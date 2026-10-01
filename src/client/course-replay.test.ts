import { describe, expect, it } from 'vitest';
import {
  COURSE_REPLAY_STORAGE_KEY,
  loadCourseReplay,
  saveCourseReplay,
  shouldReplayCourse,
} from './course-replay';

const required = {
  enabled: true,
  completed: true,
  minimumPasses: 2,
  savedPasses: 0,
  currentPasses: 1,
  extraReview: false,
};
describe('deliberate required course replay', () => {
  it('continues an observed first pass, then stops at the minimum without duration caps', () => {
    expect(shouldReplayCourse(required)).toBe(true);
    expect(shouldReplayCourse({ ...required, currentPasses: 2 })).toBe(false);
    expect(shouldReplayCourse({ ...required, currentPasses: 3 })).toBe(false);
  });
  it('counts owned prior passes alongside this block, without looping deliberate extra review', () => {
    expect(shouldReplayCourse({ ...required, savedPasses: 1 })).toBe(false);
    expect(shouldReplayCourse({ ...required, minimumPasses: 3, savedPasses: 1 })).toBe(true);
    expect(shouldReplayCourse({ ...required, extraReview: true })).toBe(false);
  });
  it('requires both opt-in and actual whole-pass completion', () => {
    expect(shouldReplayCourse({ ...required, enabled: false })).toBe(false);
    expect(shouldReplayCourse({ ...required, completed: false })).toBe(false);
  });
  it.each([undefined, 0, -1, NaN, Infinity, 1.5])(
    'never treats missing/invalid target %s as infinite replay',
    (minimumPasses) => {
      expect(shouldReplayCourse({ ...required, minimumPasses })).toBe(false);
    },
  );
});

describe('device course choice', () => {
  it.each([null, 'false', '1', '"true"', '{"enabled":true}', 'broken'])(
    'starts paused for absent/malformed %s',
    (raw) => {
      expect(loadCourseReplay({ getItem: () => raw })).toBe(false);
    },
  );
  it('retains only a boolean independent of generated preferences or source identity', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    expect(saveCourseReplay(true, storage)).toBe(true);
    expect(loadCourseReplay(storage)).toBe(true);
    expect([...values]).toEqual([[COURSE_REPLAY_STORAGE_KEY, 'true']]);
    expect(saveCourseReplay(false, storage)).toBe(true);
    expect(loadCourseReplay(storage)).toBe(false);
  });
  it('reports storage failures and silently discarded writes honestly', () => {
    const denied = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadCourseReplay(denied)).toBe(false);
    expect(saveCourseReplay(true, denied)).toBe(false);
    expect(saveCourseReplay(true, { getItem: () => null, setItem: () => {} })).toBe(false);
  });
});
