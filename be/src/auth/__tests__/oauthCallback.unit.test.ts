import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    role: { findUniqueOrThrow: vi.fn() },
    staff: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
  authorizationCodeGrant: vi.fn(),
  discovery: vi.fn(),
}));

vi.mock('../../db/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('openid-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('openid-client')>()),
  discovery: mocks.discovery,
  authorizationCodeGrant: mocks.authorizationCodeGrant,
}));

import { oauthRoutes } from '../oauth.js';
import { AUTH_COOKIE_NAME } from '../session.js';
import type { Env } from '../../config/env.js';

const env = {
  NODE_ENV: 'test',
  JWT_SECRET: 'test-secret-at-least-16-chars',
  JWT_EXPIRES_IN: '7d',
  FRONTEND_URL: 'http://localhost:3000',
  GOOGLE_CLIENT_ID: 'google-client-id',
  GOOGLE_CLIENT_SECRET: 'google-client-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:3001/api/auth/oauth/google/callback',
} as unknown as Env;

function buildApp() {
  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.register(cookie, { secret: env.JWT_SECRET });
  app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
    cookie: { cookieName: AUTH_COOKIE_NAME, signed: false },
  });
  app.decorate('config', env);
  app.register(oauthRoutes, { prefix: '/api/auth/oauth' });
  return app;
}

describe('OAuth callback token delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.discovery.mockResolvedValue({});
    mocks.authorizationCodeGrant.mockResolvedValue({
      access_token: 'access-token',
      claims: () => ({ email: 'newuser@example.test', sub: 'provider-sub-1', name: 'New User' }),
    });
    mocks.prisma.role.findUniqueOrThrow.mockResolvedValue({ id: 'role-user', key: 'user' });
    mocks.prisma.staff.findFirst.mockResolvedValue(null);
    mocks.prisma.staff.findUnique.mockResolvedValue(null);
    mocks.prisma.staff.create.mockResolvedValue({
      id: 'staff-1',
      email: 'newuser@example.test',
      name: 'New User',
      tenantId: 'default',
      role: { key: 'user' },
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('delivers the session token in an httpOnly cookie, never in the redirect URL', async () => {
    const app = buildApp();
    await app.ready();
    try {
      const sign = (app as unknown as { signCookie: (v: string) => string }).signCookie;
      const res = await app.inject({
        method: 'GET',
        url: '/api/auth/oauth/google/callback?code=auth-code&state=test-state',
        cookies: {
          oauth_state: sign('test-state'),
          oauth_nonce: sign('test-nonce'),
          oauth_pkce: sign('test-pkce'),
        },
      });

      expect(res.statusCode).toBe(302);
      const location = res.headers.location as string;
      // #143: the JWT must not leak through the redirect URL (browser history / logs / Referer).
      expect(location).toBe('http://localhost:3000/auth/callback');
      expect(location).not.toContain('token=');

      const setCookie = res.headers['set-cookie'];
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      const authCookie = cookies.find((c) => c?.startsWith(`${AUTH_COOKIE_NAME}=`));
      expect(authCookie).toBeDefined();
      expect(authCookie).toMatch(/HttpOnly/i);
    } finally {
      await app.close();
    }
  });
});
