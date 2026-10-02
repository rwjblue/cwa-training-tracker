import { useEffect, useRef } from 'react';
import type { CurrentPracticeTime } from '../shared/practice-time';

/** Publish readable seconds and settled precision without promoting the projection to an owner. */
export function usePracticeTimeProjection(
  current: CurrentPracticeTime | undefined,
  settled: boolean,
  onChange?: (current: CurrentPracticeTime | undefined) => void,
) {
  const latest = useRef({ current, onChange });
  latest.current = { current, onChange };
  const key = current
    ? JSON.stringify([
        current.id,
        current.date,
        current.classTime,
        settled ? current.seconds : Math.floor(current.seconds),
        settled ? current.recallSeconds : Math.floor(current.recallSeconds ?? 0),
      ])
    : '';
  useEffect(() => {
    latest.current.onChange?.(latest.current.current);
  }, [key, settled]);
}
