import type { CurrentPracticeTime } from './practice-time';
import { isCalendarDate, type PracticeSession } from './training';

/** A save receipt retires the live count, including device saves awaiting upload. */
export function pendingListeningPasses(
  entries: readonly PracticeSession[],
  current: CurrentPracticeTime | undefined,
  today: string,
) {
  const listening = current?.listening;
  if (
    !current?.id ||
    !listening ||
    current.classTime ||
    !isCalendarDate(today) ||
    !isCalendarDate(current.date) ||
    current.date > today ||
    !Number.isFinite(current.seconds) ||
    current.seconds <= 0 ||
    current.seconds > 86400 ||
    !Number.isSafeInteger(listening.completedPasses) ||
    listening.completedPasses <= 0 ||
    !['assigned', 'review'].includes(listening.purpose) ||
    entries.some((entry) => entry.id === current.id)
  )
    return undefined;
  return listening;
}
