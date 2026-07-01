import { prisma } from '../db/prisma.js';
import { tenantIdOrDefault } from './tenant.js';

export async function getInventoryOverview(tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const [
    skus,
    lots,
    transactions,
    locations,
    balances,
    importReports,
    hetLots,
    finishedGoodLots,
  ] = await Promise.all([
    prisma.inventorySku.count({ where: { tenantId: scopedTenantId } }),
    prisma.inventoryLot.count({ where: { tenantId: scopedTenantId } }),
    prisma.inventoryTransaction.count({ where: { tenantId: scopedTenantId } }),
    prisma.inventoryLocation.count({ where: { tenantId: scopedTenantId } }),
    prisma.inventoryBalance.count({ where: { tenantId: scopedTenantId } }),
    prisma.inventoryImportReport.count({ where: { tenantId: scopedTenantId } }),
    prisma.inventoryLot.count({ where: { tenantId: scopedTenantId, inventoryType: 'HET' } }),
    prisma.inventoryLot.count({ where: { tenantId: scopedTenantId, inventoryType: 'FINISHED_GOOD' } }),
  ]);

  return { skus, lots, transactions, locations, balances, importReports, hetLots, finishedGoodLots };
}

export async function listSkus(options: { tenantId?: string | null; q?: string; take?: number }) {
  const q = options.q?.trim();
  return prisma.inventorySku.findMany({
    where: {
      tenantId: tenantIdOrDefault(options.tenantId),
      ...(q
        ? {
            OR: [
              { id: { contains: q, mode: 'insensitive' } },
              { sku: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
              { category: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    orderBy: [{ description: 'asc' }, { id: 'asc' }],
    take: options.take ?? 200,
  });
}

export async function listLots(options: {
  tenantId?: string | null;
  q?: string;
  inventoryType?: string;
  status?: string;
  take?: number;
}) {
  const q = options.q?.trim();
  return prisma.inventoryLot.findMany({
    where: {
      tenantId: tenantIdOrDefault(options.tenantId),
      ...(options.inventoryType ? { inventoryType: options.inventoryType } : {}),
      ...(options.status ? { status: options.status } : {}),
      ...(q
        ? {
            OR: [
              { id: { contains: q, mode: 'insensitive' } },
              { lotNumber: { contains: q, mode: 'insensitive' } },
              { legacyItemSerialId: { contains: q, mode: 'insensitive' } },
              { legacyHetId: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: { inventorySku: true, currentLocation: true },
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    take: options.take ?? 200,
  });
}

export async function listTransactions(options: { tenantId?: string | null; q?: string; take?: number }) {
  const q = options.q?.trim();
  return prisma.inventoryTransaction.findMany({
    where: {
      tenantId: tenantIdOrDefault(options.tenantId),
      ...(q
        ? {
            OR: [
              { id: { contains: q, mode: 'insensitive' } },
              { reason: { contains: q, mode: 'insensitive' } },
              { legacyRefNumber: { contains: q, mode: 'insensitive' } },
              { legacyRefNumberOut: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: { inventorySku: true, inventoryLot: true, fromLocation: true, toLocation: true },
    orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    take: options.take ?? 200,
  });
}

export async function listLocations(tenantId?: string | null) {
  return prisma.inventoryLocation.findMany({
    where: { tenantId: tenantIdOrDefault(tenantId) },
    orderBy: [{ locationType: 'asc' }, { name: 'asc' }],
  });
}

export async function getGenealogy(lotId: string, tenantId?: string | null) {
  const scopedTenantId = tenantIdOrDefault(tenantId);
  const lot = await prisma.inventoryLot.findFirst({
    where: { id: lotId, tenantId: scopedTenantId },
    include: { inventorySku: true },
  });
  if (!lot) return null;
  const [parents, children] = await Promise.all([
    prisma.inventoryGenealogy.findMany({
      where: { tenantId: scopedTenantId, childInventoryLotId: lotId },
      include: { parentInventoryLot: { include: { inventorySku: true } } },
    }),
    prisma.inventoryGenealogy.findMany({
      where: { tenantId: scopedTenantId, parentInventoryLotId: lotId },
      include: { childInventoryLot: { include: { inventorySku: true } } },
    }),
  ]);
  return { id: lot.id, lot, parents, children };
}

export async function listImportReports(tenantId?: string | null) {
  return prisma.inventoryImportReport.findMany({
    where: { tenantId: tenantIdOrDefault(tenantId) },
    orderBy: { startedAt: 'desc' },
    take: 20,
  });
}
