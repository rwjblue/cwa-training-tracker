import { describe, expect, it } from 'vitest';
import {
  buildMorseTrack,
  MAX_MORSE_SECONDS,
  MORSE_SAMPLE_RATE,
  renderMorseWav,
  wordAtTime,
} from './morse-track';
import { morseTimeline } from './audio';

const settings = { characterWpm: 20, effectiveWpm: 10, frequency: 600, volume: 0.5 };

describe('continuous Morse recordings', () => {
  it('aligns every seekable word with the tone timeline across QSO transmissions', () => {
    const track = buildMorseTrack(
      [
        { text: 'CQ DE N1RWJ', gapAfter: 2 },
        { text: 'N1RWJ <KN>', frequency: 650 },
      ],
      settings,
    );
    expect(
      track.words.map(({ text, itemIndex, indexInItem }) => [text, itemIndex, indexInItem]),
    ).toEqual([
      ['CQ', 0, 0],
      ['DE', 0, 1],
      ['N1RWJ', 0, 2],
      ['N1RWJ', 1, 0],
      ['<KN>', 1, 1],
    ]);
    expect(track.items[1].start - track.items[0].end).toBeCloseTo(2, 8);
    for (const [index, word] of track.words.entries()) {
      const tone = track.tones.find((tone) => Math.abs(tone.at - word.start) < 0.000001);
      expect(tone?.frequency).toBe(word.itemIndex === 0 ? 600 : 650);
      expect(wordAtTime(track, word.start)).toBe(index);
      expect(word.end - word.start).toBeCloseTo(morseTimeline(word.text, 20, 10).duration, 8);
    }
    expect(wordAtTime(track, track.items[0].end + 1)).toBe(2);
    expect(wordAtTime(track, track.duration)).toBe(-1);
  });

  it('encodes word pauses and the loop seam into audio without stretching characters', () => {
    const normal = buildMorseTrack([{ text: 'E T' }, { text: 'E' }], settings);
    const spaced = buildMorseTrack([{ text: 'E T' }, { text: 'E' }], {
      ...settings,
      extraWordGap: 1,
      trailingGap: 2,
    });
    expect(spaced.tones.map((tone) => tone.duration)).toEqual(
      normal.tones.map((tone) => tone.duration),
    );
    expect(spaced.words[1].start - normal.words[1].start).toBeCloseTo(1, 8);
    expect(spaced.words[2].start - normal.words[2].start).toBeCloseTo(2, 8);
    expect(spaced.duration - normal.duration).toBeCloseTo(4, 8);
  });

  it('renders a seekable PCM WAV with silent gaps, soft tone edges, and baked volume', async () => {
    const track = buildMorseTrack([{ text: 'E E' }], settings);
    const blob = renderMorseWav(track);
    const data = new DataView(await blob.arrayBuffer());
    const ascii = (start: number, count: number) =>
      String.fromCharCode(...new Uint8Array(data.buffer, start, count));
    const sample = (index: number) => data.getInt16(44 + index * 2, true);
    expect(blob.type).toBe('audio/wav');
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 8)).toBe('WAVEfmt ');
    expect(data.getUint16(20, true)).toBe(1);
    expect(data.getUint16(22, true)).toBe(1);
    expect(data.getUint32(24, true)).toBe(MORSE_SAMPLE_RATE);
    expect(data.getUint16(34, true)).toBe(16);
    expect(data.byteLength).toBe(44 + Math.ceil(track.duration * MORSE_SAMPLE_RATE) * 2);
    expect(data.getUint32(4, true)).toBe(data.byteLength - 8);
    expect(sample(0)).toBe(0);
    expect(sample(Math.round(track.words[0].end * MORSE_SAMPLE_RATE) - 1)).toBe(0);
    expect(sample(Math.round((track.words[0].end + 0.1) * MORSE_SAMPLE_RATE))).toBe(0);
    const peak = Math.max(...Array.from({ length: 1000 }, (_, i) => Math.abs(sample(i))));
    expect(peak).toBeGreaterThan(3200);
    expect(peak).toBeLessThanOrEqual(3277);
    const muted = new Uint8Array(await renderMorseWav({ ...track, volume: 0 }).arrayBuffer());
    expect(muted.slice(44).every((sample) => sample === 0)).toBe(true);
  });

  it('rejects excessive duration and invalid settings before allocating a recording', () => {
    expect(() => buildMorseTrack([{ text: 'E' }], { ...settings, frequency: NaN })).toThrow(
      'sidetone',
    );
    expect(() => buildMorseTrack([{ text: 'E' }], { ...settings, volume: Infinity })).toThrow(
      'volume',
    );
    expect(() => buildMorseTrack([{ text: 'E', gapAfter: -1 }], settings)).toThrow('pause');
    expect(() =>
      buildMorseTrack([{ text: 'PARIS '.repeat(200) }], { ...settings, effectiveWpm: 1 }),
    ).toThrow('20 minutes');
    const short = buildMorseTrack([{ text: 'E' }], settings);
    expect(() => renderMorseWav({ ...short, duration: MAX_MORSE_SECONDS + 1 })).toThrow(
      '20 minutes',
    );
  });
});
