import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

export interface JwtPayload {
  id: string;
  role: string;
  email: string;
  name?: string | null;
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify<JwtPayload>();
      } catch (err) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  );

  fastify.decorate(
    'requireRole',
    (...allowedRoles: string[]) => {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        await fastify.authenticate(request, reply);
        if (!allowedRoles.includes(request.user.role)) {
          return reply.status(403).send({ error: 'Forbidden' });
        }
      };
    }
  );
}

export default fp(authPlugin, { name: 'auth' });
