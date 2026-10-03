import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE, validatePracticeSession, type PracticeSession } from './training';
import { EVIDENCE_REPORT_MAPPINGS, type EvidenceReportMapping } from './report-mappings';
import { validateAdvisorReportDefinition, type AdvisorReportDefinition } from './report-definition';
import {
  createReportDocument,
  refreshReportDocument,
  validateReportDocument,
} from './report-document';
import {
  buildReportEvidence,
  reportPracticeSnapshot,
  reportablePractice,
  selectReportRunner,
} from './report-evidence';
import { RUNNER_REVISION } from './runner';
import { createCopyAttempt, defaultCopyRecipe, submitCopyAnswer } from './copy-practice';
import { copyAttemptSessionFields } from './copy-report';
import type { LcwoRun } from './lcwo';

const now = '2026-10-03T12:00:00.000Z';
const profile = { ...DEFAULT_PROFILE, timezone: 'UTC' };
function definition(...mappings: EvidenceReportMapping[]): AdvisorReportDefinition {
  return validateAdvisorReportDefinition({
    version: 1,
    title: 'Synthetic evidence',
    fields: mappings.map((mapping, index) => ({
      key: `field${index}`,
      label: mapping,
      section: 'Practice',
      source: mapping,
      type: EVIDENCE_REPORT_MAPPINGS.find((item) => item.id === mapping)!.types[0],
      required: false,
      ...(mapping.endsWith(':rating') ? { options: ['Very Good', 'Good', 'Fair', 'Poor'] } : {}),
    })),
  });
}
const document = (...mappings: EvidenceReportMapping[]) =>
  createReportDocument(definition(...mappings), profile, [], 1, '2026-10-03', []);
const entry = (id: string, patch: Partial<PracticeSession> = {}): PracticeSession => ({
  id,
  date: '2026-10-02',
  kind: 'listening',
  minutes: 1,
  notes: 'Private note is not report material',
  createdAt: '2026-10-02T12:00:00.000Z',
  ...patch,
});
function runner(
  id: string,
  points = 5,
  seconds = 300,
  start = '2026-10-02T12:00:00.000Z',
  mixed = false,
) {
  return validatePracticeSession(
    entry(`runner:${id}`, {
      kind: 'simulator',
      minutes: seconds / 60,
      date: start.slice(0, 10),
      createdAt: new Date(Date.parse(start) + seconds * 1000).toISOString(),
      metadata: {
        evidence: {
          version: 1,
          type: 'runner',
          run: {
            runId: id,
            revision: RUNNER_REVISION,
            status: 'stopped',
            elapsedSeconds: seconds,
            runStartedAt: start,
            runEndedAt: new Date(Date.parse(start) + seconds * 1000).toISOString(),
            attribution: { version: 1, timezone: 'UTC' },
            settings: {
              mode: 'SingleCall',
              wpm: 20,
              durationSeconds: Math.max(900, seconds),
              activity: 1,
              conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
            },
            speedHistory: [
              { elapsedSeconds: 0, wpm: 20 },
              ...(mixed ? [{ elapsedSeconds: 10, wpm: 25 }] : []),
            ],
            ...(mixed ? { speedChangeCount: 1 } : {}),
            summary: {
              qsoCount: points + 1,
              verifiedPoints: points,
              score: points * 2,
              nrErrors: 1,
              nilErrors: 0,
            },
          },
        },
      },
    }),
  );
}
function audio(id: string, speeds: number[], rating?: 'very-good' | 'fair') {
  return validatePracticeSession(
    entry(id, {
      source: 'timer',
      metadata: {
        evidence: {
          version: 1,
          type: 'timed',
          measurement: { seconds: 60 },
          recordings: speeds.map((speedWpm) => ({
            url: `https://cwa.cwops.org/wp-content/uploads/WD201_${speedWpm}.mp3`,
            speedWpm,
            seconds: 60 / speeds.length,
          })),
        },
        ...(rating
          ? { assessment: { version: 1, source: 'self-reported', performanceRating: rating } }
          : {}),
        selectedRecording: 'https://cwa.cwops.org/wp-content/uploads/WD201_25.mp3',
      },
    }),
  );
}
function run(id: number, patch: Partial<LcwoRun> = {}): LcwoRun {
  return {
    version: 1,
    source: 'lcwo-export',
    id: `groups:7:${id}`,
    kind: 'letters',
    sourceType: 'groups',
    sourceUserId: '7',
    sourceResultId: String(id),
    recordedAt: `2026-10-02T12:${String(id).padStart(2, '0')}:00.000Z`,
    sourceTime: `2026-10-02 12:${String(id).padStart(2, '0')}:00`,
    characterWpm: 25,
    effectiveWpm: 15,
    accuracyPercent: 90,
    ...patch,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(now));
});
afterEach(() => vi.useRealTimers());

describe('advisor source selection and frozen provenance', () => {
  it('deduplicates before class-local filtering, includes extra review and excludes class, future and unrelated projections', () => {
    const doc = document('runner:verifiedPoints');
    const native = runner('midnight', 5, 30, '2026-10-01T02:00:00.000Z');
    const local = {
      ...doc,
      window: { ...doc.window, timezone: 'America/New_York', fromDate: '2026-10-01' },
    };
    const review = entry('review', { metadata: { practicePurpose: 'review' } });
    const rows = reportablePractice(local, [
      native,
      review,
      review,
      entry('class', { context: 'class' }),
      entry('future', { date: '2026-10-04' }),
      runner('future-time', 8, 30, '2026-10-03T13:00:00.000Z'),
    ]);
    expect(rows.map((item) => item.id)).toEqual(['review']);
    expect(reportPracticeSnapshot(review, 'UTC').facts.join(' ')).toContain(
      'extra review (reportable, no required-task credit)',
    );
  });
  it('selects one eligible result by points, longer actual duration, newer actual start and stable ID; never sums or scales', () => {
    const a = runner('a', 6, 300),
      b = runner('b', 6, 600),
      c = runner('c', 6, 600, '2026-10-02T13:00:00.000Z');
    const d = runner('d', 6, 600, '2026-10-02T13:00:00.000Z');
    const long = runner('long', 100, 901);
    const best = selectReportRunner([a, d, b, long, c]);
    expect(best?.entry.id).toBe('runner:c');
    expect(
      buildReportEvidence(
        document('runner:verifiedPoints', 'runner:score'),
        [a, b, c, d, long],
        undefined,
      ).values,
    ).toEqual({ field0: '6', field1: '12' });
    expect(selectReportRunner([runner('zero-time', 0, 0)])).toBeUndefined();
    expect(selectReportRunner([runner('zero-points', 0, 30)])?.verifiedPoints).toBe(0);
  });
  it('keeps actual mixed-speed use, verified points, score and starting speed distinct in captured facts and visible cautions', () => {
    const result = buildReportEvidence(
      document('runner:startingWpm', 'runner:usedWpms', 'runner:verifiedPoints', 'runner:score'),
      [runner('mixed', 8, 300, undefined, true)],
      undefined,
    );
    expect(result.values).toEqual({ field0: '20', field1: '20, 25', field2: '8', field3: '16' });
    expect(result.provenance.warnings.join(' ')).toContain('Mixed-speed run');
    expect(result.provenance.warnings.join(' ')).toContain('without scaling points');
    expect(result.provenance.sources[0].facts.join(' ')).toContain(
      'mixed speed, not a constant WPM',
    );
  });
  it('uses only verified actually played file/speed pairs and the latest explicit category rating', () => {
    const first = audio('first', [10, 15], 'very-good');
    const second = { ...audio('second', [18], 'fair'), createdAt: '2026-10-02T13:00:00.000Z' };
    const result = buildReportEvidence(
      document('audio:shortWords:files', 'audio:shortWords:rating'),
      [second, first, first],
      undefined,
    );
    expect(result.values).toEqual({ field0: 'WD201 10, WD201 15, WD201 18', field1: 'Fair' });
    expect(result.provenance.fields[0].references).toHaveLength(2);
    expect(result.provenance.sources.flatMap((source) => source.facts).join(' ')).not.toContain(
      'WD201_25',
    );
    expect(
      result.provenance.fields[1].references.map((index) => result.evidence[index].id),
    ).toEqual(['second']);
  });
  it('does not parse unverified URLs, score prose, private notes, historical difficulty or generic accuracy as automatic answers', () => {
    const unknown = validatePracticeSession(
      entry('unknown-audio', {
        source: 'timer',
        accuracy: 99,
        metadata: {
          evidence: {
            version: 1,
            type: 'timed',
            measurement: { seconds: 60 },
            recordings: [{ url: 'https://example.test/WD201_99.mp3', seconds: 60 }],
          },
          difficulty: 'very-good',
        },
      }),
    );
    const prose = entry('prose', {
      notes: 'Web Morse Runner: completed; 900 seconds; 60 WPM; Verified Pts 1000;',
    });
    const result = buildReportEvidence(
      document('audio:shortWords:files', 'audio:shortWords:rating', 'runner:verifiedPoints'),
      [unknown, prose],
      undefined,
    );
    expect(result.values).toEqual({ field0: '', field1: '', field2: '' });
    expect(result.provenance.warnings.join(' ')).toContain('no verified report family');
    expect(result.provenance.sources.flatMap((source) => source.facts).join(' ')).not.toContain(
      prose.notes,
    );
  });
  it('selects the latest whole external result and leaves missing adaptive metrics unknown instead of borrowing older answers', () => {
    const older = entry('older', {
      source: 'manual',
      metadata: {
        externalResult: {
          version: 1,
          source: 'user-entered',
          trainer: 'lcwo',
          kind: 'words',
          speedWpm: 18,
          maximumLength: 6,
          errorCount: 0,
          score: 500,
        },
      },
    });
    const newer = entry('newer', {
      source: 'manual',
      createdAt: '2026-10-02T14:00:00.000Z',
      metadata: {
        externalResult: {
          version: 1,
          source: 'user-entered',
          trainer: 'lcwo',
          kind: 'words',
          score: 0,
        },
      },
    });
    const doc = document(
      'lcwo:words:speedWpm',
      'lcwo:words:maximumLength',
      'lcwo:words:errorCount',
      'lcwo:words:score',
    );
    const manual = buildReportEvidence(doc, [older, newer], undefined);
    expect(manual.values).toEqual({ field0: '', field1: '', field2: '', field3: '0' });
    expect(
      manual.provenance.fields.every((field) =>
        field.references.map((index) => manual.evidence[index].id).includes('newer'),
      ),
    ).toBe(true);
    const latest = run(30, {
      id: 'words:7:30',
      kind: 'words',
      sourceType: 'words',
      sourceResultId: '30',
      recordedAt: '2026-10-02T15:00:00.000Z',
      sourceTime: '2026-10-02 15:00:00',
      characterWpm: undefined,
      effectiveWpm: undefined,
      accuracyPercent: undefined,
      maximumWpm: 24,
      score: 700,
    });
    const exported = buildReportEvidence(doc, [older, newer], {
      runs: [latest],
      estimateSeconds: 60,
    });
    expect(exported.values).toEqual({ field0: '', field1: '', field2: '', field3: '700' });
    expect(exported.provenance.warnings.join(' ')).toContain('Actual adaptive training speed');
  });
  it('averages only group measurements matching both actual effective and character speed and never invents a group length', () => {
    const data = [
      run(1, { accuracyPercent: 100 }),
      run(2, { accuracyPercent: 80 }),
      run(3, { effectiveWpm: 20, accuracyPercent: 0 }),
      run(4, { characterWpm: 30, accuracyPercent: 0 }),
      run(5, { accuracyPercent: 90 }),
    ];
    const doc = document(
      'lcwo:letters:speedWpm',
      'lcwo:letters:groupLength',
      'lcwo:letters:errorPercent',
    );
    const result = buildReportEvidence(doc, [], { runs: data, estimateSeconds: 60 });
    expect(result.values).toEqual({ field0: '15', field1: '', field2: '10' });
    expect(
      result.provenance.fields[2].references.map((index) => result.evidence[index].id).sort(),
    ).toEqual(['groups:7:1', 'groups:7:2', 'groups:7:5']);
    expect(result.provenance.sources.flatMap((source) => source.facts).join(' ')).toContain(
      'Estimated 60 seconds',
    );
    expect(result.provenance.warnings.join(' ')).toContain('matching character/effective WPM');
  });
  it('does not average earlier group exports into the latest manual whole result or use Koch to fill custom groups', () => {
    const manual = entry('manual', {
      source: 'manual',
      createdAt: '2026-10-02T14:00:00.000Z',
      metadata: {
        externalResult: {
          version: 1,
          source: 'user-entered',
          trainer: 'lcwo',
          kind: 'letters',
          speedWpm: 15,
          groupLength: 3,
        },
      },
    });
    const koch = run(1, { id: 'koch:7:1', sourceType: 'koch', kind: 'koch', lesson: 20 });
    const result = buildReportEvidence(
      document('lcwo:letters:groupLength', 'lcwo:letters:errorPercent', 'lcwo:custom:errorPercent'),
      [manual],
      { runs: [run(1, { accuracyPercent: 100 }), koch], estimateSeconds: 0 },
    );
    expect(result.values).toEqual({ field0: '3', field1: '', field2: '' });
  });
  it('keeps native Copy identity and its compatible explicit mapping separate from LCWO even at equal speeds', () => {
    const initial = createCopyAttempt(
      { ...defaultCopyRecipe(), lengthMode: 'count', groupCount: 2 },
      { id: 'copy-source', seed: 'copy-source', now: '2026-10-02T12:00:00.000Z' },
    );
    const attempt = submitCopyAnswer(initial, initial.targets[0], {
      now: '2026-10-02T12:00:10.000Z',
    });
    const copied = validatePracticeSession({
      ...copyAttemptSessionFields(attempt),
      date: '2026-10-02',
      kind: 'icr',
      notes: '',
    });
    const result = buildReportEvidence(
      document(
        'copy:letters:errorPercent',
        'copy:letters:effectiveWpm',
        'lcwo:letters:errorPercent',
      ),
      [copied],
      undefined,
    );
    expect(result.values.field0).toBe('0');
    expect(result.values.field1).toBe(String(attempt.trials[0].effectiveWpm));
    expect(result.values.field2).toBe('');
    expect(result.provenance.sources[0].source).toBe('native-copy');
    expect(result.provenance.sources[0].facts.join(' ')).toContain(attempt.scoringVersion);
    const unmapped = buildReportEvidence(
      document('lcwo:letters:errorPercent'),
      [copied],
      undefined,
    );
    expect(unmapped.provenance.warnings.join(' ')).toContain(
      'no compatible Native Copy report field',
    );
  });
  it('refreshes provenance but preserves literal edits and deliberate blanks; portable snapshots remain byte-faithful', () => {
    const original = document('runner:verifiedPoints', 'runner:score');
    const first = refreshReportDocument(original, profile, [runner('first', 6)], now);
    first.answers.field0 = '';
    first.answers.field1 = '777';
    first.editedKeys = ['field0', 'field1'];
    const refreshed = refreshReportDocument(
      first,
      profile,
      [runner('first', 6), runner('newer', 8)],
      now,
    );
    expect(refreshed.answers).toEqual({ field0: '', field1: '777' });
    expect(refreshed.provenance?.fields.map((field) => field.value)).toEqual(['8', '16']);
    expect(refreshed.id).toBe(first.id);
    expect(
      validateReportDocument(JSON.parse(JSON.stringify(refreshed)), { fieldRules: true }),
    ).toEqual(refreshed);
    const relinquished = refreshReportDocument(
      { ...refreshed, editedKeys: ['field1'] },
      profile,
      [runner('newer', 8)],
      now,
    );
    expect(relinquished.answers).toEqual({ field0: '8', field1: '777' });
    expect(first.provenance?.fields[0].value).toBe('6');
  });
  it('leaves incompatible configured measurements blank with an explanation and uses exact configured rating casing', () => {
    const doc = document('runner:verifiedPoints', 'audio:shortWords:rating');
    doc.definition.fields[0].min = 20;
    const result = buildReportEvidence(
      doc,
      [runner('small', 8), audio('rating', [10], 'very-good')],
      undefined,
    );
    expect(result.values).toEqual({ field0: '', field1: 'Very Good' });
    expect(result.provenance.fields[0].warnings.join(' ')).toContain(
      'incompatible with the configured answer rules',
    );
    doc.definition.fields[1].options = ['Excellent', 'Poor'];
    expect(
      buildReportEvidence(doc, [audio('rating', [10], 'very-good')], undefined).values.field1,
    ).toBe('');
  });
  it('uses only explicit CWT report observations and zero counts; never private notes or synthetic contacts', () => {
    const cwt = entry('cwt', {
      kind: 'on-air',
      qsoCount: 0,
      metadata: {
        assessment: {
          version: 1,
          source: 'self-reported',
          cwt: { heardCallsigns: 'N0SYN', comments: 'Explicit report comment' },
        },
      },
    });
    const simulated = { ...cwt, id: 'synthetic', source: 'morse' as const, qsoCount: 20 };
    const result = buildReportEvidence(
      document('cwt:heardCallsigns', 'cwt:comments', 'cwt:qsoCount'),
      [cwt, simulated],
      undefined,
    );
    expect(result.values).toEqual({
      field0: 'N0SYN',
      field1: 'Explicit report comment',
      field2: '0',
    });
    expect(
      result.provenance.fields.every(
        (field) => field.references.map((index) => result.evidence[index].id).join() === 'cwt',
      ),
    ).toBe(true);
    expect(result.provenance.sources.flatMap((source) => source.facts).join(' ')).not.toContain(
      cwt.notes,
    );
  });
  it('reads only valid structured historical audio and explicit ratings, never note-derived identity or conflicting selected speeds', () => {
    const historical = entry('historical-audio', {
      source: 'legacy',
      metadata: {
        legacyAttempt: {
          performanceRating: 'good',
          audioResults: [
            {
              url: 'https://cwa.cwops.org/wp-content/uploads/WD201_10.mp3',
              activeSeconds: 30,
              completedPasses: 0,
              speedWpm: 10,
            },
            {
              url: 'https://cwa.cwops.org/wp-content/uploads/WD201_15.mp3',
              activeSeconds: 30,
              completedPasses: 1,
              speedWpm: 25,
            },
            {
              url: 'https://example.test/WD201_50.mp3',
              activeSeconds: 30,
              completedPasses: 1,
              speedWpm: 50,
            },
          ],
        },
      },
    });
    const result = buildReportEvidence(
      document('audio:shortWords:files', 'audio:shortWords:rating'),
      [historical],
      undefined,
    );
    expect(result.values).toEqual({ field0: 'WD201 10', field1: 'Good' });
    expect(result.provenance.sources[0].source).toBe('historical');
    expect(result.provenance.sources[0].facts.join(' ')).toContain('0 completed passes');
    expect(result.provenance.sources[0].facts.join(' ')).not.toContain('WD201_15');
  });
  it('retains raw numeric precision and rejects oversized refreshes without mutating the previous draft', () => {
    const manual = entry('precise', {
      metadata: {
        externalResult: {
          version: 1,
          source: 'user-entered',
          trainer: 'lcwo',
          kind: 'words',
          speedWpm: 17.123456789,
        },
      },
    });
    expect(
      buildReportEvidence(document('lcwo:words:speedWpm'), [manual], undefined).values.field0,
    ).toBe('17.123456789');
    const prior = document('runner:verifiedPoints');
    const captured = structuredClone(prior);
    const many = Array.from({ length: 1000 }, (_, index) => entry(`${index}-${'x'.repeat(190)}`));
    expect(() => refreshReportDocument(prior, profile, many)).toThrow('96,000');
    expect(prior).toEqual(captured);
  });
  it('bounds embedded details explicitly while retaining every referenced source ID and portable proofs', () => {
    const sources = Array.from({ length: 300 }, (_, index) => entry(`source-${index}`));
    const report = createReportDocument(
      definition('runner:verifiedPoints'),
      profile,
      [],
      1,
      '2026-10-03',
      sources,
    );
    expect(report.evidence).toHaveLength(300);
    expect(report.provenance!.sources.length).toBeLessThanOrEqual(256);
    expect(report.provenance!.omittedSourceDetails).toBeGreaterThan(0);
    expect(report.provenance!.warnings.join(' ')).toContain('All source IDs remain retained');
    expect(validateReportDocument(JSON.parse(JSON.stringify(report)))).toEqual(report);
    for (const patch of [
      { fields: [{ ...report.provenance!.fields[0], references: [300] }] },
      { sources: [{ ...report.provenance!.sources[0], source: 'lcwo-export' }] },
      { omittedSourceDetails: 301 },
      { sources: [{ ...report.provenance!.sources[0], facts: ['private\u0000control'] }] },
    ])
      expect(() =>
        validateReportDocument({ ...report, provenance: { ...report.provenance, ...patch } }),
      ).toThrow();
  });
  it('retains explicit historical on-air observations without promoting synthetic archived contacts', () => {
    const historical = entry('historical-cwt', {
      source: 'legacy',
      kind: 'on-air',
      qsoCount: 2,
      metadata: {
        legacyAttempt: {
          cwtResult: {
            qsoCount: 2,
            workedNames: 'Synthetic Jane',
            comments: 'Explicit original observation',
          },
        },
      },
    });
    const simulated = {
      ...historical,
      id: 'historical-simulated',
      metadata: {
        legacyAttempt: {
          ...(historical.metadata!.legacyAttempt as object),
          runnerResult: { status: 'completed' },
        },
      },
    };
    const result = buildReportEvidence(
      document('cwt:workedNames', 'cwt:comments', 'cwt:qsoCount'),
      [historical, simulated],
      undefined,
    );
    expect(result.values).toEqual({
      field0: 'Synthetic Jane',
      field1: 'Explicit original observation',
      field2: '2',
    });
    expect(
      result.provenance.sources.find(
        (source) => result.evidence[source.reference].id === historical.id,
      )?.source,
    ).toBe('historical');
  });
  it('orders actual instants across different valid UTC offsets instead of comparing timestamp text', () => {
    const older = runner('offset-older', 6, 300, '2026-10-02T13:00:00+10:00');
    const newer = runner('utc-newer', 6, 300, '2026-10-02T04:00:00Z');
    expect(selectReportRunner([newer, older])?.entry.id).toBe(newer.id);
    const oldLcwo = entry('offset-lcwo', {
      source: 'legacy',
      metadata: {
        legacyAttempt: {
          startedAt: '2026-10-02T13:00:00+10:00',
          endedAt: '2026-10-02T13:01:00+10:00',
          lcwoResult: { kind: 'words', score: 100 },
        },
      },
    });
    const newLcwo = entry('utc-lcwo', {
      source: 'legacy',
      metadata: {
        legacyAttempt: {
          startedAt: '2026-10-02T04:00:00Z',
          endedAt: '2026-10-02T04:01:00Z',
          lcwoResult: { kind: 'words', score: 200 },
        },
      },
    });
    expect(
      buildReportEvidence(document('lcwo:words:score'), [newLcwo, oldLcwo], undefined).values
        .field0,
    ).toBe('200');
  });
});
