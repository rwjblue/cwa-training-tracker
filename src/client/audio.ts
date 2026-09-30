import { COPY_MORSE, COPY_ENGLISH_WORDS_BY_LENGTH } from '../shared/copy-content';
import { copyTiming } from '../shared/copy-practice';

export const MORSE = COPY_MORSE;
export const PROSIGNS: Record<string, string> = {
  '<AR>': '.-.-.',
  '<AS>': '.-...',
  '<BT>': '-...-',
  '<KN>': '-.--.',
  '<SK>': '...-.-',
  '<CL>': '-.-..-..',
  '<SOS>': '...---...',
};
const morseTokens = (text: string) => text.toUpperCase().match(/<[A-Z]{2,3}>|\s+|./g) ?? [];
export function cleanMorseText(text: string) {
  return morseTokens(text)
    .map((token) => (/^\s+$/.test(token) ? ' ' : MORSE[token] || PROSIGNS[token] ? token : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Seconds relative to playback start; prosigns have no inter-character gap. */
export function morseTimeline(text: string, characterWpm: number, effectiveWpm: number) {
  if (
    ![characterWpm, effectiveWpm].every(
      (value) => Number.isFinite(value) && value >= 1 && value <= 150,
    )
  )
    throw new Error('Choose a valid Morse speed.');
  const cleaned = cleanMorseText(text);
  if (!cleaned) throw new Error('Add some letters or numbers to play.');
  const { dit, characterGap, wordGap } = copyTiming(characterWpm, effectiveWpm);
  const tones: { at: number; duration: number }[] = [];
  const wordTimings: { text: string; start: number; end: number }[] = [];
  let at = 0;
  const words = cleaned.split(' ');
  words.forEach((word, wi) => {
    const start = at;
    const letters = morseTokens(word);
    letters.forEach((letter, ci) => {
      const symbols = PROSIGNS[letter] ?? MORSE[letter];
      [...symbols].forEach((symbol, si) => {
        const duration = (symbol === '.' ? 1 : 3) * dit;
        tones.push({ at, duration });
        at += duration + (si < symbols.length - 1 ? dit : 0);
      });
      if (ci < letters.length - 1) at += characterGap;
    });
    wordTimings.push({ text: word, start, end: at });
    if (wi < words.length - 1) at += wordGap;
  });
  return { tones, words: wordTimings, duration: at, wordGap };
}
export type PracticeMode = 'words' | 'groups' | 'numbers' | 'callsigns' | 'custom';
export const WORD_LENGTHS = [2, 3, 4, 5, 6, 7, 8] as const;
export type WordLength = (typeof WORD_LENGTHS)[number] | 'mixed';

// Familiar, real English words. Keeping pools separate guarantees exact-length practice.
export const PRACTICE_WORDS = COPY_ENGLISH_WORDS_BY_LENGTH;

export interface PracticeGenerationOptions {
  count?: number;
  groupLength?: number;
  wordLength?: WordLength;
}

/** Generate listening material, never callsign ownership or on-air operating advice. */
export function generatePractice(
  mode: string,
  options: PracticeGenerationOptions | number = {},
): string {
  const settings = typeof options === 'number' ? { count: options } : options;
  const count = settings.count ?? 12;
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new Error('Choose between 1 and 50 practice items.');
  }
  const random = (max: number) => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] % max;
  };
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const choose = (characters: string) => characters[random(characters.length)];
  if (mode === 'callsigns') {
    return Array.from(
      { length: count },
      () =>
        `${['K', 'N', 'W', 'VE', 'G', 'DL', 'JA', 'VK'][random(8)]}${random(10)}${choose(letters)}${choose(letters)}${random(2) ? choose(letters) : ''}`,
    ).join(' ');
  }
  if (mode === 'words') {
    const wordLength = settings.wordLength ?? 'mixed';
    const words =
      wordLength === 'mixed' ? Object.values(PRACTICE_WORDS).flat() : PRACTICE_WORDS[wordLength];
    if (!words?.length) throw new Error('Choose a supported word length from 2 to 8 letters.');
    return Array.from({ length: count }, () => words[random(words.length)]).join(' ');
  }
  if (mode !== 'groups' && mode !== 'numbers') throw new Error('Choose a practice content type.');
  const groupLength = settings.groupLength ?? 5;
  if (!Number.isInteger(groupLength) || groupLength < 1 || groupLength > 10) {
    throw new Error('Choose a group length from 1 to 10 characters.');
  }
  return Array.from({ length: count }, () =>
    Array.from({ length: groupLength }, () =>
      choose(mode === 'numbers' ? '0123456789' : letters),
    ).join(''),
  ).join(' ');
}
// Existing imports keep working while native playback and rendering remain independently testable.
export {
  buildMorseTrack,
  renderMorseWav,
  wordAtTime,
  MORSE_SAMPLE_RATE,
  MAX_MORSE_SECONDS,
} from './morse-track';
export type { MorseTrack, MorseTrackOptions, MorseTrackItem, MorseWord } from './morse-track';
export { MorsePlayer } from './morse-player';
export type { MorsePlaybackState, MorseProgress, MorsePlayerOptions } from './morse-player';
