import { describe, it, expect } from 'vitest';
import { DEFAULT_PROFILE, type PracticeSession } from './training';
import { starterAdvisorReportDefinition, type AdvisorReportDefinition } from './report-definition';
import {
  sameReportValue,
  createReportDocument,
  refreshReportDocument,
  copyReportDocument,
  copyOriginalDeviceDraft,
  validateReportDocument,
  validateReportDocuments,
  reportDocumentText,
  originalDeviceDrafts,
} from './report-document';
import { applyAccountChange, validateAccountChange } from './account-sync';
const profile = { ...DEFAULT_PROFILE, callsign: 'N0SYN', displayName: 'Synthetic' };
const definition: AdvisorReportDefinition = {
  ...starterAdvisorReportDefinition(),
  fields: [
    ...starterAdvisorReportDefinition().fields,
    {
      key: 'summary',
      label: 'Practice summary',
      section: 'Practice',
      type: 'text',
      required: false,
      source: 'practiceSummary',
    },
    {
      key: 'notes',
      label: 'Notes',
      section: 'Questions',
      type: 'textarea',
      required: false,
      source: 'manual',
    },
  ],
};
const draft = () => createReportDocument(definition, profile, [], 1, '2026-10-01', []);
const entry = (id = 'practice-one'): PracticeSession => ({
  id,
  date: '2026-10-01',
  kind: 'listening',
  minutes: 2,
  notes: '',
  context: 'practice',
  createdAt: '2026-10-01T12:00:00Z',
});
describe('private report documents and protected suggestions', () => {
  it('ignores object-member order while preserving ordered field and evidence arrays and literal edits', () => {
    const first = draft();
    const reordered = {
      ...first,
      answers: Object.fromEntries(Object.entries(first.answers).reverse()),
    };
    expect(sameReportValue(first, reordered)).toBe(true);
    const state = {
      accountId: 'owner',
      generation: 0,
      revision: 0,
      settings: profile,
      plan: [],
      reports: [first],
    };
    expect(applyAccountChange(state, { type: 'report-save', report: reordered }).reports).toEqual([
      first,
    ]);
    expect(
      sameReportValue(first, { ...reordered, answers: { ...reordered.answers, callsign: '' } }),
    ).toBe(false);
    expect(sameReportValue(first.definition.fields, [...first.definition.fields].reverse())).toBe(
      false,
    );
  });

  it('refreshes actual independent practice and profile context while preserving exact edits and deliberate blanks', () => {
    const first = draft();
    first.answers.notes = ' <tag> exact\nline ';
    first.answers.callsign = '';
    first.editedKeys = ['notes', 'callsign'];
    const refreshed = refreshReportDocument(first, { ...profile, callsign: 'N0NEW' }, [
      entry(),
      entry(),
      { ...entry('class'), context: 'class' },
      { ...entry('review'), metadata: { practicePurpose: 'review' } },
      { ...entry('future'), date: '2026-10-02' },
    ]);
    expect(refreshed.id).toBe(first.id);
    expect(refreshed.answers).toMatchObject({
      notes: ' <tag> exact\nline ',
      callsign: '',
      summary: '1 saved practice result; 2 minutes (independent practice; inclusive window).',
    });
    expect(refreshed.evidence).toEqual([{ kind: 'practice', id: 'practice-one' }]);
    expect(first.evidence).toEqual([]);
    const relinquished = refreshReportDocument(
      { ...refreshed, editedKeys: ['notes'] },
      { ...profile, callsign: 'N0NEW' },
      [],
    );
    expect(relinquished.answers.callsign).toBe('N0NEW');
    expect(relinquished.answers.notes).toBe(first.answers.notes);
  });
  it('keeps working edits serializable but rejects invalid field values when saving account copies', () => {
    const value = draft();
    value.answers.session = 'not a number';
    value.editedKeys = ['session'];
    expect(validateReportDocument(value).answers.session).toBe('not a number');
    expect(() => validateReportDocument(value, { fieldRules: true })).toThrow('session:');
  });
  it('copies saved/submitted snapshots to new identities without mutating source or submission facts', () => {
    const first = { ...draft(), status: 'submitted' as const, submittedAt: '2026-10-02T12:00:00Z' };
    const saved = structuredClone(first);
    const next = copyReportDocument(first);
    expect(next.id).not.toBe(first.id);
    expect(next.status).toBe('draft');
    expect(next).not.toHaveProperty('submittedAt');
    expect(next.source).toEqual({ kind: 'native', id: first.id });
    expect(first).toEqual(saved);
    expect(reportDocumentText(next)).toContain('Session 1');
  });
  it.each([
    { answers: { unknown: 'secret' } },
    { editedKeys: ['unknown'] },
    { editedKeys: ['notes', 'notes'] },
    { evidence: [{ kind: 'practice', id: 'foreign', accountId: 'foreign' }] },
    { window: { ...draft().window, toDate: '2026-10-02' } },
    { answers: { notes: '\0' } },
    { version: 2 },
  ])('rejects malformed portable document %j', (patch) =>
    expect(() => validateReportDocument({ ...draft(), ...patch })).toThrow(),
  );
  it('bounds documents and duplicate copy identities', () => {
    const value = draft();
    expect(() => validateReportDocuments([value, value])).toThrow('Duplicate');
    expect(() => validateReportDocuments(Array(201).fill(value))).toThrow('200');
    const big = {
      ...value,
      definition: {
        ...definition,
        fields: Array.from({ length: 50 }, (_, i) => ({
          key: `n${i}`,
          label: 'N',
          section: 'P',
          source: 'manual' as const,
          type: 'textarea' as const,
          required: false,
        })),
      },
      answers: Object.fromEntries(
        Array.from({ length: 50 }, (_, i) => [`n${i}`, 'x'.repeat(4000)]),
      ),
    };
    expect(() => validateReportDocument(big)).toThrow('96,000');
  });
  it('projects immutable exact retries and refuses submission or changed saved identities', () => {
    const report = draft();
    const state = {
      accountId: 'owner',
      revision: 0,
      generation: 0,
      settings: profile,
      plan: [],
      reports: [report],
    };
    expect(applyAccountChange(state, { type: 'report-save', report }).reports).toHaveLength(1);
    expect(() =>
      applyAccountChange(state, {
        type: 'report-save',
        report: { ...report, answers: { ...report.answers, notes: 'changed' } },
      }),
    ).toThrow('immutable');
    expect(() =>
      validateAccountChange({
        type: 'report-save',
        report: { ...report, status: 'submitted', submittedAt: report.createdAt },
      }),
    ).toThrow('explicit confirmed');
  });
  it('copies compatible original device drafts explicitly with exact blanks/edits and archive provenance', () => {
    const original = {
      id: 'original-draft',
      session: 1,
      reportDate: '2026-10-01',
      status: 'draft',
      answers: { notes: '', callsign: 'N0OLD' },
      editedKeys: ['notes', 'callsign'],
      sourceAttemptIds: ['original-attempt'],
      sourceLcwoIds: [],
    };
    const archived = structuredClone(original);
    const copied = copyOriginalDeviceDraft(original, 'a'.repeat(64), definition, profile, [], 1);
    expect(copied.id).not.toBe(original.id);
    expect(copied.answers).toMatchObject(original.answers);
    expect(copied.editedKeys).toEqual(original.editedKeys);
    expect(copied.source).toEqual({
      kind: 'original-device',
      id: original.id,
      archiveId: 'a'.repeat(64),
    });
    expect(copied.evidence).toEqual([]);
    expect(original).toEqual(archived);
    expect(copyReportDocument(copied).source).toEqual(copied.source);
    expect(() =>
      copyOriginalDeviceDraft(original, 'a'.repeat(64), definition, profile, [], 2),
    ).toThrow('matching');
    expect(() =>
      copyOriginalDeviceDraft(
        { ...original, status: 'submitted' },
        'a'.repeat(64),
        definition,
        profile,
        [],
        1,
      ),
    ).toThrow('historical');
    expect(() =>
      copyOriginalDeviceDraft(
        { ...original, answers: { unknown: 'x' } },
        'a'.repeat(64),
        definition,
        profile,
        [],
        1,
      ),
    ).toThrow('mapping');
  });
  it('reads only preserved device drafts and their per-session edited keys, with stable deduplication', () => {
    const source = {
      reportDraft: { id: 'one', session: 1, status: 'draft', answers: { notes: '' } },
      reportDrafts: { '1': { id: 'one', session: 1, status: 'draft', answers: { notes: '' } } },
      reportEditsBySession: { '1': ['notes'] },
      snapshot: { reports: [{ id: 'submitted', status: 'submitted' }] },
    };
    expect(originalDeviceDrafts(source)).toMatchObject([{ id: 'one', editedKeys: ['notes'] }]);
  });
});
