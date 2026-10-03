import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILE, type PracticeSession } from './training';
import { validateAdvisorReportDefinition } from './report-definition';
import {
  createReportDocument,
  refreshReportDocument,
  validateReportDocument,
} from './report-document';
import { captureReportHandoff, confirmReportHandoff } from './report-handoff';
import { buildReportEvidence } from './report-evidence';
import {
  confirmedLearnedWordHistory,
  learnedWordAnswer,
  learnedWordsFromScratchpad,
} from './report-learned-words';

const profile = { ...DEFAULT_PROFILE, timezone: 'UTC' };
const definition = () =>
  validateAdvisorReportDefinition({
    version: 1,
    title: 'Learned words',
    fields: [
      {
        key: 'words',
        label: 'Words learned',
        section: 'New words',
        type: 'textarea',
        required: false,
        source: 'learned:words',
      },
    ],
  });
const entry = (
  id: string,
  scratchpad: string,
  patch: Partial<PracticeSession> = {},
): PracticeSession => ({
  id,
  date: '2026-10-02',
  kind: 'listening',
  minutes: 0,
  notes: 'Learned: PRIVATE GENERAL NOTE',
  createdAt: '2026-10-02T00:00:00Z',
  metadata: { scratchpad },
  ...patch,
});
const draft = () => createReportDocument(definition(), profile, [], 1, '2026-10-03', []);

describe('explicit learned-word reporting', () => {
  it('extracts only declared lines, normalizes phrases/Unicode/case and retains first spelling', () => {
    expect(
      learnedWordsFromScratchpad(
        'CQ sounded familiar\nLEARNED: Rig, QTH, another   word; cafe\u0301\n learned: rig; GET; café\nHeard NAME, not learned',
      ),
    ).toEqual(['Rig', 'QTH', 'another word', 'café', 'GET']);
    expect(learnedWordsFromScratchpad(undefined)).toEqual([]);
    expect(learnedWordsFromScratchpad('Learned: valid, bad\u0000word')).toEqual(['valid']);
    expect(learnedWordAnswer(['Rig', 'a'.repeat(4000), 'QTH'])).toBe('Rig, QTH');
  });

  it('uses actual course-local windows, source IDs and dates without inferring from heard/general notes', () => {
    const doc = draft();
    doc.window = {
      ...doc.window,
      timezone: 'America/New_York',
      fromDate: '2026-10-01',
      toDate: '2026-10-02',
    };
    const rows = [
      entry('one', 'Learned: Rig, QTH'),
      entry('two', 'learned: RIG, Get'),
      entry('prose', 'Heard NAME and QTH'),
      entry('class', 'Learned: CLASS', { context: 'class' }),
      entry('outside', 'Learned: OUTSIDE', { date: '2026-09-30' }),
      entry('late-save', 'Learned: LAST', {
        date: '2026-10-03',
        metadata: {
          scratchpad: 'Learned: LAST',
          manualTiming: {
            version: 1,
            source: 'user-entered',
            completedLocal: '2026-10-03T00:00',
            startedAt: '2026-10-03T03:59:00Z',
            completedAt: '2026-10-03T04:00:00Z',
            timezone: 'America/New_York',
          },
        },
      }),
    ];
    const result = buildReportEvidence(doc, rows, null, [], Date.parse('2026-10-03T12:00:00Z'));
    expect(result.values.words).toBe('Rig, QTH, Get, LAST');
    expect(
      result.provenance.sources.find(
        (source) => result.evidence[source.reference].id === 'late-save',
      )?.date,
    ).toBe('2026-10-02');
    expect(
      result.provenance.fields[0].references.map((index) => result.evidence[index].id),
    ).toEqual(['one', 'two', 'late-save']);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE GENERAL NOTE|Heard NAME|CLASS|OUTSIDE/);
    expect(JSON.stringify(result.provenance)).toContain('Explicit Learned: Rig, QTH');
    expect(buildReportEvidence(doc, [], null).provenance.warnings.join(' ')).not.toMatch(
      /unknown or incompatible/,
    );
  });

  it('retires only exact confirmed native words after draft-after-handoff edits, never saved/prepared/imported references', () => {
    const doc = draft();
    doc.answers.words = 'Rig';
    const handoff = captureReportHandoff(doc, '2026-10-03T00:00:00Z');
    doc.answers.words = 'QTH';
    const submitted = confirmReportHandoff(handoff, true, '2026-10-03T00:01:00Z');
    const { confirmation: _confirmation, ...reference } = submitted;
    const rows = [entry('source', 'Learned: Rig, QTH, GET')];
    const suggest = (reports: (typeof doc)[]) =>
      buildReportEvidence(doc, rows, null, [], Date.parse('2026-10-03T12:00:00Z'), reports);
    expect(suggest([doc, handoff, { ...reference, id: 'imported-reference' }]).values.words).toBe(
      'Rig, QTH, GET',
    );
    const result = suggest([handoff, submitted]);
    expect(result.values.words).toBe('QTH, GET');
    expect(result.provenance.fields[0].warnings.join('\n')).toContain(submitted.id);
    expect(confirmedLearnedWordHistory([submitted])).toEqual([]);
    expect(
      confirmedLearnedWordHistory([handoff, { ...submitted, answers: { words: 'QTH' } }]),
    ).toEqual([]);
    expect(confirmedLearnedWordHistory([handoff, submitted])).toEqual([
      { word: 'Rig', reportId: submitted.id, submittedAt: submitted.submittedAt },
    ]);
  });

  it('protects deliberate blank/edits on refresh and keeps confirmed declarations privately portable', () => {
    const doc = draft();
    doc.answers.words = '';
    doc.editedKeys = ['words'];
    const rows = [entry('source', 'Learned: Rig, QTH')];
    const refreshed = refreshReportDocument(doc, profile, rows, '2026-10-03T12:00:00Z');
    expect(refreshed.answers.words).toBe('');
    expect(refreshed.provenance?.fields[0].value).toBe('Rig, QTH');
    const chosen = { ...refreshed, answers: { words: 'Rig' } };
    const handoff = captureReportHandoff(chosen, '2026-10-03T12:00:00Z');
    const submitted = confirmReportHandoff(handoff, true, '2026-10-03T12:01:00Z');
    const restored = JSON.parse(JSON.stringify([handoff, submitted])).map((value: unknown) =>
      validateReportDocument(value),
    );
    expect(confirmedLearnedWordHistory(restored)).toEqual(
      confirmedLearnedWordHistory([handoff, submitted]),
    );
    expect(
      refreshReportDocument({ ...doc, editedKeys: [] }, profile, rows, '2026-10-03T12:02:00Z', {
        reports: restored,
      }).answers.words,
    ).toBe('QTH');
  });
});
