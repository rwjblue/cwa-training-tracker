import { addDays, isCalendarDate, summarizePractice, type PracticeSession } from './training.ts';

export const PRACTICE_ACTIVITY_GROUPS = [
  { id: 'icr', label: 'Copy / code groups' },
  { id: 'simulator', label: 'Morse Runner' },
  { id: 'recordings', label: 'Recording listening' },
  { id: 'listening', label: 'Other listening' },
  { id: 'head-copy', label: 'Head copy' },
  { id: 'sending', label: 'Sending' },
  { id: 'on-air', label: 'On air · QSO / ragchew' },
  { id: 'pota', label: 'On air · POTA' },
  { id: 'sota', label: 'On air · SOTA' },
  { id: 'cwt', label: 'On air · CWT' },
  { id: 'contest', label: 'On air · contest' },
  { id: 'on-air-listening', label: 'On air · listening' },
  { id: 'on-air-other', label: 'Other on air' },
  { id: 'other', label: 'Other practice' },
] as const;

export type PracticeActivityGroup = (typeof PRACTICE_ACTIVITY_GROUPS)[number]['id'];
export interface PracticeActivityMinutes {
  id: PracticeActivityGroup;
  label: string;
  minutes: number;
}

/** Describe a saved session once; source measurements do not add more practice time. */
export function practiceActivityGroup(entry: PracticeSession): PracticeActivityGroup {
  if (entry.kind === 'on-air') {
    switch (entry.metadata?.onAirCategory) {
      case 'pota':
      case 'sota':
      case 'cwt':
      case 'contest':
        return entry.metadata.onAirCategory;
      case 'listening':
        return 'on-air-listening';
      case 'other':
        return 'on-air-other';
      default:
        return 'on-air';
    }
  }
  if (entry.kind === 'listening') {
    const evidence = entry.metadata?.evidence;
    const legacyAttempt = entry.metadata?.legacyAttempt;
    const legacyAudio =
      legacyAttempt && typeof legacyAttempt === 'object' && !Array.isArray(legacyAttempt)
        ? (legacyAttempt as Record<string, unknown>).audioResults
        : undefined;
    const recordings =
      evidence?.type === 'timed' ? evidence.recordings : entry.metadata?.recordings;
    if (
      (typeof entry.metadata?.recordingUrl === 'string' &&
        entry.metadata.recordingUrl.length > 0) ||
      (Array.isArray(recordings) && recordings.length > 0) ||
      (Array.isArray(legacyAudio) && legacyAudio.length > 0)
    )
      return 'recordings';
  }
  return entry.kind;
}

function activityMinutes(totals: Map<PracticeActivityGroup, number>): PracticeActivityMinutes[] {
  return PRACTICE_ACTIVITY_GROUPS.flatMap((group) => {
    const minutes = totals.get(group.id) ?? 0;
    return minutes > 0 ? [{ ...group, minutes }] : [];
  });
}

/** A rolling seven-day view with the same class, future-date and duplicate rules as streaks. */
export function summarizeRecentPractice(sessions: readonly PracticeSession[], today: string) {
  if (!isCalendarDate(today)) throw new Error('Invalid summary date.');
  const ids = new Set<string>();
  const practice = sessions.filter((session) => {
    if (ids.has(session.id)) return false;
    ids.add(session.id);
    return (
      session.context !== 'class' &&
      isCalendarDate(session.date) &&
      session.date <= today &&
      Number.isFinite(session.minutes) &&
      session.minutes > 0
    );
  });
  const days = Array.from({ length: 7 }, (_, index) => ({
    date: addDays(today, index - 6),
    minutes: 0,
    activities: [] as PracticeActivityMinutes[],
  }));
  const weekly = practice.filter((session) => session.date >= days[0].date);
  const weeklyTotals = new Map<PracticeActivityGroup, number>();
  for (const day of days) {
    const dayTotals = new Map<PracticeActivityGroup, number>();
    for (const session of weekly.filter((entry) => entry.date === day.date)) {
      const activity = practiceActivityGroup(session);
      day.minutes += session.minutes;
      dayTotals.set(activity, (dayTotals.get(activity) ?? 0) + session.minutes);
      weeklyTotals.set(activity, (weeklyTotals.get(activity) ?? 0) + session.minutes);
    }
    day.activities = activityMinutes(dayTotals);
  }
  const speeds = weekly.flatMap((entry) =>
    typeof entry.effectiveWpm === 'number' && Number.isFinite(entry.effectiveWpm)
      ? [entry.effectiveWpm]
      : [],
  );
  return {
    days,
    activities: activityMinutes(weeklyTotals),
    weekMinutes: days.reduce((total, day) => total + day.minutes, 0),
    sessionCount: weekly.length,
    activeDays: days.filter((day) => day.minutes > 0).length,
    latestSpeed: speeds.length ? Math.max(...speeds) : null,
    currentStreak: summarizePractice(practice, today).currentStreak,
  };
}
