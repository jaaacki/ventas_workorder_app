import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

export interface ProcedureInput {
  procedureName?: string | null;
  procedureDesc?: string | null;
  procedureShort?: string | null;
  keyText?: string | null;
}

export interface BomInput {
  bomName?: string | null;
  keyText?: string | null;
}

export interface BomLineInput {
  bomId?: string;
  bomName?: string | null;
  description?: string | null;
  quantity?: string | number | Prisma.Decimal | null;
  uom?: string | null;
  hasSerial?: boolean;
  keyText?: string | null;
}

export interface PhaseEquipInput {
  equipId?: string | null;
  name?: string | null;
  description?: string | null;
  keyText?: string | null;
}

const procedureSelect = {
  id: true,
  tenantId: true,
  procedureName: true,
  procedureDesc: true,
  procedureShort: true,
  keyText: true,
  createdAt: true,
  updatedAt: true,
} as const;

const bomSelect = {
  id: true,
  tenantId: true,
  bomName: true,
  keyText: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { lines: true, phases: true } },
} as const;

const bomLineSelect = {
  id: true,
  tenantId: true,
  bomId: true,
  bomName: true,
  description: true,
  quantity: true,
  uom: true,
  hasSerial: true,
  deleted: true,
  keyText: true,
  createdAt: true,
  updatedAt: true,
} as const;

const phaseEquipSelect = {
  id: true,
  tenantId: true,
  equipId: true,
  name: true,
  description: true,
  keyText: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { phases: true, workOrders: true } },
} as const;

function notFound(message: string) {
  return new Prisma.PrismaClientKnownRequestError(message, {
    code: 'P2025',
    clientVersion: 'unknown',
  });
}

async function assertTenantBom(bomId: string, tenantId: string) {
  const bom = await prisma.bom.findFirst({ where: { id: bomId, tenantId }, select: { id: true, bomName: true } });
  if (!bom) throw notFound('BOM not found');
  return bom;
}

function decimalOrNull(value: string | number | Prisma.Decimal | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  try {
    return new Prisma.Decimal(value);
  } catch {
    throw new Error('Invalid BOM line quantity');
  }
}

export async function listProcedures(tenantId?: string | null) {
  return prisma.procedure.findMany({
    where: { tenantId: tenantIdOrDefault(tenantId) },
    select: procedureSelect,
    orderBy: [{ procedureName: 'asc' }, { procedureShort: 'asc' }, { id: 'asc' }],
  });
}

export async function getProcedure(id: string, tenantId?: string | null) {
  return prisma.procedure.findFirst({ where: { id, tenantId: tenantIdOrDefault(tenantId) }, select: procedureSelect });
}

export async function createProcedure(input: ProcedureInput, actorId: string, tenantId?: string | null) {
  return prisma.procedure.create({
    data: {
      id: randomUUID(),
      tenantId: tenantIdOrDefault(tenantId),
      procedureName: input.procedureName ?? null,
      procedureDesc: input.procedureDesc ?? null,
      procedureShort: input.procedureShort ?? null,
      keyText: input.keyText ?? null,
      createdById: actorId,
      updatedById: actorId,
    },
    select: procedureSelect,
  });
}

export async function updateProcedure(id: string, input: ProcedureInput, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const updated = await prisma.procedure.updateMany({
    where: { id, tenantId: scopedTenantId },
    data: {
      ...(input.procedureName !== undefined && { procedureName: input.procedureName }),
      ...(input.procedureDesc !== undefined && { procedureDesc: input.procedureDesc }),
      ...(input.procedureShort !== undefined && { procedureShort: input.procedureShort }),
      ...(input.keyText !== undefined && { keyText: input.keyText }),
      updatedById: actorId,
    },
  });
  if (updated.count === 0) throw notFound('Procedure not found');

  return prisma.procedure.findFirstOrThrow({ where: { id, tenantId: scopedTenantId }, select: procedureSelect });
}

export async function deleteProcedure(id: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const deleted = await prisma.procedure.deleteMany({ where: { id, tenantId: scopedTenantId } });
  if (deleted.count === 0) throw notFound('Procedure not found');

  return { success: true as const };
}

export async function listBoms(tenantId?: string | null) {
  return prisma.bom.findMany({
    where: { tenantId: tenantIdOrDefault(tenantId) },
    select: bomSelect,
    orderBy: [{ bomName: 'asc' }, { id: 'asc' }],
  });
}

export async function getBom(id: string, tenantId?: string | null) {
  return prisma.bom.findFirst({ where: { id, tenantId: tenantIdOrDefault(tenantId) }, select: bomSelect });
}

export async function createBom(input: BomInput, actorId: string, tenantId?: string | null) {
  return prisma.bom.create({
    data: {
      id: randomUUID(),
      tenantId: tenantIdOrDefault(tenantId),
      bomName: input.bomName ?? null,
      keyText: input.keyText ?? null,
      createdById: actorId,
      updatedById: actorId,
    },
    select: bomSelect,
  });
}

export async function updateBom(id: string, input: BomInput, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const updated = await prisma.bom.updateMany({
    where: { id, tenantId: scopedTenantId },
    data: {
      ...(input.bomName !== undefined && { bomName: input.bomName }),
      ...(input.keyText !== undefined && { keyText: input.keyText }),
      updatedById: actorId,
    },
  });
  if (updated.count === 0) throw notFound('BOM not found');

  return prisma.bom.findFirstOrThrow({ where: { id, tenantId: scopedTenantId }, select: bomSelect });
}

export async function deleteBom(id: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const deleted = await prisma.bom.deleteMany({ where: { id, tenantId: scopedTenantId } });
  if (deleted.count === 0) throw notFound('BOM not found');

  return { success: true as const };
}

export async function listBomLines(options: { tenantId?: string | null; bomId?: string; includeDeleted?: boolean }) {
  const scopedTenantId = tenantIdOrDefault(options.tenantId);
  if (options.bomId) await assertTenantBom(options.bomId, scopedTenantId);

  return prisma.bomLine.findMany({
    where: {
      tenantId: scopedTenantId,
      ...(options.bomId && { bomId: options.bomId }),
      ...(options.includeDeleted ? {} : { deleted: false }),
    },
    select: bomLineSelect,
    orderBy: [{ bomName: 'asc' }, { description: 'asc' }, { id: 'asc' }],
  });
}

export async function getBomLine(id: string, tenantId?: string | null) {
  return prisma.bomLine.findFirst({ where: { id, tenantId: tenantIdOrDefault(tenantId), deleted: false }, select: bomLineSelect });
}

export async function createBomLine(input: BomLineInput & { bomId: string }, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const bom = await assertTenantBom(input.bomId, scopedTenantId);

  return prisma.bomLine.create({
    data: {
      id: randomUUID(),
      tenantId: scopedTenantId,
      bomId: input.bomId,
      bomName: input.bomName ?? bom.bomName,
      description: input.description ?? null,
      quantity: decimalOrNull(input.quantity) ?? null,
      uom: input.uom ?? null,
      hasSerial: input.hasSerial ?? false,
      deleted: false,
      keyText: input.keyText ?? null,
      createdById: actorId,
      updatedById: actorId,
    },
    select: bomLineSelect,
  });
}

export async function updateBomLine(id: string, input: BomLineInput, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  if (input.bomId) await assertTenantBom(input.bomId, scopedTenantId);
  const quantity = decimalOrNull(input.quantity);

  const updated = await prisma.bomLine.updateMany({
    where: { id, tenantId: scopedTenantId, deleted: false },
    data: {
      ...(input.bomId !== undefined && { bomId: input.bomId }),
      ...(input.bomName !== undefined && { bomName: input.bomName }),
      ...(input.description !== undefined && { description: input.description }),
      ...(quantity !== undefined && { quantity }),
      ...(input.uom !== undefined && { uom: input.uom }),
      ...(input.hasSerial !== undefined && { hasSerial: input.hasSerial }),
      ...(input.keyText !== undefined && { keyText: input.keyText }),
      updatedById: actorId,
    },
  });
  if (updated.count === 0) throw notFound('BOM line not found');

  return prisma.bomLine.findFirstOrThrow({ where: { id, tenantId: scopedTenantId, deleted: false }, select: bomLineSelect });
}

export async function deleteBomLine(id: string, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const updated = await prisma.bomLine.updateMany({
    where: { id, tenantId: scopedTenantId, deleted: false },
    data: { deleted: true, updatedById: actorId },
  });
  if (updated.count === 0) throw notFound('BOM line not found');

  return { success: true as const };
}

export async function listPhaseEquipment(tenantId?: string | null) {
  return prisma.phaseEquip.findMany({
    where: { tenantId: tenantIdOrDefault(tenantId) },
    select: phaseEquipSelect,
    orderBy: [{ name: 'asc' }, { equipId: 'asc' }, { id: 'asc' }],
  });
}

export async function getPhaseEquipment(id: string, tenantId?: string | null) {
  return prisma.phaseEquip.findFirst({ where: { id, tenantId: tenantIdOrDefault(tenantId) }, select: phaseEquipSelect });
}

export async function createPhaseEquipment(input: PhaseEquipInput, actorId: string, tenantId?: string | null) {
  return prisma.phaseEquip.create({
    data: {
      id: randomUUID(),
      tenantId: tenantIdOrDefault(tenantId),
      equipId: input.equipId ?? null,
      name: input.name ?? null,
      description: input.description ?? null,
      keyText: input.keyText ?? null,
      createdById: actorId,
      updatedById: actorId,
    },
    select: phaseEquipSelect,
  });
}

export async function updatePhaseEquipment(id: string, input: PhaseEquipInput, actorId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const updated = await prisma.phaseEquip.updateMany({
    where: { id, tenantId: scopedTenantId },
    data: {
      ...(input.equipId !== undefined && { equipId: input.equipId }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.keyText !== undefined && { keyText: input.keyText }),
      updatedById: actorId,
    },
  });
  if (updated.count === 0) throw notFound('Phase equipment not found');

  return prisma.phaseEquip.findFirstOrThrow({ where: { id, tenantId: scopedTenantId }, select: phaseEquipSelect });
}

export async function deletePhaseEquipment(id: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const deleted = await prisma.phaseEquip.deleteMany({ where: { id, tenantId: scopedTenantId } });
  if (deleted.count === 0) throw notFound('Phase equipment not found');

  return { success: true as const };
}
