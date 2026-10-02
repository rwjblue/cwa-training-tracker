import { expect, it } from 'vitest';
import { EVENT_TIME_MODE_KEY, loadEventTimeMode, saveEventTimeMode } from './event-preferences';
it('keeps the public display choice usable with missing, corrupt or refused storage', () => {
  for (const value of [null, '', 'UTC', 'private', '{}'])
    expect(loadEventTimeMode({ getItem: () => value })).toBe('local');
  expect(loadEventTimeMode({ getItem: () => 'utc' })).toBe('utc');
  expect(
    loadEventTimeMode({
      getItem: () => {
        throw new Error('Unavailable');
      },
    }),
  ).toBe('local');
  const retained = new Map<string, string>();
  expect(
    saveEventTimeMode('utc', {
      setItem: (key, value) => {
        retained.set(key, value);
      },
    }),
  ).toBe(true);
  expect(retained.get(EVENT_TIME_MODE_KEY)).toBe('utc');
  expect(
    saveEventTimeMode('local', {
      setItem: () => {
        throw new Error('Refused');
      },
    }),
  ).toBe(false);
});
