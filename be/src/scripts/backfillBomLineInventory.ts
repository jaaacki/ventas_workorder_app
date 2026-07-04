import { prisma } from '../db/prisma.js';
import { DEFAULT_TENANT_ID, tenantIdOrDefault } from '../services/tenant.js';

/**
 * Backfill BomLine.inventorySkuId from the reviewed confident mapping (epic #181).
 *
 * BOM (production sheet) and Inventory (catalog) were separate legacy systems; a
 * BOM line's free-text `description` names the same item an `InventorySku` carries
 * under a coded `sku`, but with different strings. This binds only the exact/near
 * -exact matches approved in Phase 0 — everything else stays NULL for manual
 * mapping in Phase 2. Idempotent: fills NULL only, so re-running (and running on a
 * fresh DB with no inventory imported) is safe.
 *
 * Match strategy: BomLine.description (exact) -> InventorySku.sku code (stable
 * across environments) -> set BomLine.inventorySkuId.
 */

// description -> InventorySku.sku code. Confident matches only.
const CONFIDENT: Record<string, string> = {
  Ethanol: 'ENT-PRA-CNN-5LL-GER-BCM',
  'Tungsten carbide bur': 'TCB-PRA-PII-1PP-NCO-KTE',
  'Aluminium cake tray (round)': 'ACT-SCN-PCC-1PC-NCO-AAD',
  'PETG packaging tray (inner)': 'IPT-PAK-PCC-5PS-NCO-PTT',
  'PETG outer tray': 'OPT-PAK-PCC-7PE-NCO-PTT',
  'Tyvek lid (inner)': 'TLF-PAK-PCC-5PE-NCO-AMC',
  'Tyvek lid (outer)': 'TLO-PAK-PCC-2PI-NCO-AMC',
  'Sterile sample container': 'SSC-SCN-BTT-1UN-NCO-PME',
  'Sterile bag': 'SBP-SCN-BAA-4PC-NCO-HCC',
};

export interface BackfillBomLineReport {
  tenantId: string;
  dryRun: boolean;
  bound: number;
  skippedNoSku: string[]; // descriptions whose target SKU code was not found in the catalog
  alreadyLinked: number;
  unmatchedDescriptions: string[]; // NULL bom lines with no confident-map entry (Phase-2 manual)
}

export async function backfillBomLineInventory(options: {
  tenantId?: string | null;
  dryRun?: boolean;
}): Promise<BackfillBomLineReport> {
  const tenantId = tenantIdOrDefault(options.tenantId);
  const dryRun = Boolean(options.dryRun);
  const report: BackfillBomLineReport = {
    tenantId,
    dryRun,
    bound: 0,
    skippedNoSku: [],
    alreadyLinked: 0,
    unmatchedDescriptions: [],
  };

  report.alreadyLinked = await prisma.bomLine.count({
    where: { tenantId, deleted: false, inventorySkuId: { not: null } },
  });

  for (const [description, skuCode] of Object.entries(CONFIDENT)) {
    const sku = await prisma.inventorySku.findFirst({
      where: { tenantId, sku: skuCode, deleted: false },
      select: { id: true },
    });
    if (!sku) {
      report.skippedNoSku.push(description);
      continue;
    }
    const targets = await prisma.bomLine.findMany({
      where: { tenantId, deleted: false, inventorySkuId: null, description },
      select: { id: true },
    });
    for (const line of targets) {
      if (!dryRun) {
        await prisma.bomLine.update({ where: { id: line.id }, data: { inventorySkuId: sku.id } });
      }
      report.bound += 1;
    }
  }

  const stillNull = await prisma.bomLine.findMany({
    where: { tenantId, deleted: false, inventorySkuId: null },
    select: { description: true },
  });
  report.unmatchedDescriptions = Array.from(
    new Set(stillNull.map((l) => l.description ?? '(no description)')),
  ).sort();

  return report;
}

function flag(name: string) {
  return process.argv.includes(`--${name}`);
}
function arg(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

// CLI entrypoint: `db:backfill:bomline-inventory` (mirrors the other backfills).
if (import.meta.url === `file://${process.argv[1]}`) {
  backfillBomLineInventory({ tenantId: arg('tenant-id', DEFAULT_TENANT_ID), dryRun: flag('dry-run') })
    .then((report) => {
      console.log(`BomLine→InventorySku backfill (tenant ${report.tenantId}, dryRun ${report.dryRun}):`);
      console.log(`  bound ${report.bound}, already-linked ${report.alreadyLinked}`);
      if (report.skippedNoSku.length) console.warn(`  SKU code not found for: ${report.skippedNoSku.join('; ')}`);
      if (report.unmatchedDescriptions.length)
        console.log(`  still unlinked (Phase-2 manual): ${report.unmatchedDescriptions.join('; ')}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
