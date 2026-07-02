import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { prisma } from '../db/prisma.js';
import { permissionKey } from '../auth/permissions.js';

export interface JwtPayload {
  id: string;
  role: string;
  email: string;
  tenantId: string;
  name?: string | null;
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorate(
    'authenticate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify<JwtPayload>();
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  );

  fastify.decorate(
    'requireRole',
    (...allowedRoles: string[]) => {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        await fastify.authenticate(request, reply);
        if (!allowedRoles.includes((request.user as JwtPayload).role)) {
          return reply.status(403).send({ error: 'Forbidden' });
        }
      };
    }
  );

  fastify.decorate(
    'requirePermission',
    (resource: string, action: string) => {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        await fastify.authenticate(request, reply);
        if (reply.sent) return;

        const user = request.user as JwtPayload;
        const allowed = await prisma.rolePermission.findFirst({
          where: {
            role: { key: user.role },
            permission: { key: permissionKey(resource, action) },
          },
          select: { roleId: true },
        });
        if (!allowed) {
          return reply.status(403).send({ error: 'Forbidden' });
        }
      };
    }
  );

  fastify.decorate(
    'requireAnyPermission',
    (requirements: Array<{ resource: string; action: string }>) => {
      return async (request: FastifyRequest, reply: FastifyReply) => {
        await fastify.authenticate(request, reply);
        if (reply.sent) return;

        const user = request.user as JwtPayload;
        const keys = requirements.map(({ resource, action }) => permissionKey(resource, action));
        const allowed = await prisma.rolePermission.findFirst({
          where: {
            role: { key: user.role },
            permission: { key: { in: keys } },
          },
          select: { roleId: true },
        });
        if (!allowed) {
          return reply.status(403).send({ error: 'Forbidden' });
        }
      };
    }
  );
}

export default fp(authPlugin, { name: 'auth' });
