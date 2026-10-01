import type { GeneratedListeningSummary } from '../shared/generated-listening';
import type { PracticePreferences } from './practice-preferences';
import type { MorseTrack } from './audio';

/** Describe the prepared track; custom text stays with its in-memory owner. */
export function freeListeningSummary(
  track: MorseTrack,
  preferences: PracticePreferences,
): GeneratedListeningSummary {
  const { mode, characterWpm, effectiveWpm, tone, wordLength, groupLength } = preferences;
  return {
    mode: 'free',
    contentMode: mode,
    entryCount: track.words.length,
    characterWpm,
    effectiveWpm,
    toneHz: tone,
    ...(mode === 'words' ? { wordLength } : {}),
    ...(mode === 'groups' || mode === 'numbers' ? { groupLength } : {}),
    ...(mode === 'custom' ? { customLabel: 'Your Morse text' } : {}),
  };
}
