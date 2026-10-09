import { describe, expect, it } from 'vitest';
import { PracticeUsageBurstLimiter } from './practice-usage-burst';

describe('identity-free practice report burst protection', () => {
  it('bounds a burst and refills at two reports per second without exceeding capacity', () => {
    const limiter = new PracticeUsageBurstLimiter();
    for (let i = 0; i < 120; i++) expect(limiter.allow(1_000)).toBe(true);
    expect(limiter.allow(1_000)).toBe(false);
    expect(limiter.allow(1_499)).toBe(false);
    expect(limiter.allow(1_500)).toBe(true);
    expect(limiter.allow(1_500)).toBe(false);
    expect(limiter.allow(2_000)).toBe(true);
    expect(limiter.allow(2_000)).toBe(false);
    for (let i = 0; i < 120; i++) expect(limiter.allow(1_000_000)).toBe(true);
    expect(limiter.allow(1_000_000)).toBe(false);
  });

  it('does not mint tokens when clocks go backwards or timestamps are invalid', () => {
    const limiter = new PracticeUsageBurstLimiter(1, 2);
    expect(limiter.allow(10_000)).toBe(true);
    expect(limiter.allow(9_000)).toBe(false);
    expect(limiter.allow(9_500)).toBe(false);
    expect(limiter.allow(10_000)).toBe(false);
    expect(limiter.allow(10_500)).toBe(true);
    for (const now of [NaN, Infinity, -Infinity]) expect(limiter.allow(now)).toBe(false);
    expect(limiter.allow(10_500)).toBe(false);
    expect(limiter.allow(11_000)).toBe(true);
  });
});
