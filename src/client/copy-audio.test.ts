import { describe, expect, it } from 'vitest';
import {
  copyTiming,
  copyToneHz,
  createCopyAttempt,
  defaultCopyRecipe,
  submitCopyAnswer,
  validateCopyAttempt,
} from '../shared/copy-practice';
import { buildCopyTrack } from './copy-audio';
import { buildMorseTrack } from './morse-track';

describe('copy audio pitch and continuity', () => {
  it('changes group pitch without changing Farnsworth timing or added spacing', () => {
    const recipe = {
      ...defaultCopyRecipe(),
      durationSeconds: 10,
      effectiveWpm: 8,
      extraWordSpacing: 1,
    };
    const attempt = createCopyAttempt(recipe, { id: 'group-tones', seed: 'group-tones' });
    const track = buildCopyTrack(attempt);
    const uniform = buildMorseTrack([{ text: attempt.targets[0] }], {
      characterWpm: recipe.characterWpm,
      effectiveWpm: recipe.effectiveWpm,
      frequency: recipe.toneHz,
      volume: 0.7,
      extraWordGap: copyTiming(recipe.characterWpm, recipe.effectiveWpm).wordGap,
    });
    expect(track.duration).toBeCloseTo(uniform.duration, 8);
    expect(track.tones).toHaveLength(uniform.tones.length);
    track.tones.forEach((tone, index) => {
      expect(tone.at).toBeCloseTo(uniform.tones[index].at, 8);
      expect(tone.duration).toBeCloseTo(uniform.tones[index].duration, 8);
    });
    expect(track.items).toHaveLength(attempt.targets[0].split(' ').length);
    track.items.forEach((item, index) => {
      const tones = track.tones.filter((tone) => tone.at >= item.start && tone.at < item.end);
      expect(tones.length).toBeGreaterThan(0);
      expect(tones.every((tone) => tone.frequency === copyToneHz(attempt, 0, index))).toBe(true);
      expect(tones.every((tone) => tone.frequency >= 500 && tone.frequency <= 900)).toBe(true);
    });
    expect(buildCopyTrack(validateCopyAttempt(JSON.parse(JSON.stringify(attempt))))).toEqual(track);
  });

  it('replays the original pitch and actual speed after an adaptive word round advances', () => {
    let attempt = createCopyAttempt(defaultCopyRecipe('words'), {
      id: 'word-replay',
      seed: 'word-replay',
    });
    const first = buildCopyTrack(attempt);
    attempt = submitCopyAnswer(attempt, attempt.targets[0]);
    expect(buildCopyTrack(attempt, 0)).toEqual(first);
    const next = buildCopyTrack(attempt);
    expect(next.tones.every((tone) => tone.frequency === copyToneHz(attempt, 1))).toBe(true);
    expect(buildCopyTrack(validateCopyAttempt(JSON.parse(JSON.stringify(attempt))), 0)).toEqual(
      first,
    );
  });

  it('keeps legacy fixed tones and a single pitch throughout plain text', () => {
    const legacy = { ...defaultCopyRecipe('plaintext'), toneHz: 725 };
    delete legacy.toneMode;
    const attempt = createCopyAttempt(legacy, { id: 'fixed-text', seed: 'text-tones' });
    const fixed = buildCopyTrack(attempt);
    expect(fixed.tones.every((tone) => tone.frequency === 725)).toBe(true);
    const random = createCopyAttempt(defaultCopyRecipe('plaintext'), {
      id: 'random-text',
      seed: 'text-tones',
    });
    expect(
      buildCopyTrack(random).tones.every((tone) => tone.frequency === copyToneHz(random, 0)),
    ).toBe(true);
  });
});
