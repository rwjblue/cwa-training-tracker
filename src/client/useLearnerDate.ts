import { useEffect, useState } from 'react';
import { dateInTimezone } from '../shared/training';

/** One app calendar refresh, independent of whether its retained clock is paused. */
export function useLearnerDate(timezone: string) {
  const [date, setDate] = useState(() => dateInTimezone(new Date(), timezone));
  useEffect(() => {
    const refresh = () => setDate(dateInTimezone(new Date(), timezone));
    refresh();
    const interval = window.setInterval(refresh, 1000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [timezone]);
  // Do not show the previous zone's day during a preference change.
  const observed = dateInTimezone(new Date(), timezone);
  return date === observed ? date : observed;
}
