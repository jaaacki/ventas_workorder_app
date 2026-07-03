// Auth session transport: the signed JWT is delivered to the browser in an
// httpOnly cookie (never in a URL or in localStorage), and refreshed with a
// sliding window so active users stay signed in while idle sessions expire.
import '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Env } from '../config/env.js';
import type { JwtPayload } from '../plugins/auth.js';

export const AUTH_COOKIE_NAME = 'auth_token';

// Fallback lifetime for the cookie's maxAge when the token cannot be decoded.
// Kept in step with the JWT_EXPIRES_IN default; the cookie's real maxAge is
// derived from the token's own exp claim below.
const DEFAULT_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

// ponytail: same-origin deploy (nginx proxies /api to the backend) so sameSite=lax
// is correct — it also survives the top-level provider redirect during OAuth, which
// sameSite=strict would drop. A cross-origin frontend would need sameSite=none; secure;
// revisit only if the FE is ever served from a different site than the API.
function authCookieOptions(config: Env, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSeconds,
  };
}

function tokenMaxAgeSeconds(reply: FastifyReply, token: string): number {
  try {
    const decoded = reply.server.jwt.decode<{ exp?: number }>(token);
    if (decoded?.exp) {
      const remaining = decoded.exp - Math.floor(Date.now() / 1000);
      if (remaining > 0) return remaining;
    }
  } catch {
    // fall through to the default lifetime
  }
  return DEFAULT_MAX_AGE_SECONDS;
}

export function issueAuthCookie(reply: FastifyReply, token: string, config: Env): void {
  reply.setCookie(AUTH_COOKIE_NAME, token, authCookieOptions(config, tokenMaxAgeSeconds(reply, token)));
}

export function clearAuthCookie(reply: FastifyReply, config: Env): void {
  reply.clearCookie(AUTH_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}

// When a still-valid token is past the halfway point of its lifetime, re-issue a
// fresh one. Best-effort: a refresh failure never throws and never blocks the
// request — the caller has already verified the current token is valid.
export async function maybeSlidingRefresh(request: FastifyRequest, reply: FastifyReply, config: Env): Promise<void> {
  try {
    const user = request.user as JwtPayload & { iat?: number; exp?: number };
    if (!user?.exp || !user?.iat) return;
    const now = Math.floor(Date.now() / 1000);
    const lifetime = user.exp - user.iat;
    const remaining = user.exp - now;
    if (lifetime <= 0 || remaining > lifetime / 2) return;

    const token = await reply.jwtSign({
      id: user.id,
      role: user.role,
      email: user.email,
      tenantId: user.tenantId,
      name: user.name,
    });
    issueAuthCookie(reply, token, config);
  } catch (err) {
    request.log.warn(err, 'sliding session refresh failed');
  }
}
