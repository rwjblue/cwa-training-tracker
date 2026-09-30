import { describe, expect, it } from 'vitest';
import { COPY_MORSE, COPY_WORD_COLLECTIONS, COPY_SENTENCES } from './copy-content.ts';
import {
  copyTextSeconds,
  copyTiming,
  createCopyAttempt,
  currentCopySpeeds,
  defaultCopyRecipe,
  generateCopyTargets,
  scoreCopyText,
  submitCopyAnswer,
  summarizeCopyAttempt,
  validateCopyAttempt,
  validateCopyRecipe,
} from './copy-practice.ts';

const now = '2026-09-29T12:00:00.000Z';

describe('native copy generation', () => {
  it('generates reproducible custom groups and rounds duration to a whole group', () => {
    const recipe = {
      ...defaultCopyRecipe(),
      groupKind: 'custom' as const,
      customCharacters: 'E',
      groupLength: 1,
      durationSeconds: 60,
    };
    const targets = generateCopyTargets(recipe, 'seed');
    expect(targets).toEqual(generateCopyTargets(recipe, 'seed'));
    expect(targets[0]).toMatch(/^E(?: E)+$/);
    const time = copyTextSeconds(targets[0], 25, 10);
    expect(Math.abs(time - 60)).toBeLessThanOrEqual((copyTiming(25, 10).wordGap + 1.2 / 25) / 2);
  });

  it('honors count, pools, weighted random lengths, and rejects unplayable characters', () => {
    const recipe = {
      ...defaultCopyRecipe(),
      lengthMode: 'count' as const,
      groupKind: 'figures' as const,
      groupCount: 30,
      groupLength: 'random' as const,
    };
    const groups = generateCopyTargets(recipe, 'figures')[0].split(' ');
    expect(groups).toHaveLength(30);
    expect(groups.every((group) => /^\d{2,7}$/.test(group))).toBe(true);
    expect(() =>
      validateCopyRecipe({ mode: 'groups', groupKind: 'custom', customCharacters: '🙂' }),
    ).toThrow('supported Morse');
    expect(() =>
      validateCopyRecipe({ mode: 'groups', groupKind: 'custom', customCharacters: ' ' }),
    ).toThrow('at least one');
    expect(validateCopyRecipe({ mode: 'groups', customCharacters: 'e E t' }).customCharacters).toBe(
      'ET',
    );
    expect(() =>
      generateCopyTargets(
        { ...recipe, effectiveWpm: 1, extraWordSpacing: 40, groupCount: 100 },
        'long',
      ),
    ).toThrow('too long');
  });

  it('uses inclusive short words and fills a small pool without inventing vocabulary', () => {
    const recipe = {
      ...defaultCopyRecipe('words'),
      wordCollection: 'short' as const,
      maxWordLength: 1,
    };
    const words = generateCopyTargets(recipe, 'short');
    expect(words).toHaveLength(25);
    expect(new Set(words)).toEqual(new Set(['A', 'I']));
    expect(words[0]).not.toBe(words[1]);
    expect(() => validateCopyRecipe({ ...recipe, wordCollection: 'qcodes' })).toThrow('No words');
    const wider = generateCopyTargets({ ...recipe, maxWordLength: 3 }, 'wider');
    expect(wider.every((word) => word.length <= 3)).toBe(true);
    expect(new Set(wider).size).toBe(25);
  });

  it('keeps authored corpora playable and fictional call filters meaningful', () => {
    for (const content of [...Object.values(COPY_WORD_COLLECTIONS).flat(), ...COPY_SENTENCES]) {
      expect([...content].every((character) => character === ' ' || COPY_MORSE[character])).toBe(
        true,
      );
    }
    for (const callFilter of ['simple', 'short'] as const) {
      const calls = generateCopyTargets(
        { ...defaultCopyRecipe('callsigns'), callFilter },
        'international',
      );
      expect(calls).toHaveLength(25);
      expect(calls.every((call) => !/\d{2}|[A-Z]{4}/.test(call))).toBe(true);
      if (callFilter === 'simple') expect(calls.every((call) => !call.includes('/'))).toBe(true);
    }
    expect(generateCopyTargets(defaultCopyRecipe('plaintext'), 'sentence')).toHaveLength(1);
  });

  it('validates speed semantics before generation', () => {
    expect(() => validateCopyRecipe({ mode: 'words', effectiveWpm: 4 })).toThrow('at least 5');
    expect(() =>
      validateCopyRecipe({ mode: 'groups', characterWpm: 20, effectiveWpm: 25 }),
    ).toThrow('exceed');
    expect(() => validateCopyRecipe({ mode: 'words', effectiveWpm: 20, maxSpeed: 10 })).toThrow(
      'starting speed',
    );
    const faster = createCopyAttempt(
      validateCopyRecipe({ mode: 'words', characterWpm: 10, effectiveWpm: 25 }),
      { id: 'faster', seed: 'faster', now },
    );
    expect(currentCopySpeeds(faster)).toEqual({ characterWpm: 25, effectiveWpm: 25 });
  });
});

describe('copy timing and alignment', () => {
  it('uses exact PARIS timing and adds extra whole word gaps only', () => {
    const timing = copyTiming(25, 10);
    expect(timing.characterGap).toBeCloseTo(0.712421052631579);
    expect(copyTextSeconds('PARIS', 25, 10) + timing.wordGap).toBeCloseTo(6);
    expect(copyTextSeconds('EE EE', 25, 10, 2) - copyTextSeconds('EE EE', 25, 10)).toBeCloseTo(
      2 * timing.wordGap,
    );
    expect(copyTextSeconds('EE', 25, 10, 2)).toBe(copyTextSeconds('EE', 25, 10));
    expect(copyTextSeconds('PARIS', 25, 25) + copyTiming(25, 25).wordGap).toBeCloseTo(2.4);
  });

  it('preserves substitutions, omissions, insertions, and unexpected characters', () => {
    const score = scoreCopyText('ABCDE FGHIJ', 'abcde\n fghij XXXXX');
    expect(score.distance).toBe(6);
    expect(score.denominator).toBe(10);
    expect(score.accuracy).toBe(40);
    expect(score.alignment.filter((item) => item.kind === 'insertion')).toHaveLength(6);
    expect(
      scoreCopyText('ABCDE', 'ABDE').alignment.find((item) => item.kind === 'deletion')?.expected,
    ).toBe('C');
    expect(scoreCopyText('ABCDE', 'ABXDE').distance).toBe(1);
    expect(scoreCopyText('ABC', 'ABC🙂').distance).toBe(1);
    expect(scoreCopyText('ABC DEF', 'ABCDEF').distance).toBe(1);
    expect(scoreCopyText('ABC DEF', 'ABCDEF', true).denominator).toBe(7);
    expect(scoreCopyText('ABC', '').accuracy).toBe(0);
    expect(scoreCopyText('A', 'AAAAAAAA').errorPercent).toBe(100);
  });

  it('grades beyond legacy 255-byte boundaries and bounds allocation', () => {
    const sent = 'A'.repeat(400);
    expect(scoreCopyText(sent, `${sent.slice(0, -1)}B`).distance).toBe(1);
    expect(scoreCopyText('ABC', 'abc').accuracy).toBe(100);
    expect(() => scoreCopyText('A', 'B'.repeat(2001))).toThrow('2000');
  });
});

describe('copy rounds and validated evidence', () => {
  it('scores exact adaptive items using post-increment speed and preserves successful sent speed', () => {
    let attempt = createCopyAttempt(
      { ...defaultCopyRecipe('words'), effectiveWpm: 20, maxWordLength: 3 },
      { id: 'round', seed: 'words', now },
    );
    expect(currentCopySpeeds(attempt)).toEqual({ characterWpm: 25, effectiveWpm: 20 });
    const length = attempt.targets[0].length;
    attempt = submitCopyAnswer(attempt, attempt.targets[0], { replayCount: 2, now });
    expect(attempt.trials[0].points).toBe(21 * length);
    expect(summarizeCopyAttempt(attempt)).toMatchObject({
      correct: 1,
      maxSpeed: 20,
      firstPassCorrect: 0,
      replays: 2,
    });
    expect(currentCopySpeeds(attempt).effectiveWpm).toBe(21);
    attempt = submitCopyAnswer(attempt, '', { now });
    expect(attempt.trials[1].points).toBe(0);
    expect(currentCopySpeeds(attempt).effectiveWpm).toBe(20);
    expect(validateCopyAttempt(attempt)).toEqual(attempt);
  });

  it('caps adaptive speed, keeps fixed speed, and completes exactly 25 trials', () => {
    let adaptive = createCopyAttempt(
      { ...defaultCopyRecipe('callsigns'), effectiveWpm: 5, maxSpeed: 5 },
      { id: 'floor', seed: 'floor', now },
    );
    adaptive = submitCopyAnswer(adaptive, '', { now });
    expect(currentCopySpeeds(adaptive).effectiveWpm).toBe(5);
    adaptive = submitCopyAnswer(adaptive, adaptive.targets[1], { now });
    expect(adaptive.trials[1].points).toBe(5 * adaptive.targets[1].length);
    let fixed = createCopyAttempt(
      { ...defaultCopyRecipe('words'), effectiveWpm: 20, adaptive: false },
      { id: 'fixed', seed: 'fixed', now },
    );
    for (const target of fixed.targets)
      fixed = submitCopyAnswer(fixed, target.toLowerCase(), { now });
    expect(fixed.status).toBe('completed');
    expect(
      fixed.trials.every(
        (trial) => trial.points === 20 * fixed.targets[fixed.trials.indexOf(trial)].length,
      ),
    ).toBe(true);
    expect(summarizeCopyAttempt(fixed)).toMatchObject({
      correct: 25,
      total: 25,
      accuracy: 100,
      firstPassCorrect: 25,
    });
    expect(() => submitCopyAnswer(fixed, '', { now })).toThrow('ended');
    expect(validateCopyAttempt(fixed)).toEqual(fixed);
  });

  it('saves a continuous attempt with full target and independently measured time', () => {
    let attempt = createCopyAttempt(
      { ...defaultCopyRecipe(), lengthMode: 'count', groupCount: 2 },
      { id: 'groups', seed: 'groups', now },
    );
    attempt = submitCopyAnswer(attempt, attempt.targets[0], {
      responseSeconds: 4,
      now: '2026-09-29T12:01:00.000Z',
    });
    attempt.audioSeconds = 30.25;
    attempt.answerSeconds = 4.5;
    expect(summarizeCopyAttempt(validateCopyAttempt(attempt))).toMatchObject({
      accuracy: 100,
      seconds: 34.75,
    });
    expect(() => validateCopyAttempt({ ...attempt, audioSeconds: 61, answerSeconds: 5 })).toThrow(
      'elapsed',
    );
    expect(() => validateCopyAttempt({ ...attempt, status: 'active' })).toThrow('completion');
  });

  it('rejects fabricated targets, scores, speed trajectories, and excessive or invalid time', () => {
    let attempt = createCopyAttempt(defaultCopyRecipe('words'), {
      id: 'validate',
      seed: 'evidence',
      now,
    });
    attempt = submitCopyAnswer(attempt, attempt.targets[0], { now });
    expect(() => validateCopyAttempt({ ...attempt, targets: ['CHANGED'] })).toThrow('targets');
    for (const property of ['points', 'distance', 'characterWpm', 'effectiveWpm'] as const) {
      expect(() =>
        validateCopyAttempt({ ...attempt, trials: [{ ...attempt.trials[0], [property]: 999 }] }),
      ).toThrow('inconsistent');
    }
    expect(() => validateCopyAttempt({ ...attempt, audioSeconds: Infinity })).toThrow('Audio');
    expect(() =>
      validateCopyAttempt({ ...attempt, updatedAt: '2026-09-28T12:00:00.000Z' }),
    ).toThrow('precede');
    expect(() => validateCopyAttempt({ ...attempt, contentVersion: 'unknown' })).toThrow('version');
    expect(validateCopyAttempt({ ...attempt, status: 'abandoned' }).status).toBe('abandoned');
  });

  it('requires safe identifiers and real calendar timestamps with timezones', () => {
    const recipe = defaultCopyRecipe();
    for (const invalid of [
      '2026-02-30T12:00:00Z',
      '2026-09-29',
      '2026-09-29T12:00:00',
      '2026-09-29T24:00:00Z',
    ]) {
      expect(() =>
        createCopyAttempt(recipe, { id: 'calendar', seed: 'time', now: invalid }),
      ).toThrow('timestamp');
    }
    expect(() => createCopyAttempt(recipe, { id: 'bad/id', seed: 'time', now })).toThrow('ID');
    const attempt = createCopyAttempt(recipe, {
      id: 'time',
      seed: 'time',
      now: '2026-09-29T08:00:00-04:00',
    });
    expect(attempt.createdAt).toBe(now);
  });
});
