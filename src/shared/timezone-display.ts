import { civilTimeCandidates } from './civil-time.ts';

/** Use the offset at the displayed instant, rather than today's DST setting.
 * Date-only labels use local noon, since they have no specific time of day.
 */
export function timezoneAbbreviation(
  timezone: string,
  at: string | number | Date = new Date(),
): string {
  try {
    const instant =
      typeof at === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(at)
        ? civilTimeCandidates(at, '12:00', timezone)[0]
        : typeof at === 'string'
          ? new Date(at)
          : at;
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    })
      .formatToParts(instant)
      .find((part) => part.type === 'timeZoneName')!.value;
  } catch {
    return 'Unknown timezone';
  }
}

/** Stable YYYY-MM-DD and 24-hour time, with a date-aware short timezone. */
export function formatZonedDateTime(at: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).formatToParts(at);
  const part = (key: string) => parts.find((item) => item.type === key)!.value;
  return `${part('year').padStart(4, '0')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')} ${part('timeZoneName')}`;
}
