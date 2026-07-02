// Schema-leak translation rules for the redesign (handoff README §6).
// One home for turning raw backend keys/codes into human-facing text so no
// primary screen renders `unit:HET-…`, `supply:CLI-…`, or a row of `-`.

export type StatusTone = 'neutral' | 'secondary' | 'destructive' | 'default' | 'success';

/** Localised date-time, or null when absent (callers apply their own placeholder). */
export function formatDate(value: string | null | undefined): string | null {
  return value ? new Date(value).toLocaleString() : null;
}

/** Drop a leading `prefix:` segment, e.g. `unit:HET-2607010DEJ` -> `HET-2607010DEJ`. */
export function stripPrefix(value: string | null | undefined): string {
  if (!value) return '';
  const idx = value.indexOf(':');
  return idx >= 0 ? value.slice(idx + 1) : value;
}

/** First non-empty candidate, else the fallback. Use to resolve a reference to a name. */
export function resolveName(
  candidates: Array<string | null | undefined>,
  fallback = '',
): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.toString().trim();
    if (trimmed) return trimmed;
  }
  return fallback;
}

/** True when a value is worth rendering. Everything else should be omitted, never shown as `-`. */
export function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Keep only `{label,value}` rows whose value is meaningful. */
export function omitEmpty<T extends { value: unknown }>(rows: T[]): T[] {
  return rows.filter((row) => hasValue(row.value));
}

const STATUS_MAP: Record<string, { label: string; tone: StatusTone }> = {
  // lifecycleState
  NotStarted: { label: 'Not started', tone: 'neutral' },
  InProgress: { label: 'In production', tone: 'secondary' },
  ReadyToAdvance: { label: 'Ready to advance', tone: 'secondary' },
  ReleasePending: { label: 'Ready to release', tone: 'default' },
  Released: { label: 'Released', tone: 'default' },
  // operationalStatus extras
  Blocked: { label: 'Blocked', tone: 'destructive' },
  // releaseStatus
  released: { label: 'Released', tone: 'default' },
  quarantined: { label: 'In quarantine', tone: 'destructive' },
  rejected: { label: 'Rejected', tone: 'destructive' },
  // legacyStateBucket
  '1. In Progress': { label: 'In production', tone: 'secondary' },
  '2. Next Phase': { label: 'Awaiting next phase', tone: 'secondary' },
  '3. In Quarantine': { label: 'In quarantine', tone: 'destructive' },
  '4. Finished Goods': { label: 'Finished goods', tone: 'default' },
  '5. WO Completed': { label: 'Completed', tone: 'neutral' },
};

/** Map a backend status code to a human label + a badge tone. */
export function humanStatus(code: string | null | undefined): { label: string; tone: StatusTone } {
  if (!code) return { label: 'Unknown', tone: 'neutral' };
  const mapped = STATUS_MAP[code];
  if (mapped) return mapped;
  // Fall back to a de-shouted version of an unknown code.
  const label = code
    .replace(/^\d+\.\s*/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { label, tone: 'neutral' };
}

/** shadcn Badge variant for a tone. `success` has no Badge variant, map it to secondary. */
export function toneToBadgeVariant(
  tone: StatusTone,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (tone) {
    case 'destructive':
      return 'destructive';
    case 'default':
      return 'default';
    case 'success':
    case 'secondary':
      return 'secondary';
    default:
      return 'outline';
  }
}
