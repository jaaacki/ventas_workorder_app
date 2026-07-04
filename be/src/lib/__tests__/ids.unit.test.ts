import { describe, it, expect } from 'vitest';
import { generatePrefixedId } from '../ids.js';

describe('generatePrefixedId', () => {
  it('prefixes the id and follows the PREFIX-<base36>-<hex> shape', () => {
    const id = generatePrefixedId('STER');
    expect(id.startsWith('STER-')).toBe(true);
    expect(id).toMatch(/^STER-[0-9A-Z]+-[0-9A-F]{6}$/);
  });

  it('does not collide within the same millisecond (random suffix)', () => {
    // Mint many ids in a tight loop (same/adjacent ms); the random suffix must
    // keep them unique so concurrent inserts never clash on the primary key.
    const ids = new Set<string>();
    for (let i = 0; i < 5000; i += 1) {
      ids.add(generatePrefixedId('WO'));
    }
    expect(ids.size).toBe(5000);
  });
});
