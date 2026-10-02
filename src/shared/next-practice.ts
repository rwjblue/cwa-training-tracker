import { classMeetingStatus } from './class-schedule';
import { availableForImmediatePractice, liveAssignmentStatus } from './live-assignment';
import { dailyPlanSummary, type DailyPlannedTask, type PlannedTask } from './plan';
import { courseMeetings, dateInTimezone, type PracticeSession, type Profile } from './training';

export interface BlockedPractice {
  item: DailyPlannedTask;
  reason: 'recording' | 'live-window';
}

/** Selection only. Opening, saving and completing remain deliberate actions. */
export function nextPracticePlan(
  tasks: readonly PlannedTask[],
  entries: readonly PracticeSession[],
  profile: Profile,
  now: number,
) {
  if (!Number.isFinite(now)) throw new Error('Choose a valid planning clock.');
  const date = new Date(now);
  const today = dateInTimezone(date, profile.timezone);
  const plan = dailyPlanSummary(tasks, courseMeetings(profile), entries, today);
  const pinnedIds = new Set(plan.pinned.map(({ task }) => task.id));
  // Stable ties retain the shared plan's lesson/creation/identity ordering.
  const candidates = [...plan.assignedToday, ...plan.pinned, ...plan.earlier]
    .filter(({ task }) => !task.done && (!task.dismissedFromToday || pinnedIds.has(task.id)))
    .sort(
      (a, b) =>
        Number(b.dueDate === today) - Number(a.dueDate === today) ||
        Number(pinnedIds.has(b.task.id)) - Number(pinnedIds.has(a.task.id)) ||
        a.dueDate!.localeCompare(b.dueDate!) ||
        Number(b.status === 'started') - Number(a.status === 'started'),
    );
  const eligible: DailyPlannedTask[] = [];
  const blocked: BlockedPractice[] = [];
  for (const item of candidates) {
    const resource = item.task.exercise;
    if (resource?.type === 'audio' && (!resource.url || resource.unresolved))
      blocked.push({ item, reason: 'recording' });
    else if (!availableForImmediatePractice(item.task, profile, now))
      blocked.push({ item, reason: 'live-window' });
    else eligible.push(item);
  }
  const activeClass = classMeetingStatus(profile, date).active;
  return {
    today,
    activeClass,
    next: activeClass ? undefined : eligible[0],
    eligible,
    blocked,
    // Undated class preparation is visible, never automatically advanced.
    preparation: plan.preparation.filter(({ task }) => !task.dismissedFromToday),
    unscheduled: plan.unscheduled.filter(({ task }) => !task.dismissedFromToday),
    nextPracticeDate: plan.nextPracticeDate,
    allComplete: tasks.length > 0 && tasks.every((task) => task.done),
  };
}

export function blockedPracticeExplanation(
  blocked: BlockedPractice,
  profile: Profile,
  now: number,
) {
  if (blocked.reason === 'recording')
    return blocked.item.task.exercise?.type === 'audio'
      ? (blocked.item.task.exercise.unresolved ??
          'The recording is unavailable. Check the official instructions.')
      : 'The recording is unavailable. Check the official instructions.';
  const live = liveAssignmentStatus(blocked.item.task, profile, now);
  return live?.state === 'needs-deadline'
    ? 'Set a class or practice deadline before choosing an event window.'
    : live?.state === 'upcoming'
      ? 'A live window is coming up. Prepare now and return when it starts.'
      : 'No eligible live window remains before this deadline. Check the instructions with your advisor.';
}
