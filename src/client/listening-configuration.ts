import type { GeneratedListeningSummary } from '../shared/generated-listening';
import type { PracticePreferences } from './practice-preferences';
import type { PracticeQso } from './qso-content';
import { wordPracticeRound, type WordList } from './word-content';

/** Source facts belong to the generated round, which can outlive a selected preference. */
export interface ListeningWordRound {
  readonly words: readonly string[];
  readonly listId: WordList;
  readonly shuffle: boolean;
}

export function listeningWordRound(
  listId: WordList,
  custom: string,
  shuffle: boolean,
  random = Math.random,
): ListeningWordRound {
  return Object.freeze({
    words: Object.freeze(wordPracticeRound(listId, custom, shuffle, random)),
    listId,
    shuffle,
  });
}

export function wordListeningSummary(
  round: ListeningWordRound,
  p: PracticePreferences,
): GeneratedListeningSummary {
  return Object.freeze({
    mode: 'words',
    listId: round.listId,
    ...(round.listId === 'custom' ? { customLabel: 'Your word list' } : {}),
    entryCount: round.words.length,
    characterWpm: p.characterWpm,
    effectiveWpm: p.effectiveWpm,
    toneHz: p.tone,
    wordGapSeconds: p.wordGap,
    shuffle: round.shuffle,
    repeat: p.repeatList,
    spokenAnswers: p.spokenAnswers,
  });
}

export function qsoListeningSummary(
  qso: PracticeQso,
  p: PracticePreferences,
): GeneratedListeningSummary {
  return Object.freeze({
    mode: 'qso',
    // The native generator only produces these four published scenario identities.
    scenarioId: qso.id as Extract<GeneratedListeningSummary, { mode: 'qso' }>['scenarioId'],
    stations: Object.freeze([...qso.stations] as [string, string]),
    tonesHz: Object.freeze([p.tone, Math.min(1000, p.tone + 50)] as [number, number]),
    transmissionGapSeconds: 2,
    characterWpm: p.characterWpm,
    effectiveWpm: p.effectiveWpm,
  });
}
