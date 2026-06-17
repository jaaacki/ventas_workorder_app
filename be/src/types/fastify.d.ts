// Type augmentation for @fastify/env so app.config is typed.
declare module 'fastify' {
  interface FastifyInstance {
    config: import('./config/env.js').Env;
  }
}
