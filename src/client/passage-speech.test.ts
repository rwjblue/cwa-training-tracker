import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import index from '../../public/audio/cw-training/passages/index.json';
import manifest from '../../data/cw-training/passage-speech.json';
import { PRACTICE_PASSAGES } from '../shared/listening-stories';
import { morseTimeline } from './audio';
import {
  buildSpokenPassageTrack,
  MORSE_SAMPLE_RATE,
  renderMorseWav,
  wordAtTime,
} from './morse-track';
import { loadPassageSpeech } from './passage-speech';
import { decodeWordWav } from './word-speech';

const options = {
  characterWpm: 60,
  effectiveWpm: 60,
  frequency: 650,
  volume: 0.4,
  voiceVolume: 0.6,
  morseRepeats: 2 as const,
  recallGapSeconds: 1.5,
};

it('ships intact whole-passage PCM for every public phrase, sentence and story', () => {
  const lines = [...new Set(PRACTICE_PASSAGES.flatMap((passage) => [...passage.lines]))].sort();
  expect(Object.keys(index.clips).sort()).toEqual(lines);
  expect(manifest.words.map((entry) => entry.word).sort()).toEqual(lines);
  for (const [line, clip] of Object.entries(index.clips)) {
    const bytes = readFileSync(`public${clip.url}`);
    expect(createHash('sha256').update(bytes).digest('hex'), line).toBe(clip.sha256);
    const samples = decodeWordWav(Uint8Array.from(bytes).buffer);
    expect(samples.length, line).toBeGreaterThan(MORSE_SAMPLE_RATE * 0.1);
    expect(
      samples.some((sample) => Math.abs(sample) > 0.1),
      line,
    ).toBe(true);
  }
});

it('repeats entire phrases, keeps word seeking aligned and bakes answers and recall silence into PCM', async () => {
  const lines = ['THE RADIO', 'A CLEAR CALL'];
  const clips = new Map(lines.map((line) => [line, new Float32Array([0.8, -0.8, 0.2])]));
  for (const morseRepeats of [2, 3] as const) {
    const track = buildSpokenPassageTrack(lines, clips, { ...options, morseRepeats });
    expect(track.items.map((item) => item.text)).toEqual(lines);
    for (const [itemIndex, item] of track.items.entries()) {
      const timeline = morseTimeline(item.text, 60, 60);
      const words = track.words.filter((word) => word.itemIndex === itemIndex);
      expect(words).toHaveLength(item.text.split(' ').length * morseRepeats);
      expect(words.filter((word) => word.repeatIndex === 0).map((word) => word.text)).toEqual(
        item.text.split(' '),
      );
      const tones = track.tones.filter((tone) => tone.at >= item.start && tone.at < item.end);
      expect(tones).toHaveLength(timeline.tones.length * morseRepeats);
      for (let repeat = 0; repeat < morseRepeats; repeat++) {
        const word = words.find((word) => word.repeatIndex === repeat)!;
        const at = item.start + repeat * (timeline.duration + options.recallGapSeconds);
        expect(word.start).toBeCloseTo(at, 8);
        expect(tones[repeat * timeline.tones.length].at).toBeCloseTo(at, 8);
        expect(track.words[wordAtTime(track, word.start)].itemIndex).toBe(itemIndex);
        expect(track.words[wordAtTime(track, word.start)].repeatIndex).toBe(repeat);
      }
      expect(track.speech![itemIndex].at - item.start).toBeCloseTo(
        morseRepeats * (timeline.duration + options.recallGapSeconds),
        8,
      );
      expect(words.at(-1)!.answerStart).toBe(track.speech![itemIndex].at);
    }
    const bytes = new DataView(await renderMorseWav(track).arrayBuffer());
    for (const clip of track.speech!) {
      const at = Math.round(clip.at * MORSE_SAMPLE_RATE);
      expect(bytes.getInt16(44 + (at - 1) * 2, true)).toBe(0);
      expect(bytes.getInt16(44 + at * 2, true)).toBe(
        Math.round(0.8 * 0.25 * options.voiceVolume * 32767),
      );
      expect(bytes.getInt16(44 + (at + clip.samples.length) * 2, true)).toBe(0);
    }
    expect(track.duration - track.items.at(-1)!.end).toBeCloseTo(options.recallGapSeconds);
    expect(() => buildSpokenPassageTrack(lines, new Map(), options)).toThrow('prerecorded answer');
    expect(() =>
      buildSpokenPassageTrack(Array(500).fill(lines[0]), clips, {
        ...options,
        characterWpm: 5,
        effectiveWpm: 3,
      }),
    ).toThrow('20 minutes');
  }
});

it('preloads recorded phrases once and permits retry after a failed download', async () => {
  const clip = index.clips['THE RADIO'];
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(new Response(readFileSync(`public${clip.url}`)));
  vi.stubGlobal('fetch', fetch);
  try {
    await expect(loadPassageSpeech(['UNRECORDED'])).rejects.toThrow('no prerecorded answer');
    expect(fetch).not.toHaveBeenCalled();
    await expect(loadPassageSpeech(['THE RADIO'])).rejects.toThrow('offline');
    expect((await loadPassageSpeech(['THE RADIO', 'THE RADIO'])).size).toBe(1);
    await loadPassageSpeech(['THE RADIO']);
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    vi.unstubAllGlobals();
  }
});
