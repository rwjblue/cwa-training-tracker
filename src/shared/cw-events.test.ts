import { describe, expect, it } from 'vitest';
import {
  CW_EVENT_SCHEDULE,
  cwEventAgenda,
  cwEventOccurrences,
  formatCwEventWindow,
} from './cw-events';
const ms = (value: string) => Date.parse(value);
describe('verified public live schedule', () => {
  it('has exactly the organizer UTC windows and explicit one-hour durations', () => {
    expect(
      CW_EVENT_SCHEDULE.events.flatMap((event) =>
        event.slots.map((slot) => [event.id, slot.weekdayUtc, slot.hourUtc, slot.durationMinutes]),
      ),
    ).toEqual([
      ['sst', 1, 0, 60],
      ['sst', 5, 20, 60],
      ['mst', 1, 13, 60],
      ['mst', 1, 19, 60],
      ['mst', 2, 3, 60],
      ['cwt', 3, 13, 60],
      ['cwt', 3, 19, 60],
      ['cwt', 4, 3, 60],
      ['cwt', 4, 7, 60],
    ]);
    expect(CW_EVENT_SCHEDULE.verifiedOn).toBe('2026-10-02');
    expect(
      CW_EVENT_SCHEDULE.events.every(
        (event) => event.sources.length && event.rulesUrl.startsWith('https:'),
      ),
    ).toBe(true);
  });
  it('keeps current through the last millisecond and selects next at exact end', () => {
    const start = ms('2026-10-02T20:00:00Z');
    expect(cwEventAgenda(start - 1).current).toEqual([]);
    expect(cwEventAgenda(start - 1).next.start).toBe(start);
    for (const now of [start, start + 3_599_999]) {
      expect(cwEventAgenda(now).current.map((event) => event.event.id)).toEqual(['sst']);
      expect(cwEventAgenda(now).next.start).toBe(ms('2026-10-05T00:00:00Z'));
    }
    expect(cwEventAgenda(start + 3_600_000).current).toEqual([]);
    expect(cwEventAgenda(start + 3_600_000).next.start).toBe(ms('2026-10-05T00:00:00Z'));
  });
  it('queries exact CWT windows for eligibility across year and week rollover', () => {
    const windows = cwEventOccurrences(
      ms('2025-12-31T13:30:00Z'),
      ms('2026-01-01T07:00:00Z'),
      'cwt',
    );
    expect(windows.map((event) => new Date(event.start).toISOString())).toEqual([
      '2025-12-31T13:00:00.000Z',
      '2025-12-31T19:00:00.000Z',
      '2026-01-01T03:00:00.000Z',
    ]);
    expect(windows.every((event) => event.end - event.start === 3_600_000)).toBe(true);
    expect(cwEventAgenda(ms('2026-01-01T03:30:00Z')).current[0].id).toBe(windows[2].id);
  });
  it('bounds upcoming lists and preserves immutable stable occurrence identity', () => {
    const now = ms('2026-12-31T23:59:59Z');
    const list = cwEventAgenda(now, 100).upcoming;
    expect(list).toHaveLength(100);
    expect(new Set(list.map((event) => event.id)).size).toBe(100);
    expect(list[0].start).toBe(ms('2027-01-01T20:00:00Z'));
    expect(cwEventAgenda(now, 1).next.id).toBe(list[0].id);
    expect(
      cwEventOccurrences(ms('2028-02-28T00:00:00Z'), ms('2028-03-01T00:00:00Z'), 'mst').map(
        (event) => new Date(event.start).getUTCDate(),
      ),
    ).toEqual([28, 28, 29]);
  });
  it('changes local date/DST display without changing UTC recurrence', () => {
    const before = cwEventAgenda(ms('2026-10-25T23:00:00Z')).next;
    const after = cwEventAgenda(ms('2026-11-01T23:00:00Z')).next;
    expect(after.start - before.start).toBe(7 * 86_400_000);
    expect(formatCwEventWindow(before, 'America/New_York')).toContain('Sun, Oct 25, 2026, 20:00');
    expect(formatCwEventWindow(after, 'America/New_York')).toContain('Sun, Nov 1, 2026, 19:00');
    const cwt = cwEventAgenda(ms('2026-10-07T18:00:00Z')).next;
    expect(formatCwEventWindow(cwt, 'Asia/Tokyo')).toContain('Thu, Oct 8, 2026, 04:00');
    expect(formatCwEventWindow(cwt, 'UTC')).toContain('Wed, Oct 7, 2026, 19:00');
  });
  it('rejects invalid clocks, inverted/unbounded ranges and invalid list sizes', () => {
    for (const now of [NaN, Infinity, -Infinity, 8.64e15])
      expect(() => cwEventAgenda(now)).toThrow();
    for (const limit of [0, 101, 1.1, NaN])
      expect(() => cwEventAgenda(Date.now(), limit)).toThrow();
    expect(() => cwEventOccurrences(1, 1)).toThrow();
    expect(() => cwEventOccurrences(0, 367 * 86_400_000)).toThrow();
  });
});
