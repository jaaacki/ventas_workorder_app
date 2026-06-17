import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../db/prisma.js';

export const authRoutes: FastifyPluginAsyncZod = async function (app) {
  app.post(
    '/login',
    {
      schema: {
        body: z.object({
          email: z.string().email(),
          password: z.string().min(1),
        }),
        response: {
          200: z.object({ token: z.string(), user: z.object({ id: z.string(), email: z.string(), name: z.string().nullable() }) }),
        },
      },
    },
    async (req, reply) => {
      const { email, password } = req.body;
      const staff = await prisma.staff.findUnique({ where: { email } });
      if (!staff || !staff.passwordHash) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }
      const valid = await bcrypt.compare(password, staff.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }
      const token = await reply.jwtSign({ id: staff.id, email: staff.email });
      return { token, user: { id: staff.id, email: staff.email, name: staff.name } };
    }
  );

  app.get(
    '/me',
    {
      onRequest: [async (req) => { await req.jwtVerify(); }],
      schema: {
        response: {
          200: z.object({ id: z.string(), email: z.string(), name: z.string().nullable() }),
        },
      },
    },
    async (req) => {
      const { id } = req.user as { id: string };
      const staff = await prisma.staff.findUniqueOrThrow({ where: { id } });
      return { id: staff.id, email: staff.email, name: staff.name };
    }
  );
};
