import {
  addDays,
  courseMeetings,
  dateInTimezone,
  isCalendarDate,
  type Profile,
} from './training.ts';

export interface ClassTime {
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
}
export interface ClassException extends ClassTime {
  session: number;
  date: string;
  timezone?: string;
}
/** Civil meeting times retain their own zone when the learner's display zone changes. */
export interface ClassSchedule {
  version: 1;
  timezone: string;
  ordinary?: ClassTime;
  exceptions: ClassException[];
  joinUrl?: string;
}
export interface TimedClassMeeting {
  session: number;
  curriculumDate: string;
  date: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  exception: boolean;
}

function record(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected class schedule details.');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new Error('Unsupported class schedule field.');
  return input;
}
function timezone(value: unknown): string {
  if (typeof value !== 'string' || value.length > 100 || !value)
    throw new Error('Choose a meeting timezone.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
  } catch {
    throw new Error('Choose a valid meeting timezone.');
  }
  // Offset identifiers are not IANA zones. UTC and recognized IANA aliases work.
  if (/^[+-]/.test(value)) throw new Error('Choose an IANA meeting timezone.');
  return value;
}
function classTime(input: Record<string, unknown>): ClassTime {
  for (const field of ['startTime', 'endTime'] as const)
    if (typeof input[field] !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input[field]))
      throw new Error('Choose class start and end times in hours and minutes.');
  if (typeof input.endsNextDay !== 'boolean')
    throw new Error('Choose whether class ends the next day.');
  return {
    startTime: input.startTime as string,
    endTime: input.endTime as string,
    endsNextDay: input.endsNextDay,
  };
}

/** Keep access parameters intact. Only the private account may expose this link. */
export function validateClassJoinUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 4000 || !value.trim())
    throw new Error('Choose a class link of at most 4,000 characters.');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Choose a complete HTTP or HTTPS class link.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Class links must use HTTP or HTTPS without username/password credentials.');
  if (url.href.length > 4000)
    throw new Error('Choose a class link of at most 4,000 characters after URL encoding.');
  return url.href;
}

/** Reject skipped wall times; during a repeated hour select its earlier occurrence. */
export function classTimestamp(date: string, time: string, zone: string): string {
  if (!isCalendarDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error('Choose a valid class date and time.');
  timezone(zone);
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    era: 'short',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const wall = (instant: number) => {
    const parts = format.formatToParts(new Date(instant));
    const part = (key: string) => Number(parts.find((item) => item.type === key)!.value);
    const civil = new Date(0);
    const year =
      parts.find((item) => item.type === 'era')!.value === 'BC' ? 1 - part('year') : part('year');
    // Date.UTC interprets years 0–99 as 1900–1999; keep accepted dates literal.
    civil.setUTCFullYear(year, part('month') - 1, part('day'));
    civil.setUTCHours(part('hour'), part('minute'), part('second'), 0);
    return civil.getTime();
  };
  const target = Date.parse(`${date}T${time}:00Z`);
  const offsets = new Set(
    [-36, -24, -12, 0, 12, 24, 36].map((hours) => {
      const sample = target + hours * 3_600_000;
      return wall(sample) - sample;
    }),
  );
  const candidates = [...offsets]
    .map((offset) => target - offset)
    .filter((instant) => wall(instant) === target)
    .sort((a, b) => a - b);
  if (!candidates.length)
    throw new Error(
      `${date} ${time} does not exist in ${zone} because the clock changes. Choose another time.`,
    );
  return new Date(candidates[0]).toISOString();
}

/** Curriculum generation remains unchanged: exceptions move a meeting, not homework. */
export function timedClassMeetings(profile: Profile): TimedClassMeeting[] {
  const schedule = profile.classSchedule;
  if (!schedule) return [];
  const meetings = courseMeetings(profile)
    .flatMap((meeting): TimedClassMeeting[] => {
      const exception = schedule.exceptions.find((item) => item.session === meeting.lesson);
      const timing = exception ?? schedule.ordinary;
      if (!timing) return [];
      const date = exception?.date ?? meeting.date;
      const zone = exception?.timezone ?? schedule.timezone;
      const startsAt = classTimestamp(date, timing.startTime, zone);
      const endsAt = classTimestamp(
        addDays(date, timing.endsNextDay ? 1 : 0),
        timing.endTime,
        zone,
      );
      const duration = Date.parse(endsAt) - Date.parse(startsAt);
      if (duration < 60_000 || duration > 86_400_000)
        throw new Error(`Session ${meeting.lesson} must end after it starts, within 24 hours.`);
      return [
        {
          session: meeting.lesson,
          curriculumDate: meeting.date,
          date,
          timezone: zone,
          startsAt,
          endsAt,
          exception: Boolean(exception),
        },
      ];
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.session - b.session);
  for (let index = 1; index < meetings.length; index++)
    if (meetings[index].startsAt < meetings[index - 1].endsAt)
      throw new Error('Class meetings cannot overlap. Check the individual exceptions.');
  return meetings;
}

export function validateClassSchedule(
  value: unknown,
  profile: Profile,
  checkMeetings = true,
): ClassSchedule {
  const input = record(value, ['version', 'timezone', 'ordinary', 'exceptions', 'joinUrl']);
  if (input.version !== 1) throw new Error('Unsupported class schedule version.');
  if (!Array.isArray(input.exceptions) || input.exceptions.length > 16)
    throw new Error('Use at most one class exception per session.');
  const seen = new Set<number>();
  const schedule: ClassSchedule = {
    version: 1,
    timezone: timezone(input.timezone),
    exceptions: input.exceptions
      .map((value) => {
        const row = record(value, [
          'session',
          'date',
          'startTime',
          'endTime',
          'endsNextDay',
          'timezone',
        ]);
        if (
          typeof row.session !== 'number' ||
          !Number.isInteger(row.session) ||
          row.session < 1 ||
          row.session > 16 ||
          seen.has(row.session)
        )
          throw new Error('Use a unique known class session from 1 through 16.');
        seen.add(row.session);
        if (!isCalendarDate(row.date)) throw new Error('Choose a valid exception date.');
        return {
          session: row.session,
          date: row.date,
          ...classTime(row),
          ...(row.timezone === undefined ? {} : { timezone: timezone(row.timezone) }),
        };
      })
      .sort((a, b) => a.session - b.session),
  };
  if (input.ordinary !== undefined)
    schedule.ordinary = classTime(record(input.ordinary, ['startTime', 'endTime', 'endsNextDay']));
  if (input.joinUrl !== undefined && input.joinUrl !== '')
    schedule.joinUrl = validateClassJoinUrl(input.joinUrl);
  if (checkMeetings) {
    if ((schedule.ordinary || schedule.exceptions.length) && !profile.firstClassDate)
      throw new Error('Set your first class date before adding meeting times.');
    timedClassMeetings({ ...profile, classSchedule: schedule });
  }
  return schedule;
}

export function classMeetingStatus(profile: Profile, now: Date) {
  const meetings = timedClassMeetings(profile);
  const time = now.getTime();
  const active = meetings.find(
    (item) => Date.parse(item.startsAt) <= time && time < Date.parse(item.endsAt),
  );
  const next = meetings.find((item) => Date.parse(item.startsAt) > time);
  const today = dateInTimezone(now, profile.timezone);
  const finished = meetings
    .filter(
      (item) =>
        Date.parse(item.endsAt) <= time && dateInTimezone(item.endsAt, profile.timezone) === today,
    )
    .at(-1);
  return { active, next, finished };
}
