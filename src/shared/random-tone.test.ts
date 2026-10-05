import { describe, expect, it, vi } from 'vitest';
import { randomToneHz, randomTonePair } from './random-tone';

describe('shared listening pitch selection', () => {
  it.each([
    [0, 500],
    [0.5, 700],
    [0.999999, 900],
  ])('maps a draw of %s into the inclusive range at %i Hz', (draw, expected) => {
    const random = vi.fn(() => draw);
    expect(randomToneHz(random)).toBe(expected);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it.each([
    [0, 0, [500, 535]],
    [0, 0.999999, [500, 900]],
    [0.999999, 0, [900, 500]],
    [0.999999, 0.999999, [900, 865]],
    [0.5, 165 / 332, [700, 665]],
    [0.5, 0.5, [700, 735]],
  ])('samples both sides of an allowed pair from %s and %s', (first, second, expected) => {
    const random = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const pair = randomTonePair(random);
    expect(pair).toEqual(expected);
    expect(random).toHaveBeenCalledTimes(2);
    expect(Object.isFrozen(pair)).toBe(true);
  });

  it.each([0, 0.08, 0.5, 0.92, 0.999999])(
    'keeps the gap and bounds even when every draw repeats %s',
    (draw) => {
      const random = vi.fn(() => draw);
      const [first, second] = randomTonePair(random);
      for (const tone of [first, second]) {
        expect(tone).toBeGreaterThanOrEqual(500);
        expect(tone).toBeLessThanOrEqual(900);
        expect(Number.isInteger(tone)).toBe(true);
      }
      expect(Math.abs(first - second)).toBeGreaterThanOrEqual(35);
      expect(random).toHaveBeenCalledTimes(2);
    },
  );

  it('honors a supported custom separation and rejects impossible or fractional constraints', () => {
    expect(randomTonePair(() => 0.5, 200)).toEqual([700, 900]);
    for (const difference of [0, -35, 35.5, 201, NaN, Infinity]) {
      const random = vi.fn(() => 0.5);
      expect(() => randomTonePair(random, difference)).toThrow('1 to 200');
      expect(random).not.toHaveBeenCalled();
    }
  });
});
