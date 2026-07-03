import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ staff: { findFirst: vi.fn() } }));
vi.mock('../../db/prisma.js', () => ({ prisma: { staff: mocks.staff } }));

import { AUTH_COOKIE_NAME, clearAuthCookie, issueAuthCookie, maybeSlidingRefresh } from '../session.js';
import type { Env } from '../../config/env.js';

const config = { NODE_ENV: 'test' } as unknown as Env;

const payload = { id: 'staff-1', role: 'user', email: 'u@example.test', tenantId: 'tenant-a', name: 'U' };

beforeEach(() => {
  vi.clearAllMocks();
  // Default: the staff behind the token is still active — sliding refresh re-issues.
  mocks.staff.findFirst.mockResolvedValue({ id: 'staff-1', active: true, email: 'u@example.test', tenantId: 'tenant-a', role: { key: 'user' } });
});

function buildApp() {
  const app = Fastify();
  app.register(cookie, { secret: 'test-secret-at-least-16-chars' });
  app.register(jwt, {
    secret: 'test-secret-at-least-16-chars',
    cookie: { cookieName: AUTH_COOKIE_NAME, signed: false },
  });
  return app;
}

function parseSetCookie(header: string | string[] | undefined): string[] {
  if (!header) return [];
  return Array.isArray(header) ? header : [header];
}

describe('auth session cookie', () => {
  it('issues an httpOnly, path-scoped cookie carrying a JWT with an exp claim', async () => {
    const app = buildApp();
    app.post('/t/issue', async (_req, reply) => {
      const token = await reply.jwtSign(payload, { expiresIn: '1h' });
      issueAuthCookie(reply, token, config);
      return { ok: true };
    });
    await app.ready();
    try {
      const res = await app.inject({ method: 'POST', url: '/t/issue' });
      const setCookie = parseSetCookie(res.headers['set-cookie']).find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      expect(setCookie).toBeDefined();
      expect(setCookie).toMatch(/HttpOnly/i);
      expect(setCookie).toMatch(/Path=\//);
      expect(setCookie).toMatch(/SameSite=Lax/i);
      // maxAge tracks the token lifetime (~3600s), never a never-expiring cookie.
      const maxAge = Number(/Max-Age=(\d+)/.exec(setCookie!)?.[1]);
      expect(maxAge).toBeGreaterThan(3500);
      expect(maxAge).toBeLessThanOrEqual(3600);

      const rawToken = decodeURIComponent(/auth_token=([^;]+)/.exec(setCookie!)![1]);
      const decoded = app.jwt.decode<{ exp?: number }>(rawToken);
      expect(decoded?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    } finally {
      await app.close();
    }
  });

  it('clears the cookie on logout', async () => {
    const app = buildApp();
    app.post('/t/clear', async (_req, reply) => {
      clearAuthCookie(reply, config);
      return { ok: true };
    });
    await app.ready();
    try {
      const res = await app.inject({ method: 'POST', url: '/t/clear' });
      const setCookie = parseSetCookie(res.headers['set-cookie']).find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      expect(setCookie).toBeDefined();
      expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    } finally {
      await app.close();
    }
  });

  it('re-issues the cookie when the token is past half its lifetime', async () => {
    const app = buildApp();
    app.post('/t/refresh', async (req, reply) => {
      const now = Math.floor(Date.now() / 1000);
      // issued 6 days ago on a 7-day lifetime → only 1 day left, past half-life.
      (req as { user: unknown }).user = { ...payload, iat: now - 6 * 86400, exp: now + 1 * 86400 };
      await maybeSlidingRefresh(req, reply, config);
      return { ok: true };
    });
    await app.ready();
    try {
      const res = await app.inject({ method: 'POST', url: '/t/refresh' });
      const setCookie = parseSetCookie(res.headers['set-cookie']).find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      expect(setCookie).toBeDefined();
    } finally {
      await app.close();
    }
  });

  it('clears the cookie instead of re-issuing when the staff has been deactivated', async () => {
    mocks.staff.findFirst.mockResolvedValue({ id: 'staff-1', active: false, email: 'u@example.test', tenantId: 'tenant-a', role: { key: 'user' } });
    const app = buildApp();
    app.post('/t/refresh', async (req, reply) => {
      const now = Math.floor(Date.now() / 1000);
      // past half-life, so refresh runs the DB re-validation.
      (req as { user: unknown }).user = { ...payload, iat: now - 6 * 86400, exp: now + 1 * 86400 };
      await maybeSlidingRefresh(req, reply, config);
      return { ok: true };
    });
    await app.ready();
    try {
      const res = await app.inject({ method: 'POST', url: '/t/refresh' });
      const setCookie = parseSetCookie(res.headers['set-cookie']).find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      // Deactivated staff: the cookie is cleared, not refreshed.
      expect(setCookie).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    } finally {
      await app.close();
    }
  });

  it('does not re-issue while the token is still fresh', async () => {
    const app = buildApp();
    app.post('/t/refresh', async (req, reply) => {
      const now = Math.floor(Date.now() / 1000);
      // issued moments ago on a 7-day lifetime → well within the first half.
      (req as { user: unknown }).user = { ...payload, iat: now - 60, exp: now + 7 * 86400 };
      await maybeSlidingRefresh(req, reply, config);
      return { ok: true };
    });
    await app.ready();
    try {
      const res = await app.inject({ method: 'POST', url: '/t/refresh' });
      const setCookie = parseSetCookie(res.headers['set-cookie']).find((c) => c.startsWith(`${AUTH_COOKIE_NAME}=`));
      expect(setCookie).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
