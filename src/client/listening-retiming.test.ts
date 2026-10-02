import { describe, expect, it } from 'vitest';
import { buildMorseTrack, renderMorseWav, wordAtTime } from './morse-track';
import {
  nextWordRetimeItem,
  retimedOccurrencePosition,
  retimeWordTrack,
} from './listening-retiming';

const words = (characterWpm: number, effectiveWpm: number) =>
  buildMorseTrack(
    ['ET', 'E', 'ET', 'T'].map((text) => ({ text, gapAfter: 2 })),
    { characterWpm, effectiveWpm, frequency: 600, volume: 0.4 },
  );

describe('live generated listening timelines', () => {
  it('keeps duplicate order and the exact heard prefix, retiming only future word items', () => {
    const previous = words(20, 10);
    const next = words(30, 12);
    const boundary = previous.items[2].start;
    const mixed = retimeWordTrack(previous, next, 2);
    expect(mixed.items.slice(0, 2)).toEqual(previous.items.slice(0, 2));
    expect(mixed.words.slice(0, 2)).toEqual(previous.words.slice(0, 2));
    expect(mixed.tones.filter((tone) => tone.at < boundary)).toEqual(
      previous.tones.filter((tone) => tone.at < boundary),
    );
    expect(mixed.items.map((item) => item.text)).toEqual(['ET', 'E', 'ET', 'T']);
    expect(mixed.items[2].start).toBe(boundary);
    expect(mixed.items[2].end - mixed.items[2].start).toBeCloseTo(
      next.items[2].end - next.items[2].start,
    );
    expect(mixed.duration - mixed.items[2].start).toBeCloseTo(next.duration - next.items[2].start);
    expect(wordAtTime(mixed, boundary)).toBe(2);
    expect(renderMorseWav(mixed).size).toBeGreaterThan(44);
  });
  it('keeps a current word and its gap at old timing, with effective-only edits and a repeated edit', () => {
    const previous = words(20, 10);
    const first = nextWordRetimeItem(previous, previous.items[1].end + 0.2, true);
    expect(first).toBe(2);
    const mixed = retimeWordTrack(previous, words(20, 5), first);
    expect(mixed.items.slice(0, 2)).toEqual(previous.items.slice(0, 2));
    expect(mixed.items[2].end).toBeGreaterThan(previous.items[2].end);
    const again = retimeWordTrack(mixed, words(25, 12), 3);
    expect(again.items.slice(0, 3)).toEqual(mixed.items.slice(0, 3));
    expect(again.items[3].start).toBe(mixed.items[3].start);
    expect(retimeWordTrack(again, words(30, 20), 4)).toBe(again);
    expect(nextWordRetimeItem(previous, previous.duration, true)).toBe(4);
    expect(nextWordRetimeItem(previous, 0, false)).toBe(0);
    expect(nextWordRetimeItem(previous, 0, true)).toBe(1);
    expect(() =>
      retimeWordTrack(
        previous,
        buildMorseTrack([{ text: 'E' }], {
          characterWpm: 20,
          effectiveWpm: 10,
          frequency: 600,
          volume: 0.4,
        }),
        1,
      ),
    ).toThrow('same word round');
  });
  it('maps the exact repeated QSO or authored-story occurrence through word and station gaps', () => {
    const items = [
      { text: 'E T E', gapAfter: 2 },
      { text: 'E E', gapAfter: 2 },
    ];
    const previous = buildMorseTrack(items, {
      characterWpm: 20,
      effectiveWpm: 10,
      frequency: 600,
      volume: 0.4,
    });
    const next = buildMorseTrack(items, {
      characterWpm: 30,
      effectiveWpm: 8,
      frequency: 600,
      volume: 0.4,
    });
    for (let index = 0; index < previous.words.length; index++) {
      expect(retimedOccurrencePosition(previous, next, previous.words[index].start + 0.01)).toBe(
        next.words[index].start,
      );
      expect(retimedOccurrencePosition(previous, next, previous.words[index].end + 0.01)).toBe(
        next.words[index].start,
      );
    }
    expect(retimedOccurrencePosition(previous, next, previous.duration)).toBe(next.duration);
    expect(retimedOccurrencePosition(previous, next, 0)).toBe(0);
  });
});
