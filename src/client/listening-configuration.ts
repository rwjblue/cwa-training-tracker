import { type PracticeStory } from '../shared/listening-stories';
import { buildMorseTrack, morseTimeline } from './audio';
import type { GeneratedListeningSummary } from '../shared/generated-listening';
import type { PracticePreferences } from './practice-preferences';
import type { PracticeQso } from './qso-content';
import { wordPracticeRound, type WordList } from './word-content';

/** Source facts belong to the generated round, which can outlive a selected preference. */
export interface ListeningWordRound {
  readonly words: readonly string[];
  readonly listId: WordList;
  readonly shuffle: boolean;
  /** Device content identity only; never included in a played summary. */
  readonly sourceText?: string;
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
    ...(listId === 'custom' ? { sourceText: custom } : {}),
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

/** One bounded Morse-only recording for the actual ordered source occurrences. */
export function wordListeningTrack(round: ListeningWordRound, p: PracticePreferences) {
  const summary = wordListeningSummary(round, p);
  const options = {
    characterWpm: summary.characterWpm,
    effectiveWpm: summary.effectiveWpm,
    frequency: p.tone,
    volume: p.volume / 100,
  };
  const track = buildMorseTrack(
    round.words.map((text) => ({
      text,
      gapAfter: morseTimeline(text, options.characterWpm, options.effectiveWpm).wordGap + p.wordGap,
    })),
    options,
  );
  return { track, summary };
}

/** Keep the learner's pitch for station 1 and a full 50 Hz cue within both bounds. */
export function qsoStationTones(preferredHz: number): readonly [number, number] {
  if (!Number.isFinite(preferredHz) || preferredHz < 300 || preferredHz > 1000)
    throw new Error('Choose a QSO sidetone from 300 to 1000 Hz.');
  return Object.freeze([preferredHz, preferredHz <= 950 ? preferredHz + 50 : preferredHz - 50]);
}

export function qsoListeningSummary(
  qso: PracticeQso,
  p: PracticePreferences,
): Extract<GeneratedListeningSummary, { mode: 'qso' }> {
  return Object.freeze({
    mode: 'qso',
    // The native generator only produces these four published scenario identities.
    scenarioId: qso.id as Extract<GeneratedListeningSummary, { mode: 'qso' }>['scenarioId'],
    stations: Object.freeze([...qso.stations] as [string, string]),
    tonesHz: qsoStationTones(p.tone),
    transmissionGapSeconds: 2,
    characterWpm: p.characterWpm,
    effectiveWpm: p.effectiveWpm,
  });
}

/** Render the same ordered station pair that the applied evidence describes. */
export function qsoListeningTrack(qso: PracticeQso, p: PracticePreferences) {
  const summary = qsoListeningSummary(qso, p);
  const track = buildMorseTrack(
    qso.lines.map((text, index) => ({
      text,
      frequency: summary.tonesHz[index % 2],
      gapAfter: summary.transmissionGapSeconds,
    })),
    {
      characterWpm: summary.characterWpm,
      effectiveWpm: summary.effectiveWpm,
      frequency: summary.tonesHz[0],
      volume: p.volume / 100,
    },
  );
  return { track, summary };
}

export function storyListeningSummary(
  story: PracticeStory,
  p: PracticePreferences,
): GeneratedListeningSummary {
  return Object.freeze({
    mode: 'story',
    storyId: story.id,
    toneHz: p.tone,
    sentenceGapSeconds: 2,
    characterWpm: p.characterWpm,
    effectiveWpm: p.effectiveWpm,
  });
}
/** Public authored sentences share one narrator; no station alternation or trailing handoff. */
export function storyListeningTrack(story: PracticeStory, p: PracticePreferences) {
  return buildMorseTrack(
    story.lines.map((text, index) => ({
      text,
      frequency: p.tone,
      gapAfter: index < story.lines.length - 1 ? 2 : 0,
    })),
    {
      characterWpm: p.characterWpm,
      effectiveWpm: p.effectiveWpm,
      frequency: p.tone,
      volume: p.volume / 100,
    },
  );
}
