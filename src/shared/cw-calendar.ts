import {
  CW_EVENT_SCHEDULE,
  cwSlotStart,
  PUBLIC_CW_CALENDAR_PATH,
  type CwEventSchedule,
} from './cw-events';

export function publicCwCalendarUrl(origin: string): string {
  return new URL(PUBLIC_CW_CALENDAR_PATH, new URL(origin).origin).href;
}
const timestamp = (value: number | string) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
const escape = (value: string) =>
  value
    .replaceAll('\\', '\\\\')
    .replaceAll('\r\n', '\n')
    .replaceAll('\r', '\n')
    .replaceAll('\n', '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');

/** RFC 5545 folding counts UTF-8 octets, including a continuation's leading space. */
export function foldCalendarLine(value: string): string {
  const lines: string[] = [];
  let line = '';
  let bytes = 0;
  const encoder = new TextEncoder();
  for (const character of value) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      lines.push(line);
      line = ' ';
      bytes = 1;
    }
    line += character;
    bytes += size;
  }
  lines.push(line);
  return lines.join('\r\n');
}

export function buildPublicCwCalendar(
  origin: string,
  schedule: CwEventSchedule = CW_EVENT_SCHEDULE,
): string {
  const agendaUrl = new URL('/#events', new URL(origin).origin).href;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CW Academy Companion//Live Practice//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:SST / MST / CWT live practice',
    'X-WR-CALDESC:Public organizer windows. Viewing or simulator practice does not establish participation.',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
    `X-CWA-SCHEDULE-VERSION:${schedule.verifiedOn}-${schedule.sequence}`,
    `URL:${publicCwCalendarUrl(origin)}`,
  ];
  for (const event of schedule.events)
    for (const slot of event.slots) {
      const start = cwSlotStart(slot);
      lines.push(
        'BEGIN:VEVENT',
        `UID:${slot.id}@cwa.n1rwj.com`,
        `DTSTAMP:${timestamp(schedule.modifiedAt)}`,
        `LAST-MODIFIED:${timestamp(schedule.modifiedAt)}`,
        `DTSTART:${timestamp(start)}`,
        `DTEND:${timestamp(start + slot.durationMinutes * 60_000)}`,
        'RRULE:FREQ=WEEKLY',
        `SEQUENCE:${schedule.sequence}`,
        'STATUS:CONFIRMED',
        'TRANSP:TRANSPARENT',
        `SUMMARY:${escape(`${event.id.toUpperCase()} — ${event.name}`)}`,
        `DESCRIPTION:${escape(`${event.organizer}\nOfficial rules: ${event.rulesUrl}\nLive agenda: ${agendaUrl}\nUTC schedule verified ${schedule.verifiedOn}.`)}`,
        `URL:${agendaUrl}`,
        'END:VEVENT',
      );
    }
  lines.push('END:VCALENDAR');
  return lines.map(foldCalendarLine).join('\r\n') + '\r\n';
}
