import ICAL from 'ical.js';
import { describe, expect, it } from 'vitest';
import { buildPublicCwCalendar, foldCalendarLine } from './cw-calendar';
import { CW_EVENT_SCHEDULE, cwEventOccurrences } from './cw-events';
const origin = 'https://cwa.n1rwj.com';
const parsed = (body: string) => new ICAL.Component(ICAL.parse(body));
describe('public recurring calendar import', () => {
  it('imports nine unique recurring series and matches shared windows across DST/year', () => {
    const body = buildPublicCwCalendar(origin);
    const calendar = parsed(body);
    const components = calendar.getAllSubcomponents('vevent');
    expect(components).toHaveLength(9);
    expect(new Set(components.map((event) => event.getFirstPropertyValue('uid'))).size).toBe(9);
    for (const [from, until] of [
      ['2026-10-25T00:00:00Z', '2026-11-03T00:00:00Z'],
      ['2026-12-30T00:00:00Z', '2027-01-05T00:00:00Z'],
    ]) {
      const expected = cwEventOccurrences(Date.parse(from), Date.parse(until));
      const imported: { start: number; end: number; slotId: string }[] = [];
      for (const component of components) {
        const event = new ICAL.Event(component);
        const iterator = event.iterator();
        let occurrence;
        // Parser expansion, not our recurrence algorithm, independently imports
        // the same series from its stable calendar anchor.
        while ((occurrence = iterator.next())) {
          const details = event.getOccurrenceDetails(occurrence);
          const start = details.startDate.toJSDate().getTime();
          const end = details.endDate.toJSDate().getTime();
          if (start >= Date.parse(until)) break;
          if (end > Date.parse(from))
            imported.push({ start, end, slotId: String(event.uid).split('@')[0] });
        }
      }
      expect(imported.sort((a, b) => a.start - b.start)).toEqual(
        expected.map(({ start, end, slotId }) => ({ start, end, slotId })),
      );
    }
    expect(body.replaceAll('\r\n', '')).not.toContain('\n');
    expect(body).not.toMatch(/account|token|joinUrl|training result|PRIVATE/);
    expect(calendar.getFirstPropertyValue('url')).toBe(`${origin}/api/live-practice/calendar.ics`);
  });
  it('revises times without duplicating UIDs and deliberately advances sequence/version', () => {
    const original = parsed(buildPublicCwCalendar(origin)).getAllSubcomponents('vevent');
    const revised = parsed(
      buildPublicCwCalendar(origin, {
        ...CW_EVENT_SCHEDULE,
        verifiedOn: '2026-10-03',
        modifiedAt: '2026-10-03T00:00:00Z',
        sequence: 2,
        events: CW_EVENT_SCHEDULE.events.map((event) => ({
          ...event,
          slots: event.slots.map((slot) =>
            slot.id === 'sst-first' ? { ...slot, hourUtc: 1 } : slot,
          ),
        })),
      }),
    ).getAllSubcomponents('vevent');
    expect(revised.map((event) => event.getFirstPropertyValue('uid'))).toEqual(
      original.map((event) => event.getFirstPropertyValue('uid')),
    );
    expect(revised.every((event) => Number(event.getFirstPropertyValue('sequence')) === 2)).toBe(
      true,
    );
    expect(String(revised[0].getFirstPropertyValue('dtstart'))).toContain('T01:00:00Z');
    expect(revised[0].getFirstPropertyValue('last-modified')).not.toEqual(
      original[0].getFirstPropertyValue('last-modified'),
    );
  });
  it('folds Unicode by octets and parses escaped organizer text without loss', () => {
    const text = 'Organizer é漢🙂; one, two\\three\nnew line '.repeat(8);
    const body = buildPublicCwCalendar('http://localhost:8791', {
      ...CW_EVENT_SCHEDULE,
      events: [
        {
          ...CW_EVENT_SCHEDULE.events[0],
          name: text,
          slots: [CW_EVENT_SCHEDULE.events[0].slots[0]],
        },
      ],
    });
    expect(body.split('\r\n').every((line) => new TextEncoder().encode(line).length <= 75)).toBe(
      true,
    );
    expect(parsed(body).getFirstSubcomponent('vevent')!.getFirstPropertyValue('summary')).toBe(
      `SST — ${text}`,
    );
    expect(foldCalendarLine('é'.repeat(75)).replaceAll('\r\n ', '')).toBe('é'.repeat(75));
    expect(body).toContain('http://localhost:8791/#events');
    expect(body).not.toContain('https://rwjblue.com');
  });
});
