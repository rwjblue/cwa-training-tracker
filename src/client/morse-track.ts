import { cleanMorseText, morseTimeline } from './audio';

export const MORSE_SAMPLE_RATE = 22050;
export const MAX_MORSE_SECONDS = 20 * 60;

export interface MorseWord {
  text: string;
  start: number;
  end: number;
  itemIndex: number;
  indexInItem: number;
}
export interface MorseTrack {
  words: MorseWord[];
  items: { text: string; start: number; end: number }[];
  tones: { at: number; duration: number; frequency: number }[];
  duration: number;
  volume: number;
}
export interface MorseTrackItem {
  text: string;
  frequency?: number;
  /** Silence after this item, in seconds; includes the last item when specified. */
  gapAfter?: number;
}
export interface MorseTrackOptions {
  characterWpm: number;
  effectiveWpm: number;
  frequency: number;
  /** Gain baked into the WAV, because iOS does not honor element.volume. */
  volume: number;
  extraWordGap?: number;
  trailingGap?: number;
}

const tooLong = () =>
  new Error(
    'This recording exceeds 20 minutes. Use fewer words, shorter pauses, or a faster speed.',
  );
function checkRange(value: number, min: number, max: number, label: string) {
  if (!Number.isFinite(value) || value < min || value > max)
    throw new Error(`Choose a valid ${label}.`);
}

/** Build one recording, including every inter-word and inter-transmission pause. */
export function buildMorseTrack(
  items: readonly MorseTrackItem[],
  options: MorseTrackOptions,
): MorseTrack {
  checkRange(options.frequency, 100, 2000, 'sidetone');
  checkRange(options.volume, 0, 1, 'volume');
  const extraGap = options.extraWordGap ?? 0;
  const trailingGap = options.trailingGap ?? 0;
  // Copy practice expresses spacing as multiples of a Farnsworth word gap.
  // At low effective speeds a valid extra gap can exceed 30 seconds. The
  // complete recording still has the same hard duration/allocation limit.
  checkRange(extraGap, 0, MAX_MORSE_SECONDS, 'word pause');
  checkRange(trailingGap, 0, 30, 'ending pause');
  if (!items.length) throw new Error('Add some letters or numbers to play.');
  if (items.length > 1000 || items.reduce((sum, item) => sum + item.text.length, 0) > 20000)
    throw tooLong();
  const track: MorseTrack = {
    words: [],
    items: [],
    tones: [],
    duration: 0,
    volume: options.volume,
  };
  for (const [itemIndex, item] of items.entries()) {
    const frequency = item.frequency ?? options.frequency;
    checkRange(frequency, 100, 2000, 'sidetone');
    if (item.gapAfter !== undefined) checkRange(item.gapAfter, 0, 30, 'transmission pause');
    const text = cleanMorseText(item.text);
    const timeline = morseTimeline(text, options.characterWpm, options.effectiveWpm);
    const start = track.duration;
    for (const [indexInItem, word] of timeline.words.entries()) {
      track.words.push({
        ...word,
        start: start + word.start + indexInItem * extraGap,
        end: start + word.end + indexInItem * extraGap,
        itemIndex,
        indexInItem,
      });
    }
    let wordIndex = 0;
    for (const tone of timeline.tones) {
      while (timeline.words[wordIndex + 1]?.start <= tone.at) wordIndex++;
      track.tones.push({ ...tone, at: start + tone.at + wordIndex * extraGap, frequency });
    }
    const end = start + timeline.duration + (timeline.words.length - 1) * extraGap;
    track.items.push({ text, start, end });
    const gap =
      item.gapAfter ?? (itemIndex < items.length - 1 ? timeline.wordGap + extraGap : trailingGap);
    track.duration = end + gap;
    if (track.duration > MAX_MORSE_SECONDS) throw tooLong();
  }
  return track;
}

/** Keep the preceding word selected during its pause; return no word after completion. */
export function wordAtTime(track: MorseTrack, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0 || seconds >= track.duration) return -1;
  let low = 0;
  let high = track.words.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    if (track.words[middle].start <= seconds) low = middle + 1;
    else high = middle - 1;
  }
  return high;
}

/** Render directly into bounded, mono 16-bit PCM. Audio never depends on JS timers. */
export function renderMorseWav(track: MorseTrack): Blob {
  if (!Number.isFinite(track.duration) || track.duration <= 0 || track.duration > MAX_MORSE_SECONDS)
    throw tooLong();
  checkRange(track.volume, 0, 1, 'volume');
  const frames = Math.ceil(track.duration * MORSE_SAMPLE_RATE);
  const bytes = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, bytes.byteLength - 8, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, MORSE_SAMPLE_RATE, true);
  view.setUint32(28, MORSE_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, frames * 2, true);
  for (const tone of track.tones) {
    if (
      !Number.isFinite(tone.at) ||
      !Number.isFinite(tone.duration) ||
      tone.at < 0 ||
      tone.duration <= 0 ||
      tone.at + tone.duration > track.duration + 0.000001
    )
      throw new Error('This recording has invalid tone timing.');
    checkRange(tone.frequency, 100, 2000, 'sidetone');
    const start = Math.round(tone.at * MORSE_SAMPLE_RATE);
    const end = Math.min(frames, Math.round((tone.at + tone.duration) * MORSE_SAMPLE_RATE));
    const ramp = Math.max(
      1,
      Math.min(Math.round(MORSE_SAMPLE_RATE * 0.004), Math.floor((end - start) / 2)),
    );
    for (let i = start; i < end; i++) {
      const edge = Math.min(1, (i - start) / ramp, (end - 1 - i) / ramp);
      const envelope = (1 - Math.cos(Math.PI * edge)) / 2;
      const sample = Math.sin((2 * Math.PI * tone.frequency * (i - start)) / MORSE_SAMPLE_RATE);
      view.setInt16(44 + i * 2, Math.round(sample * envelope * track.volume * 0.2 * 32767), true);
    }
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
