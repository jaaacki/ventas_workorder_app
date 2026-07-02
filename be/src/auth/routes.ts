import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import '@fastify/jwt';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma.js';
import type { JwtPayload } from '../plugins/auth.js';
import { tenantIdOrDefault } from '../services/tenant.js';

const errorResponse = z.object({ error: z.string() });

const roleSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  builtIn: z.boolean(),
  sortOrder: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  bitrixId: z.string().nullable(),
  googleId: z.string().nullable(),
  microsoftId: z.string().nullable(),
  active: z.boolean(),
  tenantId: z.string(),
  roleId: z.string().nullable(),
  role: roleSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

async function getUserRole(): Promise<{ id: string; key: string }> {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'user' } });
  return role;
}

function sanitizeUser<T extends { passwordHash?: string | null }>(staff: T): Omit<T, 'passwordHash'> {
  const { passwordHash: _p, ...rest } = staff;
  return rest as Omit<T, 'passwordHash'>;
}

export const authRoutes: FastifyPluginAsyncZod = async function (app) {
  app.post(
    '/login',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Log in',
        description: 'Authenticate with local email/password credentials and receive a JWT.',
        operationId: 'login',
        'x-route-kind': 'auth',
        'x-auth': 'anonymous',
        body: z.object({
          email: z.string().email(),
          password: z.string().min(1),
        }),
        response: {
          200: z.object({
            token: z.string(),
            user: userSchema,
          }),
          401: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const { email, password } = req.body;
      const staff = await prisma.staff.findUnique({
        where: { email },
        include: { role: true },
      });
      if (!staff || !staff.passwordHash || !staff.role) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }
      const valid = await bcrypt.compare(password, staff.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }
      const token = await reply.jwtSign({
        id: staff.id,
        role: staff.role.key,
        email: staff.email,
        tenantId: tenantIdOrDefault(staff.tenantId),
        name: staff.name,
      });
      return { token, user: sanitizeUser(staff) };
    }
  );

  app.post(
    '/register',
    {
      onRequest: [app.requireRole('owner')],
      schema: {
        tags: ['Auth'],
        summary: 'Register staff user',
        description: 'Create a staff user with a local password. Owner role required.',
        operationId: 'registerStaff',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'auth',
        'x-auth': 'role',
        'x-required-roles': ['owner'],
        body: z.object({
          email: z.string().email(),
          password: z.string().min(8),
          name: z.string().min(1).optional(),
          roleId: z.string().optional(),
        }),
        response: {
          201: userSchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const { email, password, name, roleId } = req.body;
      const existing = await prisma.staff.findUnique({ where: { email } });
      if (existing) {
        return reply.status(400).send({ error: 'Email already registered' });
      }
      const assignedRoleId = roleId || (await getUserRole()).id;
      const staff = await prisma.staff.create({
        data: {
          email,
          name,
          passwordHash: bcrypt.hashSync(password, 12),
          tenantId: tenantIdOrDefault((req.user as JwtPayload).tenantId),
          roleId: assignedRoleId,
        },
        include: { role: true },
      });
      reply.status(201);
      return sanitizeUser(staff);
    }
  );

  app.get(
    '/me',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Get current user',
        description: 'Read the authenticated staff profile and role.',
        operationId: 'getCurrentUser',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'auth',
        'x-auth': 'authenticated',
        response: {
          200: userSchema,
          401: errorResponse,
        },
      },
    },
    async (req) => {
      const staff = await prisma.staff.findFirstOrThrow({
        where: { id: (req.user as JwtPayload).id, tenantId: tenantIdOrDefault((req.user as JwtPayload).tenantId) },
        include: { role: true },
      });
      return sanitizeUser(staff);
    }
  );

  app.post(
    '/logout',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'Log out',
        description: 'Client-side logout acknowledgement for JWT-based sessions.',
        operationId: 'logout',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'auth',
        'x-auth': 'authenticated',
        response: {
          200: z.object({ success: z.boolean() }),
          401: errorResponse,
        },
      },
    },
    async () => {
      return { success: true };
    }
  );

  app.get(
    '/roles',
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ['Auth'],
        summary: 'List roles',
        description: 'Read available RBAC roles ordered for display.',
        operationId: 'listRoles',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'authenticated',
        response: {
          200: z.array(roleSchema),
          401: errorResponse,
        },
      },
    },
    async () => {
      return prisma.role.findMany({ orderBy: { sortOrder: 'asc' } });
    }
  );

  app.patch(
    '/roles/:id',
    {
      onRequest: [app.requireRole('owner')],
      schema: {
        tags: ['Auth'],
        summary: 'Update role',
        description: 'Patch role display metadata. Owner role required.',
        operationId: 'updateRole',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['owner'],
        params: z.object({ id: z.string() }),
        body: z.object({
          name: z.string().min(1).optional(),
          description: z.string().optional(),
        }),
        response: {
          200: roleSchema,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const role = await prisma.role.findUnique({ where: { id: req.params.id } });
      if (!role) {
        return reply.status(404).send({ error: 'Role not found' });
      }
      return prisma.role.update({
        where: { id: req.params.id },
        data: { name: req.body.name, description: req.body.description },
      });
    }
  );

  app.get(
    '/staff',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Auth'],
        summary: 'List staff',
        description: 'Read staff users with role details. Admin or owner role required.',
        operationId: 'listStaff',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'read-model',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        response: {
          200: z.array(userSchema),
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    async (req) => {
      const staffList = await prisma.staff.findMany({
        where: { tenantId: tenantIdOrDefault((req.user as JwtPayload).tenantId) },
        include: { role: true },
        orderBy: { createdAt: 'desc' },
      });
      return staffList.map((s) => sanitizeUser(s));
    }
  );

  app.patch(
    '/staff/:id/role',
    {
      onRequest: [app.requireRole('owner')],
      schema: {
        tags: ['Auth'],
        summary: 'Update staff role',
        description: 'Assign a role to a staff user. Owner role required.',
        operationId: 'updateStaffRole',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['owner'],
        params: z.object({ id: z.string() }),
        body: z.object({ roleId: z.string() }),
        response: {
          200: userSchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const target = await prisma.staff.findFirst({ where: { id: req.params.id, tenantId: tenantIdOrDefault((req.user as JwtPayload).tenantId) } });
      if (!target) {
        return reply.status(404).send({ error: 'User not found' });
      }
      const role = await prisma.role.findUnique({ where: { id: req.body.roleId } });
      if (!role) {
        return reply.status(400).send({ error: 'Invalid role' });
      }
      return prisma.staff.update({
        where: { id: req.params.id },
        data: { roleId: req.body.roleId },
        include: { role: true },
      }).then((s) => sanitizeUser(s));
    }
  );

  app.patch(
    '/staff/:id/active',
    {
      onRequest: [app.requireRole('admin', 'owner')],
      schema: {
        tags: ['Auth'],
        summary: 'Update staff active state',
        description: 'Activate or deactivate a staff user. Admin or owner role required.',
        operationId: 'updateStaffActive',
        security: [{ bearerAuth: [] }],
        'x-route-kind': 'resource-crud',
        'x-auth': 'role',
        'x-required-roles': ['admin', 'owner'],
        params: z.object({ id: z.string() }),
        body: z.object({ active: z.boolean() }),
        response: {
          200: userSchema,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      const target = await prisma.staff.findFirst({ where: { id: req.params.id, tenantId: tenantIdOrDefault((req.user as JwtPayload).tenantId) } });
      if (!target) {
        return reply.status(404).send({ error: 'User not found' });
      }
      return prisma.staff.update({
        where: { id: req.params.id },
        data: { active: req.body.active },
        include: { role: true },
      }).then((s) => sanitizeUser(s));
    }
  );
};
