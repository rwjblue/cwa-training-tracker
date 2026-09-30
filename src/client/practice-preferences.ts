import type { WordList } from './word-content';
import { WORD_LENGTHS, type PracticeMode, type WordLength } from './audio';

export const PRACTICE_PREFERENCES_KEY = 'cwa.practice.preferences.v1';
export interface PracticePreferences {
  tool: 'words' | 'qso' | 'free' | 'sending';
  wordList: WordList;
  wordGap: number;
  shuffleWords: boolean;
  repeatList: boolean;
  spokenAnswers: boolean;
  hideTrainerText: boolean;
  qsoScenario: string;
  characterWpm: number;
  effectiveWpm: number;
  tone: number;
  volume: number;
  mode: PracticeMode;
  groupLength: number;
  wordLength: WordLength;
}
export const DEFAULT_PRACTICE_PREFERENCES: PracticePreferences = {
  tool: 'words',
  wordList: 'common-qso',
  wordGap: 1,
  shuffleWords: true,
  repeatList: true,
  spokenAnswers: false,
  hideTrainerText: true,
  qsoScenario: 'short-contact',
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
    tool: ['words', 'qso', 'free', 'sending'].includes(String(source.tool))
      ? (source.tool as PracticePreferences['tool'])
      : source.mode
        ? 'free'
        : defaults.tool,
    wordList: ['common-qso', 'common-30', 'custom'].includes(String(source.wordList))
      ? (source.wordList as WordList)
      : defaults.wordList,
    wordGap: bounded(source.wordGap, defaults.wordGap, 0, 5, 0.5),
    shuffleWords:
      typeof source.shuffleWords === 'boolean' ? source.shuffleWords : defaults.shuffleWords,
    repeatList: typeof source.repeatList === 'boolean' ? source.repeatList : defaults.repeatList,
    spokenAnswers:
      typeof source.spokenAnswers === 'boolean' ? source.spokenAnswers : defaults.spokenAnswers,
    hideTrainerText:
      typeof source.hideTrainerText === 'boolean'
        ? source.hideTrainerText
        : defaults.hideTrainerText,
    qsoScenario: ['short-contact', 'ragchew', 'pota', 'repeat'].includes(String(source.qsoScenario))
      ? String(source.qsoScenario)
      : defaults.qsoScenario,
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
