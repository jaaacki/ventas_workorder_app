import jwt from '@fastify/jwt';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import authPlugin from '../auth.js';

const mocks = vi.hoisted(() => ({
  prisma: {
    rolePermission: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('../../db/prisma.js', () => ({ prisma: mocks.prisma }));

function buildAuthTestApp() {
  const app = Fastify();
  app.register(jwt, { secret: 'test-secret-at-least-16-chars' });
  app.register(authPlugin);
  app.after(() => {
    app.get('/permission', { onRequest: [app.requirePermission('inventory.lot', 'read')] }, async () => ({ ok: true }));
    app.get(
      '/any-permission',
      {
        onRequest: [
          app.requireAnyPermission([
            { resource: 'inventory.lot', action: 'readDeleted' },
            { resource: 'inventory.lot', action: 'readAudit' },
          ]),
        ],
      },
      async () => ({ ok: true }),
    );
  });
  return app;
}

describe('auth permission helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows requests with the required role permission', async () => {
    const app = buildAuthTestApp();
    await app.ready();
    const token = app.jwt.sign({ id: 'staff-1', email: 'admin@example.test', role: 'admin', tenantId: 'tenant-a' });
    mocks.prisma.rolePermission.findFirst.mockResolvedValue({ roleId: 'role-admin' });

    try {
      const response = await app.inject({ method: 'GET', url: '/permission', headers: { authorization: `Bearer ${token}` } });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.rolePermission.findFirst).toHaveBeenCalledWith({
        where: {
          role: { key: 'admin' },
          permission: { key: 'inventory.lot.read' },
        },
        select: { roleId: true },
      });
    } finally {
      await app.close();
    }
  });

  it('denies requests without the required role permission', async () => {
    const app = buildAuthTestApp();
    await app.ready();
    const token = app.jwt.sign({ id: 'staff-2', email: 'viewer@example.test', role: 'viewer', tenantId: 'tenant-a' });
    mocks.prisma.rolePermission.findFirst.mockResolvedValue(null);

    try {
      const response = await app.inject({ method: 'GET', url: '/permission', headers: { authorization: `Bearer ${token}` } });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'Forbidden' });
    } finally {
      await app.close();
    }
  });

  it('allows any matching permission from an include-deleted requirement set', async () => {
    const app = buildAuthTestApp();
    await app.ready();
    const token = app.jwt.sign({ id: 'staff-3', email: 'auditor@example.test', role: 'inventory_manager', tenantId: 'tenant-a' });
    mocks.prisma.rolePermission.findFirst.mockResolvedValue({ roleId: 'role-inventory-manager' });

    try {
      const response = await app.inject({ method: 'GET', url: '/any-permission', headers: { authorization: `Bearer ${token}` } });

      expect(response.statusCode).toBe(200);
      expect(mocks.prisma.rolePermission.findFirst).toHaveBeenCalledWith({
        where: {
          role: { key: 'inventory_manager' },
          permission: { key: { in: ['inventory.lot.readDeleted', 'inventory.lot.readAudit'] } },
        },
        select: { roleId: true },
      });
    } finally {
      await app.close();
    }
  });
});
