import { WORD_LENGTHS, type PracticeMode, type WordLength } from './audio';

export const PRACTICE_PREFERENCES_KEY = 'cwa.practice.preferences.v1';
export interface PracticePreferences {
  characterWpm: number;
  effectiveWpm: number;
  tone: number;
  volume: number;
  mode: PracticeMode;
  groupLength: number;
  wordLength: WordLength;
}
export const DEFAULT_PRACTICE_PREFERENCES: PracticePreferences = {
  characterWpm: 20,
  effectiveWpm: 10,
  tone: 600,
  volume: 40,
  mode: 'words',
  groupLength: 5,
  wordLength: 'mixed',
};

function bounded(value: unknown, fallback: number, min: number, max: number, step = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value / step) * step));
}
export function normalizePracticePreferences(value: unknown): PracticePreferences {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const defaults = DEFAULT_PRACTICE_PREFERENCES;
  const characterWpm = bounded(source.characterWpm, defaults.characterWpm, 5, 50);
  return {
    characterWpm,
    effectiveWpm: Math.min(
      characterWpm,
      bounded(source.effectiveWpm, defaults.effectiveWpm, 3, 50),
    ),
    tone: bounded(source.tone, defaults.tone, 300, 1000, 25),
    volume: bounded(source.volume, defaults.volume, 0, 100),
    mode: ['words', 'groups', 'numbers', 'callsigns', 'custom'].includes(String(source.mode))
      ? (source.mode as PracticeMode)
      : defaults.mode,
    groupLength: bounded(source.groupLength, defaults.groupLength, 1, 10),
    wordLength: WORD_LENGTHS.includes(source.wordLength as (typeof WORD_LENGTHS)[number])
      ? (source.wordLength as WordLength)
      : 'mixed',
  };
}
export function loadPracticePreferences(storage?: Pick<Storage, 'getItem'>): PracticePreferences {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    const raw = target?.getItem(PRACTICE_PREFERENCES_KEY);
    return normalizePracticePreferences(raw ? JSON.parse(raw) : undefined);
  } catch {
    return { ...DEFAULT_PRACTICE_PREFERENCES };
  }
}
export function savePracticePreferences(
  value: PracticePreferences,
  storage?: Pick<Storage, 'setItem'>,
): boolean {
  try {
    const target = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    if (!target) return false;
    target.setItem(PRACTICE_PREFERENCES_KEY, JSON.stringify(normalizePracticePreferences(value)));
    return true;
  } catch {
    return false;
  }
}
