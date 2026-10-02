import { describe, expect, it } from 'vitest';
import { dailyWordListening } from './daily-word-listening';
import {
  dateInTimezone,
  validatePracticeSession,
  DEFAULT_PROFILE,
  type PracticeSession,
} from './training';
import { weeklyReport } from './plan';
import { practiceTimeWithCurrent, savedPracticeTime } from './practice-time';

const date = '2026-10-01';
function entry(id = 'words', words: number | undefined = 480): PracticeSession {
  return validatePracticeSession({
    id,
    date,
    kind: 'head-copy',
    minutes: 10,
    notes: 'Synthetic words',
    source: 'morse',
    createdAt: '2026-10-02T09:58:00Z',
    metadata: {
      practicePurpose: 'review',
      evidence: {
        version: 1,
        type: 'timed',
        measurement: { seconds: 600, recallSeconds: 120 },
        recordings: [],
        ...(words !== undefined ? { wordListeningSeconds: words } : {}),
        generatedListening: {
          version: 1,
          overflow: false,
          summaries: [
            {
              mode: 'words',
              listId: 'common-30',
              entryCount: 30,
              characterWpm: 20,
              effectiveWpm: 10,
              toneHz: 600,
              wordGapSeconds: 1,
              shuffle: false,
              repeat: true,
              spokenAnswers: false,
            },
          ],
        },
      },
    },
  });
}
describe('optional daily word listening', () => {
  it('counts eight heard minutes separately from two recall minutes and total practice', () => {
    const saved = entry();
    expect(dailyWordListening([saved], [], date)).toMatchObject({
      savedSeconds: 480,
      currentSeconds: 0,
      totalSeconds: 480,
      remainingSeconds: 120,
      reachedGoal: false,
    });
    expect(practiceTimeWithCurrent(savedPracticeTime([saved], date), []).practice).toMatchObject({
      totalSeconds: 600,
      recallSeconds: 120,
    });
    expect(weeklyReport([saved], DEFAULT_PROFILE, date, date)).toContain(
      'Measured word listening: 480.00 seconds',
    );
    expect(weeklyReport([saved], DEFAULT_PROFILE, date, date)).toContain(
      'extra review (no required assignment credit)',
    );
  });
  it('retires current after any receipt and deduplicates retries and observations', () => {
    const current = {
      id: 'words',
      date,
      seconds: 600,
      recallSeconds: 120,
      wordListeningSeconds: 480,
    };
    expect(dailyWordListening([], [current, current], date).currentSeconds).toBe(480);
    expect(dailyWordListening([entry(), entry()], [current], date)).toMatchObject({
      savedSeconds: 480,
      currentSeconds: 0,
      totalSeconds: 480,
    });
    for (const changed of [
      { ...entry(), context: 'class' as const },
      { ...entry(), date: '2026-10-02' },
      { ...entry(), minutes: 0, metadata: undefined },
    ])
      expect(dailyWordListening([changed], [current], date).totalSeconds).toBe(0);
  });
  it('uses captured learner date across midnight and excludes class/current wrong dates', () => {
    const saved = entry();
    expect(dateInTimezone(saved.createdAt, 'Pacific/Honolulu')).toBe(date);
    expect(dateInTimezone(saved.createdAt, 'UTC')).toBe('2026-10-02');
    expect(dailyWordListening([saved], [], '2026-10-02').totalSeconds).toBe(0);
    expect(
      dailyWordListening(
        [{ ...saved, context: 'class' }],
        [
          { id: 'class-current', date, seconds: 50, wordListeningSeconds: 50, classTime: true },
          { id: 'wrong-date', date: '2026-10-02', seconds: 50, wordListeningSeconds: 50 },
        ],
        date,
      ).totalSeconds,
    ).toBe(0);
  });
  it('crosses the milestone and keeps counting deliberate continued listening', () => {
    const current = (seconds: number) => ({
      id: 'current',
      date,
      seconds,
      wordListeningSeconds: seconds,
    });
    expect(dailyWordListening([entry()], [current(119.9)], date).reachedGoal).toBe(false);
    expect(dailyWordListening([entry()], [current(120)], date)).toMatchObject({
      totalSeconds: 600,
      remainingSeconds: 0,
      reachedGoal: true,
    });
    expect(dailyWordListening([entry()], [current(150)], date)).toMatchObject({
      totalSeconds: 630,
      remainingSeconds: 0,
      reachedGoal: true,
    });
  });
  it('does not infer elapsed word time from old configurations, estimates or malformed projections', () => {
    const old = entry('old');
    delete (old.metadata!.evidence as { wordListeningSeconds?: number }).wordListeningSeconds;
    expect(dailyWordListening([old], [], date).totalSeconds).toBe(0);
    for (const words of [NaN, Infinity, -1, 100])
      expect(
        dailyWordListening(
          [],
          [{ id: 'invalid', date, seconds: 10, recallSeconds: 2, wordListeningSeconds: words }],
          date,
        ).totalSeconds,
      ).toBe(0);
  });
  it('allows arithmetic roundoff beside recall without lending time to impossible word subtotals', () => {
    const current = {
      id: 'rounded',
      date,
      seconds: 600 - Number.EPSILON * 600,
      recallSeconds: 120,
      wordListeningSeconds: 480,
    };
    expect(dailyWordListening([], [current], date).currentSeconds).toBe(480);
    expect(
      dailyWordListening([], [{ ...current, wordListeningSeconds: 480.001 }], date).currentSeconds,
    ).toBe(0);
  });
});
