import { useEffect, useState } from 'react';
import { liveAssignmentStatus } from '../shared/live-assignment';
import type { PlannedTask } from '../shared/plan';
import type { Profile } from '../shared/training';

/** One application calendar observation; never measures or mutates practice. */
export function useLiveEventTime(tasks: readonly PlannedTask[], profile: Profile) {
  const [now, setNow] = useState(Date.now);
  const enabled = tasks.some((task) => task.exercise?.type === 'live-event');
  useEffect(() => {
    if (!enabled) return;
    let timer: number;
    const refresh = () => {
      window.clearTimeout(timer);
      const observed = Date.now();
      setNow(observed);
      const boundaries = tasks.flatMap((task) => {
        const status = liveAssignmentStatus(task, profile, observed);
        return [status?.current?.end, status?.next?.start, status?.deadline?.at].filter(
          (value): value is number => value !== undefined && value > observed,
        );
      });
      // Re-arm even when the wall clock repeats or moves backwards. Observation
      // must not depend on React accepting a changed timestamp as new state.
      timer = window.setTimeout(
        refresh,
        Math.max(1, Math.min(60_000, ...boundaries.map((boundary) => boundary - observed))),
      );
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [tasks, profile, enabled]);
  return now;
}
