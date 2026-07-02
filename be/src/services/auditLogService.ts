import { Prisma } from '@prisma/client';
import type { JwtPayload } from '../plugins/auth.js';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

type AuditAction = 'create' | 'update' | 'delete' | 'restore' | string;

function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function writeAuditLog(input: {
  tenantId?: string | null;
  actor?: JwtPayload | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
}) {
  return prisma.auditLog.create({
    data: {
      tenantId: tenantIdOrDefault(input.tenantId),
      actorId: input.actor?.id,
      actorEmail: input.actor?.email,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      before: toJson(input.before),
      after: toJson(input.after),
      metadata: toJson(input.metadata),
    },
  });
}

export async function listAuditLogs(input: { tenantId?: string | null; entityType: string; entityId: string }) {
  return prisma.auditLog.findMany({
    where: {
      tenantId: tenantIdOrDefault(input.tenantId),
      entityType: input.entityType,
      entityId: input.entityId,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}
