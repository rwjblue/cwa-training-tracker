import { MAX_MORSE_SECONDS, wordAtTime, type MorseTrack } from './morse-track';

/** A word item and its following pause finish before a live speed takes effect. */
export function nextWordRetimeItem(track: MorseTrack, seconds: number, playing: boolean) {
  const index = track.items.findIndex((item) => item.start >= seconds + (playing ? 0.05 : 0));
  return index < 0 ? track.items.length : index;
}

/** Preserve PCM timing in the heard prefix and splice the same ordered future items. */
export function retimeWordTrack(
  previous: MorseTrack,
  next: MorseTrack,
  firstItem: number,
): MorseTrack {
  if (
    previous.items.length !== next.items.length ||
    previous.items.some((item, index) => item.text !== next.items[index].text)
  )
    throw new Error('Speed changes must keep the same word round.');
  if (firstItem >= previous.items.length) return previous;
  if (!Number.isInteger(firstItem) || firstItem < 0)
    throw new Error('Choose a valid word boundary.');
  const boundary = previous.items[firstItem].start;
  const nextBoundary = next.items[firstItem].start;
  const shift = boundary - nextBoundary;
  const duration = next.duration + shift;
  if (duration > MAX_MORSE_SECONDS)
    throw new Error('This round would exceed 20 minutes. Use a faster speed or a shorter list.');
  return {
    ...next,
    duration,
    items: [
      ...previous.items.slice(0, firstItem),
      ...next.items
        .slice(firstItem)
        .map((item) => ({ ...item, start: item.start + shift, end: item.end + shift })),
    ],
    words: [
      ...previous.words.filter((word) => word.itemIndex < firstItem),
      ...next.words
        .filter((word) => word.itemIndex >= firstItem)
        .map((word) => ({ ...word, start: word.start + shift, end: word.end + shift })),
    ],
    tones: [
      ...previous.tones.filter((tone) => tone.at < boundary),
      ...next.tones
        .filter((tone) => tone.at >= nextBoundary)
        .map((tone) => ({ ...tone, at: tone.at + shift })),
    ],
  };
}

/** Global indices distinguish repeated tokens and retain the preceding occurrence in a gap. */
export function retimedOccurrencePosition(previous: MorseTrack, next: MorseTrack, seconds: number) {
  if (seconds >= previous.duration) return next.duration;
  const word = Math.max(0, wordAtTime(previous, seconds));
  return next.words[word]?.start ?? 0;
}
