import type { PrismaClient } from '@prisma/client';

/**
 * Confident BomLine.description -> InventorySku.sku mapping (epic #181).
 *
 * BOM (production sheet) and Inventory (catalog) were separate legacy systems; a
 * BOM line names the same item an InventorySku carries, but with different text.
 * Reagent identities + colour code come from docs/"Production and QC Process
 * Workflow.pdf" (Yellow = Sodium Hypochlorite, Orange = Hydrogen Peroxide, Blue =
 * Acid 0.6N, Green = Ethanol); the SKU codes even encode the colour (YWO/ORG/BLU).
 *
 * Only exact/near-exact, human-reviewed matches live here. Materials NOT listed
 * (labels, EtO sticker, Type I/II water) are resolved through the suggestion-
 * assisted BOM-line editor (Phase 2) rather than guessed.
 */
export const AMG_BOMLINE_SKU: Record<string, string> = {
  // batch 1
  Ethanol: 'ENT-PRA-CNN-5LL-GER-BCM',
  'Tungsten carbide bur': 'TCB-PRA-PII-1PP-NCO-KTE',
  'Aluminium cake tray (round)': 'ACT-SCN-PCC-1PC-NCO-AAD',
  'PETG packaging tray (inner)': 'IPT-PAK-PCC-5PS-NCO-PTT',
  'PETG outer tray': 'OPT-PAK-PCC-7PE-NCO-PTT',
  'Tyvek lid (inner)': 'TLF-PAK-PCC-5PE-NCO-AMC',
  'Tyvek lid (outer)': 'TLO-PAK-PCC-2PI-NCO-AMC',
  'Sterile sample container': 'SSC-SCN-BTT-1UN-NCO-PME',
  'Sterile bag': 'SBP-SCN-BAA-4PC-NCO-HCC',
  // batch 2 — PDF-confirmed
  'Yellow reagent': 'SHP-PRA-CNN-5LL-YWO-BCM',
  'Orange reagent': 'HPO-PRA-CNN-5LL-ORG-BCM',
  'Blue reagent': 'HAN-PRA-BTT-1LL-BLU-BCM',
  'PET container': 'PCF-SCT-BTT-1UN-NCO-SSM',
  Carton: 'CFE-PAK-PII-1UN-NCO-FEA',
  'Autoclave pouch': 'SPU-SCN-BAA-2PI-NCO-NTH',
};

/** Legacy descriptions carry trailing junk (e.g. "Ethanol --- "). Normalise for lookup. */
export function normalizeBomDescription(description: string | null | undefined): string {
  return (description ?? '').replace(/[\s\-—]+$/u, '').trim();
}

/**
 * Fill any NULL bomLine.inventorySkuId by matching the (normalised) description to
 * a SKU code in AMG_BOMLINE_SKU, resolving the code to the tenant's InventorySku.
 * Idempotent (touches only NULLs); a no-op on a DB with no inventory imported, and
 * never overrides a manual link. Returns the number of lines bound.
 */
export async function bindBomLineInventory(prisma: PrismaClient, tenantId: string): Promise<number> {
  const lines = await prisma.bomLine.findMany({
    where: { tenantId, deleted: false, inventorySkuId: null },
    select: { id: true, description: true },
  });
  const skuIdByCode = new Map<string, string | null>();
  let bound = 0;
  for (const line of lines) {
    const code = AMG_BOMLINE_SKU[normalizeBomDescription(line.description)];
    if (!code) continue;
    if (!skuIdByCode.has(code)) {
      const sku = await prisma.inventorySku.findFirst({
        where: { tenantId, sku: code, deleted: false },
        select: { id: true },
      });
      skuIdByCode.set(code, sku?.id ?? null);
    }
    const skuId = skuIdByCode.get(code);
    if (!skuId) continue;
    await prisma.bomLine.update({ where: { id: line.id }, data: { inventorySkuId: skuId } });
    bound += 1;
  }
  return bound;
}
