import { validatePracticeSession } from './training';
import { describe, expect, it } from 'vitest';
import { lcwoContributions, estimatedLcwoSessions, lcwoContributionDetails } from './lcwo-practice';
import { validateLcwoRun } from './lcwo';
import { weeklyReport } from './plan';
import { DEFAULT_PROFILE, validateTrainingExport, type PracticeSession } from './training';

const run = validateLcwoRun({
  version: 1,
  source: 'lcwo-export',
  id: 'groups:7:12',
  kind: 'letters',
  sourceType: 'groups',
  sourceUserId: '7',
  sourceResultId: '12',
  sourceTime: '2026-09-30 00:00:15',
  recordedAt: '2026-09-30T00:00:15.000Z',
  characterWpm: 25,
  effectiveWpm: 18,
  accuracyPercent: 0,
});
const data = { runs: [run], estimateSeconds: 60 };
const now = Date.parse('2026-10-01T00:00:00Z');
const block = (patch: Partial<PracticeSession> = {}): PracticeSession => ({
  id: 'block',
  date: '2026-09-29',
  kind: 'icr',
  minutes: 10,
  source: 'manual',
  notes: '',
  createdAt: '2026-10-01T12:00:00Z',
  ...patch,
});
const rows = (entries: PracticeSession[] = [], input = data) =>
  lcwoContributions(input, entries, 'America/New_York', now);
describe('explicit LCWO estimates against full saved history', () => {
  it('uses source completion in the learner zone, deduplicates source IDs and disables by default', () => {
    expect(rows([], { ...data, runs: [run, run] })).toHaveLength(1);
    expect(rows()[0]).toMatchObject({
      date: '2026-09-29',
      reason: 'estimate',
      additionalSeconds: 60,
    });
    expect(rows([], { ...data, estimateSeconds: 0 })[0]).toMatchObject({
      reason: 'disabled',
      additionalSeconds: 0,
    });
    expect(estimatedLcwoSessions(rows())[0]).toMatchObject({
      date: '2026-09-29',
      minutes: 1,
      source: 'legacy',
      notes: expect.stringContaining('not measured audio'),
    });
  });
  it('suppresses known intervals crossing midnight and outside the selected report day', () => {
    const known = block({
      date: '2026-09-28',
      metadata: {
        legacyAttempt: {
          taskId: 'other:icr',
          startedAt: '2026-09-29T23:59:00Z',
          endedAt: '2026-09-30T00:01:00Z',
          review: true,
        },
      },
    });
    expect(rows([known])[0]).toMatchObject({
      reason: 'logged-block',
      coveredBy: 'block',
      additionalSeconds: 0,
    });
    const report = weeklyReport(
      [known],
      { ...DEFAULT_PROFILE, timezone: 'America/New_York' },
      '2026-09-29',
      '2026-09-29',
      data,
    );
    expect(report).toContain('0 additional estimated group minutes');
    expect(report).toContain('matching logged block');
  });
  it('withholds uncertain same-day timer/manual blocks without inventing upload-minus-minutes timestamps', () => {
    const row = rows([block({ source: 'timer' })])[0];
    expect(row.reason).toBe('block-time-unknown');
    expect(lcwoContributionDetails(row, 60)).toContain('unknown actual timestamps');
    expect(rows([block({ date: '2026-09-28' })])[0].additionalSeconds).toBe(60);
  });
  it('excludes class, zero, unrelated trainer, other family and historical estimate blocks', () => {
    for (const entry of [
      block({ context: 'class' }),
      block({ minutes: 0 }),
      block({
        metadata: {
          externalResult: {
            version: 1,
            source: 'user-entered',
            trainer: 'lcwo',
            kind: 'figures',
            speedWpm: 20,
          },
        },
      }),
      block({ metadata: { legacyLcwoRun: { id: 'groups:7:13' } } }),
    ])
      expect(rows([entry])[0].additionalSeconds).toBe(60);
    expect(rows([block({ metadata: { legacyLcwoRun: { id: run.id } } })])[0].reason).toBe(
      'historical-result',
    );
  });
  it('never guesses words, callsigns or Koch duration, or credits a future result', () => {
    for (const sourceType of ['words', 'callsigns', 'koch'] as const) {
      const other = validateLcwoRun({
        ...run,
        sourceType,
        kind: sourceType === 'callsigns' ? 'callsign' : sourceType,
        id: `${sourceType}:7:12`,
        characterWpm: undefined,
        effectiveWpm: undefined,
        accuracyPercent: undefined,
      });
      expect(rows([], { ...data, runs: [other] })[0]).toMatchObject({
        reason: 'duration-unknown',
        additionalSeconds: 0,
      });
    }
    expect(lcwoContributions(data, [], 'UTC', Date.parse('2026-09-29T23:59:59Z'))[0].reason).toBe(
      'future-source',
    );
  });
  it('uses actual manual completion intervals and prevents saving computed totals', () => {
    const metadata = {
      manualTiming: {
        version: 1 as const,
        source: 'user-entered' as const,
        startedAt: '2026-09-29T23:59:00Z',
        completedAt: '2026-09-30T00:01:00Z',
        completedLocal: '2026-09-30T00:01:00',
        timezone: 'UTC',
      },
    };
    expect(rows([block({ metadata })])[0].reason).toBe('logged-block');
    expect(() => validatePracticeSession(estimatedLcwoSessions(rows())[0])).toThrow('read-only');
  });
  it('reports per-trainer meanings, unknown durations, exact source IDs and the explicit assumption', () => {
    const report = weeklyReport(
      [],
      { ...DEFAULT_PROFILE, timezone: 'America/New_York' },
      '2026-09-29',
      '2026-09-29',
      data,
    );
    expect(report).toContain('1 independent-practice minutes');
    expect(report).toContain('1 additional estimated group minutes');
    expect(report).toContain('Stored accuracy (%) — not displayed errors: 0');
    expect(report).toContain('groups:7:12');
    expect(report).toContain('Actual run duration: unknown');
    expect(report).not.toContain('25/18 WPM');
    const portable = {
      version: 1,
      identity: { username: 'Student7', sourceUserId: '7' },
      connected: false,
      ...data,
    };
    expect(
      validateTrainingExport({
        format: 'cwa-training-tracker',
        version: 1,
        exportedAt: '2026-10-01T00:00:00Z',
        sessions: [],
        lcwo: portable,
      }).lcwo,
    ).toEqual(portable);
  });
});
