import { PRACTICE_STORIES, type StoryId } from '../shared/listening-stories';
import type { WordList } from './word-content';
import { WORD_LENGTHS, type PracticeMode, type WordLength } from './audio';

export const PRACTICE_PREFERENCES_KEY = 'cwa.practice.preferences.v1';
export interface PracticePreferences {
  version: 2;
  qsoSettings: ListeningSoundSetup;
  tool: 'words' | 'qso' | 'stories' | 'free' | 'sending';
  storySettings: StorySettings;
  wordList: WordList;
  wordGap: number;
  shuffleWords: boolean;
  variableWordPitch: boolean;
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
/** Independent public selection/sound only; never a clock or private script. */
export interface ListeningSoundSetup {
  version: 1;
  characterWpm: number;
  effectiveWpm: number;
  tone: number;
  hideTrainerText: boolean;
}
export interface StorySettings extends ListeningSoundSetup {
  storyId: StoryId;
}
export const DEFAULT_QSO_SETTINGS: ListeningSoundSetup = {
  version: 1,
  characterWpm: 20,
  effectiveWpm: 10,
  tone: 600,
  hideTrainerText: true,
};
export const DEFAULT_STORY_SETTINGS: StorySettings = {
  version: 1,
  storyId: 'story-trail',
  characterWpm: 20,
  effectiveWpm: 10,
  tone: 600,
  hideTrainerText: true,
};
export const DEFAULT_PRACTICE_PREFERENCES: PracticePreferences = {
  version: 2,
  qsoSettings: DEFAULT_QSO_SETTINGS,
  tool: 'words',
  storySettings: DEFAULT_STORY_SETTINGS,
  wordList: 'common-qso',
  wordGap: 1,
  shuffleWords: true,
  variableWordPitch: true,
  repeatList: true,
  spokenAnswers: false,
  hideTrainerText: true,
  qsoScenario: 'short-contact',
  characterWpm: 20,
  effectiveWpm: 10,
  tone: 450,
  volume: 40,
  mode: 'words',
  groupLength: 5,
  wordLength: 'mixed',
};

function bounded(value: unknown, fallback: number, min: number, max: number, step = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Number(Math.max(min, Math.min(max, Math.round(value / step) * step)).toFixed(8));
}
export function normalizeListeningSoundSetup(
  value: unknown,
  defaults: ListeningSoundSetup = DEFAULT_QSO_SETTINGS,
): ListeningSoundSetup {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  if (source.version !== undefined && source.version !== 1) return { ...defaults };
  const characterWpm = bounded(source.characterWpm, defaults.characterWpm, 5, 60);
  return {
    version: 1,
    characterWpm,
    effectiveWpm: Math.min(
      characterWpm,
      bounded(source.effectiveWpm, defaults.effectiveWpm, 3, 60),
    ),
    tone: bounded(source.tone, defaults.tone, 300, 1000),
    hideTrainerText:
      typeof source.hideTrainerText === 'boolean'
        ? source.hideTrainerText
        : defaults.hideTrainerText,
  };
}
export function normalizeStorySettings(
  value: unknown,
  fallback = DEFAULT_STORY_SETTINGS,
): StorySettings {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  if (source.version !== undefined && source.version !== 1) return { ...fallback };
  return {
    ...normalizeListeningSoundSetup(value, fallback),
    storyId: PRACTICE_STORIES.some((story) => story.id === source.storyId)
      ? (source.storyId as StoryId)
      : fallback.storyId,
  };
}
/** Words retain their original sound fields; QSO and Stories own separate setups. */
export function listeningPreferences(value: PracticePreferences): PracticePreferences {
  const sound =
    value.tool === 'stories'
      ? value.storySettings
      : value.tool === 'qso'
        ? value.qsoSettings
        : undefined;
  if (!sound) return value;
  const { characterWpm, effectiveWpm, tone, hideTrainerText } = sound;
  return { ...value, characterWpm, effectiveWpm, tone, hideTrainerText };
}
export function normalizePracticePreferences(value: unknown): PracticePreferences {
  let source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  if (source.version !== undefined && source.version !== 1 && source.version !== 2) source = {};
  const defaults = DEFAULT_PRACTICE_PREFERENCES;
  const migratedSound = normalizeListeningSoundSetup({
    characterWpm: source.characterWpm,
    effectiveWpm: source.effectiveWpm,
    tone: source.tone,
    hideTrainerText: source.hideTrainerText,
  });
  const characterWpm = migratedSound.characterWpm;
  return {
    version: 2,
    qsoSettings: normalizeListeningSoundSetup(source.qsoSettings ?? migratedSound, migratedSound),
    storySettings: normalizeStorySettings(source.storySettings),
    tool: ['words', 'qso', 'stories', 'free', 'sending'].includes(String(source.tool))
      ? (source.tool as PracticePreferences['tool'])
      : source.mode
        ? 'free'
        : defaults.tool,
    wordList: ['common-qso', 'common-30', 'custom'].includes(String(source.wordList))
      ? (source.wordList as WordList)
      : defaults.wordList,
    wordGap: bounded(source.wordGap, defaults.wordGap, 0, 5, 0.1),
    shuffleWords:
      typeof source.shuffleWords === 'boolean' ? source.shuffleWords : defaults.shuffleWords,
    variableWordPitch:
      typeof source.variableWordPitch === 'boolean'
        ? source.variableWordPitch
        : defaults.variableWordPitch,
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
      bounded(source.effectiveWpm, defaults.effectiveWpm, 3, 60),
    ),
    tone: bounded(source.tone, defaults.tone, 300, 1000),
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

/** Commit sound edits to the originating mode; shared comfort volume stays common. */
export function changeListeningPreferences(
  value: PracticePreferences,
  changes: Partial<PracticePreferences>,
): PracticePreferences {
  if (value.tool !== 'stories' && value.tool !== 'qso')
    return normalizePracticePreferences({ ...value, ...changes });
  const soundKeys = ['characterWpm', 'effectiveWpm', 'tone', 'hideTrainerText'] as const;
  const common = { ...changes };
  const soundChanges = Object.fromEntries(
    soundKeys.filter((key) => key in changes).map((key) => [key, changes[key]]),
  );
  for (const key of soundKeys) delete common[key];
  return normalizePracticePreferences({
    ...value,
    ...common,
    ...(value.tool === 'stories'
      ? { storySettings: { ...value.storySettings, ...changes.storySettings, ...soundChanges } }
      : { qsoSettings: { ...value.qsoSettings, ...changes.qsoSettings, ...soundChanges } }),
  });
}
