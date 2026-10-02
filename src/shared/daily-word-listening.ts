import { sessionEvidence } from './practice-evidence.ts';
import { isCalendarDate, validatePracticeSession, type PracticeSession } from './training.ts';
import type { CurrentPracticeTime } from './practice-time.ts';

export const DAILY_WORD_LISTENING_SECONDS = 600;

/** Source subtotals are raw facts, not selected tools or corrected stopwatch estimates. */
export function dailyWordListening(
  entries: readonly PracticeSession[],
  current: readonly CurrentPracticeTime[],
  date: string,
) {
  const seen = new Set<string>();
  let savedSeconds = 0;
  let currentSeconds = 0;
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    // A server/local receipt retires its live owner even after date/class edits.
    seen.add(entry.id);
    if (!isCalendarDate(date) || entry.date !== date || entry.context === 'class') continue;
    try {
      const checked = validatePracticeSession(entry);
      if (checked.evidenceMode === 'historical') continue;
      const evidence = sessionEvidence(checked.metadata);
      if (evidence?.type === 'timed') savedSeconds += evidence.wordListeningSeconds ?? 0;
    } catch {
      // Unreadable or pre-measurement records cannot supply word-listening credit.
    }
  }
  for (const observation of current) {
    if (seen.has(observation.id)) continue;
    seen.add(observation.id);
    const words = observation.wordListeningSeconds;
    if (
      !observation.id ||
      !isCalendarDate(date) ||
      observation.date !== date ||
      observation.classTime ||
      typeof words !== 'number' ||
      !Number.isFinite(words) ||
      words < 0 ||
      !Number.isFinite(observation.seconds) ||
      observation.seconds > 86400 ||
      words - (observation.seconds - (observation.recallSeconds ?? 0)) >
        Number.EPSILON * 16 * Math.max(words, observation.seconds) ||
      !Number.isFinite(observation.recallSeconds ?? 0) ||
      (observation.recallSeconds ?? 0) < 0
    )
      continue;
    currentSeconds += words;
  }
  const totalSeconds = savedSeconds + currentSeconds;
  return {
    date,
    savedSeconds,
    currentSeconds,
    totalSeconds,
    remainingSeconds: Math.max(0, DAILY_WORD_LISTENING_SECONDS - totalSeconds),
    reachedGoal: totalSeconds >= DAILY_WORD_LISTENING_SECONDS,
  };
}
