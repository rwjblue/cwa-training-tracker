import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRACTICE_PREFERENCES,
  PRACTICE_PREFERENCES_KEY,
  loadPracticePreferences,
  normalizePracticePreferences,
  savePracticePreferences,
} from './practice-preferences';

describe('browser practice preferences', () => {
  it('remembers independent sound and generation choices between visits', () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    };
    const preferences = {
      ...DEFAULT_PRACTICE_PREFERENCES,
      characterWpm: 35,
      effectiveWpm: 17,
      tone: 725,
      volume: 23,
      groupLength: 8,
      wordLength: 4 as const,
      mode: 'numbers' as const,
    };
    expect(savePracticePreferences(preferences, storage)).toBe(true);
    expect(loadPracticePreferences(storage)).toEqual(preferences);
    expect(data.has(PRACTICE_PREFERENCES_KEY)).toBe(true);
    expect(Object.keys(JSON.parse(data.get(PRACTICE_PREFERENCES_KEY)!))).not.toContain('text');
  });

  it('clamps saved values and prevents effective speed from exceeding character speed', () => {
    expect(
      normalizePracticePreferences({
        characterWpm: 5,
        effectiveWpm: 80,
        tone: 99999,
        volume: -10,
        groupLength: 200,
        wordLength: 11,
        mode: 'unknown',
      }),
    ).toEqual({
      characterWpm: 5,
      effectiveWpm: 5,
      tone: 1000,
      volume: 0,
      groupLength: 10,
      wordLength: 'mixed',
      mode: 'words',
    });
    expect(normalizePracticePreferences({ tone: 613 }).tone).toBe(625);
  });

  it('discards nonfinite and wrong-type values instead of scheduling invalid audio', () => {
    expect(
      normalizePracticePreferences({
        characterWpm: NaN,
        effectiveWpm: Infinity,
        tone: '600',
        volume: {},
        groupLength: [],
        wordLength: '5',
      }),
    ).toEqual(DEFAULT_PRACTICE_PREFERENCES);
  });

  it('still works when storage is absent, malformed, or blocked', () => {
    expect(loadPracticePreferences({ getItem: () => null })).toEqual(DEFAULT_PRACTICE_PREFERENCES);
    expect(loadPracticePreferences({ getItem: () => '{bad JSON' })).toEqual(
      DEFAULT_PRACTICE_PREFERENCES,
    );
    expect(
      loadPracticePreferences({
        getItem: () => {
          throw new Error('Blocked');
        },
      }),
    ).toEqual(DEFAULT_PRACTICE_PREFERENCES);
    expect(
      savePracticePreferences(DEFAULT_PRACTICE_PREFERENCES, {
        setItem: () => {
          throw new Error('Quota');
        },
      }),
    ).toBe(false);
  });
});
