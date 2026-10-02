import { taskDueDate, type PlannedTask } from './plan.ts';
import { evidenceTime, sessionEvidence } from './practice-evidence.ts';
import {
  courseMeetings,
  isCalendarDate,
  validatePracticeSession,
  type PracticeSession,
  type Profile,
} from './training.ts';

/** Readonly observations from existing clocks, never a second clock or checkpoint. */
export interface CurrentPracticeTime {
  id: string;
  date: string;
  seconds: number;
  recallSeconds?: number;
  classTime?: boolean;
}
export interface PracticeTimeTotals {
  savedSeconds: number;
  currentSeconds: number;
  totalSeconds: number;
  recallSeconds: number;
}
export interface DailyPracticeTime {
  date: string;
  practice: PracticeTimeTotals;
  classTime: PracticeTimeTotals;
}
const empty = (): PracticeTimeTotals => ({
  savedSeconds: 0,
  currentSeconds: 0,
  totalSeconds: 0,
  recallSeconds: 0,
});

/** Server receipts precede local receipts. Even an edited zero/class receipt retires current. */
export function savedPracticeTime(entries: readonly PracticeSession[], date: string) {
  const ids = new Set<string>();
  const practice = empty();
  const classTime = empty();
  for (const entry of entries) {
    if (ids.has(entry.id)) continue;
    ids.add(entry.id);
    if (!isCalendarDate(date) || entry.date !== date) continue;
    try {
      const checked = validatePracticeSession(entry);
      const seconds = checked.minutes * 60;
      const totals = checked.context === 'class' ? classTime : practice;
      totals.savedSeconds += seconds;
      const evidence = sessionEvidence(checked.metadata);
      const legacy = checked.metadata?.legacyAttempt;
      const legacyRecall =
        legacy && typeof legacy === 'object' && !Array.isArray(legacy)
          ? (legacy as Record<string, unknown>).recallSeconds
          : undefined;
      const recall =
        evidence?.type === 'timed'
          ? evidenceTime(evidence).recallSeconds
          : typeof legacyRecall === 'number' && Number.isFinite(legacyRecall)
            ? legacyRecall
            : 0;
      totals.recallSeconds += Math.max(0, Math.min(seconds, recall));
    } catch {
      // Unreadable evidence cannot become summary credit.
    }
  }
  return { date, practice, classTime, ids };
}

/** A durable local receipt already owns saved time; a later upload adds nothing. */
export function practiceTimeWithCurrent(
  saved: ReturnType<typeof savedPracticeTime>,
  observations: readonly CurrentPracticeTime[],
): DailyPracticeTime {
  const practice = { ...saved.practice };
  const classTime = { ...saved.classTime };
  const seen = new Set(saved.ids);
  for (const current of observations) {
    if (seen.has(current.id)) continue;
    seen.add(current.id);
    if (
      !current.id ||
      !isCalendarDate(saved.date) ||
      current.date !== saved.date ||
      !Number.isFinite(current.seconds) ||
      current.seconds <= 0 ||
      current.seconds > 86400 ||
      (current.recallSeconds !== undefined &&
        (!Number.isFinite(current.recallSeconds) ||
          current.recallSeconds < 0 ||
          current.recallSeconds > current.seconds))
    )
      continue;
    const totals = current.classTime ? classTime : practice;
    totals.currentSeconds += current.seconds;
    totals.recallSeconds += current.recallSeconds ?? 0;
  }
  for (const totals of [practice, classTime])
    totals.totalSeconds = totals.savedSeconds + totals.currentSeconds;
  return { date: saved.date, practice, classTime };
}

/** Retained terminal drafts are current until their stable ID has a save receipt. */
export function currentPracticeFromResult(entry: PracticeSession): CurrentPracticeTime {
  return {
    id: entry.id,
    date: entry.date,
    seconds: entry.minutes * 60,
    classTime: entry.context === 'class',
  };
}

/** Assignment presence survives completion; earlier/undated preparation does not create a day. */
export function dailyPracticeGoals(profile: Profile, tasks: readonly PlannedTask[], date: string) {
  const meetings = courseMeetings(profile);
  const assigned =
    isCalendarDate(date) && tasks.some((task) => taskDueDate(task, meetings) === date);
  return {
    requiredMinutes: assigned ? profile.dailyGoalMinutes : 0,
    personalMinutes: profile.dailyGoalMinutes,
    restDay: !assigned,
  };
}
