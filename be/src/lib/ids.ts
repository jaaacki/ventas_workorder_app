import { randomBytes } from 'node:crypto';

/**
 * Mint a readable, collision-resistant id: `PREFIX-<base36 ms>-<random hex>`.
 *
 * The millisecond timestamp keeps ids roughly sortable and human-readable; the
 * random suffix prevents same-millisecond primary-key collisions when two ids
 * mint concurrently (e.g. two work orders advancing, or two sterilisations
 * created in the same tick) — without it a PK clash aborts the transaction and
 * surfaces as an opaque 500. Used for WO-/LOT-/STER-/MANU-/COLL-/HET- ids.
 *
 * The suffix is 6 random bytes (48 bits): within a single millisecond the
 * timestamp is constant, so collision-safety rests entirely on the suffix — at
 * 24 bits a few thousand same-ms mints hit a birthday collision, at 48 bits the
 * probability is negligible.
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(6).toString('hex').toUpperCase()}`;
}
