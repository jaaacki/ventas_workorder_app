import { prisma } from '../db/prisma.js';
import { DEFAULT_TENANT_ID, tenantIdOrDefault } from '../services/tenant.js';
import { bindBomLineInventory } from './bomLineInventoryMap.js';

/**
 * Ad-hoc BomLine.inventorySkuId backfill (epic #181). Thin wrapper over the shared
 * `bindBomLineInventory` (the same confident map the seed uses), for running the
 * link outside a full seed. Idempotent — fills NULL only; unmatched lines stay NULL
 * for the suggestion-assisted Phase-2 editor.
 */
export interface BackfillBomLineReport {
  tenantId: string;
  bound: number;
  alreadyLinked: number;
  unmatchedDescriptions: string[];
}

export async function backfillBomLineInventory(options: {
  tenantId?: string | null;
}): Promise<BackfillBomLineReport> {
  const tenantId = tenantIdOrDefault(options.tenantId);
  const bound = await bindBomLineInventory(prisma, tenantId);
  const alreadyLinked = await prisma.bomLine.count({
    where: { tenantId, deleted: false, inventorySkuId: { not: null } },
  });
  const stillNull = await prisma.bomLine.findMany({
    where: { tenantId, deleted: false, inventorySkuId: null },
    select: { description: true },
  });
  const unmatchedDescriptions = Array.from(
    new Set(stillNull.map((l) => l.description ?? '(no description)')),
  ).sort();
  return { tenantId, bound, alreadyLinked, unmatchedDescriptions };
}

function arg(name: string, fallback?: string) {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

// CLI entrypoint: `db:backfill:bomline-inventory`.
if (import.meta.url === `file://${process.argv[1]}`) {
  backfillBomLineInventory({ tenantId: arg('tenant-id', DEFAULT_TENANT_ID) })
    .then((report) => {
      console.log(`BomLine→InventorySku backfill (tenant ${report.tenantId}):`);
      console.log(`  bound ${report.bound}, total-linked ${report.alreadyLinked}`);
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
