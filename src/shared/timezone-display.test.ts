import { describe, expect, it } from 'vitest';
import { formatZonedDateTime, timezoneAbbreviation } from './timezone-display.ts';

describe('timezone display', () => {
  it('uses the displayed instant through the repeated daylight-saving hour', () => {
    const before = Date.parse('2026-11-01T05:30:00Z');
    const after = Date.parse('2026-11-01T06:30:00Z');
    expect(formatZonedDateTime(before, 'America/New_York')).toBe('2026-11-01 01:30 EDT');
    expect(formatZonedDateTime(after, 'America/New_York')).toBe('2026-11-01 01:30 EST');
  });

  it('uses local noon for date-only labels on the day the clocks change', () => {
    expect(timezoneAbbreviation('America/New_York', '2026-11-01')).toBe('EST');
    expect(timezoneAbbreviation('America/New_York', '2026-03-08')).toBe('EDT');
    expect(timezoneAbbreviation('America/New_York', '2026-01-01')).toBe('EST');
  });

  it('keeps UTC midnight at 00:00 and supports fractional offsets', () => {
    const at = Date.parse('2026-10-14T00:00:00Z');
    expect(formatZonedDateTime(at, 'UTC')).toBe('2026-10-14 00:00 UTC');
    expect(formatZonedDateTime(at, 'Asia/Kathmandu')).toBe('2026-10-14 05:45 GMT+5:45');
    expect(timezoneAbbreviation('unrecognized/imported-zone', at)).toBe('Unknown timezone');
  });
});
