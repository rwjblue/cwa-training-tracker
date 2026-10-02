/** Public organizer schedule. No account, course or practice-result state belongs here. */
export type CwEventId = 'sst' | 'mst' | 'cwt';
export interface CwEventSlot {
  /** Logical series identity: keep this ID when its published time changes. */
  readonly id: string;
  readonly weekdayUtc: number;
  readonly hourUtc: number;
  readonly durationMinutes: number;
}
export interface CwEventDefinition {
  readonly id: CwEventId;
  readonly name: string;
  readonly organizer: string;
  readonly rulesUrl: string;
  readonly sources: readonly string[];
  readonly slots: readonly CwEventSlot[];
}
export interface CwEventSchedule {
  readonly verifiedOn: string;
  readonly modifiedAt: string;
  readonly sequence: number;
  readonly events: readonly CwEventDefinition[];
}

// Verified against the current organizer pages on 2026-10-02. All rules use UTC.
// Increment sequence and modifiedAt for every published calendar change. Never
// rename an existing slot merely because its weekday/hour changes.
export const CW_EVENT_SCHEDULE: CwEventSchedule = {
  verifiedOn: '2026-10-02',
  modifiedAt: '2026-10-02T00:00:00.000Z',
  sequence: 1,
  events: [
    {
      id: 'sst',
      name: 'Slow Speed Test',
      organizer: 'K1USN Radio Club',
      rulesUrl: 'https://www.k1usn.com/sst_rules.html',
      sources: [
        'https://www.k1usn.com/sst_rules.html',
        'https://docs.google.com/document/d/e/2PACX-1vTFtjDXVkS_wGX2XmBV4P8VyT40iSx_NJcx-m2C9Gb9ANJiCMwNeZdpqk_P8DMNJ2OvIGHydv5e36lQ/pub?embedded=true',
      ],
      slots: [
        { id: 'sst-first', weekdayUtc: 1, hourUtc: 0, durationMinutes: 60 },
        { id: 'sst-second', weekdayUtc: 5, hourUtc: 20, durationMinutes: 60 },
      ],
    },
    {
      id: 'mst',
      name: 'Medium Speed Test',
      organizer: 'International CW Council',
      rulesUrl: 'https://internationalcwcouncil.org/mst-contest/',
      sources: ['https://internationalcwcouncil.org/mst-contest/'],
      slots: [
        { id: 'mst-first', weekdayUtc: 1, hourUtc: 13, durationMinutes: 60 },
        { id: 'mst-second', weekdayUtc: 1, hourUtc: 19, durationMinutes: 60 },
        { id: 'mst-third', weekdayUtc: 2, hourUtc: 3, durationMinutes: 60 },
      ],
    },
    {
      id: 'cwt',
      name: 'CWops Test',
      organizer: 'CWops',
      rulesUrl: 'https://cwops.org/cwops-tests/',
      sources: ['https://cwops.org/cwops-tests/'],
      slots: [
        { id: 'cwt-first', weekdayUtc: 3, hourUtc: 13, durationMinutes: 60 },
        { id: 'cwt-second', weekdayUtc: 3, hourUtc: 19, durationMinutes: 60 },
        { id: 'cwt-third', weekdayUtc: 4, hourUtc: 3, durationMinutes: 60 },
        { id: 'cwt-fourth', weekdayUtc: 4, hourUtc: 7, durationMinutes: 60 },
      ],
    },
  ],
};

export const PUBLIC_CW_CALENDAR_PATH = '/api/live-practice/calendar.ics';
const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** Fixed Monday anchor keeps calendar DTSTART stable between publications. */
export const CW_EVENT_ANCHOR = Date.UTC(2020, 0, 6);
export interface CwEventOccurrence {
  readonly id: string;
  readonly slotId: string;
  readonly event: CwEventDefinition;
  readonly start: number;
  readonly end: number;
}

export function cwSlotStart(slot: CwEventSlot): number {
  return CW_EVENT_ANCHOR + ((slot.weekdayUtc - 1 + 7) % 7) * DAY_MS + slot.hourUtc * 3_600_000;
}

/** Half-open query: return windows overlapping [from, until), at most one year. */
export function cwEventOccurrences(
  from: number,
  until: number,
  eventId?: CwEventId,
  schedule = CW_EVENT_SCHEDULE,
): CwEventOccurrence[] {
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(until) ||
    Math.abs(from) > 8.64e15 ||
    Math.abs(until) > 8.64e15 ||
    until <= from ||
    until - from > 366 * DAY_MS
  )
    throw new Error('Choose a valid live-event range of at most 366 days.');
  const occurrences: CwEventOccurrence[] = [];
  for (const event of schedule.events) {
    if (eventId && event.id !== eventId) continue;
    for (const slot of event.slots) {
      const anchor = cwSlotStart(slot);
      const duration = slot.durationMinutes * 60_000;
      // Include an occurrence already in progress, excluding its exact end.
      let start = anchor + (Math.floor((from - duration - anchor) / WEEK_MS) + 1) * WEEK_MS;
      for (; start < until; start += WEEK_MS) {
        occurrences.push({
          id: `${slot.id}:${new Date(start).toISOString()}`,
          slotId: slot.id,
          event,
          start,
          end: start + duration,
        });
      }
    }
  }
  return occurrences.sort((a, b) => a.start - b.start || a.slotId.localeCompare(b.slotId));
}

export function cwEventAgenda(now: number, limit = 9) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Choose between 1 and 100 upcoming live events.');
  // Nine verified weekly slots; the bounded horizon supports even a CWT-only
  // consumer independently through cwEventOccurrences rather than UI filtering.
  const events = cwEventOccurrences(now, now + 90 * DAY_MS);
  const current = events.filter((event) => event.start <= now && now < event.end);
  const upcoming = events.filter((event) => event.start > now).slice(0, limit);
  return { current, next: upcoming[0], upcoming };
}

export function formatCwEventWindow(event: CwEventOccurrence, timezone: string): string {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  return `${format.format(event.start)} – ${format.format(event.end)}`;
}

export function cwEventCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  return `${days ? `${days}d ` : ''}${hours ? `${hours}h ` : ''}${minutes}m ${seconds % 60}s`;
}
