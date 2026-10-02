import { classTimestamp, timedClassMeetings } from './class-schedule.ts';
import { cwEventOccurrences, type CwEventOccurrence } from './cw-events.ts';
import { courseMeetings, type Profile } from './training.ts';
import type { PlannedTask } from './plan.ts';

export interface LiveAssignmentDeadline {
  at: number;
  source: 'class-start' | 'class-date-start' | 'practice-date-end';
  timezone: string;
}
export interface LiveAssignmentStatus {
  state: 'active' | 'upcoming' | 'unavailable' | 'needs-deadline';
  deadline?: LiveAssignmentDeadline;
  current?: CwEventOccurrence;
  next?: CwEventOccurrence;
}

/** A practice date selects homework; its associated class is the live deadline. */
export function liveAssignmentDeadline(
  task: PlannedTask,
  profile: Profile,
): LiveAssignmentDeadline | undefined {
  if (task.exercise?.type !== 'live-event') return;
  if (task.exercise.deadline === 'associated-class' && task.lesson !== undefined) {
    const timed = timedClassMeetings(profile).find((meeting) => meeting.session === task.lesson);
    if (timed)
      return { at: Date.parse(timed.startsAt), source: 'class-start', timezone: timed.timezone };
    const dateOnly = courseMeetings(profile).find((meeting) => meeting.lesson === task.lesson);
    if (dateOnly) {
      const timezone = profile.classSchedule?.timezone ?? profile.timezone;
      try {
        return {
          at: Date.parse(classTimestamp(dateOnly.date, '00:00', timezone)),
          source: 'class-date-start',
          timezone,
        };
      } catch {
        // A skipped midnight/date cannot supply an invented class instant.
        return;
      }
    }
  }
  if (task.dueDate) {
    try {
      return {
        at: Date.parse(classTimestamp(task.dueDate, '23:59', profile.timezone)) + 60_000,
        source: 'practice-date-end',
        timezone: profile.timezone,
      };
    } catch {
      return;
    }
  }
}

/** The published policy is strict start-before-deadline, not end-before-deadline. */
export function liveAssignmentStatus(
  task: PlannedTask,
  profile: Profile,
  now: number,
): LiveAssignmentStatus | undefined {
  if (task.exercise?.type !== 'live-event') return;
  if (!Number.isFinite(now)) throw new Error('Choose a valid live assignment clock.');
  const deadline = liveAssignmentDeadline(task, profile);
  if (!deadline) return { state: 'needs-deadline' };
  // Include a still-running eligible event even when class starts within it.
  // A long course deadline never creates an unbounded recurrence query.
  const until = Math.max(now + 1, Math.min(deadline.at, now + 366 * 86_400_000));
  const windows = cwEventOccurrences(now, until, task.exercise.eventId).filter(
    (window) => window.start < deadline.at,
  );
  const current = windows.find((window) => window.start <= now && now < window.end);
  const next = windows.find((window) => window.start > now);
  return {
    state: current ? 'active' : next ? 'upcoming' : 'unavailable',
    deadline,
    ...(current ? { current } : {}),
    ...(next ? { next } : {}),
  };
}

/** Immediate recommendations exclude unavailable live work; preparation stays reachable. */
export function availableForImmediatePractice(task: PlannedTask, profile: Profile, now: number) {
  const live = liveAssignmentStatus(task, profile, now);
  return !live || live.state === 'active';
}
