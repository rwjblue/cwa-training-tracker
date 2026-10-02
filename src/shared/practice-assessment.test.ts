import { createCopyAttempt, defaultCopyRecipe, submitCopyAnswer } from './copy-practice';
import { describe, expect, it } from 'vitest';
import {
  CWT_OBSERVATION_FIELDS,
  PERFORMANCE_RATINGS,
  contactCountDetail,
  practiceAssessmentEvidence,
  supportsOnAirObservations,
  validateAssessedContactCount,
} from './practice-assessment';
import {
  DEFAULT_PROFILE,
  validatePracticeSession,
  validateTrainingExport,
  type PracticeSession,
} from './training';
import { weeklyReport } from './plan';

const base: PracticeSession = {
  id: 'assessment-session',
  date: '2026-10-02',
  kind: 'on-air',
  source: 'manual',
  minutes: 5,
  notes: 'Private practice note',
  createdAt: '2026-10-02T13:00:00Z',
};
const assessment = { version: 1 as const, source: 'self-reported' as const };
const session = (value: unknown) =>
  validatePracticeSession({ ...base, metadata: { assessment: value } });

describe('explicit practice assessments', () => {
  it('keeps explicit assessment outside normalized Copy measurements', () => {
    const started = createCopyAttempt(
      { ...defaultCopyRecipe('groups'), lengthMode: 'count', groupCount: 2 },
      { id: 'assessment-copy', seed: 'synthetic', now: base.createdAt },
    );
    const attempt = submitCopyAnswer(started, started.targets[0], { now: '2026-10-02T13:01:00Z' });
    const value = validatePracticeSession({
      ...base,
      id: 'copy:assessment-copy',
      kind: 'head-copy',
      metadata: { copyAttempt: attempt, assessment: { ...assessment, performanceRating: 'poor' } },
    });
    expect(value.metadata?.copyAttempt).toEqual(attempt);
    expect(value.metadata?.assessment).toEqual({ ...assessment, performanceRating: 'poor' });
    expect(value.accuracy).toBe(100);
  });

  it.each(Object.keys(PERFORMANCE_RATINGS))(
    'retains the explicit %s judgment without deriving it from accuracy or difficulty',
    (rating) => {
      const entry = session({ ...assessment, performanceRating: rating });
      expect(entry.metadata?.assessment?.performanceRating).toBe(rating);
      const legacy = validatePracticeSession({
        ...base,
        accuracy: 100,
        source: 'legacy',
        metadata: {
          legacyAttempt: {
            difficulty: 'easy',
            performanceRating: 'poor',
            cwtResult: { comments: 'Original CWT' },
          },
        },
      });
      expect(legacy.metadata?.assessment).toBeUndefined();
      expect(legacy.metadata?.legacyAttempt).toEqual({
        difficulty: 'easy',
        performanceRating: 'poor',
        cwtResult: { comments: 'Original CWT' },
      });
    },
  );

  it.each([null, 'easy', 'right', 'excellent', 0, true])('rejects non-rating %s', (rating) => {
    expect(() => session({ ...assessment, performanceRating: rating })).toThrow(
      'performance rating',
    );
  });

  it.each(Object.keys(CWT_OBSERVATION_FIELDS))(
    'retains bounded multiline %s exactly and rejects malformed text',
    (key) => {
      const value = ' A\nB '.padEnd(4000, 'x');
      const entry = session({ ...assessment, cwt: { [key]: value } });
      expect(entry.metadata?.assessment?.cwt).toEqual({ [key]: value });
      for (const invalid of [null, 1, [], {}, 'a'.repeat(4001), 'A\0B'])
        expect(() => session({ ...assessment, cwt: { [key]: invalid } })).toThrow('4,000');
    },
  );

  it.each([
    null,
    [],
    {},
    { ...assessment, version: 2, performanceRating: 'good' },
    { ...assessment, source: 'measured', performanceRating: 'good' },
    { ...assessment, sessionId: 'other-account', performanceRating: 'good' },
    { ...assessment, cwt: null },
    { ...assessment, cwt: { qsoCount: 0 } },
    { ...assessment, cwt: { userId: 'other' } },
  ])('rejects invalid assessment envelopes/references %#', (value) => {
    expect(() => session(value)).toThrow();
  });

  it('preserves unknown versus zero and typed provenance across compatible export/import', () => {
    const cwt = {
      heardCallsigns: 'W1SYN',
      heardExchanges: 'SAM 001',
      workedCallsigns: 'K2SYN',
      workedNames: 'KIM',
      comments: 'Report-only comment',
    };
    const unknown = session({ ...assessment, performanceRating: 'fair', cwt });
    const zero = validatePracticeSession({ ...unknown, id: 'zero', qsoCount: 0 });
    const backup = validateTrainingExport({
      format: 'cwa-training-tracker',
      version: 1,
      exportedAt: base.createdAt,
      sessions: [unknown, zero],
    });
    expect(backup.sessions[0]).not.toHaveProperty('qsoCount');
    expect(backup.sessions[1].qsoCount).toBe(0);
    expect(backup.sessions.map((entry) => entry.metadata?.assessment)).toEqual([
      unknown.metadata?.assessment,
      unknown.metadata?.assessment,
    ]);
    expect(practiceAssessmentEvidence(unknown)).toMatchObject({
      sessionId: base.id,
      date: base.date,
      kind: 'on-air',
      source: 'self-reported',
      performanceRating: 'fair',
      cwt,
    });
    expect(practiceAssessmentEvidence(unknown)).not.toHaveProperty('qsoCount');
    const report = weeklyReport(backup.sessions, DEFAULT_PROFILE, base.date, base.date);
    expect(report).toContain('Actual on-air QSO count: unknown (not recorded)');
    expect(report).toContain('0 actual on-air QSOs (self-reported)');
    expect(report).toContain('Performance: Fair (learner judgment)');
    expect(report).toContain('CWT comments for the report: Report-only comment');
    expect(report).toContain('Private practice note');
    expect(practiceAssessmentEvidence(unknown)).not.toHaveProperty('notes');
  });

  it('requires an on-air source, while optional performance remains available for all practice', () => {
    for (const kind of [
      'listening',
      'sending',
      'head-copy',
      'icr',
      'simulator',
      'other',
    ] as const) {
      expect(() =>
        validatePracticeSession({
          ...base,
          kind,
          metadata: { assessment: { ...assessment, cwt: {} } },
        }),
      ).toThrow('on-air practice');
      expect(
        validatePracticeSession({
          ...base,
          kind,
          metadata: { assessment: { ...assessment, performanceRating: 'good' } },
        }).metadata?.assessment?.performanceRating,
      ).toBe('good');
    }
    expect(
      supportsOnAirObservations({
        ...base,
        source: 'timer',
        metadata: { elapsedSeconds: 30, practiceTool: 'external' },
      }),
    ).toBe(true);
    for (const tool of ['qso', 'words', 'stories', 'copy', 'morse-runner', 'audio']) {
      const source = {
        ...base,
        metadata: { practiceTool: tool, assessment: { ...assessment, cwt: {} } },
      };
      expect(() => validatePracticeSession(source)).toThrow('on-air practice');
    }
    expect(() =>
      validatePracticeSession({
        ...base,
        source: 'morse',
        metadata: { assessment: { ...assessment, cwt: {} } },
      }),
    ).toThrow('on-air practice');
  });

  it.each([
    { legacyAttempt: { runnerResult: { source: 'embedded', qsoCount: 5 } } },
    { legacyAttempt: { audioResults: [{ completedPasses: 0 }] } },
    { legacyAttempt: { lcwoResult: { kind: 'letters', errorPercent: 0 } } },
    { legacyLcwoRun: { kind: 'callsign', score: 0 } },
    { legacyTask: { kind: 'audio' } },
    { legacyTask: { kind: 'simulator' } },
    { legacyTask: { kind: 'icr' } },
    { legacyAttempt: { taskId: 'other:word-recognition' } },
    { legacyAttempt: { taskId: 'other:icr' } },
    { legacyTask: { id: 'other:morse-runner' } },
    { legacyAttempt: { taskId: 'word-practice:synthetic' } },
    { legacyAttempt: { taskId: 'qso-practice:synthetic' } },
    { legacyAttempt: { taskId: 'bob-77-words', assignmentId: 'daily-listening' } },
    { historicalTiming: { timing: { recordings: [{ url: 'https://example.test/audio.wav' }] } } },
  ])('keeps archived source facts separate from actual contact claims: %j', (metadata) => {
    const archived = validatePracticeSession({ ...base, source: 'legacy', qsoCount: 5, metadata });
    expect(supportsOnAirObservations(archived)).toBe(false);
    expect(contactCountDetail(archived)).toBe('5 historical count (not actual on-air QSOs)');
    expect(() => validateAssessedContactCount(archived)).not.toThrow();
    const rated = validatePracticeSession({
      ...archived,
      metadata: { ...archived.metadata, assessment: { ...assessment, performanceRating: 'fair' } },
    });
    expect(() => validateAssessedContactCount(rated, archived)).not.toThrow();
    expect(() => validateAssessedContactCount({ ...rated, qsoCount: 6 }, archived)).toThrow();
    expect(() =>
      validatePracticeSession({
        ...archived,
        metadata: { ...archived.metadata, assessment: { ...assessment, cwt: {} } },
      }),
    ).toThrow('on-air practice');
    const backup = validateTrainingExport({
      format: 'cwa-training-tracker',
      version: 1,
      exportedAt: base.createdAt,
      sessions: [rated],
    });
    expect(backup.sessions[0].metadata).toEqual(rated.metadata);
  });

  it('allows genuine archived CWT observations without promoting old ratings or difficulty', () => {
    const metadata = {
      legacyTask: { id: 'other:cwt', kind: 'live' },
      legacyAttempt: {
        taskId: 'other:cwt',
        performanceRating: 'poor',
        difficulty: 'easy',
        cwtResult: { heardCallsigns: 'W1OLD' },
      },
    };
    const archived = validatePracticeSession({ ...base, source: 'legacy', metadata });
    expect(supportsOnAirObservations(archived)).toBe(true);
    expect(archived.metadata?.assessment).toBeUndefined();
    const assessed = validatePracticeSession({
      ...archived,
      metadata: {
        ...metadata,
        assessment: { ...assessment, cwt: { comments: 'New explicit observation' } },
      },
    });
    expect(assessed.metadata?.legacyAttempt).toEqual(metadata.legacyAttempt);
  });

  it('does not turn generated or simulated counts into actual contact credit, and preserves older facts', () => {
    const generated = validatePracticeSession({
      ...base,
      source: 'morse',
      qsoCount: 3,
      metadata: { practiceTool: 'qso' },
    });
    expect(() => validateAssessedContactCount(generated)).not.toThrow();
    const assessed = {
      ...generated,
      metadata: {
        ...generated.metadata,
        assessment: { ...assessment, performanceRating: 'good' as const },
      },
    };
    expect(() => validateAssessedContactCount(assessed)).toThrow('cannot record actual');
    expect(() => validateAssessedContactCount(generated, generated)).not.toThrow();
    expect(() => validateAssessedContactCount({ ...assessed, qsoCount: 4 }, generated)).toThrow();
    expect(contactCountDetail(generated)).toBe('3 historical count (not actual on-air QSOs)');
    const restored = validateTrainingExport({
      format: 'cwa-training-tracker',
      version: 1,
      exportedAt: base.createdAt,
      sessions: [generated],
    });
    expect(restored.sessions[0].qsoCount).toBe(3);
    expect(contactCountDetail({ ...base, kind: 'simulator', qsoCount: 4 })).toBe(
      '4 simulated QSOs',
    );
    expect(contactCountDetail(base)).toBeUndefined();
  });

  it.each([null, -1, 1.5, 100001])(
    'rejects invalid contact count %s in the shared record validator',
    (qsoCount) => {
      expect(() =>
        validatePracticeSession({
          ...base,
          qsoCount,
          metadata: { assessment: { ...assessment, cwt: {} } },
        }),
      ).toThrow('QSO count');
    },
  );
});
