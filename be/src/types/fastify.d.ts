// Type augmentations for Fastify + @fastify/jwt + our auth plugin.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'; // eslint-disable-line @typescript-eslint/no-unused-vars

declare module 'fastify' {
  interface FastifyInstance {
    config: import('../config/env.js').Env;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: string[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyReply {
    jwtSign(
      payload: { id: string; role: string; email: string; tenantId: string; name?: string | null },
      options?: Record<string, unknown>
    ): Promise<string>;
    setCookie(name: string, value: string, options?: Record<string, unknown>): FastifyReply;
    clearCookie(name: string, options?: Record<string, unknown>): FastifyReply;
  }

  interface FastifyRequest {
    jwtVerify<T extends object = { id: string; role: string; email: string; tenantId: string; name?: string | null }>(): Promise<T>;
    user: { id: string; role: string; email: string; tenantId: string; name?: string | null };
    cookies: { [cookieName: string]: string | undefined };
    unsignCookie(value: string): { valid: boolean; value: string | null; renew?: boolean };
  }
}
