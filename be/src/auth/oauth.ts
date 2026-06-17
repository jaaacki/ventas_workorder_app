import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  type Configuration,
  ClientSecretPost,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  discovery,
  fetchUserInfo,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  calculatePKCECodeChallenge,
  skipSubjectCheck,
} from 'openid-client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import type { Env } from '../config/env.js';
import { prisma } from '../db/prisma.js';

const errorResponse = z.object({ error: z.string() });

const providerParam = z.enum(['google', 'microsoft']);

type ProviderConfig = {
  issuerUrl: string;
  scope: string;
  clientId: string | undefined;
  clientSecret: string | undefined;
  redirectUri: string | undefined;
};

function getProviderConfig(provider: z.infer<typeof providerParam>, env: Env): ProviderConfig {
  if (provider === 'google') {
    return {
      issuerUrl: 'https://accounts.google.com',
      scope: 'openid email profile',
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
    };
  }
  const tenant = env.MS_TENANT || 'common';
  return {
    issuerUrl: `https://login.microsoftonline.com/${tenant}/v2.0`,
    scope: 'openid email profile User.Read',
    clientId: env.MS_CLIENT_ID,
    clientSecret: env.MS_CLIENT_SECRET,
    redirectUri: env.MS_REDIRECT_URI,
  };
}

async function getClient(config: ProviderConfig): Promise<Configuration> {
  if (!config.clientId || !config.clientSecret || !config.redirectUri) {
    throw new Error('OAuth provider is not configured');
  }
  return discovery(
    new URL(config.issuerUrl),
    config.clientId,
    {
      redirect_uris: [config.redirectUri],
      response_types: ['code'],
    },
    ClientSecretPost(config.clientSecret)
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
        },
      },
    },
    async (req, reply) => {
      const { provider } = req.params;
      const env = app.config;
      const providerConfig = getProviderConfig(provider, env);
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
        return reply.status(501).send({ error: `OAuth provider ${provider} is not configured` });
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
        const callbackUrl = new URL(
          req.raw.url || '/',
          `${req.protocol}://${req.hostname}`
        );
        tokenSet = await authorizationCodeGrant(config, callbackUrl, {
          expectedState: stateCookie,
          expectedNonce: nonceCookie,
          pkceCodeVerifier: pkceCookie,
        });
      } catch (err) {
        app.log.warn(err, 'OAuth callback failed');
        return reply.status(501).send({ error: `OAuth provider ${provider} is not configured` });
      }

      const claims = tokenSet.claims();
      let email = typeof claims?.email === 'string' ? claims.email.toLowerCase() : undefined;
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
        name: staff.name,
      });

      clearOAuthCookies(reply);
      return reply.redirect(`${env.FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}`);
    }
  );
};
