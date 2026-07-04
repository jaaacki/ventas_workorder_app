import { z } from 'zod';

// Closed, application-owned status vocabularies. These are the sets the app
// fully controls, so they are safe to validate strictly at every write path and
// share between the API contract (route zod schemas) and the service layer.
//
// Deliberately NOT modelled here (they stay free-form strings): InventoryLot.status,
// CollectionUnit.status, and InventoryTransaction.transactionType — imported legacy
// data carries values outside any closed set (e.g. AVAILABLE_LEGACY,
// WORKORDER_REFERENCED_NO_PROCUREMENT_SOURCE), so a strict enum would reject real
// rows. See #208 for the audit.

export const releaseStatusValues = ['released', 'quarantined', 'rejected'] as const;
export const releaseStatusSchema = z.enum(releaseStatusValues);
export type ReleaseStatus = (typeof releaseStatusValues)[number];

export const sterilisationDirectionValues = ['OUT', 'IN'] as const;
export const sterilisationDirectionSchema = z.enum(sterilisationDirectionValues);
export type SterilisationDirection = (typeof sterilisationDirectionValues)[number];

// Open, known vocabulary for InventoryLot.inventoryType. Unlike the closed status
// sets above, inventoryType is an application-owned classification: the API write
// path validates against this list, but it must cover every value the app can
// legitimately produce — the FE lot dropdown plus every category the legacy
// importer maps (importInventoryLegacy.inventoryTypeForCategory). Keep this list
// as the single source of truth so FE, BE, and import never drift. New physical
// categories are added here, not silently rejected at the write boundary.
export const inventoryTypeValues = [
  'HET',
  'RAW_MATERIAL',
  'WIP',
  'FINISHED_GOOD',
  'CONSUMABLE',
  'PROCESSING_REAGENT',
  'PACKAGING',
  'PPE',
  'WASTE',
  'STORAGE_CONTAINER',
] as const;
export const inventoryTypeSchema = z.enum(inventoryTypeValues);
export type InventoryType = (typeof inventoryTypeValues)[number];
