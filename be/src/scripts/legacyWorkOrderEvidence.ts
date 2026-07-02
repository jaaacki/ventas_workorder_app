import { prisma } from '../db/prisma.js';

/**
 * Shared helpers for restoring the work-order MES evidence that the AppSheet
 * CSV import dropped (issue #116):
 *   - `prodDuration` (per-phase cycle-time KPI, stored in minutes) was declared
 *     as a decimal but the legacy value is an `H:MM:SS` string, so it parsed to
 *     nothing and landed NULL.
 *   - `startSignBy` / `endSignBy` are signer *emails* in the legacy export; the
 *     schema stores `startSignById` / `endSignById` as `staff.id`, so they need
 *     resolving against the staff table.
 *
 * Used by both the one-time backfill script and the importCsv recurrence fix so
 * the parsing/resolution logic lives in one place.
 */

type Db = typeof prisma;

/**
 * Parse a legacy AppSheet duration string into minutes.
 * Accepts `H:MM:SS`, `HH:MM:SS`, `M:SS`, or a bare seconds/minutes count.
 * Returns undefined for blank/invalid input. Rounded to 4dp to match the
 * `Decimal(18,4)` column and workOrderService's own `elapsedMs / 60000` formula.
 */
export function parseDurationToMinutes(v?: string | null): number | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const parts = s.split(':').map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return undefined;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (parts.length === 3) {
    [hours, minutes, seconds] = parts;
  } else if (parts.length === 2) {
    [minutes, seconds] = parts;
  } else if (parts.length === 1) {
    // A single value is ambiguous; the legacy export never emits this, but treat
    // it as minutes to avoid inventing precision.
    [minutes] = parts;
  } else {
    return undefined;
  }
  const total = hours * 60 + minutes + seconds / 60;
  if (!Number.isFinite(total) || total < 0) return undefined;
  return Number(total.toFixed(4));
}

/** Minutes between two timestamps, matching workOrderService's formula. Fallback for when the CSV duration string is blank. */
export function durationMinutesBetween(start?: Date | null, end?: Date | null): number | undefined {
  if (!start || !end) return undefined;
  const ms = end.getTime() - start.getTime();
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  return Number((ms / 60000).toFixed(4));
}

/**
 * Known legacy signer email renames — same person, changed address. Keeps the
 * sign-off audit trail attached to the current staff record.
 */
export const LEGACY_SIGNER_ALIASES: Record<string, string> = {
  'henry.ho@ventas.bio': 'henry@ventas.bio',
};

function normaliseSignerEmail(email: string | undefined | null): string | undefined {
  if (!email) return undefined;
  const e = email.trim().toLowerCase();
  if (!e) return undefined;
  return LEGACY_SIGNER_ALIASES[e] ?? e;
}

/** Build a lowercased-email -> staff.id lookup for resolving legacy signer emails. */
export async function buildStaffEmailMap(db: Db = prisma): Promise<Map<string, string>> {
  const staff = await db.staff.findMany({ select: { id: true, email: true } });
  const map = new Map<string, string>();
  for (const s of staff) {
    if (s.email) map.set(s.email.trim().toLowerCase(), s.id);
  }
  return map;
}

/** Resolve a legacy signer email (after alias) to a staff.id, or undefined if not a known staff member. */
export function resolveSignerId(email: string | undefined | null, emailMap: Map<string, string>): string | undefined {
  const e = normaliseSignerEmail(email);
  if (!e) return undefined;
  return emailMap.get(e);
}

/**
 * Ensure a legacy signer email resolves to a staff record, creating an inactive
 * stub if the operator has left and is no longer in `staff`. Preserves the phase
 * sign-off audit trail (who signed) which would otherwise be lost. The stub
 * cannot log in (no password/OAuth link) and is flagged inactive. Idempotent:
 * mutates `emailMap` in place and returns the resolved id (undefined for blank).
 */
export async function ensureLegacySigner(
  email: string | undefined | null,
  emailMap: Map<string, string>,
  db: Db = prisma,
): Promise<string | undefined> {
  const e = normaliseSignerEmail(email);
  if (!e) return undefined;
  const existing = emailMap.get(e);
  if (existing) return existing;

  const localPart = e.split('@')[0] ?? e;
  const staff = await db.staff.upsert({
    where: { email: e },
    update: {},
    create: { email: e, name: `${localPart} (legacy signer)`, active: false, tenantId: 'ventas' },
    select: { id: true },
  });
  emailMap.set(e, staff.id);
  return staff.id;
}
