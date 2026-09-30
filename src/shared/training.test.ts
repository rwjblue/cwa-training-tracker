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
import { createCopyAttempt, defaultCopyRecipe, submitCopyAnswer } from './copy-practice';
import { copyAttemptSessionFields } from './copy-report';

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
          audioResults: [
            {
              url: 'https://example.org/audio.mp3',
              title: 'Example audio',
              speedWpm: 18,
              activeSeconds: 570,
              completedPasses: 1,
            },
          ],
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
  it('derives native copy time and measurements from validated attempt evidence', () => {
    const initial = createCopyAttempt(
      {
        ...defaultCopyRecipe('groups'),
        lengthMode: 'count',
        groupCount: 2,
      },
      { id: 'measured', seed: 'fixture', now: '2026-09-28T12:00:00.000Z' },
    );
    const attempt = {
      ...submitCopyAnswer(initial, initial.targets[0], { now: '2026-09-28T12:02:00.000Z' }),
      audioSeconds: 60.25,
      answerSeconds: 20.5,
      reviewSeconds: 1.25,
    };
    const value = validatePracticeSession(
      session('copy:measured', '2026-09-28', 999, {
        characterWpm: 40,
        effectiveWpm: 30,
        accuracy: 5,
        source: 'manual',
        metadata: { copyAttempt: attempt, plannedTaskId: 'task:one', elapsedSeconds: 999 },
      }),
    );
    expect(value).toMatchObject({
      ...copyAttemptSessionFields(attempt),
      minutes: 82 / 60,
      characterWpm: 25,
      effectiveWpm: 10,
      accuracy: 100,
      metadata: { elapsedSeconds: 82, plannedTaskId: 'task:one' },
    });
    const exported = validateTrainingExport({
      format: 'cwa-training-tracker',
      version: 1,
      exportedAt: '2026-09-28T13:00:00.000Z',
      sessions: [value],
    });
    expect(validateTrainingExport(JSON.parse(JSON.stringify(exported)))).toEqual(exported);
    expect(() => validatePracticeSession({ ...value, id: 'different-id' })).toThrow(
      'match its attempt',
    );
    expect(() =>
      validatePracticeSession({
        ...value,
        metadata: { copyAttempt: { ...attempt, trials: [{ ...attempt.trials[0], distance: 2 }] } },
      }),
    ).toThrow('inconsistent distance');
    expect(() => validatePracticeSession({ ...value, metadata: { copyAttempt: initial } })).toThrow(
      'Finish or end',
    );
  });

  it('does not invent one speed or missing accuracy for partial native attempts', () => {
    let attempt = createCopyAttempt(defaultCopyRecipe('words'), {
      id: 'adaptive',
      seed: 'fixture',
      now: '2026-09-28T12:00:00.000Z',
    });
    const unanswered = validatePracticeSession(
      session('copy:adaptive', '2026-09-28', 1, {
        accuracy: 99,
        metadata: { copyAttempt: { ...attempt, status: 'abandoned' } },
      }),
    );
    expect(unanswered).not.toHaveProperty('accuracy');
    expect(unanswered.minutes).toBe(0);
    for (let i = 0; i < 2; i++) {
      attempt = submitCopyAnswer(attempt, attempt.targets[i], { now: '2026-09-28T12:02:00.000Z' });
    }
    const partial = validatePracticeSession(
      session('copy:adaptive', '2026-09-28', 1, {
        characterWpm: 25,
        effectiveWpm: 10,
        metadata: { copyAttempt: { ...attempt, status: 'abandoned', audioSeconds: 15 } },
      }),
    );
    expect(partial).not.toHaveProperty('characterWpm');
    expect(partial).not.toHaveProperty('effectiveWpm');
    expect(partial).toMatchObject({ minutes: 0.25, accuracy: 100 });
  });

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

  it('defaults older profiles to no Gravatar requests and accepts only explicit booleans', () => {
    const { useGravatar: _omitted, ...olderProfile } = DEFAULT_PROFILE;
    expect(validateProfile(olderProfile).useGravatar).toBe(false);
    expect(validateProfile({ ...olderProfile, useGravatar: true }).useGravatar).toBe(true);
    expect(validateProfile({ ...olderProfile, useGravatar: false }).useGravatar).toBe(false);
    for (const invalid of ['true', 'false', 1, 0, null]) {
      expect(() => validateProfile({ ...olderProfile, useGravatar: invalid })).toThrow('Gravatar');
    }
  });

  it('imports old profile backups safely and preserves an explicit Gravatar preference', () => {
    const { useGravatar: _omitted, ...olderProfile } = DEFAULT_PROFILE;
    const backup = {
      format: 'cwa-training-tracker',
      version: 1,
      exportedAt: '2026-09-29T12:00:00Z',
      sessions: [],
      profile: olderProfile,
    };
    expect(validateTrainingExport(backup).profile?.useGravatar).toBe(false);
    const optedIn = validateTrainingExport({
      ...backup,
      profile: { ...olderProfile, useGravatar: true },
    });
    expect(validateTrainingExport(JSON.parse(JSON.stringify(optedIn))).profile?.useGravatar).toBe(
      true,
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
      characterWpm: 18,
      notes: 'Try again tomorrow',
    });
    expect(converted.sessions[0].metadata?.legacyAttempt).toEqual(original.snapshot.attempts[0]);
    expect(converted.sessions[0].metadata).toMatchObject({
      scratchpad: 'Private recall notes',
      plannedTaskId: 'legacy-task:listening-1',
    });
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

  const attempt = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    taskId: 'listening-1',
    startedAt: '2026-09-28T12:00:00Z',
    endedAt: '2026-09-28T12:01:00Z',
    activeSeconds: 60,
    context: 'practice',
    completed: false,
    ...extra,
  });
  const history = (attempts: Record<string, unknown>[], runs: Record<string, unknown>[] = []) => {
    const original = legacyFixture();
    return { ...original, snapshot: { ...original.snapshot, attempts, lcwo: { runs } } };
  };

  it('applies an exclusive course-local cutoff before deriving assignment completion', () => {
    const original = history([
      attempt('yesterday', { startedAt: '2026-09-29T03:59:00Z', endedAt: '2026-09-29T04:01:00Z' }),
      attempt('today', { startedAt: '2026-09-29T04:00:00Z', completed: true }),
    ]);
    original.pending.attempts.push(attempt('pending-today', { startedAt: '2026-09-29T05:00:00Z' }));
    const converted = convertLegacyExport(original, { beforeDate: '2026-09-29' });
    expect(converted.sessions.map((entry) => entry.id)).toEqual(['legacy:yesterday']);
    expect(converted.sessions[0].date).toBe('2026-09-28');
    expect(converted.plan?.[0].done).toBe(false);
    expect(converted.legacy?.data).toEqual(original);
    expect(converted.legacy?.importedBefore).toEqual({
      date: '2026-09-29',
      timezone: 'America/New_York',
    });
    expect(validateTrainingExport(JSON.parse(JSON.stringify(converted)))).toEqual(converted);
    expect(() => convertLegacyExport(original, { beforeDate: '2026-02-30' })).toThrow('cutoff');
    expect(() => convertLegacyExport(converted, { beforeDate: '2026-09-29' })).toThrow(
      'original legacy',
    );
  });

  it('drops pure dismissals while preserving zero-valued measurements and scratchpads', () => {
    const converted = convertLegacyExport(
      history([
        attempt('dismissed', { activeSeconds: 0, note: '[Left missed]' }),
        attempt('empty-elsewhere', { activeSeconds: 0, note: ' [Practiced elsewhere] ' }),
        attempt('zero-contact', { activeSeconds: 0, note: '[Left missed]', qsoCount: 0 }),
        attempt('zero-result', {
          activeSeconds: 0,
          note: '[Left missed]',
          lcwoResult: { kind: 'callsign', score: 0 },
        }),
        attempt('zero-audio', {
          activeSeconds: 0,
          note: '[Left missed]',
          audioResults: [{ completedPasses: 0 }],
        }),
        attempt('scratchpad', {
          activeSeconds: 0,
          note: '[Left missed]',
          scratchpad: 'Learned: antenna',
        }),
        attempt('completed-elsewhere', {
          activeSeconds: 0,
          note: '[Practiced elsewhere]',
          completed: true,
        }),
      ]),
    );
    expect(converted.sessions.map((entry) => entry.sourceId)).toEqual([
      'zero-contact',
      'zero-result',
      'zero-audio',
      'scratchpad',
      'completed-elsewhere',
    ]);
    expect(converted.sessions[0].qsoCount).toBe(0);
    expect(converted.sessions[3].metadata?.scratchpad).toBe('Learned: antenna');
  });

  it('uses observed speed semantics and maps optional listening and instructor practice', () => {
    const original = history([
      attempt('prescribed-only'),
      attempt('actual-audio', { audioResults: [{ speedWpm: 21 }, { speedWpm: 21 }] }),
      attempt('mixed-audio', { audioResults: [{ speedWpm: 15 }, { speedWpm: 21 }] }),
      attempt('older-audio', {
        note: 'Audio recording: WD101 (19 WPM); assigned 15 WPM. Source: https://example.org/audio.mp3',
      }),
      attempt('groups', { lcwoResult: { kind: 'letters', speedWpm: 13, errorPercent: 0 } }),
      attempt('runner', { runnerResult: { wpm: 18, speeds: [18, 21] } }),
      attempt('daily', { taskId: 'bob-77-words', assignmentId: 'daily-listening', review: true }),
      attempt('review', { review: true }),
      attempt('material', { taskId: 'material-1' }),
    ]);
    const converted = convertLegacyExport({
      ...original,
      snapshot: {
        ...original.snapshot,
        materials: [{ id: 'material-1', title: 'Instructor practice', session: 4 }],
      },
    });
    const entries = converted.sessions;
    expect(entries[0].characterWpm).toBeUndefined();
    expect(entries[1].characterWpm).toBe(21);
    expect(entries[2].characterWpm).toBeUndefined();
    expect(entries[3].characterWpm).toBe(19);
    expect(entries[4]).toMatchObject({ effectiveWpm: 13, accuracy: 100 });
    expect(entries[4].characterWpm).toBeUndefined();
    expect(entries[5].characterWpm).toBeUndefined();
    expect(entries[6]).toMatchObject({ kind: 'listening' });
    expect(entries[7].metadata?.plannedTaskId).toBeUndefined();
    expect(entries[8]).toMatchObject({
      kind: 'sending',
      lesson: 4,
      metadata: { legacyTask: { title: 'Instructor practice' } },
    });
  });

  it('adds only uncovered unique code-group estimates without inventing timed blocks or task credit', () => {
    const run = (id: string, recordedAt: string, extra: Record<string, unknown> = {}) => ({
      id,
      recordedAt,
      kind: 'letters',
      sourceType: 'groups',
      characterWpm: 25,
      effectiveWpm: 13,
      ...extra,
    });
    const original = history(
      [
        attempt('review-block', {
          taskId: 'other:icr',
          review: true,
          startedAt: '2026-09-28T03:55:00Z',
          endedAt: '2026-09-28T04:05:00Z',
        }),
        attempt('manual-letters', {
          startedAt: '2026-09-28T10:00:00Z',
          endedAt: '2026-09-28T10:10:00Z',
          lcwoResult: { kind: 'letters' },
        }),
        attempt('class-block', {
          taskId: 'other:icr',
          context: 'class',
          startedAt: '2026-09-28T11:00:00Z',
          endedAt: '2026-09-28T11:10:00Z',
        }),
        attempt('empty-block', {
          taskId: 'other:icr',
          activeSeconds: 0,
          startedAt: '2026-09-28T12:00:00Z',
          endedAt: '2026-09-28T12:10:00Z',
        }),
      ],
      [
        run('covered-start', '2026-09-28T03:55:00Z', { kind: 'custom' }),
        run('covered-across-midnight', '2026-09-28T04:00:00Z'),
        run('covered-end', '2026-09-28T04:05:00Z'),
        run('covered-manual', '2026-09-28T10:05:00Z'),
        run('different-drill', '2026-09-28T10:05:00Z', { kind: 'custom', accuracyPercent: 0 }),
        run('class-does-not-cover', '2026-09-28T11:05:00Z'),
        run('zero-does-not-cover', '2026-09-28T12:05:00Z'),
        run('zero-does-not-cover', '2026-09-28T12:05:00Z'),
        run('words', '2026-09-28T13:00:00Z', { sourceType: 'words', kind: 'words' }),
        run('koch', '2026-09-28T13:00:00Z', { sourceType: 'koch', kind: 'koch' }),
        run('today', '2026-09-29T04:00:00Z'),
      ],
    );
    const converted = convertLegacyExport(original, { beforeDate: '2026-09-29' });
    const estimates = converted.sessions.filter((entry) => entry.metadata?.estimatedMinutes);
    expect(estimates.map((entry) => entry.id)).toEqual([
      'legacy-lcwo-estimate:different-drill',
      'legacy-lcwo-estimate:class-does-not-cover',
      'legacy-lcwo-estimate:zero-does-not-cover',
    ]);
    expect(estimates[0]).toMatchObject({
      minutes: 1,
      kind: 'icr',
      characterWpm: 25,
      effectiveWpm: 13,
      accuracy: 0,
    });
    expect(
      estimates.every(
        (entry) =>
          entry.metadata?.plannedTaskId === undefined &&
          entry.metadata?.legacyAttempt === undefined,
      ),
    ).toBe(true);
    expect(summarizePractice(converted.sessions, '2026-09-28').totalMinutes).toBe(5);
    expect(convertLegacyExport(original, { beforeDate: '2026-09-29' }).sessions).toEqual(
      converted.sessions,
    );
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
      const filteredOutput = join(directory, 'filtered.json');
      execFileSync(process.execPath, [
        script,
        source,
        '--output',
        filteredOutput,
        '--before',
        '2026-09-07',
        '--keep-profile',
      ]);
      const filtered = JSON.parse(readFileSync(filteredOutput, 'utf8'));
      expect(filtered.sessions).toEqual([]);
      expect(filtered.profile).toBeUndefined();
      expect(filtered.legacy.importedBefore).toEqual({
        date: '2026-09-07',
        timezone: 'America/New_York',
      });
      expect(filtered.legacy.data).toEqual(JSON.parse(original));
      expect(statSync(filteredOutput).mode & 0o777).toBe(0o600);
      expect(readFileSync(source, 'utf8')).toBe(original);
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
