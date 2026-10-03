import { describe, expect, it, vi } from 'vitest';
import {
  createManualTiming,
  manualCompletionCandidates,
  manualPracticeDetails,
  validateExternalPractice,
} from './external-practice';
import { validatePracticeSession, validateTrainingExport, type PracticeSession } from './training';
import { supportsOnAirObservations } from './practice-assessment';
import { classTimestamp } from './class-schedule';
import { practiceSessionEvidenceDetails } from './practice-evidence';

const lcwo = (kind: string, metrics = {}) => ({
  version: 1,
  source: 'user-entered',
  trainer: 'lcwo',
  kind,
  ...metrics,
});
const runner = (metrics = {}) => ({
  version: 1,
  source: 'user-entered',
  trainer: 'morse-runner',
  mode: 'WPX',
  elapsedSeconds: 120,
  ...metrics,
});
const entry = (metadata: Record<string, unknown> = {}): PracticeSession => ({
  id: 'external',
  date: '2026-09-28',
  kind: 'listening',
  source: 'manual',
  minutes: 2,
  notes: 'Synthetic',
  createdAt: '2026-09-29T12:00:00.000Z',
  metadata,
});

describe('source-specific user-entered external facts', () => {
  it('adds user-entered LCWO metrics to an assigned external timer without changing measured time or fabricating timestamps', () => {
    const saved = validatePracticeSession({
      ...entry({
        practiceTool: 'external',
        elapsedSeconds: 120,
        externalResult: lcwo('words', { score: 0 }),
      }),
      source: 'timer',
    });
    expect(saved.minutes).toBe(2);
    expect(saved.metadata?.evidence).toMatchObject({
      type: 'timed',
      measurement: { seconds: 120 },
    });
    const details = practiceSessionEvidenceDetails(saved.metadata).join('\n');
    expect(details).toContain('Measured 120.00 seconds');
    expect(details).toContain('LCWO score: 0');
    expect(() =>
      validatePracticeSession({
        ...saved,
        metadata: {
          ...saved.metadata,
          manualTiming: createManualTiming('2026-09-28T13:00', 'UTC', 120),
        },
      }),
    ).toThrow('cannot replace');
    expect(() =>
      validatePracticeSession({
        ...saved,
        kind: 'simulator',
        metadata: { ...saved.metadata, externalResult: runner() },
      }),
    ).toThrow('Use Log practice');
  });
  it.each(['letters', 'figures', 'custom'])(
    'retains effective speed and explicit zero for %s without an accuracy claim',
    (kind) => {
      const result = validateExternalPractice(
        lcwo(kind, { speedWpm: 200, groupLength: 1000, errorPercent: 0 }),
      );
      expect(result).toEqual(lcwo(kind, { speedWpm: 200, groupLength: 1000, errorPercent: 0 }));
      const saved = validatePracticeSession(entry({ externalResult: result }));
      expect(saved).not.toHaveProperty('accuracy');
      expect(saved).not.toHaveProperty('characterWpm');
      expect(manualPracticeDetails(saved.metadata)).toContain('Actual effective speed (WPM): 200');
    },
  );
  it.each(['letters', 'figures', 'custom', 'words', 'callsign'])(
    'keeps all omitted %s metrics unknown',
    (kind) => {
      const result = validateExternalPractice(lcwo(kind));
      expect(result).toEqual(lcwo(kind));
      expect(manualPracticeDetails({ externalResult: result })).toContain(
        'Actual start and completion: unknown (not recorded).',
      );
      expect(manualPracticeDetails({ externalResult: result }).join('\n')).toContain(
        'unknown (not recorded)',
      );
    },
  );
  it('keeps word score/errors and maximum length separate from group percentages', () => {
    const result = validateExternalPractice(
      lcwo('words', { speedWpm: 37.5, maximumLength: 12, errorCount: 0, score: 0 }),
    );
    expect(result).toEqual(
      lcwo('words', { speedWpm: 37.5, maximumLength: 12, errorCount: 0, score: 0 }),
    );
    expect(manualPracticeDetails({ externalResult: result })).toContain('LCWO score: 0');
  });
  it.each([
    ['letters', { score: 1 }],
    ['figures', { maximumLength: 2 }],
    ['custom', { errorCount: 0 }],
    ['words', { errorPercent: 0 }],
    ['words', { groupLength: 1 }],
    ['callsign', { maximumLength: 2 }],
    ['callsign', { groupLength: 1 }],
    ['callsign', { errorPercent: 0 }],
  ])('rejects unrelated fields for %s', (kind, metrics) =>
    expect(() => validateExternalPractice(lcwo(kind, metrics))).toThrow('does not belong'),
  );
  it.each([
    ['speedWpm', 0],
    ['speedWpm', 201],
    ['speedWpm', NaN],
    ['speedWpm', Infinity],
    ['speedWpm', null],
    ['speedWpm', '20'],
    ['groupLength', 0],
    ['groupLength', 1001],
    ['groupLength', 1.5],
    ['errorPercent', -1],
    ['errorPercent', 101],
    ['errorPercent', null],
  ])('rejects invalid group %s=%s', (key, value) =>
    expect(() => validateExternalPractice(lcwo('letters', { [key]: value }))).toThrow(),
  );
  it.each([
    ['errorCount', -1],
    ['errorCount', 1.5],
    ['errorCount', 1000001],
    ['score', 1e12 + 1],
    ['score', -1],
    ['maximumLength', 1001],
    ['maximumLength', 0],
    ['maximumLength', 1.1],
  ])('rejects invalid word %s=%s', (key, value) =>
    expect(() => validateExternalPractice(lcwo('words', { [key]: value }))).toThrow(),
  );
  it.each([
    { source: 'embedded' },
    { version: 2 },
    { accuracy: 100 },
    { kind: 'unknown' },
    { ownerId: 'other' },
  ])('rejects source/envelope spoofing %j', (extra) =>
    expect(() => validateExternalPractice({ ...lcwo('words'), ...extra })).toThrow(),
  );
  it('retains Runner actual time, points/score/contacts and unknown versus zero independently', () => {
    const result = validateExternalPractice(
      runner({ startingWpm: 200, usedWpms: [200, 25], verifiedPoints: 0, score: 0, contacts: 0 }),
    );
    expect(result).toEqual(
      runner({ startingWpm: 200, usedWpms: [200, 25], verifiedPoints: 0, score: 0, contacts: 0 }),
    );
    const saved = validatePracticeSession({
      ...entry({ externalResult: result }),
      kind: 'simulator',
    });
    expect(saved.source).toBe('manual');
    expect(saved.metadata?.evidence).toBeUndefined();
    expect(saved.qsoCount).toBeUndefined();
    expect(manualPracticeDetails(saved.metadata).join('\n')).toContain(
      'not an acknowledged native engine result',
    );
  });
  it.each([
    { mode: 'Pileup' },
    { startingWpm: 201 },
    { usedWpms: [] },
    { usedWpms: [20, 20] },
    { startingWpm: 20, usedWpms: [25] },
    { usedWpms: [NaN] },
    { usedWpms: new Array(201).fill(20) },
    { verifiedPoints: 1, contacts: 0 },
    { score: 1.5 },
    { verifiedPoints: -1 },
    { contacts: 1e12 + 1 },
    { elapsedSeconds: 86401 },
    { elapsedSeconds: -1 },
    { runId: 'fake' },
    { speedHistory: [] },
  ])('rejects inconsistent or fabricated manual Runner evidence %j', (extra) =>
    expect(() => validateExternalPractice(runner(extra))).toThrow(),
  );
  it.each([
    { characterWpm: 20 },
    { effectiveWpm: 15 },
    { accuracy: 100 },
    { kind: 'on-air' },
    { source: 'timer' },
  ])('rejects manual external contradictions %j', (extra) =>
    expect(() =>
      validatePracticeSession({ ...entry({ externalResult: lcwo('words') }), ...extra }),
    ).toThrow(),
  );
  it('cannot add a manual envelope to native timer/Copy measurements and cannot label external contacts on air', () => {
    expect(() =>
      validatePracticeSession(entry({ externalResult: lcwo('words'), elapsedSeconds: 120 })),
    ).toThrow('cannot replace');
    expect(
      supportsOnAirObservations({
        ...entry({ externalResult: validateExternalPractice(lcwo('words')) }),
        kind: 'on-air',
      }),
    ).toBe(false);
    expect(() =>
      validatePracticeSession({ ...entry({ externalResult: runner() }), kind: 'listening' }),
    ).toThrow('simulator');
    expect(() =>
      validatePracticeSession({
        ...entry({ externalResult: runner({ elapsedSeconds: 119 }) }),
        kind: 'simulator',
      }),
    ).toThrow('actual run duration');
  });
});

describe('actual completion in captured civil time', () => {
  it('derives actual start/date across midnight; creation/review time remains separate', () => {
    const timing = createManualTiming('2026-09-29T00:01:30', 'America/New_York', 120);
    expect(timing.startedAt).toBe('2026-09-29T03:59:30.000Z');
    const saved = validatePracticeSession(
      entry({
        manualTiming: timing,
        externalResult: lcwo('callsign', { score: 0, errorCount: 0 }),
      }),
    );
    expect(saved.date).toBe('2026-09-28');
    expect(saved.createdAt).toBe('2026-09-29T12:00:00.000Z');
    const exported = {
      format: 'cwa-training-tracker',
      version: 1,
      exportedAt: saved.createdAt,
      sessions: [saved],
    };
    expect(validateTrainingExport(exported).sessions).toEqual([saved]);
  });
  it('requires an explicit repeated-hour choice without changing class earlier-fold behavior', () => {
    expect(() => createManualTiming('2025-11-02T01:30', 'America/New_York', 120)).toThrow(
      'occurs twice',
    );
    expect(createManualTiming('2025-11-02T01:30', 'America/New_York', 120, 0).completedAt).toBe(
      '2025-11-02T05:30:00.000Z',
    );
    expect(createManualTiming('2025-11-02T01:30', 'America/New_York', 120, 1).completedAt).toBe(
      '2025-11-02T06:30:00.000Z',
    );
    expect(classTimestamp('2025-11-02', '01:30', 'America/New_York')).toBe(
      '2025-11-02T05:30:00.000Z',
    );
  });
  it('handles spring gaps, half-hour folds and literal years below 100', () => {
    expect(() => createManualTiming('2025-03-09T02:30', 'America/New_York', 120)).toThrow(
      'does not exist',
    );
    const candidates = manualCompletionCandidates('2025-04-06T01:45', 'Australia/Lord_Howe');
    expect(candidates).toHaveLength(2);
    expect(candidates[1] - candidates[0]).toBe(1800000);
    expect(createManualTiming('0099-01-02T00:01', 'UTC', 60).startedAt).toBe(
      '0099-01-02T00:00:00.000Z',
    );
  });
  it.each([
    '2026-02-30T01:00',
    '2026-09-28T24:00',
    '2026-09-28T01:60',
    '2026-09-28T01:00Z',
    'not a date',
  ])('rejects invalid local %s', (local) =>
    expect(() => createManualTiming(local, 'UTC', 60)).toThrow(),
  );
  it.each(['Invalid/Zone', '+05:00', ''])('rejects invalid IANA zone %s', (zone) =>
    expect(() => createManualTiming('2026-09-28T01:00', zone, 60)).toThrow(),
  );
  it('rejects future completion and a fabricated occurrence outside a repeated hour', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-29T12:00:00Z'));
    try {
      expect(() => createManualTiming('2026-09-29T12:01', 'UTC', 120)).toThrow('no later than now');
    } finally {
      vi.restoreAllMocks();
    }
    expect(() => createManualTiming('2026-09-28T01:00', 'UTC', 60, 1)).toThrow(
      'only for a repeated',
    );
  });
  it.each([{ minutes: 3 }, { date: '2026-09-29' }, { source: 'legacy' }])(
    'rejects contradictory timestamp placement %j',
    (extra) => {
      const timing = createManualTiming('2026-09-29T00:01:30', 'America/New_York', 120);
      expect(() =>
        validatePracticeSession({ ...entry({ manualTiming: timing }), ...extra }),
      ).toThrow();
    },
  );
  it.each([
    { startedAt: '2026-09-29T03:59:31.000Z' },
    { completedAt: '2026-09-29T04:01:31.000Z' },
    { source: 'engine' },
    { occurrence: 0 },
    { ownerId: 'other' },
  ])('rejects spoofed timestamp envelope %j', (extra) => {
    const timing = createManualTiming('2026-09-29T00:01:30', 'America/New_York', 120);
    expect(() =>
      validatePracticeSession(entry({ manualTiming: { ...timing, ...extra } })),
    ).toThrow();
  });
  it('keeps old date-only records compatible without inventing timestamps', () => {
    const saved = validatePracticeSession(entry());
    expect(saved.metadata?.manualTiming).toBeUndefined();
    expect(
      validateTrainingExport({
        format: 'cwa-training-tracker',
        version: 1,
        exportedAt: saved.createdAt,
        sessions: [saved],
      }).sessions[0],
    ).toEqual(saved);
  });
});
