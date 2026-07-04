import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../server.js';
import { prisma } from '../../db/prisma.js';

// The lifecycle routes are gated on workOrder.* permissions (#208). This proves
// the guard end to end against the seeded role→permission mappings: a role
// without a permission is refused with 403 and never mutates, while a role that
// holds it succeeds. Self-contained fixture (own tenant + workflow + phase + HET
// + work order), cleaned up afterwards; relies only on the standard seeded
// roles (admin/operator/user) that db:seed reconciles before the suite runs.

describe('work-order lifecycle RBAC (integration)', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  const prefix = `IT-RBAC-${Date.now().toString(36)}`;
  const tenantId = `${prefix}-T`;
  const actorId = `${prefix}-ACTOR`;
  const workflowId = `${prefix}-WF`;
  const phaseId = `${prefix}-PHASE`;
  const hetId = `${prefix}-HET`;
  const workOrderId = `${prefix}-WO`;

  function tokenFor(role: string) {
    return app.jwt.sign({ id: actorId, role, email: `${actorId.toLowerCase()}@example.test`, tenantId });
  }

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    await prisma.tenant.upsert({
      where: { slug: tenantId },
      update: {},
      create: { id: tenantId, slug: tenantId, name: 'RBAC Integration' },
    });
    await prisma.staff.create({ data: { id: actorId, tenantId, email: `${actorId.toLowerCase()}@example.test` } });
    await prisma.workflow.create({
      data: { id: workflowId, tenantId, name: 'RBAC Workflow', code: `WF-${prefix}`, createdById: actorId, updatedById: actorId },
    });
    await prisma.phase.create({
      data: { id: phaseId, tenantId, workflowId, sortOrder: 0, phaseName: 'Execution', phaseShort: 'EX', keyText: phaseId },
    });
    await prisma.het.create({
      data: { id: hetId, tenantId, hetNumber: `HET-${prefix}`, quantity: 1, createdById: actorId, updatedById: actorId },
    });
    await prisma.workOrder.create({
      data: {
        id: workOrderId,
        tenantId,
        woNumber: `WO-${prefix}`,
        workflowId,
        phaseId,
        phaseOrder: 0,
        hetId,
        createdById: actorId,
        updatedById: actorId,
      },
    });
  });

  afterAll(async () => {
    await prisma.workOrderAuditEvent.deleteMany({ where: { workOrderId } }).catch(() => undefined);
    await prisma.workOrder.updateMany({ where: { id: workOrderId }, data: { steralisationCurrentId: null, collectionReceiptId: null } }).catch(() => undefined);
    await prisma.het.updateMany({ where: { id: hetId }, data: { usedById: null, finishedById: null } }).catch(() => undefined);
    await prisma.workOrder.deleteMany({ where: { id: workOrderId } }).catch(() => undefined);
    await prisma.het.deleteMany({ where: { id: hetId } }).catch(() => undefined);
    await prisma.phase.deleteMany({ where: { id: phaseId } }).catch(() => undefined);
    await prisma.workflow.deleteMany({ where: { id: workflowId } }).catch(() => undefined);
    await prisma.staff.deleteMany({ where: { id: actorId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await app.close();
    await prisma.$disconnect();
  });

  it('refuses a role without workOrder.execute on a lifecycle write, without mutating', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/work-orders/${workOrderId}/start`,
      headers: { authorization: `Bearer ${tokenFor('user')}` },
      payload: { signatureDataUrl: 'data:image/png;base64,test-signature' },
    });

    expect(response.statusCode).toBe(403);
    const stored = await prisma.workOrder.findUniqueOrThrow({ where: { id: workOrderId }, select: { prodStart: true } });
    expect(stored.prodStart).toBeNull();
  });

  it('refuses workOrder.create for a role that can execute but not create', async () => {
    // operator holds workOrder.execute/advance/collect but not create — proves
    // per-action granularity, not just a coarse allow/deny.
    const response = await app.inject({
      method: 'POST',
      url: '/api/work-orders',
      headers: { authorization: `Bearer ${tokenFor('operator')}` },
      payload: { workflowId, hetId },
    });

    expect(response.statusCode).toBe(403);
  });

  it('allows a role with workOrder.execute to perform the lifecycle write', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/work-orders/${workOrderId}/start`,
      headers: { authorization: `Bearer ${tokenFor('admin')}` },
      payload: { signatureDataUrl: 'data:image/png;base64,test-signature' },
    });

    expect(response.statusCode).toBe(200);
    const stored = await prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderId },
      select: { prodStart: true, startSignById: true },
    });
    expect(stored.prodStart).not.toBeNull();
    expect(stored.startSignById).toBe(actorId);
  });
});
