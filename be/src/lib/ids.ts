import { randomBytes } from 'node:crypto';

/**
 * Mint a readable, collision-resistant id: `PREFIX-<base36 ms>-<random hex>`.
 *
 * The millisecond timestamp keeps ids roughly sortable and human-readable; the
 * random suffix prevents same-millisecond primary-key collisions when two ids
 * mint concurrently (e.g. two work orders advancing, or two sterilisations
 * created in the same tick) — without it a PK clash aborts the transaction and
 * surfaces as an opaque 500. Used for WO-/LOT-/STER-/MANU-/COLL-/HET- ids.
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
}
