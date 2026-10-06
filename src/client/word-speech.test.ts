import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import index from '../../public/audio/cw-training/words/index.json';
import manifest from '../../data/cw-training/word-speech.json';
import comparison from '../../public/audio/cw-training/words/comparison/index.json';
import { WORD_LISTS } from './word-content';
import { DEFAULT_PRACTICE_PREFERENCES } from './practice-preferences';
import { decodeWordWav, loadWordSpeech } from './word-speech';
import { buildSpokenWordTrack, MORSE_SAMPLE_RATE, renderMorseWav, wordAtTime } from './morse-track';
import { morseTimeline } from './audio';

const options = {
  characterWpm: 50,
  effectiveWpm: 50,
  frequency: 600,
  volume: 0.5,
  extraWordGap: 0.5,
};

describe('prerecorded spoken rounds', () => {
  it('ships a valid, reproducible clip for every built-in answer', () => {
    const words = [...new Set(Object.values(WORD_LISTS).flatMap((list) => list.words))];
    expect(Object.keys(index.clips).sort()).toEqual(words.sort());
    expect(manifest.words.map((entry) => entry.word).sort()).toEqual(words);
    const allClips = new Map<string, Float32Array>();
    for (const [word, clip] of Object.entries(index.clips)) {
      const bytes = readFileSync(`public${clip.url}`);
      expect(createHash('sha256').update(bytes).digest('hex'), word).toBe(clip.sha256);
      const samples = decodeWordWav(Uint8Array.from(bytes).buffer);
      allClips.set(word, samples);
      expect(samples.length, word).toBeGreaterThan(MORSE_SAMPLE_RATE * 0.1);
      expect(
        samples.some((sample) => Math.abs(sample) > 0.1),
        word,
      ).toBe(true);
    }
  });

  it('keeps comparison samples paired with the selected pack and intact original answers', () => {
    expect(comparison.voiceId).toBe(manifest.generator.voice);
    expect(comparison.model).toBe(manifest.generator.model);
    expect(new Set(comparison.words.map((entry) => entry.word)).size).toBe(comparison.words.length);
    for (const entry of comparison.words) {
      const authored = manifest.words.find((answer) => answer.word === entry.word)!;
      expect(authored.pronunciation).toBe(entry.pronunciation);
      expect(entry.newUrl).toBe(index.clips[entry.word as keyof typeof index.clips].url);
      const original = readFileSync(`public${entry.oldUrl}`);
      expect(createHash('sha256').update(original).digest('hex')).toBe(entry.oldSha256);
      expect(decodeWordWav(Uint8Array.from(original).buffer).length).toBeGreaterThan(
        MORSE_SAMPLE_RATE * 0.1,
      );
    }
  });

  it('puts exactly three Morse plays, speech, and the loop pause in a single seekable WAV', async () => {
    const clips = new Map([
      ['A', new Float32Array([0.8, -0.8, 0.2])],
      ['I', new Float32Array([0.5, -0.5])],
    ]);
    const track = buildSpokenWordTrack(['A', 'I'], clips, options);
    expect(track.items.map((item) => item.text)).toEqual(['A', 'I']);
    for (const [i, word] of track.words.entries()) {
      const timeline = morseTimeline(word.text, 50, 50);
      const gap = timeline.wordGap + options.extraWordGap;
      const tones = track.tones.filter(
        (tone) => tone.at >= word.start && tone.at < word.answerStart!,
      );
      expect(tones).toHaveLength(timeline.tones.length * 3);
      for (let repeat = 0; repeat < 3; repeat++)
        expect(tones[repeat * timeline.tones.length].at).toBeCloseTo(
          word.start + repeat * (timeline.duration + gap),
        );
      expect(word.answerStart! - word.start).toBeCloseTo(
        3 * timeline.duration + 2 * gap + timeline.wordGap,
      );
      expect(wordAtTime(track, word.answerStart!)).toBe(i);
      expect(wordAtTime(track, word.end + gap / 2)).toBe(i);
    }
    const sought = track.words[1].start;
    expect(wordAtTime(track, Math.floor(sought * 1e6) / 1e6)).toBe(1);
    expect(wordAtTime(track, sought - 1 / MORSE_SAMPLE_RATE)).toBe(0);
    const last = track.words.at(-1)!;
    expect(track.duration - last.end).toBeCloseTo(
      morseTimeline('I', 50, 50).wordGap + options.extraWordGap,
    );
    const data = new DataView(await renderMorseWav(track).arrayBuffer());
    expect(data.byteLength).toBe(44 + Math.ceil(track.duration * MORSE_SAMPLE_RATE) * 2);
    for (const clip of track.speech!) {
      const start = Math.round(clip.at * MORSE_SAMPLE_RATE);
      expect(data.getInt16(44 + (start - 1) * 2, true)).toBe(0);
      clip.samples.forEach((sample, i) =>
        expect(data.getInt16(44 + (start + i) * 2, true)).toBe(
          Math.round(sample * 0.25 * options.volume * 32767),
        ),
      );
      expect(data.getInt16(44 + (start + clip.samples.length) * 2, true)).toBe(0);
    }
    const muted = new Uint8Array(
      await renderMorseWav({ ...track, volume: 0, voiceVolume: 0 }).arrayBuffer(),
    );
    expect(muted.slice(44).every((sample) => sample === 0)).toBe(true);
    expect(() => buildSpokenWordTrack(['UNKNOWN'], clips, options)).toThrow('prerecorded answer');
    expect(() =>
      buildSpokenWordTrack(Array(200).fill('A'), clips, { ...options, effectiveWpm: 1 }),
    ).toThrow('20 minutes');
    expect(() =>
      renderMorseWav({ ...track, speech: [{ at: track.duration, samples: clips.get('A')! }] }),
    ).toThrow('timing');
  });

  it('balances published speech with Morse and keeps both gains independent, including either mute', async () => {
    const samples = decodeWordWav(
      Uint8Array.from(readFileSync('public/audio/cw-training/words/a.wav')).buffer,
    );
    const clips = new Map([['A', samples]]);
    const peaks: number[][] = [];
    for (const [volume, voiceVolume] of [
      [1, 1],
      [0.4, 0.4],
      [0, 0.4],
      [0.4, 0],
    ]) {
      const track = buildSpokenWordTrack(['A'], clips, { ...options, volume, voiceVolume });
      const data = new DataView(await renderMorseWav(track).arrayBuffer());
      const peak = (start: number, end: number) => {
        let value = 0;
        for (
          let frame = Math.round(start * MORSE_SAMPLE_RATE);
          frame < Math.round(end * MORSE_SAMPLE_RATE);
          frame++
        )
          value = Math.max(value, Math.abs(data.getInt16(44 + frame * 2, true)) / 32767);
        return value;
      };
      peaks.push([
        peak(0, track.words[0].answerStart!),
        peak(track.words[0].answerStart!, track.words[0].end),
      ]);
    }
    expect(peaks[0][0]).toBeCloseTo(0.2, 3);
    expect(peaks[0][1]).toBeCloseTo(peaks[0][0], 2);
    expect(peaks[1][0]).toBeCloseTo(peaks[0][0] * 0.4, 4);
    expect(peaks[1][1]).toBeCloseTo(peaks[0][1] * 0.4, 4);
    expect(peaks[2][0]).toBe(0);
    expect(peaks[2][1]).toBe(peaks[1][1]);
    expect(peaks[3][0]).toBe(peaks[1][0]);
    expect(peaks[3][1]).toBe(0);
    for (const voiceVolume of [-1, NaN, Infinity, 1.01])
      expect(() =>
        renderMorseWav(buildSpokenWordTrack(['A'], clips, { ...options, voiceVolume })),
      ).toThrow('voice volume');
  });

  it('rejects malformed and truncated clips without opening an audio context', () => {
    const good = Uint8Array.from(readFileSync('public/audio/cw-training/words/a.wav'));
    expect(() => decodeWordWav(good.slice(0, -1).buffer)).toThrow('PCM WAV');
    const wrongRate = good.slice();
    new DataView(wrongRate.buffer).setUint32(24, 44100, true);
    expect(() => decodeWordWav(wrongRate.buffer)).toThrow('PCM WAV');
    expect(() => decodeWordWav(new ArrayBuffer(10))).toThrow('PCM WAV');
  });

  it('refuses missing custom words before fetching and retries a failed download', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(new Response(readFileSync('public/audio/cw-training/words/a.wav')));
    vi.stubGlobal('fetch', fetch);
    try {
      await expect(loadWordSpeech(['UNKNOWN'])).rejects.toThrow('No prerecorded answer');
      expect(fetch).not.toHaveBeenCalled();
      await expect(loadWordSpeech(['A'])).rejects.toThrow('offline');
      const clips = await loadWordSpeech(['A', 'A']);
      expect(clips.size).toBe(1);
      await loadWordSpeech(['A']);
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
