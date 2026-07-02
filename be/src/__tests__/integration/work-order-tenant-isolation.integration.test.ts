import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../server.js';
import { prisma } from '../../db/prisma.js';

describe('work-order tenant isolation (integration)', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  const prefix = `IT-TENANT-${Date.now().toString(36)}`;
  const tenantA = `${prefix}-A`;
  const tenantB = `${prefix}-B`;
  const actorA = `${prefix}-ACTOR-A`;
  const actorB = `${prefix}-ACTOR-B`;
  const workflowA = `${prefix}-WF-A`;
  const workflowB = `${prefix}-WF-B`;
  const phaseA = `${prefix}-PHASE-A`;
  const phaseB = `${prefix}-PHASE-B`;
  const hetA = `${prefix}-HET-A`;
  const hetB = `${prefix}-HET-B`;
  const workOrderA = `${prefix}-WO-A`;
  const workOrderB = `${prefix}-WO-B`;

  function tokenFor(input: { actorId: string; tenantId: string; role?: string; email: string }) {
    return app.jwt.sign({
      id: input.actorId,
      role: input.role ?? 'admin',
      email: input.email,
      tenantId: input.tenantId,
    });
  }

  async function seedTenant(input: {
    tenantId: string;
    actorId: string;
    workflowId: string;
    phaseId: string;
    hetId: string;
    workOrderId: string;
    label: string;
  }) {
    await prisma.tenant.upsert({
      where: { slug: input.tenantId },
      update: {},
      create: { id: input.tenantId, slug: input.tenantId, name: `Integration ${input.label}` },
    });
    await prisma.staff.create({
      data: {
        id: input.actorId,
        tenantId: input.tenantId,
        email: `${input.actorId.toLowerCase()}@example.test`,
      },
    });
    await prisma.workflow.create({
      data: {
        id: input.workflowId,
        tenantId: input.tenantId,
        name: `Workflow ${input.label}`,
        code: `WF-${input.label}`,
        createdById: input.actorId,
        updatedById: input.actorId,
      },
    });
    await prisma.phase.create({
      data: {
        id: input.phaseId,
        tenantId: input.tenantId,
        phaseName: `Phase ${input.label}`,
        phaseShort: input.label,
        phaseOrder: 0,
        keyText: input.phaseId,
      },
    });
    await prisma.workflowPhase.create({
      data: { workflowId: input.workflowId, phaseId: input.phaseId, sortOrder: 0 },
    });
    await prisma.het.create({
      data: {
        id: input.hetId,
        tenantId: input.tenantId,
        hetNumber: `HET-${input.label}`,
        quantity: 1,
        createdById: input.actorId,
        updatedById: input.actorId,
      },
    });
    await prisma.workOrder.create({
      data: {
        id: input.workOrderId,
        tenantId: input.tenantId,
        woNumber: `WO-${input.label}`,
        workflowId: input.workflowId,
        phaseId: input.phaseId,
        phaseOrder: 0,
        hetId: input.hetId,
        createdById: input.actorId,
        updatedById: input.actorId,
      },
    });
  }

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();

    await seedTenant({
      tenantId: tenantA,
      actorId: actorA,
      workflowId: workflowA,
      phaseId: phaseA,
      hetId: hetA,
      workOrderId: workOrderA,
      label: 'A',
    });
    await seedTenant({
      tenantId: tenantB,
      actorId: actorB,
      workflowId: workflowB,
      phaseId: phaseB,
      hetId: hetB,
      workOrderId: workOrderB,
      label: 'B',
    });
  });

  afterAll(async () => {
    await prisma.workOrderAuditEvent.deleteMany({ where: { workOrderId: { in: [workOrderA, workOrderB] } } }).catch(() => undefined);
    await prisma.workOrder.deleteMany({ where: { id: { in: [workOrderA, workOrderB] } } }).catch(() => undefined);
    await prisma.het.deleteMany({ where: { id: { in: [hetA, hetB] } } }).catch(() => undefined);
    await prisma.workflowPhase.deleteMany({ where: { workflowId: { in: [workflowA, workflowB] } } }).catch(() => undefined);
    await prisma.phase.deleteMany({ where: { id: { in: [phaseA, phaseB] } } }).catch(() => undefined);
    await prisma.workflow.deleteMany({ where: { id: { in: [workflowA, workflowB] } } }).catch(() => undefined);
    await prisma.staff.deleteMany({ where: { id: { in: [actorA, actorB] } } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } }).catch(() => undefined);
    await app.close();
    await prisma.$disconnect();
  });

  it('only lists work orders for the authenticated tenant', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/work-orders',
      headers: { authorization: `Bearer ${tokenFor({ actorId: actorA, tenantId: tenantA, email: 'a@example.test' })}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body) as Array<{ id: string; tenantId: string }>;
    const ids = body.map((workOrder) => workOrder.id);
    expect(ids).toContain(workOrderA);
    expect(ids).not.toContain(workOrderB);
    expect(body.find((workOrder) => workOrder.id === workOrderA)?.tenantId).toBe(tenantA);
  });

  it('does not expose another tenant work order by id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/work-orders/${workOrderA}`,
      headers: { authorization: `Bearer ${tokenFor({ actorId: actorB, tenantId: tenantB, email: 'b@example.test' })}` },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: 'Work order not found' });
  });

  it('does not mutate another tenant work order through lifecycle routes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/work-orders/${workOrderA}/start`,
      headers: { authorization: `Bearer ${tokenFor({ actorId: actorB, tenantId: tenantB, email: 'b@example.test' })}` },
      payload: { signatureDataUrl: 'data:image/png;base64,test-signature' },
    });

    expect(response.statusCode).toBe(404);

    const stored = await prisma.workOrder.findUniqueOrThrow({
      where: { id: workOrderA },
      select: { tenantId: true, prodStart: true, startSignById: true },
    });
    expect(stored).toEqual({ tenantId: tenantA, prodStart: null, startSignById: null });
  });

  it('records and exposes audit events for owning-tenant lifecycle actions', async () => {
    const token = tokenFor({ actorId: actorA, tenantId: tenantA, email: 'a@example.test' });
    const startResponse = await app.inject({
      method: 'POST',
      url: `/api/work-orders/${workOrderA}/start`,
      headers: { authorization: `Bearer ${token}` },
      payload: { signatureDataUrl: 'data:image/png;base64,test-signature' },
    });

    expect(startResponse.statusCode).toBe(200);

    const auditResponse = await app.inject({
      method: 'GET',
      url: `/api/work-orders/${workOrderA}/audit-events`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(auditResponse.statusCode).toBe(200);
    const events = JSON.parse(auditResponse.body) as Array<{
      tenantId: string;
      workOrderId: string;
      action: string;
      actorId: string | null;
      source: string;
      previousState: { prodStart: string | null } | null;
      newState: { prodStart: string | null } | null;
    }>;
    expect(events).toEqual([
      expect.objectContaining({
        tenantId: tenantA,
        workOrderId: workOrderA,
        action: 'work_order.phase_started',
        actorId: actorA,
        source: 'workOrderService.startWorkOrderPhase',
        previousState: expect.objectContaining({ prodStart: null }),
        newState: expect.objectContaining({ prodStart: expect.any(String) }),
      }),
    ]);

    const crossTenantAuditResponse = await app.inject({
      method: 'GET',
      url: `/api/work-orders/${workOrderA}/audit-events`,
      headers: { authorization: `Bearer ${tokenFor({ actorId: actorB, tenantId: tenantB, email: 'b@example.test' })}` },
    });
    expect(crossTenantAuditResponse.statusCode).toBe(404);
  });

  it('does not create a work order from another tenant workflow id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/work-orders',
      headers: { authorization: `Bearer ${tokenFor({ actorId: actorB, tenantId: tenantB, email: 'b@example.test' })}` },
      payload: { workflowId: workflowA, hetId: hetB },
    });

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({ error: 'Workflow not found' });

    const crossTenantCreated = await prisma.workOrder.findFirst({
      where: { tenantId: tenantB, workflowId: workflowA },
    });
    expect(crossTenantCreated).toBeNull();
  });
});
