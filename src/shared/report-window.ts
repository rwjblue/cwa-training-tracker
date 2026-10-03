import { timedClassMeetings } from './class-schedule.ts';
import {
  addDays,
  courseMeetings,
  dateInTimezone,
  isCalendarDate,
  type Profile,
} from './training.ts';
import type { PlannedTask } from './plan.ts';

export interface AdvisorReportWindow {
  session: number;
  reportDate: string;
  timezone: string;
  preparationDates: string[];
  meetingDate?: string;
  meetingStartsAt?: string;
  fromDate: string;
  toDate: string;
  empty: boolean;
  fallback: boolean;
  explanation: string;
}
/** Date-only homework stays on its original dates; meeting exceptions are disclosed separately. */
export function advisorReportWindow(
  profile: Profile,
  tasks: readonly PlannedTask[],
  session: number,
  reportDate: string,
  now = new Date(),
): AdvisorReportWindow {
  const meeting = courseMeetings(profile).find((meeting) => meeting.lesson === session);
  if (!Number.isInteger(session) || session < 1 || session > 16 || !isCalendarDate(reportDate))
    throw new Error('Choose a class session and a valid report date.');
  const timed = timedClassMeetings(profile).find((meeting) => meeting.session === session);
  const timezone = timed?.timezone ?? profile.classSchedule?.timezone ?? profile.timezone;
  const today = dateInTimezone(now, timezone);
  if (reportDate > today)
    throw new Error('A report date cannot be in the future in the course timezone.');
  const preparationDates = [
    ...new Set(
      tasks
        .filter((task) => task.lesson === session && task.dueDate && isCalendarDate(task.dueDate))
        .map((task) => task.dueDate!),
    ),
  ].sort();
  const meetingDate = timed ? dateInTimezone(timed.startsAt, timezone) : meeting?.date;
  const end = preparationDates.at(-1) ?? meetingDate ?? reportDate;
  const fromDate = preparationDates[0] ?? addDays(end, -2);
  const toDate = reportDate < end ? reportDate : end;
  const empty = toDate < fromDate;
  const fallback = !preparationDates.length;
  const basis = fallback
    ? `No dated preparation exercises were found. Use the two days before ${meetingDate ? 'the class date' : 'the chosen report date'} through that date, capped at your report date.`
    : 'The inclusive window follows the dated preparation exercises for this session.';
  const explanation = empty
    ? `${basis} Preparation has not started by this report date. The window is empty and includes no future evidence.`
    : reportDate < end
      ? `${basis} Early report: the window ends at your chosen report date.`
      : basis;
  return {
    session,
    reportDate,
    timezone,
    preparationDates,
    ...(meetingDate ? { meetingDate } : {}),
    ...(timed ? { meetingStartsAt: timed.startsAt } : {}),
    fromDate,
    toDate,
    empty,
    fallback,
    explanation,
  };
}
