import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRACTICE_PREFERENCES,
  listeningPreferences,
  changeListeningPreferences,
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
      ...DEFAULT_PRACTICE_PREFERENCES,
      tool: 'free',
      characterWpm: 5,
      effectiveWpm: 5,
      tone: 1000,
      qsoSettings: {
        ...DEFAULT_PRACTICE_PREFERENCES.qsoSettings,
        characterWpm: 5,
        effectiveWpm: 5,
        tone: 1000,
      },
      volume: 0,
      groupLength: 10,
      wordLength: 'mixed',
      mode: 'words',
    });
    expect(normalizePracticePreferences({ tone: 613 }).tone).toBe(613);
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

it('retains both Story speeds/selection independently and migrates old shared settings', () => {
  let current = normalizePracticePreferences({ characterWpm: 35, effectiveWpm: 17, tone: 725 });
  const common = { characterWpm: 35, effectiveWpm: 17, tone: 725 };
  current = changeListeningPreferences(current, { tool: 'stories' });
  expect(listeningPreferences(current)).toMatchObject({
    characterWpm: 20,
    effectiveWpm: 10,
    tone: 600,
  });
  current = changeListeningPreferences(current, {
    characterWpm: 28,
    effectiveWpm: 14,
    tone: 650,
    hideTrainerText: false,
  });
  current = changeListeningPreferences(current, {
    storySettings: { ...current.storySettings, storyId: 'story-light' },
  });
  expect(current).toMatchObject(common);
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
  expect(savePracticePreferences(current, storage)).toBe(true);
  current = loadPracticePreferences(storage);
  expect(listeningPreferences(current)).toMatchObject({
    characterWpm: 28,
    effectiveWpm: 14,
    tone: 650,
    hideTrainerText: false,
  });
  expect(current.storySettings.storyId).toBe('story-light');
  current = changeListeningPreferences(current, { tool: 'qso' });
  expect(listeningPreferences(current)).toMatchObject(common);
  current = changeListeningPreferences(current, { tool: 'stories' });
  expect(listeningPreferences(current)).toMatchObject({ characterWpm: 28, effectiveWpm: 14 });
  const malformed = normalizePracticePreferences({
    storySettings: {
      version: 1,
      storyId: 'private',
      characterWpm: 5,
      effectiveWpm: 50,
      tone: Infinity,
    },
  });
  expect(malformed.storySettings).toMatchObject({
    storyId: 'story-trail',
    characterWpm: 5,
    effectiveWpm: 5,
    tone: 600,
  });
});

it('migrates low legacy speeds and preserves exact independent mode setups through storage', () => {
  let current = normalizePracticePreferences({
    version: 1,
    characterWpm: 5,
    effectiveWpm: 3,
    tone: 617,
    wordGap: 0.3,
  });
  expect(current).toMatchObject({
    version: 2,
    characterWpm: 5,
    effectiveWpm: 3,
    tone: 617,
    wordGap: 0.3,
  });
  expect(current.qsoSettings).toMatchObject({ characterWpm: 5, effectiveWpm: 3, tone: 617 });
  current = changeListeningPreferences(current, { characterWpm: 55, effectiveWpm: 55 });
  current = changeListeningPreferences(current, { tool: 'qso' });
  current = changeListeningPreferences(current, { characterWpm: 20, effectiveWpm: 8, tone: 731 });
  current = changeListeningPreferences(current, { tool: 'stories' });
  current = changeListeningPreferences(current, { characterWpm: 60, effectiveWpm: 51, tone: 419 });
  let raw = '';
  expect(
    savePracticePreferences(current, {
      setItem: (_key, value) => {
        raw = value;
      },
    }),
  ).toBe(true);
  current = loadPracticePreferences({ getItem: () => raw });
  for (const [tool, characterWpm, effectiveWpm, tone] of [
    ['words', 55, 55, 617],
    ['qso', 20, 8, 731],
    ['stories', 60, 51, 419],
  ] as const) {
    current = changeListeningPreferences(current, { tool });
    expect(listeningPreferences(current)).toMatchObject({ characterWpm, effectiveWpm, tone });
  }
  expect(current.wordGap).toBe(0.3);
  expect(normalizePracticePreferences({ version: 99, characterWpm: 60 })).toEqual(
    DEFAULT_PRACTICE_PREFERENCES,
  );
  expect(
    normalizePracticePreferences({
      characterWpm: 70,
      effectiveWpm: 80,
      tone: 617.6,
      wordGap: 0.34,
    }),
  ).toMatchObject({ characterWpm: 60, effectiveWpm: 60, tone: 618, wordGap: 0.3 });
  expect(
    normalizePracticePreferences({ qsoSettings: { version: 99, characterWpm: 55 } }).qsoSettings,
  ).toEqual(DEFAULT_PRACTICE_PREFERENCES.qsoSettings);
});
