import { describe, expect, it } from 'vitest';
import { practiceActivityGroup, summarizeRecentPractice } from './practice-summary';
import type { PracticeSession } from './training';

const session = (id: string, overrides: Partial<PracticeSession> = {}): PracticeSession => ({
  id,
  date: '2026-10-05',
  minutes: 5,
  kind: 'listening',
  notes: '',
  createdAt: '2026-10-05T12:00:00Z',
  ...overrides,
});

describe('practice activity summary', () => {
  it('keeps the selected on-air activity and unspecified historical QSOs separate from listening tools', () => {
    expect(practiceActivityGroup(session('old', { kind: 'on-air' }))).toBe('on-air');
    expect(
      practiceActivityGroup(session('qso', { kind: 'on-air', metadata: { onAirCategory: 'qso' } })),
    ).toBe('on-air');
    for (const category of ['pota', 'sota', 'cwt', 'contest'] as const)
      expect(
        practiceActivityGroup(
          session(category, { kind: 'on-air', metadata: { onAirCategory: category } }),
        ),
      ).toBe(category);
    expect(
      practiceActivityGroup(
        session('air-listen', { kind: 'on-air', metadata: { onAirCategory: 'listening' } }),
      ),
    ).toBe('on-air-listening');
    expect(
      practiceActivityGroup(
        session('air-other', { kind: 'on-air', metadata: { onAirCategory: 'other' } }),
      ),
    ).toBe('on-air-other');
    expect(practiceActivityGroup(session('copy', { kind: 'icr' }))).toBe('icr');
    expect(practiceActivityGroup(session('runner', { kind: 'simulator' }))).toBe('simulator');
  });

  it('recognizes native and retained historical recordings without adding source time twice', () => {
    const recording = session('recording', {
      minutes: 2.5,
      metadata: {
        evidence: {
          version: 1,
          type: 'timed',
          measurement: { seconds: 150 },
          recordings: [{ url: 'https://example.test/recording.mp3', seconds: 90 }],
        },
      },
    });
    const legacy = session('legacy', {
      minutes: 1.25,
      metadata: {
        legacyAttempt: {
          audioResults: [{ url: 'https://example.test/old.mp3', activeSeconds: 75 }],
        },
      },
    });
    expect(practiceActivityGroup(recording)).toBe('recordings');
    expect(practiceActivityGroup(legacy)).toBe('recordings');
    expect(
      practiceActivityGroup(
        session('url', { metadata: { recordingUrl: 'https://example.test/manual.mp3' } }),
      ),
    ).toBe('recordings');
    expect(practiceActivityGroup(session('generated'))).toBe('listening');
    const summary = summarizeRecentPractice([recording, legacy], '2026-10-05');
    expect(summary.days.at(-1)).toEqual({
      date: '2026-10-05',
      minutes: 3.75,
      activities: [{ id: 'recordings', label: 'Recording listening', minutes: 3.75 }],
    });
    expect(summary.weekMinutes).toBe(3.75);
  });

  it('uses a rolling seven days while preserving the older streak across a day off', () => {
    const entries = [
      session('older', { date: '2026-09-27', minutes: 5 }),
      session('first', { date: '2026-09-29', kind: 'icr', minutes: 10 }),
      session('first', { date: '2026-09-29', kind: 'icr', minutes: 10 }),
      ...['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((date) =>
        session(date, { date, kind: 'sending', minutes: 1 }),
      ),
      session('today', {
        kind: 'on-air',
        minutes: 2.5,
        effectiveWpm: 18,
        metadata: { onAirCategory: 'pota' },
      }),
      session('class', { context: 'class', minutes: 60, effectiveWpm: 99 }),
      session('future', { date: '2026-10-06', minutes: 60, effectiveWpm: 80 }),
      session('zero', { minutes: 0 }),
      session('invalid', { date: '2026-02-30', minutes: 40 }),
      session('nonfinite', { minutes: Number.NaN }),
    ];
    const summary = summarizeRecentPractice(entries, '2026-10-05');
    expect(summary.days.map((day) => day.date)).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
    ]);
    expect(summary.weekMinutes).toBe(17.5);
    expect(summary.sessionCount).toBe(7);
    expect(summary.activeDays).toBe(7);
    expect(summary.currentStreak).toBe(8);
    expect(summary.latestSpeed).toBe(18);
    expect(summary.activities.map((activity) => [activity.id, activity.minutes])).toEqual([
      ['icr', 10],
      ['sending', 5],
      ['pota', 2.5],
    ]);
    expect(
      summary.days.reduce(
        (sum, day) => sum + day.activities.reduce((total, activity) => total + activity.minutes, 0),
        0,
      ),
    ).toBe(summary.weekMinutes);
  });
});
