import { describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  addDays,
  convertLegacyExport,
  courseMeetings,
  dateInTimezone,
  DEFAULT_PROFILE,
  isCalendarDate,
  summarizePractice,
  validatePracticeSession,
  validateProfile,
  validateTrainingExport,
  type PracticeSession,
} from './training';

function session(
  id: string,
  date: string,
  minutes: number,
  extra: Partial<PracticeSession> = {},
): PracticeSession {
  return {
    id,
    date,
    minutes,
    kind: 'listening',
    notes: '',
    createdAt: `${date}T12:00:00Z`,
    ...extra,
  };
}

function legacyFixture() {
  return {
    exportedAt: '2026-09-29T00:00:00Z',
    snapshot: {
      course: {
        id: 'example-course',
        title: 'Intermediate practice',
        timezone: 'America/New_York',
        dailyGoalMinutes: 60,
        meetings: [
          { session: 1, startsAt: '2026-09-07T19:30:00Z', endsAt: '2026-09-07T20:30:00Z' },
          { session: 2, startsAt: '2026-09-10T19:30:00Z', endsAt: '2026-09-10T20:30:00Z' },
        ],
        assignments: [
          {
            session: 1,
            tasks: [
              {
                id: 'listening-1',
                kind: 'audio',
                speedWpm: 15,
                title: 'Example original exercise',
              },
            ],
          },
        ],
      },
      attempts: [
        {
          id: 'attempt-1',
          taskId: 'listening-1',
          startedAt: '2026-09-08T02:00:00Z',
          endedAt: '2026-09-08T02:10:00Z',
          activeSeconds: 570,
          recallSeconds: 30,
          completed: false,
          completedPasses: 1,
          context: 'practice',
          note: 'Try again tomorrow',
          scratchpad: 'Private recall notes',
        },
      ],
      materials: [{ title: 'Private example material', text: 'Example content' }],
      reports: [{ id: 'report-1', answers: { example: 'Saved report' } }],
      lcwo: { results: [{ id: 'unmapped-metric' }] },
    },
    pending: { attempts: [] as Record<string, unknown>[] },
    activeBlock: { id: 'unfinished', activeSeconds: 120 },
  };
}

describe('practice input validation', () => {
  it('rejects invalid calendar dates, nonfinite time, and impossible speeds', () => {
    expect(isCalendarDate('2026-02-29')).toBe(false);
    expect(isCalendarDate('2024-02-29')).toBe(true);
    expect(() => validatePracticeSession(session('one', '2026-02-30', 15))).toThrow(
      'practice date',
    );
    expect(() => validatePracticeSession(session('one', '2026-09-28', Number.NaN))).toThrow(
      'Practice minutes',
    );
    expect(() =>
      validatePracticeSession(
        session('one', '2026-09-28', 15, { characterWpm: 20, effectiveWpm: 25 }),
      ),
    ).toThrow('Effective speed');
    expect(() =>
      validatePracticeSession(
        session('one', '2026-09-28', 15, { createdAt: '2026-09-28T12:00:00' }),
      ),
    ).toThrow('timezone');
    expect(() =>
      validatePracticeSession(
        session('one', '2026-09-28', 15, { createdAt: '2026-02-30T12:00:00Z' }),
      ),
    ).toThrow('timestamp');
  });

  it('preserves zero results and blank notes without inventing accuracy', () => {
    expect(
      validatePracticeSession(session('one', '2026-09-28', 0, { qsoCount: 0, accuracy: 0 })),
    ).toMatchObject({ qsoCount: 0, accuracy: 0, minutes: 0, notes: '' });
    expect(validatePracticeSession(session('two', '2026-09-28', 1))).not.toHaveProperty('accuracy');
  });

  it('validates learner timezone, schedule, and bounded goals', () => {
    expect(
      validateProfile({ ...DEFAULT_PROFILE, callsign: ' n1abc ', classDays: [4, 1] }),
    ).toMatchObject({ callsign: 'N1ABC', classDays: [1, 4] });
    expect(() => validateProfile({ ...DEFAULT_PROFILE, timezone: 'Not/AZone' })).toThrow(
      'timezone',
    );
    expect(() => validateProfile({ ...DEFAULT_PROFILE, classDays: [1, 1] })).toThrow('unique');
    expect(() => validateProfile({ ...DEFAULT_PROFILE, dailyGoalMinutes: -10 })).toThrow(
      'Daily goal',
    );
  });
});

describe('calendar planning', () => {
  it("uses the learner's date across UTC midnight and daylight-saving boundaries", () => {
    expect(dateInTimezone('2026-09-29T02:30:00Z', 'America/New_York')).toBe('2026-09-28');
    expect(dateInTimezone('2026-11-01T05:30:00Z', 'America/New_York')).toBe('2026-11-01');
    expect(dateInTimezone('2026-11-01T06:30:00Z', 'America/New_York')).toBe('2026-11-01');
    expect(addDays('2026-10-31', 2)).toBe('2026-11-02');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('plans sixteen meetings from configurable weekdays', () => {
    const meetings = courseMeetings({ firstClassDate: '2026-09-07', classDays: [1, 4] });
    expect(meetings).toHaveLength(16);
    expect(meetings[0]).toEqual({ lesson: 1, week: 1, date: '2026-09-07' });
    expect(meetings[15]).toEqual({ lesson: 16, week: 8, date: '2026-10-29' });
    expect(courseMeetings({ firstClassDate: '2026-09-08', classDays: [2, 5] })[1].date).toBe(
      '2026-09-11',
    );
    expect(courseMeetings({ firstClassDate: '', classDays: [1, 4] })).toEqual([]);
    expect(() => courseMeetings({ firstClassDate: '2026-09-07', classDays: [] })).toThrow();
  });
});

describe('practice totals', () => {
  it('separates class time, ignores duplicate IDs and future sessions, and uses a Monday week', () => {
    const items = [
      session('a', '2026-09-27', 30),
      session('b', '2026-09-28', 15),
      session('b', '2026-09-28', 15),
      session('class', '2026-09-28', 60, { context: 'class' }),
      session('future', '2026-09-29', 15),
    ];
    const summary = summarizePractice(items, '2026-09-28', 60);
    expect(summary).toMatchObject({
      todayMinutes: 15,
      weekMinutes: 15,
      totalMinutes: 45,
      practiceDays: 2,
      currentStreak: 2,
      bestStreak: 2,
      todayGoalPercent: 25,
    });
    expect(summary.days[0]).toEqual({ date: '2026-09-28', minutes: 15 });
    expect(summary.days[6].date).toBe('2026-10-04');
  });

  it("keeps yesterday's streak while today is in progress, but breaks after a missed day", () => {
    const items = [session('a', '2026-09-26', 10), session('b', '2026-09-27', 10)];
    expect(summarizePractice(items, '2026-09-28').currentStreak).toBe(2);
    expect(summarizePractice(items, '2026-09-29').currentStreak).toBe(0);
    expect(summarizePractice([], '2026-09-28').bestStreak).toBe(0);
  });
});

describe('legacy migration', () => {
  it('preserves the original archive, exact practice seconds and structured observations', () => {
    const original = legacyFixture();
    const converted = convertLegacyExport(original);
    expect(converted.profile).toMatchObject({
      level: 'intermediate',
      timezone: 'America/New_York',
      firstClassDate: '2026-09-07',
      classDays: [1, 4],
    });
    expect(converted.sessions).toHaveLength(1);
    expect(converted.sessions[0]).toMatchObject({
      id: 'legacy:attempt-1',
      date: '2026-09-07',
      kind: 'listening',
      minutes: 9.5,
      lesson: 1,
      characterWpm: 15,
      notes: 'Try again tomorrow',
    });
    expect(converted.sessions[0].metadata?.legacyAttempt).toEqual(original.snapshot.attempts[0]);
    expect(converted.legacy?.data).toEqual(original);
    expect(convertLegacyExport(original).sessions).toEqual(converted.sessions);
  });

  it('merges pending changes once and preserves zero-QSO on-air sessions and class context', () => {
    const original = legacyFixture();
    original.pending.attempts.push({ ...original.snapshot.attempts[0], activeSeconds: 600 });
    original.pending.attempts.push({
      id: 'cwt',
      taskId: 'other:cwt',
      startedAt: '2026-09-10T13:00:00Z',
      activeSeconds: 900,
      cwtResult: { qsoCount: 0, heardCallsigns: 'N0CALL' },
      context: 'class',
    });
    const converted = convertLegacyExport(original);
    expect(converted.sessions).toHaveLength(2);
    expect(converted.sessions[0].minutes).toBe(10);
    expect(converted.sessions[1]).toMatchObject({ kind: 'on-air', qsoCount: 0, context: 'class' });
    expect(summarizePractice(converted.sessions, '2026-09-10').totalMinutes).toBe(10);
  });

  it('does not silently skip malformed attempts or accept duplicate import IDs', () => {
    const original = legacyFixture();
    original.snapshot.attempts[0].activeSeconds = -1;
    expect(() => convertLegacyExport(original)).toThrow('Legacy practice seconds');
    const converted = convertLegacyExport(legacyFixture());
    converted.sessions.push(converted.sessions[0]);
    expect(() => validateTrainingExport(converted)).toThrow('duplicate session IDs');
    expect(() => convertLegacyExport({ ...legacyFixture(), pending: { attempts: {} } })).toThrow(
      'must be an array',
    );
  });

  it('round-trips the modern format with all legacy metadata intact', () => {
    const converted = convertLegacyExport(legacyFixture());
    expect(convertLegacyExport(JSON.parse(JSON.stringify(converted)))).toEqual(converted);
  });
});

describe('local migration command', () => {
  it('writes a private output, preserves the source, and refuses accidental overwrites or public paths', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cwa-import-test-'));
    const source = join(directory, 'source.json');
    const output = join(directory, 'converted.json');
    const script = fileURLToPath(new URL('../../scripts/import-legacy.ts', import.meta.url));
    const original = JSON.stringify(legacyFixture());
    writeFileSync(source, original, { mode: 0o600 });
    try {
      execFileSync(process.execPath, [script, source, '--output', output]);
      expect(JSON.parse(readFileSync(output, 'utf8')).sessions).toHaveLength(1);
      expect(statSync(output).mode & 0o777).toBe(0o600);
      expect(readFileSync(source, 'utf8')).toBe(original);
      expect(spawnSync(process.execPath, [script, source, '--output', output]).status).not.toBe(0);
      const unsafe = fileURLToPath(
        new URL('./private-import-must-not-exist.json', import.meta.url),
      );
      const rejected = spawnSync(process.execPath, [script, source, '--output', unsafe], {
        encoding: 'utf8',
      });
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain('ignored');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
