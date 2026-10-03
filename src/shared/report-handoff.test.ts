import { describe, expect, it } from 'vitest';
import {
  createReportDocument,
  copyReportDocument,
  validateReportDocument,
} from './report-document';
import {
  starterAdvisorReportDefinition,
  validateAdvisorReportDefinition,
} from './report-definition';
import { DEFAULT_PROFILE } from './training';
import { applyAccountChange, validateAccountChange, validateAccountSnapshot } from './account-sync';
import {
  captureReportHandoff,
  confirmReportHandoff,
  reportPrefillUrl,
  validateReportRelationships,
  orderReportCopies,
} from './report-handoff';
const now = '2026-10-03T14:00:00Z';
function draft() {
  const definition = {
    ...starterAdvisorReportDefinition(),
    formUrl: 'https://forms.example.test/viewform?entry.session=old&safe=context',
    fields: starterAdvisorReportDefinition().fields.map((field) => ({
      ...field,
      externalId: `entry.${field.key}`,
    })),
  };
  const report = createReportDocument(
    definition,
    { ...DEFAULT_PROFILE, callsign: 'N0SYN' },
    [],
    1,
    '2026-10-03',
    [],
  );
  report.createdAt = now;
  report.updatedAt = now;
  report.answers.name = ' <exact> & +\nline ';
  report.answers.callsign = '';
  report.editedKeys = ['name', 'callsign'];
  return report;
}
const state = () => ({
  accountId: 'owner',
  revision: 0,
  generation: 0,
  settings: DEFAULT_PROFILE,
  plan: [],
  reports: [],
});
describe('reviewed report handoff and explicit confirmation', () => {
  it('freezes mapping/window/exact answers before handoff and reserves one stable submission ID', () => {
    const working = draft();
    const captured = captureReportHandoff(working, now);
    working.answers.name = 'later';
    working.definition.fields[0].externalId = 'changed';
    working.window.reportDate = '2026-10-04';
    expect(captured.answers.name).toBe(' <exact> & +\nline ');
    expect(captured.answers.callsign).toBe('');
    const url = new URL(reportPrefillUrl(captured));
    expect(url.searchParams.getAll('entry.session')).toEqual(['1']);
    expect(url.searchParams.get('entry.name')).toBe(captured.answers.name);
    expect(url.searchParams.get('entry.callsign')).toBe('');
    expect(url.searchParams.get('safe')).toBe('context');
    expect(captured.status).toBe('handoff');
    expect(captured).not.toHaveProperty('submittedAt');
    expect(() => confirmReportHandoff(captured, false, now)).toThrow('Confirm');
    const confirmed = confirmReportHandoff(captured, true, '2026-10-03T15:00:00Z');
    expect(confirmed.id).toBe(captured.handoff!.submissionId);
    expect(confirmed.answers).toEqual(captured.answers);
    expect(confirmReportHandoff(captured, true, confirmed.submittedAt)).toEqual(confirmed);
  });
  it('blocks required invalid answers and unsafe/unmapped/oversized opening without mutating the prior draft', () => {
    const working = draft();
    working.answers.session = '';
    expect(() => captureReportHandoff(working, now)).toThrow('session:');
    expect(working.status).toBe('draft');
    for (const formUrl of [
      'javascript:alert(1)',
      'https://user:secret@example.test/viewform',
      'https://127.0.0.1/form',
      'https://[::1]/form',
      'https://localhost/form',
      'https://forms.example.test/formResponse',
    ])
      expect(() => validateAdvisorReportDefinition({ ...draft().definition, formUrl })).toThrow();
    const missing = draft();
    delete missing.definition.fields[0].externalId;
    expect(() => reportPrefillUrl(missing)).toThrow('external field IDs');
    const large = draft();
    large.answers.name = '😀'.repeat(1900);
    large.answers.callsign = '😀'.repeat(1900);
    expect(() => reportPrefillUrl(large)).toThrow('too long');
  });
  it('requires the exact owned handoff and explicit acknowledgement in semantic operations', () => {
    const handoff = captureReportHandoff(draft(), now);
    const submitted = confirmReportHandoff(handoff, true, now);
    expect(() =>
      validateAccountChange({ type: 'report-confirm', report: submitted, confirmed: false }),
    ).toThrow('explicit');
    expect(() =>
      applyAccountChange(state(), { type: 'report-confirm', report: submitted, confirmed: true }),
    ).toThrow('owned handoff');
    const captured = applyAccountChange(state(), { type: 'report-handoff', report: handoff });
    const finished = applyAccountChange(captured, {
      type: 'report-confirm',
      report: submitted,
      confirmed: true,
    });
    expect(
      applyAccountChange(finished, { type: 'report-confirm', report: submitted, confirmed: true })
        .reports,
    ).toHaveLength(2);
    expect(() =>
      applyAccountChange(captured, {
        type: 'report-confirm',
        report: { ...submitted, answers: { ...submitted.answers, name: 'new' } },
        confirmed: true,
      }),
    ).toThrow('exact');
    expect(() => applyAccountChange(finished, { type: 'report-delete', id: handoff.id })).toThrow(
      'cannot be deleted',
    );
    expect(() =>
      applyAccountChange(captured, {
        type: 'report-save',
        report: { ...draft(), id: submitted.id },
      }),
    ).toThrow('exact');
  });
  it('makes linked corrections portable and orders reverse imports without mutating history', () => {
    const handoff = captureReportHandoff(draft(), now);
    const submitted = confirmReportHandoff(handoff, true, now);
    const correction = { ...copyReportDocument(submitted), revisionOf: submitted.id };
    correction.answers.name = 'correction';
    const next = captureReportHandoff(correction, now);
    const confirmed = confirmReportHandoff(next, true, now);
    const reverse = [confirmed, next, submitted, handoff];
    validateReportRelationships(reverse);
    expect(orderReportCopies(reverse).map((report) => report.id)).toEqual([
      handoff.id,
      submitted.id,
      next.id,
      confirmed.id,
    ]);
    expect(submitted.answers.name).not.toBe('correction');
    expect(() => validateReportRelationships([next])).toThrow('correction');
    expect(() =>
      validateReportRelationships([
        { ...submitted, revisionOf: confirmed.id },
        handoff,
        next,
        confirmed,
      ]),
    ).toThrow();
  });
  it('rejects incomplete or changed native confirmations in device account snapshots before local recovery', () => {
    const handoff = captureReportHandoff(draft(), now);
    const submitted = confirmReportHandoff(handoff, true, now);
    expect(() => validateAccountSnapshot({ ...state(), reports: [submitted] })).toThrow(
      'owned handoff',
    );
    expect(() =>
      validateAccountSnapshot({
        ...state(),
        reports: [handoff, { ...submitted, answers: { ...submitted.answers, name: 'altered' } }],
      }),
    ).toThrow('exact');
    expect(validateAccountSnapshot({ ...state(), reports: [submitted, handoff] }).reports).toEqual([
      submitted,
      handoff,
    ]);
  });
  it('retains older imported reference snapshots and removes native confirmation on explicit reopening', () => {
    const legacy = {
      ...draft(),
      status: 'submitted' as const,
      submittedAt: '2026-10-01T12:00:00Z',
    };
    expect(validateReportDocument(legacy)).toEqual(legacy);
    validateReportRelationships([legacy]);
    const handoff = captureReportHandoff(draft(), now);
    const submitted = confirmReportHandoff(handoff, true, now);
    const reopened = copyReportDocument(submitted);
    expect(reopened.status).toBe('draft');
    expect(reopened).not.toHaveProperty('confirmation');
    expect(reopened).not.toHaveProperty('handoff');
    expect(reopened).not.toHaveProperty('submittedAt');
    expect(() =>
      validateReportDocument({ ...handoff, handoff: { submissionId: handoff.id } }),
    ).toThrow('distinct');
    expect(() => confirmReportHandoff(handoff, true, '2026-10-02T00:00:00Z')).toThrow(
      'precedes creation',
    );
  });
});
