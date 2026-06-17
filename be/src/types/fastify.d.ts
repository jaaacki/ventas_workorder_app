// Type augmentation for @fastify/env so app.config is typed.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'; // eslint-disable-line @typescript-eslint/no-unused-vars

declare module 'fastify' {
  interface FastifyInstance {
    config: import('./config/env.js').Env;
  }
  interface FastifyReply {
    jwtSign(payload: Record<string, unknown>, options?: Record<string, unknown>): Promise<string>;
  }
  interface FastifyRequest {
    jwtVerify<T extends object = { id: string }>(): Promise<T>;
    user: { id: string };
  }
}
