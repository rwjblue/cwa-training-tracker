/** Public device choice; never contains an account, task, or recording identity. */
export const COURSE_REPLAY_STORAGE_KEY = 'cwa.recording.course-replay.v1';

export function loadCourseReplay(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    return (storage ?? window.localStorage).getItem(COURSE_REPLAY_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function saveCourseReplay(
  enabled: boolean,
  storage?: Pick<Storage, 'setItem' | 'getItem'>,
): boolean {
  try {
    const target = storage ?? window.localStorage;
    const value = JSON.stringify(enabled);
    target.setItem(COURSE_REPLAY_STORAGE_KEY, value);
    return target.getItem(COURSE_REPLAY_STORAGE_KEY) === value;
  } catch {
    return false;
  }
}

/** Only observed completion can continue a required course block. */
export function shouldReplayCourse({
  enabled,
  completed,
  minimumPasses,
  savedPasses,
  currentPasses,
  extraReview,
}: {
  enabled: boolean;
  completed: boolean;
  minimumPasses?: number;
  savedPasses: number;
  currentPasses: number;
  extraReview: boolean;
}): boolean {
  return (
    enabled &&
    completed &&
    !extraReview &&
    minimumPasses !== undefined &&
    Number.isSafeInteger(minimumPasses) &&
    minimumPasses > 0 &&
    Number.isSafeInteger(savedPasses) &&
    savedPasses >= 0 &&
    Number.isSafeInteger(currentPasses) &&
    currentPasses >= 0 &&
    savedPasses + currentPasses < minimumPasses
  );
}
