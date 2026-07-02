import { describe, it, expect } from 'vitest';
import {
  parseDurationToMinutes,
  durationMinutesBetween,
  resolveSignerId,
} from '../legacyWorkOrderEvidence.js';

describe('parseDurationToMinutes', () => {
  it('parses the legacy H:MM:SS format into minutes', () => {
    // 0:13:23 -> 13 + 23/60 = 13.3833
    expect(parseDurationToMinutes('0:13:23')).toBe(13.3833);
    expect(parseDurationToMinutes('1:00:00')).toBe(60);
    expect(parseDurationToMinutes('5:30:00')).toBe(330);
  });

  it('accepts M:SS', () => {
    expect(parseDurationToMinutes('13:23')).toBe(13.3833);
  });

  it('returns undefined for blank or invalid input', () => {
    expect(parseDurationToMinutes(undefined)).toBeUndefined();
    expect(parseDurationToMinutes(null)).toBeUndefined();
    expect(parseDurationToMinutes('')).toBeUndefined();
    expect(parseDurationToMinutes('   ')).toBeUndefined();
    expect(parseDurationToMinutes('abc')).toBeUndefined();
    expect(parseDurationToMinutes('1:xx:00')).toBeUndefined();
  });
});

describe('durationMinutesBetween', () => {
  it('computes minutes between two timestamps (matches app formula)', () => {
    const start = new Date('2024-08-26T11:11:54Z');
    const end = new Date('2024-08-26T11:25:17Z');
    expect(durationMinutesBetween(start, end)).toBe(13.3833);
  });

  it('returns undefined when a bound is missing or end precedes start', () => {
    const t = new Date('2024-08-26T11:11:54Z');
    expect(durationMinutesBetween(null, t)).toBeUndefined();
    expect(durationMinutesBetween(t, null)).toBeUndefined();
    expect(durationMinutesBetween(new Date('2024-08-26T12:00:00Z'), t)).toBeUndefined();
  });
});

describe('resolveSignerId', () => {
  const map = new Map([['simon.ng@ventas.bio', 'staff-1']]);

  it('resolves a known email case-insensitively', () => {
    expect(resolveSignerId('simon.ng@ventas.bio', map)).toBe('staff-1');
    expect(resolveSignerId('  Simon.NG@Ventas.Bio ', map)).toBe('staff-1');
  });

  it('returns undefined for unknown or blank emails', () => {
    expect(resolveSignerId('nobody@ventas.bio', map)).toBeUndefined();
    expect(resolveSignerId(undefined, map)).toBeUndefined();
    expect(resolveSignerId('', map)).toBeUndefined();
  });

  it('applies known legacy email aliases before lookup', () => {
    // henry.ho@ was renamed to henry@ — the sign-off must resolve to the
    // current staff record, not drop to NULL.
    const withHenry = new Map([['henry@ventas.bio', 'staff-henry']]);
    expect(resolveSignerId('henry.ho@ventas.bio', withHenry)).toBe('staff-henry');
  });
});
