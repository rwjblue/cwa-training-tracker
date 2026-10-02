export type EventTimeMode = 'local' | 'utc';
export const EVENT_TIME_MODE_KEY = 'cwa.live-practice.time-mode.v1';
export const validEventTimeMode = (value: unknown): value is EventTimeMode =>
  value === 'local' || value === 'utc';
export function loadEventTimeMode(storage?: Pick<Storage, 'getItem'>): EventTimeMode {
  try {
    const value = (storage ?? window.localStorage).getItem(EVENT_TIME_MODE_KEY);
    return validEventTimeMode(value) ? value : 'local';
  } catch {
    return 'local';
  }
}
export function saveEventTimeMode(
  value: EventTimeMode,
  storage?: Pick<Storage, 'setItem'>,
): boolean {
  try {
    (storage ?? window.localStorage).setItem(EVENT_TIME_MODE_KEY, value);
    return true;
  } catch {
    return false;
  }
}
