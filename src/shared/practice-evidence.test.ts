import { describe, expect, it } from 'vitest';
import {
  evidenceTime,
  practiceSessionEvidenceDetails,
  sessionEvidence,
  validatePracticeEvidence,
  validateRecordingEvidence,
  recordingCompletedPasses,
  recordingPassTolerance,
  type RecordingPassEvidence,
} from './practice-evidence';
import { validatePracticeSession, validateTrainingExport } from './training';
import { RUNNER_REVISION } from './runner';
import type { GeneratedListeningEvidence } from './generated-listening';

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

const generated = (): GeneratedListeningEvidence => ({
  version: 1,
  overflow: false,
  summaries: [
    {
      mode: 'words',
      listId: 'custom',
      customLabel: 'Your word list',
      entryCount: 2,
      characterWpm: 20,
      effectiveWpm: 10,
      toneHz: 600,
      wordGapSeconds: 1,
      shuffle: false,
      repeat: true,
      spokenAnswers: false,
    },
    {
      mode: 'qso',
      scenarioId: 'pota',
      stations: ['W1DPN', 'K2MVR'],
      tonesHz: [600, 650],
      characterWpm: 25,
      effectiveWpm: 15,
      transmissionGapSeconds: 2,
    },
  ],
});

describe('non-copy native evidence', () => {
  it.each([
    { duration: 4, minimum: 3.8 },
    { duration: 0.05, minimum: 0.0475 },
    { duration: 100, minimum: 99 },
  ])(
    'validates only actual heard seconds against the $duration-second native pass floor',
    ({ duration, minimum }) => {
      expect(recordingPassTolerance(duration)).toBeCloseTo(duration - minimum, 8);
      const measurement = {
        url: 'https://example.org/native-pass.mp3',
        seconds: minimum,
        passes: {
          version: 1,
          method: 'native-1x',
          durations: [{ durationSeconds: duration, completedPasses: 1 }],
        },
      };
      expect(validateRecordingEvidence(measurement).seconds).toBe(minimum);
      expect(() => validateRecordingEvidence({ ...measurement, seconds: minimum - 0.002 })).toThrow(
        /exceed/,
      );
    },
  );

  it.each([
    { seconds: 0, duration: 1e-20, count: Number.MAX_SAFE_INTEGER },
    { seconds: 1e-10, duration: 1e-20, count: Number.MAX_SAFE_INTEGER },
    { seconds: Number.MIN_VALUE, duration: Number.MIN_VALUE * 2, count: 1 },
    { seconds: Number.MIN_VALUE, duration: Number.MIN_VALUE, count: 2 },
  ])(
    'rejects positive passes without their actual positive hearing: $seconds / $duration',
    (row) => {
      expect(() =>
        validateRecordingEvidence({
          url: 'https://example.test/tiny.wav',
          seconds: row.seconds,
          passes: {
            version: 1,
            method: 'native-1x',
            durations: [{ durationSeconds: row.duration, completedPasses: row.count }],
          },
        }),
      ).toThrow(/passes exceed/);
    },
  );

  it('accepts positive subnormal hearing and ordinary fractional roundoff without free time', () => {
    for (const [duration, seconds] of [
      [Number.MIN_VALUE, Number.MIN_VALUE],
      [2, 2.3 - 0.4],
    ]) {
      const result = validateRecordingEvidence({
        url: 'https://example.test/fractional.wav',
        seconds,
        passes: {
          version: 1,
          method: 'native-1x',
          durations: [{ durationSeconds: duration, completedPasses: 1 }],
        },
      });
      expect(recordingCompletedPasses(result)).toBe(1);
      expect(result.seconds).toBe(seconds);
    }
  });

  it.each([1, 0.99999])(
    'requires available listening outside %s recall seconds for completed passes',
    (recallSeconds) => {
      expect(() =>
        validatePracticeEvidence({
          ...timed(),
          measurement: { seconds: 1, recallSeconds },
          recordings: [
            {
              url: 'https://example.test/tiny.wav',
              seconds: 0.0001,
              passes: {
                version: 1,
                method: 'native-1x',
                durations: [{ durationSeconds: 1e-20, completedPasses: Number.MAX_SAFE_INTEGER }],
              },
            },
          ],
        }),
      ).toThrow(/Recording and recall/);
    },
  );

  it('cannot correct a pass-bearing source into an all-recall total', () => {
    expect(() =>
      validatePracticeEvidence({
        ...timed(),
        measurement: { seconds: 1, recallSeconds: 0 },
        recordings: [
          {
            url: 'https://example.test/tiny.wav',
            seconds: 0.0001,
            passes: {
              version: 1,
              method: 'native-1x',
              durations: [{ durationSeconds: 1e-20, completedPasses: Number.MAX_SAFE_INTEGER }],
            },
          },
        ],
        correction: { seconds: 1, recallSeconds: 1, reason: 'Invalid recall correction' },
      }),
    ).toThrow(/Corrected total must include/);
  });

  it('retains short actual listening beside long recall despite subtraction roundoff', () => {
    const raw = {
      ...timed(),
      measurement: { seconds: 84000 + 0.001, recallSeconds: 84000 },
      recordings: [
        {
          url: 'https://example.test/short.wav',
          seconds: 0.001,
          passes: {
            version: 1,
            method: 'native-1x',
            durations: [{ durationSeconds: 0.001, completedPasses: 1 }],
          },
        },
      ],
    };
    expect(validatePracticeEvidence(raw)).toMatchObject({ recordings: raw.recordings });
    expect(
      validatePracticeEvidence({
        ...raw,
        correction: { seconds: 84000 + 0.001, recallSeconds: 84000, reason: 'Exact measured time' },
      }),
    ).toMatchObject({ recordings: raw.recordings });
  });

  it('preserves older omitted and measured-zero pass backups with their existing timing tolerance', () => {
    const recording = { url: 'https://example.test/old.wav', seconds: 0.0001 };
    const entries = [
      undefined,
      {
        version: 1,
        method: 'native-1x',
        durations: [{ durationSeconds: 1e-20, completedPasses: 0 }],
      },
    ].map((passes, index) =>
      validatePracticeSession({
        ...session({
          ...timed(),
          measurement: { seconds: 1, recallSeconds: 1 },
          recordings: [{ ...recording, ...(passes ? { passes } : {}) }],
        }),
        id: `old-tolerance-${index}`,
      }),
    );
    const backup = validateTrainingExport({
      format: 'cwa-training-tracker',
      version: 1,
      exportedAt: entries[0].createdAt,
      sessions: entries,
    });
    expect(validateTrainingExport(JSON.parse(JSON.stringify(backup)))).toEqual(backup);
    const evidence = sessionEvidence(backup.sessions[0].metadata)!;
    if (evidence.type !== 'timed') throw new Error('Expected timed evidence');
    expect(recordingCompletedPasses(evidence.recordings[0])).toBeUndefined();
  });

  it.each([
    { label: 'unmeasured', passes: undefined },
    {
      label: 'measured zero',
      passes: {
        version: 1,
        method: 'native-1x',
        durations: [{ durationSeconds: 1, completedPasses: 0 }],
      },
    },
  ])('preserves older $label corrected timing at the floating-point boundary', ({ passes }) => {
    const rawSeconds = 5 + 0.001;
    const recording = {
      url: 'https://example.test/old.wav',
      seconds: rawSeconds - 5,
      ...(passes ? { passes } : {}),
    };
    // This exact source value was accepted by the original addition comparison.
    expect(recording.seconds).toBeGreaterThan(0.001);
    const correction = { seconds: 5, recallSeconds: 5, reason: 'Historical correction' };
    const corrected = validatePracticeSession(
      session({
        ...timed(),
        measurement: { seconds: rawSeconds, recallSeconds: 5 },
        recordings: [recording],
        correction,
      }),
    );
    expect(corrected.minutes).toBe(5 / 60);
    expect(corrected.metadata?.evidence).toMatchObject({
      measurement: { seconds: rawSeconds, recallSeconds: 5 },
      recordings: [recording],
      correction,
    });
    const evidence = sessionEvidence(corrected.metadata)!;
    if (evidence.type !== 'timed') throw new Error('Expected timed evidence.');
    expect(recordingCompletedPasses(evidence.recordings[0])).toBe(passes ? 0 : undefined);
    const backup = validateTrainingExport({
      format: 'cwa-training-tracker',
      version: 1,
      exportedAt: corrected.createdAt,
      sessions: [corrected],
    });
    expect(validateTrainingExport(JSON.parse(JSON.stringify(backup)))).toEqual(backup);
  });

  it('retains changed-duration native pass groups through aliases, correction and old v1 backup', () => {
    const passes: RecordingPassEvidence = {
      version: 1,
      method: 'native-1x',
      durations: [
        { durationSeconds: 10, completedPasses: 2 },
        { durationSeconds: 12, completedPasses: 1 },
      ],
    };
    const raw = { ...timed(), recordings: [{ ...timed().recordings[0], passes }] };
    const metadata = {
      elapsedSeconds: raw.measurement.seconds,
      recallSeconds: raw.measurement.recallSeconds,
      recordings: raw.recordings,
      evidence: raw,
    };
    const result = sessionEvidence(metadata)!;
    expect(result).toMatchObject({ recordings: [{ passes }] });
    expect(recordingCompletedPasses(raw.recordings[0])).toBe(3);
    expect(recordingCompletedPasses({})).toBeUndefined();
    const corrected = validatePracticeSession({
      ...session(raw),
      metadata: {
        ...metadata,
        evidence: { ...raw, correction: { recallSeconds: 0, reason: 'Recall estimate corrected' } },
      },
    });
    expect(corrected.minutes).toBe(raw.measurement.seconds / 60);
    expect(corrected.metadata?.evidence).toMatchObject({ recordings: [{ passes }] });
    const backup = validateTrainingExport({
      format: 'cwa-training-tracker',
      version: 1,
      exportedAt: corrected.createdAt,
      sessions: [corrected, { ...validatePracticeSession(session(timed())), id: 'old-unmeasured' }],
    });
    const roundTrip = validateTrainingExport(JSON.parse(JSON.stringify(backup)));
    expect(roundTrip).toEqual(backup);
    const details = practiceSessionEvidenceDetails(roundTrip.sessions[0].metadata).join('\n');
    expect(details).toContain(
      '3 completed passes (native 1x; 2 × 10.00s observed duration; 1 × 12.00s observed duration)',
    );
    expect(details).toContain(raw.recordings[0].url);
    expect(practiceSessionEvidenceDetails(roundTrip.sessions[1].metadata).join('\n')).toContain(
      'passes unmeasured',
    );
    expect(() => sessionEvidence({ ...metadata, recordings: timed().recordings })).toThrow(
      /disagree/,
    );
    passes.durations[0].completedPasses = 9;
    expect(result).toMatchObject({
      recordings: [{ passes: { durations: [{ completedPasses: 2 }, { completedPasses: 1 }] } }],
    });
  });
  it('distinguishes zero observed passes from unmeasured recordings and permits repeated short files', () => {
    const measured = validateRecordingEvidence({
      ...timed().recordings[0],
      seconds: 2,
      passes: {
        version: 1,
        method: 'native-1x',
        durations: [{ durationSeconds: 10, completedPasses: 0 }],
      },
    });
    expect(recordingCompletedPasses(measured)).toBe(0);
    expect(
      practiceSessionEvidenceDetails({ elapsedSeconds: 2, recordings: [measured] }).join('\n'),
    ).toContain('0 completed passes');
    const repeats = validateRecordingEvidence({
      ...timed().recordings[0],
      seconds: 200,
      passes: {
        version: 1,
        method: 'native-1x',
        durations: [{ durationSeconds: 1, completedPasses: 200 }],
      },
    });
    expect(recordingCompletedPasses(repeats)).toBe(200);
    expect(recordingPassTolerance(0.5)).toBe(0.025);
    expect(recordingPassTolerance(200)).toBe(1);
  });
  it.each([
    { version: 2, method: 'native-1x', durations: [{ durationSeconds: 10, completedPasses: 1 }] },
    { version: 1, method: 'timer', durations: [{ durationSeconds: 10, completedPasses: 1 }] },
    { version: 1, method: 'native-1x', durations: [] },
    { version: 1, method: 'native-1x', durations: [{ durationSeconds: 0, completedPasses: 1 }] },
    { version: 1, method: 'native-1x', durations: [{ durationSeconds: -1, completedPasses: 1 }] },
    { version: 1, method: 'native-1x', durations: [{ durationSeconds: NaN, completedPasses: 1 }] },
    {
      version: 1,
      method: 'native-1x',
      durations: [{ durationSeconds: Infinity, completedPasses: 1 }],
    },
    {
      version: 1,
      method: 'native-1x',
      durations: [{ durationSeconds: 86401, completedPasses: 0 }],
    },
    { version: 1, method: 'native-1x', durations: [{ durationSeconds: 10, completedPasses: -1 }] },
    { version: 1, method: 'native-1x', durations: [{ durationSeconds: 10, completedPasses: 1.5 }] },
    { version: 1, method: 'native-1x', durations: [{ durationSeconds: 10, completedPasses: NaN }] },
    {
      version: 1,
      method: 'native-1x',
      durations: [{ durationSeconds: 10, completedPasses: Infinity }],
    },
    {
      version: 1,
      method: 'native-1x',
      durations: [{ durationSeconds: 10, completedPasses: Number.MAX_SAFE_INTEGER + 1 }],
    },
    {
      version: 1,
      method: 'native-1x',
      durations: [{ durationSeconds: 10, completedPasses: 0, privateText: 'unsupported' }],
    },
    {
      version: 1,
      method: 'native-1x',
      durations: [{ durationSeconds: 10, completedPasses: 0 }],
      coverage: [[0, 10]],
    },
    {
      version: 1,
      method: 'native-1x',
      durations: [
        { durationSeconds: 10, completedPasses: 0 },
        { durationSeconds: 10, completedPasses: 0 },
      ],
    },
    {
      version: 1,
      method: 'native-1x',
      durations: Array.from({ length: 101 }, (_, index) => ({
        durationSeconds: index + 1,
        completedPasses: 0,
      })),
    },
    { version: 1, method: 'native-1x', durations: [{ durationSeconds: 20, completedPasses: 5 }] },
    {
      version: 1,
      method: 'native-1x',
      durations: [
        { durationSeconds: Number.MIN_VALUE, completedPasses: Number.MAX_SAFE_INTEGER },
        { durationSeconds: Number.MIN_VALUE * 2, completedPasses: 1 },
      ],
    },
  ])('rejects malformed or impossible recording pass evidence %j', (passes) => {
    expect(() => validateRecordingEvidence({ ...timed().recordings[0], passes })).toThrow();
  });
  it('preserves bounded played configurations through canonical aliases, correction and v1 backup', () => {
    const raw = {
      version: 1,
      type: 'timed',
      measurement: { seconds: 120, recallSeconds: 5 },
      recordings: [],
      generatedListening: generated(),
    };
    const metadata = { elapsedSeconds: 120, recallSeconds: 5, recordings: [], evidence: raw };
    expect(sessionEvidence(metadata)).toEqual(raw);
    const corrected = validatePracticeSession({
      ...session(raw),
      metadata: {
        ...metadata,
        evidence: { ...raw, correction: { seconds: 125, reason: 'Extra recall' } },
      },
    });
    expect(corrected.minutes).toBe(125 / 60);
    expect(corrected.metadata?.evidence).toMatchObject({
      measurement: raw.measurement,
      generatedListening: generated(),
    });
    const details = practiceSessionEvidenceDetails(corrected.metadata).join('\n');
    expect(details).toContain('Played Your word list: 2 entries');
    expect(details).toContain('Played A POTA contact: W1DPN / K2MVR');
    expect(details).toContain('Learner correction: 125.00 total seconds');
    const backup = validateTrainingExport({
      format: 'cwa-training-tracker',
      version: 1,
      evidenceVersion: 1,
      exportedAt: corrected.createdAt,
      sessions: [corrected],
    });
    expect(validateTrainingExport(JSON.parse(JSON.stringify(backup)))).toEqual(backup);
  });
  it('rejects generated configuration payloads outside timed raw evidence and private fields inside it', () => {
    expect(() =>
      validatePracticeEvidence({ ...runner(), generatedListening: generated() }),
    ).toThrow(/unsupported field/);
    expect(() =>
      sessionEvidence({
        copyAttempt: {},
        evidence: {
          version: 1,
          type: 'timed',
          measurement: { seconds: 60 },
          recordings: [],
          generatedListening: generated(),
        },
      }),
    ).toThrow(/combine/);
    expect(() =>
      validatePracticeEvidence({
        version: 1,
        type: 'timed',
        measurement: { seconds: 60 },
        recordings: [],
        generatedListening: {
          ...generated(),
          summaries: [{ ...generated().summaries[0], text: 'PRIVATE LIST' }],
        },
      }),
    ).toThrow(/unsupported field/);
  });
  it('retains old native and legacy final selections without inventing played configurations', () => {
    expect(validatePracticeEvidence(timed())).not.toHaveProperty('generatedListening');
    const old = {
      ...session(undefined),
      metadata: {
        elapsedSeconds: 60,
        wordList: 'common-30',
        qsoScenario: 'short-contact',
      },
    };
    expect(sessionEvidence(validatePracticeSession(old).metadata)).not.toHaveProperty(
      'generatedListening',
    );
    expect(validatePracticeSession(old).metadata).toMatchObject({
      wordList: 'common-30',
      qsoScenario: 'short-contact',
    });
  });
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
    { measuredRecall: 10, correctedRecall: 0 },
    { measuredRecall: 10, correctedRecall: 4.25 },
    { measuredRecall: undefined, correctedRecall: 4.25 },
  ])(
    'corrects only the recall split without increasing the total %j',
    ({ measuredRecall, correctedRecall }) => {
      const raw = {
        ...timed(),
        measurement: {
          seconds: 90.25,
          ...(measuredRecall !== undefined ? { recallSeconds: measuredRecall } : {}),
        },
      };
      const correction = { recallSeconds: correctedRecall, reason: 'Corrected interrupted recall' };
      const corrected = validatePracticeSession({
        ...session(raw),
        metadata: {
          elapsedSeconds: raw.measurement.seconds,
          ...(measuredRecall !== undefined ? { recallSeconds: measuredRecall } : {}),
          recordings: raw.recordings,
          evidence: { ...raw, correction },
        },
      });
      expect(corrected.minutes).toBe(raw.measurement.seconds / 60);
      expect(corrected.metadata?.elapsedSeconds).toBe(raw.measurement.seconds);
      expect(corrected.metadata?.recallSeconds).toBe(measuredRecall);
      expect(corrected.metadata?.evidence).toMatchObject({
        measurement: raw.measurement,
        recordings: raw.recordings,
        correction,
      });
      const evidence = sessionEvidence(corrected.metadata);
      if (evidence?.type !== 'timed') throw new Error('Expected timer');
      expect(evidenceTime(evidence)).toEqual({
        seconds: raw.measurement.seconds,
        recallSeconds: correctedRecall,
      });
    },
  );
  it.each([
    { seconds: 20, recallSeconds: 21, reason: 'Correction' },
    { seconds: 85, recallSeconds: 10, reason: 'Correction' },
    { seconds: 9, reason: 'Total below retained recall' },
    { recallSeconds: 10.25, reason: 'Recall beyond the space left after measured audio' },
    { recallSeconds: -1, reason: 'Negative recall estimate' },
    { recallSeconds: NaN, reason: 'Nonfinite recall estimate' },
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
