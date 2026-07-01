import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  type Configuration,
  ClientSecretPost,
  PrivateKeyJwt,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  discovery,
  fetchUserInfo,
  modifyAssertion,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  calculatePKCECodeChallenge,
  skipSubjectCheck,
} from 'openid-client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash, webcrypto, X509Certificate } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Env } from '../config/env.js';
import { prisma } from '../db/prisma.js';
import { DEFAULT_TENANT_ID, tenantIdOrDefault } from '../services/tenant.js';

const errorResponse = z.object({ error: z.string() });

const providerParam = z.enum(['google', 'microsoft']);

export type ProviderConfig = {
  issuerUrl: string;
  scope: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
  privateKey: string | undefined;
  privateKeyFile: string | undefined;
  certificate: string | undefined;
  certificateFile: string | undefined;
  certificateThumbprint: string | undefined;
  redirectUri: string | undefined;
};

export function isProviderConfigured(config: ProviderConfig): boolean {
  const hasSecretAuth = Boolean(config.clientSecret);
  const hasCertificateAuth = Boolean(
    (config.privateKey || config.privateKeyFile) &&
      (config.certificateThumbprint || config.certificate || config.certificateFile)
  );
  return Boolean(config.clientId && config.redirectUri && (hasSecretAuth || hasCertificateAuth));
}

export function getProviderConfig(provider: z.infer<typeof providerParam>, env: Env): ProviderConfig {
  if (provider === 'google') {
    return {
      issuerUrl: 'https://accounts.google.com',
      scope: 'openid email profile',
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      privateKey: undefined,
      privateKeyFile: undefined,
      certificate: undefined,
      certificateFile: undefined,
      certificateThumbprint: undefined,
      redirectUri: env.GOOGLE_REDIRECT_URI,
    };
  }
  const tenant = env.MS_TENANT || 'common';
  return {
    issuerUrl: `https://login.microsoftonline.com/${tenant}/v2.0`,
    scope: env.MS_SCOPE || 'openid email profile',
    clientId: env.MS_CLIENT_ID,
    clientSecret: env.MS_CLIENT_SECRET,
    privateKey: env.MS_PRIVATE_KEY,
    privateKeyFile: env.MS_PRIVATE_KEY_FILE,
    certificate: env.MS_CERTIFICATE,
    certificateFile: env.MS_CERTIFICATE_FILE,
    certificateThumbprint: env.MS_CERT_THUMBPRINT,
    redirectUri: env.MS_REDIRECT_URI,
  };
}

async function readPemValue(inlineValue: string | undefined, filePath: string | undefined): Promise<string | undefined> {
  if (inlineValue) return inlineValue.replaceAll('\\n', '\n');
  if (!filePath) return undefined;
  return readFile(filePath, 'utf8');
}

export function normalizeCertificateThumbprint(thumbprint: string): string {
  const compact = thumbprint.replace(/[\s:]/g, '');
  if (/^[a-f0-9]{40}$/i.test(compact)) {
    return Buffer.from(compact, 'hex').toString('base64url');
  }
  return thumbprint.trim().replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function thumbprintFromCertificate(certificatePem: string): string {
  const certificate = new X509Certificate(certificatePem);
  return createHash('sha1').update(certificate.raw).digest('base64url');
}

function pkcs8DerFromPem(privateKeyPem: string): Uint8Array<ArrayBuffer> {
  const match = /-----BEGIN PRIVATE KEY-----([^-]+)-----END PRIVATE KEY-----/s.exec(privateKeyPem);
  if (!match) {
    throw new Error('Microsoft OAuth private key must be an unencrypted PKCS#8 PEM');
  }
  const buffer = Buffer.from(match[1].replace(/\s/g, ''), 'base64');
  return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

async function buildMicrosoftCertificateAuth(config: ProviderConfig) {
  const privateKeyPem = await readPemValue(config.privateKey, config.privateKeyFile);
  if (!privateKeyPem) return undefined;

  const certificatePem = await readPemValue(config.certificate, config.certificateFile);
  const thumbprint = config.certificateThumbprint
    ? normalizeCertificateThumbprint(config.certificateThumbprint)
    : certificatePem
      ? thumbprintFromCertificate(certificatePem)
      : undefined;
  if (!thumbprint) {
    throw new Error('Microsoft OAuth certificate auth requires MS_CERT_THUMBPRINT or certificate PEM');
  }

  const privateKey = await webcrypto.subtle.importKey(
    'pkcs8',
    pkcs8DerFromPem(privateKeyPem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  return PrivateKeyJwt(privateKey, {
    [modifyAssertion]: (header) => {
      header.x5t = thumbprint;
    },
  });
}

async function getClient(config: ProviderConfig): Promise<Configuration> {
  if (!isProviderConfigured(config)) {
    throw new Error('OAuth provider is not configured');
  }
  const clientId = config.clientId;
  const clientSecret = config.clientSecret;
  const redirectUri = config.redirectUri;
  if (!clientId || !redirectUri) {
    throw new Error('OAuth provider is not configured');
  }

  const clientAuth = clientSecret ? ClientSecretPost(clientSecret) : await buildMicrosoftCertificateAuth(config);
  if (!clientAuth) {
    throw new Error('OAuth provider is not configured');
  }

  return discovery(
    new URL(config.issuerUrl),
    clientId,
    {
      redirect_uris: [redirectUri],
      response_types: ['code'],
    },
    clientAuth
  );
}

function setOAuthCookie(reply: FastifyReply, name: string, value: string) {
  reply.setCookie(name, value, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/auth/oauth',
    maxAge: 600,
  });
}

function readOAuthCookie(req: FastifyRequest, name: string): string | undefined {
  const raw = req.cookies[name];
  if (!raw) return undefined;
  const unsigned = req.unsignCookie(raw);
  return unsigned.valid ? (unsigned.value ?? undefined) : undefined;
}

function clearOAuthCookies(reply: FastifyReply) {
  reply.clearCookie('oauth_state', { path: '/api/auth/oauth' });
  reply.clearCookie('oauth_nonce', { path: '/api/auth/oauth' });
  reply.clearCookie('oauth_pkce', { path: '/api/auth/oauth' });
}

export function buildOAuthCallbackUrl(redirectUri: string, rawUrl: string | undefined): URL {
  const callbackUrl = new URL(redirectUri);
  if (!rawUrl) return callbackUrl;

  callbackUrl.search = new URL(rawUrl, redirectUri).search;
  return callbackUrl;
}

export const oauthRoutes: FastifyPluginAsyncZod = async function (app) {
  app.get(
    '/:provider/authorize',
    {
      schema: {
        params: z.object({ provider: providerParam }),
        response: {
          302: z.any(),
          400: errorResponse,
          501: errorResponse,
          502: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const { provider } = req.params;
      const env = app.config;
      const providerConfig = getProviderConfig(provider, env);
      if (!isProviderConfigured(providerConfig)) {
        return reply.status(501).send({ error: `OAuth provider ${provider} is not configured` });
      }

      try {
        const config = await getClient(providerConfig);
        const state = randomState();
        const nonce = randomNonce();
        const codeVerifier = randomPKCECodeVerifier();
        const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

        const url = buildAuthorizationUrl(config, {
          redirect_uri: providerConfig.redirectUri!,
          response_type: 'code',
          scope: providerConfig.scope,
          state,
          nonce,
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
        });

        setOAuthCookie(reply, 'oauth_state', state);
        setOAuthCookie(reply, 'oauth_nonce', nonce);
        setOAuthCookie(reply, 'oauth_pkce', codeVerifier);
        return reply.redirect(url.toString());
      } catch (err) {
        app.log.warn(err, 'OAuth authorize failed');
        return reply.status(502).send({ error: `OAuth provider ${provider} authorization failed` });
      }
    }
  );

  app.get(
    '/:provider/callback',
    {
      schema: {
        params: z.object({ provider: providerParam }),
        querystring: z.object({
          code: z.string().optional(),
          state: z.string().optional(),
          error: z.string().optional(),
          error_description: z.string().optional(),
        }),
        response: {
          302: z.any(),
          400: errorResponse,
          501: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const { provider } = req.params;
      const env = app.config;

      if (req.query.error) {
        const message = req.query.error_description || req.query.error;
        return reply.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(message)}`);
      }

      const providerConfig = getProviderConfig(provider, env);
      if (!isProviderConfigured(providerConfig)) {
        return reply.redirect(
          `${env.FRONTEND_URL}/login?error=${encodeURIComponent(`OAuth provider ${provider} is not configured`)}`
        );
      }

      const stateCookie = readOAuthCookie(req, 'oauth_state');
      const nonceCookie = readOAuthCookie(req, 'oauth_nonce');
      const pkceCookie = readOAuthCookie(req, 'oauth_pkce');
      if (!stateCookie || !nonceCookie || !pkceCookie || stateCookie !== req.query.state) {
        return reply.status(400).send({ error: 'Invalid or expired OAuth state' });
      }

      let config: Configuration;
      let tokenSet;
      try {
        config = await getClient(providerConfig);
        const callbackUrl = buildOAuthCallbackUrl(providerConfig.redirectUri!, req.raw.url);
        tokenSet = await authorizationCodeGrant(config, callbackUrl, {
          expectedState: stateCookie,
          expectedNonce: nonceCookie,
          pkceCodeVerifier: pkceCookie,
        });
      } catch (err) {
        app.log.warn(err, 'OAuth callback failed');
        return reply.redirect(
          `${env.FRONTEND_URL}/login?error=${encodeURIComponent(`OAuth provider ${provider} callback failed`)}`
        );
      }

      const claims = tokenSet.claims();
      let email =
        typeof claims?.email === 'string'
          ? claims.email.toLowerCase()
          : typeof claims?.preferred_username === 'string'
            ? claims.preferred_username.toLowerCase()
            : typeof claims?.upn === 'string'
              ? claims.upn.toLowerCase()
              : undefined;
      let name = typeof claims?.name === 'string' ? claims.name : undefined;
      const providerId = typeof claims?.sub === 'string' ? claims.sub : undefined;

      if (!email) {
        try {
          const userinfo = await fetchUserInfo(config, tokenSet.access_token, skipSubjectCheck);
          email = typeof userinfo.email === 'string' ? (userinfo.email as string).toLowerCase() : undefined;
          name = name || (typeof userinfo.name === 'string' ? (userinfo.name as string) : undefined);
        } catch (err) {
          app.log.warn(err, 'OAuth userinfo fetch failed');
        }
      }

      if (!email || !providerId) {
        return reply.status(400).send({ error: 'Provider did not return required profile information' });
      }

      const role = await prisma.role.findUniqueOrThrow({ where: { key: 'user' } });
      const idField = provider === 'google' ? 'googleId' : 'microsoftId';

      let staff = await prisma.staff.findFirst({
        where: { [idField]: providerId },
        include: { role: true },
      });
      if (!staff) {
        staff = await prisma.staff.findUnique({ where: { email }, include: { role: true } });
      }

      if (!staff) {
        staff = await prisma.staff.create({
          data: {
            email,
            name,
            tenantId: DEFAULT_TENANT_ID,
            roleId: role.id,
            [idField]: providerId,
            active: true,
          },
          include: { role: true },
        });
      } else {
        staff = await prisma.staff.update({
          where: { id: staff.id },
          data: {
            [idField]: providerId,
            name: name || staff.name,
          },
          include: { role: true },
        });
      }

      const token = await reply.jwtSign({
        id: staff.id,
        role: staff.role?.key || 'user',
        email: staff.email,
        tenantId: tenantIdOrDefault(staff.tenantId),
        name: staff.name,
      });

      clearOAuthCookies(reply);
      return reply.redirect(`${env.FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`);
    }
  );
};
