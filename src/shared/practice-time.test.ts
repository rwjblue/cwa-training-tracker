import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, dateInTimezone, type PracticeSession } from './training';
import type { PlannedTask } from './plan';
import {
  dailyPracticeGoals,
  savedPracticeTime,
  practiceTimeWithCurrent,
  type CurrentPracticeTime,
} from './practice-time';

const date = '2026-10-01';
const entry = (
  id: string,
  seconds = 60,
  extra: Partial<PracticeSession> = {},
): PracticeSession => ({
  id,
  date,
  minutes: seconds / 60,
  kind: 'listening',
  notes: '',
  createdAt: `${date}T12:00:00Z`,
  ...extra,
});
const current = (id = 'studio:one', seconds = 120): CurrentPracticeTime => ({ id, date, seconds });
const totals = (entries: PracticeSession[], observations: CurrentPracticeTime[]) =>
  practiceTimeWithCurrent(savedPracticeTime(entries, date), observations);

describe('daily practice ownership and goals', () => {
  it('transfers a stable attempt once from current to local saved to server acknowledged', () => {
    const live = current();
    const old = entry('old', 180);
    const receipt = entry(live.id, live.seconds);
    expect(totals([old], [live]).practice).toMatchObject({
      savedSeconds: 180,
      currentSeconds: 120,
      totalSeconds: 300,
    });
    const queued = totals([old, receipt], [live]);
    expect(queued.practice).toMatchObject({
      savedSeconds: 300,
      currentSeconds: 0,
      totalSeconds: 300,
    });
    expect(totals([receipt, old, receipt], [live, live])).toEqual(queued);
    const next = current('studio:next', 15.25);
    expect(totals([receipt, old], [next, live]).practice.totalSeconds).toBe(315.25);
  });
  it('deduplicates active and retained terminal results and honors edited receipt ownership', () => {
    const native = current('runner:native', 61);
    expect(totals([], [native, native]).practice.currentSeconds).toBe(61);
    const classReceipt = entry(native.id, 61, { context: 'class' });
    const moved = totals([classReceipt], [native]);
    expect(moved.practice.totalSeconds).toBe(0);
    expect(moved.classTime).toMatchObject({
      savedSeconds: 61,
      currentSeconds: 0,
      totalSeconds: 61,
    });
    expect(totals([entry(native.id, 0)], [native]).practice.totalSeconds).toBe(0);
  });
  it('keeps native and corrected recall within total, with class separate', () => {
    const measured = entry('heard', 60, { metadata: { elapsedSeconds: 60, recallSeconds: 20 } });
    const corrected = entry('corrected', 90, {
      metadata: {
        evidence: {
          version: 1,
          type: 'timed',
          measurement: { seconds: 60, recallSeconds: 10 },
          recordings: [],
          correction: { seconds: 90, recallSeconds: 30, reason: 'Synthetic correction' },
        },
      },
    });
    const result = totals(
      [measured, corrected, entry('class', 120, { context: 'class' })],
      [
        { ...current(), recallSeconds: 15 },
        { ...current('class:live', 30), classTime: true },
      ],
    );
    expect(result.practice).toMatchObject({
      savedSeconds: 150,
      currentSeconds: 120,
      totalSeconds: 270,
      recallSeconds: 65,
    });
    expect(result.classTime.totalSeconds).toBe(150);
  });
  it.each([NaN, Infinity, -1, 86401])('rejects invalid current duration %s', (seconds) => {
    expect(totals([], [current('bad', seconds)]).practice.totalSeconds).toBe(0);
  });
  it.each([NaN, -1, 121])(
    'rejects invalid recall rather than inventing independent time: %s',
    (recallSeconds) => {
      expect(totals([], [{ ...current(), recallSeconds }]).practice.totalSeconds).toBe(0);
    },
  );
  it('excludes zero, invalid and future records while preserving legacy estimates once', () => {
    const estimate = entry('estimate', 60, {
      source: 'legacy',
      metadata: { legacyEstimated: true },
    });
    const result = totals(
      [
        estimate,
        estimate,
        entry('zero', 0),
        entry('bad', NaN),
        entry('bad-date', 60, { date: '2026-02-30' }),
        entry('future', 60, { date: '2026-10-02' }),
        entry('negative', -60),
      ],
      [{ ...current(), date: '2026-10-02' }, current('zero', 0)],
    );
    expect(result.practice).toMatchObject({
      savedSeconds: 60,
      currentSeconds: 0,
      totalSeconds: 60,
    });
  });
  it.each(['America/New_York', 'Pacific/Honolulu', 'Asia/Kathmandu'])(
    'keeps the captured start day across midnight in %s',
    (timezone) => {
      const start = dateInTimezone('2026-10-02T01:00:00Z', timezone);
      const observed = { ...current(), date: start };
      expect(
        practiceTimeWithCurrent(savedPracticeTime([], start), [observed]).practice.currentSeconds,
      ).toBe(120);
      const next = new Date(`${start}T12:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      const tomorrow = next.toISOString().slice(0, 10);
      expect(
        practiceTimeWithCurrent(savedPracticeTime([], tomorrow), [observed]).practice
          .currentSeconds,
      ).toBe(0);
      expect(
        practiceTimeWithCurrent(
          savedPracticeTime([entry(observed.id, 120, { date: start })], start),
          [observed],
        ).practice.totalSeconds,
      ).toBe(120);
    },
  );
  it('defines rest from dated assignment presence, independent of completion and future preparation', () => {
    const profile = {
      ...DEFAULT_PROFILE,
      dailyGoalMinutes: 45,
      firstClassDate: date,
      classDays: [1, 4],
    };
    const task: PlannedTask = {
      id: 'work',
      title: 'Synthetic',
      notes: '',
      createdAt: `${date}T12:00Z`,
      kind: 'listening',
      done: false,
      dueDate: date,
    };
    expect(dailyPracticeGoals(profile, [task], date)).toEqual({
      requiredMinutes: 45,
      personalMinutes: 45,
      restDay: false,
    });
    expect(dailyPracticeGoals(profile, [{ ...task, done: true }], date).requiredMinutes).toBe(45);
    expect(dailyPracticeGoals(profile, [{ ...task, dueDate: undefined, lesson: 2 }], date)).toEqual(
      { requiredMinutes: 0, personalMinutes: 45, restDay: true },
    );
    expect(dailyPracticeGoals(profile, [], date).requiredMinutes).toBe(0);
    expect(
      dailyPracticeGoals(profile, [{ ...task, dueDate: undefined, lesson: 1 }], date)
        .requiredMinutes,
    ).toBe(45);
  });
});
