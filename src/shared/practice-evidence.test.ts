import { describe, expect, it } from 'vitest';
import {
  evidenceTime,
  practiceSessionEvidenceDetails,
  sessionEvidence,
  validatePracticeEvidence,
} from './practice-evidence';
import { validatePracticeSession, validateTrainingExport } from './training';
import { RUNNER_REVISION } from './runner';

const timed = () => ({
  version: 1,
  type: 'timed',
  measurement: { seconds: 90.25, recallSeconds: 10 },
  recordings: [
    { url: 'https://cwa.cwops.org/wp-content/uploads/ING7_18.mp3', speedWpm: 18, seconds: 80.25 },
  ],
});
const runner = () => ({
  version: 1,
  type: 'runner',
  run: {
    runId: 'run-1',
    revision: RUNNER_REVISION,
    status: 'stopped',
    elapsedSeconds: 30.25,
    runStartedAt: '2026-09-30T12:00:00.000Z',
    runEndedAt: '2026-09-30T12:00:31.000Z',
    settings: {
      mode: 'SingleCall',
      wpm: 20,
      durationSeconds: 60,
      activity: 1,
      conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
    },
    speedHistory: [{ elapsedSeconds: 0, wpm: 20 }],
    summary: { qsoCount: 0, verifiedPoints: 0, score: 0, nrErrors: 0, nilErrors: 0 },
  },
});
const session = (evidence: unknown) => ({
  id: 'entry-1',
  date: '2026-09-30',
  kind: 'listening',
  minutes: 900,
  characterWpm: 100,
  effectiveWpm: 90,
  accuracy: 99,
  qsoCount: 500,
  notes: 'Synthetic',
  createdAt: '2026-09-30T12:00:00.000Z',
  metadata: { evidence },
});

describe('non-copy native evidence', () => {
  it.each([NaN, Infinity, -1, 86401])('rejects invalid native time %s', (seconds) => {
    expect(() => validatePracticeEvidence({ ...timed(), measurement: { seconds } })).toThrow(
      /practice seconds/,
    );
  });
  it('rejects recall beyond total and recording time counted twice', () => {
    expect(() =>
      validatePracticeEvidence({ ...timed(), measurement: { seconds: 9, recallSeconds: 10 } }),
    ).toThrow(/Recall/);
    expect(() =>
      validatePracticeEvidence({ ...timed(), measurement: { seconds: 90, recallSeconds: 20 } }),
    ).toThrow(/Recording and recall/);
  });
  it('validates exact source timing while preserving file labels and fractional time', () => {
    const result = validatePracticeSession(session(timed()));
    expect(result).toMatchObject({ minutes: 90.25 / 60, characterWpm: 25, effectiveWpm: 18 });
    expect(result.metadata?.evidence).toMatchObject({
      recordings: [{ speedWpm: 18, characterWpm: 25, effectiveWpm: 18, seconds: 80.25 }],
    });
    expect(() =>
      validatePracticeEvidence({
        ...timed(),
        recordings: [{ ...timed().recordings[0], speedWpm: 22 }],
      }),
    ).toThrow(/catalog/);
  });
  it('does not invent character timing for an unknown recording or mixed speed', () => {
    const result = validatePracticeSession(
      session({
        ...timed(),
        recordings: [{ url: 'https://example.test/audio.wav', seconds: 1, speedWpm: 20 }],
      }),
    );
    expect(result.characterWpm).toBeUndefined();
    expect(result.effectiveWpm).toBeUndefined();
  });
  it('records declared corrections alongside unchanged raw measurements and round trips them', () => {
    const raw = timed();
    const corrected = validatePracticeSession(
      session({
        ...raw,
        correction: { seconds: 95, recallSeconds: 14, reason: 'Corrected recall estimate' },
      }),
    );
    expect(corrected.minutes).toBe(95 / 60);
    expect(corrected.metadata?.evidence).toMatchObject({
      measurement: raw.measurement,
      correction: { seconds: 95, recallSeconds: 14 },
    });
    const backup = validateTrainingExport({
      format: 'cwa-training-tracker',
      version: 1,
      exportedAt: '2026-09-30T12:00:00Z',
      sessions: [corrected],
    });
    expect(backup.sessions[0]).toEqual(corrected);
  });
  it.each([
    { seconds: 20, recallSeconds: 21, reason: 'Correction' },
    { seconds: 85, recallSeconds: 10, reason: 'Correction' },
    { seconds: 100, reason: '' },
    { recallSeconds: Infinity, reason: 'Correction' },
  ])('rejects inconsistent or unmarked corrections %j', (correction) => {
    expect(() => validatePracticeEvidence({ ...timed(), correction })).toThrow();
  });
  it('allows timer duration correction without requiring equality with the raw timer', () => {
    const result = validatePracticeEvidence({
      ...timed(),
      recordings: [],
      correction: { seconds: 20, recallSeconds: 0, reason: 'Timer left running' },
    });
    if (result.type !== 'timed') throw new Error('Expected timer');
    expect(evidenceTime(result)).toEqual({ seconds: 20, recallSeconds: 0 });
    expect(result.measurement.seconds).toBe(90.25);
  });
  it.each(['javascript:alert(1)', 'https://user:password@example.test/a'])(
    'rejects unsafe source %s',
    (url) => {
      expect(() =>
        validatePracticeEvidence({ ...timed(), recordings: [{ url, seconds: 1 }] }),
      ).toThrow(/Recording URL/);
    },
  );
  it('preserves zero contacts and derives Runner fields instead of generic form values', () => {
    const result = validatePracticeSession(session(runner()));
    expect(result).toMatchObject({
      kind: 'simulator',
      source: 'timer',
      minutes: 30.25 / 60,
      characterWpm: 20,
      qsoCount: 0,
    });
    expect(result.effectiveWpm).toBeUndefined();
    expect(result.accuracy).toBeUndefined();
    const raw = runner();
    delete (raw.run as Partial<typeof raw.run>).summary;
    expect(validatePracticeSession(session(raw)).qsoCount).toBeUndefined();
  });
  it('does not display starting speed as a single measured speed after a change', () => {
    const raw = runner();
    raw.run.speedHistory.push({ elapsedSeconds: 12, wpm: 25 });
    expect(validatePracticeSession(session(raw)).characterWpm).toBeUndefined();
  });
  it.each([
    { elapsedSeconds: 61 },
    { elapsedSeconds: NaN },
    { status: 'running' },
    { status: 'completed' },
    { runId: '../bad' },
    { runEndedAt: '2026-09-30T11:59:59.000Z' },
    { runEndedAt: '2026-09-30T12:00:01.000Z' },
    { summary: { qsoCount: 0, verifiedPoints: 1, score: 1, nrErrors: 0, nilErrors: 0 } },
    { summary: { qsoCount: 0, verifiedPoints: 0, score: 1, nrErrors: 0, nilErrors: 0 } },
    { summary: { qsoCount: 2, verifiedPoints: 2, score: 3, nrErrors: 0, nilErrors: 0 } },
    { speedHistory: [{ elapsedSeconds: 0, wpm: 30 }] },
    {
      speedHistory: [
        { elapsedSeconds: 0, wpm: 20 },
        { elapsedSeconds: 31, wpm: 25 },
      ],
    },
    {
      speedHistory: [
        { elapsedSeconds: 0, wpm: 20 },
        { elapsedSeconds: 20, wpm: 25 },
        { elapsedSeconds: 19, wpm: 22 },
      ],
    },
  ])('rejects inconsistent Runner measurements %j', (change) => {
    expect(() =>
      validatePracticeEvidence({ ...runner(), run: { ...runner().run, ...change } }),
    ).toThrow(/Runner/);
  });
  it('normalizes prior native fields deterministically and rejects contradictory envelopes', () => {
    const metadata = { elapsedSeconds: 30.25, runner: runner().run };
    const evidence = sessionEvidence(metadata)!;
    expect(sessionEvidence({ ...metadata, evidence })).toEqual(evidence);
    expect(() => sessionEvidence({ ...metadata, evidence, elapsedSeconds: 31 })).toThrow(
      /disagree/,
    );
    expect(() => sessionEvidence({ copyAttempt: {}, evidence })).toThrow(/combine/);
  });
  it('retains valid historical archive semantics without reclassifying recall-inclusive audio as native', () => {
    const legacy = {
      ...session(undefined),
      source: 'legacy',
      minutes: 570 / 60,
      metadata: {
        legacyAttempt: {
          activeSeconds: 570,
          recallSeconds: 30,
          audioResults: [{ activeSeconds: 570 }],
        },
      },
    };
    expect(validatePracticeSession(legacy)).toEqual(legacy);
  });
  it('preserves the declared evidence export version and rejects unsupported versions', () => {
    const backup = {
      format: 'cwa-training-tracker',
      version: 1,
      exportedAt: '2026-09-30T12:00:00Z',
      sessions: [],
    };
    expect(validateTrainingExport(backup).evidenceVersion).toBeUndefined();
    expect(validateTrainingExport({ ...backup, evidenceVersion: 1 }).evidenceVersion).toBe(1);
    expect(() => validateTrainingExport({ ...backup, evidenceVersion: 2 })).toThrow(
      /evidence export version/,
    );
  });
  it('retains old duration edits at historical boundaries without changing new measured writes', () => {
    const old = {
      ...session(undefined),
      minutes: 1,
      metadata: { elapsedSeconds: 120, recallSeconds: 0 },
    };
    expect(validatePracticeSession(old).minutes).toBe(2);
    const historical = validatePracticeSession(old, { preserveHistoricalDuration: true });
    expect(historical.minutes).toBe(1);
    expect(historical.metadata?.evidence).toMatchObject({
      measurement: { seconds: 120, recallSeconds: 0 },
      correction: { seconds: 60, reason: expect.stringContaining('Historical duration edit') },
    });
    expect(validatePracticeSession(historical)).toEqual(historical);
  });
  it('archives contradictory old recording totals without inventing recall or native correction evidence', () => {
    const old = {
      ...session(undefined),
      minutes: 0.5,
      metadata: {
        elapsedSeconds: 120,
        recallSeconds: 10,
        recordings: [{ url: 'https://example.test/source.wav', seconds: 60 }],
      },
    };
    const historical = validatePracticeSession(old, { preserveHistoricalDuration: true });
    expect(historical.minutes).toBe(0.5);
    expect(historical.metadata?.evidence).toBeUndefined();
    expect(historical.metadata?.historicalTiming).toMatchObject({
      savedSeconds: 30,
      timing: old.metadata,
    });
    expect(sessionEvidence(historical.metadata)).toBeUndefined();
    expect(practiceSessionEvidenceDetails(historical.metadata).join(' ')).toContain(
      'Original timer: 120.00 seconds, including 10.00 recall seconds',
    );
    expect(validatePracticeSession(historical)).toEqual(historical);
  });
  it('keeps normalization bounded and old near-limit metadata portable without dropping facts', () => {
    const old = {
      ...session(undefined),
      minutes: 1,
      metadata: { elapsedSeconds: 120, note: 'x'.repeat(199960) },
    };
    expect(JSON.stringify(old.metadata).length).toBeLessThanOrEqual(200000);
    expect(() => validatePracticeSession(old)).toThrow(/Normalized session metadata/);
    const historical = validatePracticeSession(old, { preserveHistoricalDuration: true });
    expect(historical).toMatchObject({
      minutes: 1,
      evidenceMode: 'historical',
      metadata: old.metadata,
    });
    expect(historical.metadata?.evidence).toBeUndefined();
    expect(validatePracticeSession(historical)).toEqual(historical);
    expect(
      validateTrainingExport({
        format: 'cwa-training-tracker',
        version: 1,
        evidenceVersion: 1,
        exportedAt: old.createdAt,
        sessions: [historical],
      }).sessions[0],
    ).toEqual(historical);
    expect(() =>
      validatePracticeSession({ ...historical, metadata: { evidence: timed() } }),
    ).toThrow(/Historical accounting/);
  });
});
