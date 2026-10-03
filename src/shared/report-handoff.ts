import { validateAdvisorReportAnswers } from './report-definition';
import {
  copyReportDocument,
  sameReportValue,
  validateReportDocument,
  type ReportDocument,
} from './report-document';

/** A prepared copy has its own frozen definition, mappings, answers and source facts. */
export function captureReportHandoff(
  draft: ReportDocument,
  now = new Date().toISOString(),
): ReportDocument {
  if (draft.status !== 'draft')
    throw new Error('Review a working draft before preparing a handoff.');
  const errors = validateAdvisorReportAnswers(draft.definition, draft.answers);
  if (errors.length)
    throw new Error(errors.map((error) => `${error.key}: ${error.message}`).join(' '));
  const copy = copyReportDocument(draft);
  return validateReportDocument(
    {
      ...copy,
      status: 'handoff',
      createdAt: now,
      updatedAt: now,
      handoff: { submissionId: crypto.randomUUID() },
    },
    { fieldRules: true },
  );
}
export function confirmReportHandoff(
  handoff: ReportDocument,
  confirmed: boolean,
  now = new Date().toISOString(),
): ReportDocument {
  if (!confirmed) throw new Error('Confirm that the external form accepted this exact copy.');
  const checked = validateReportDocument(handoff, { fieldRules: true });
  if (checked.status !== 'handoff' || !checked.handoff)
    throw new Error('Choose a preserved handoff to confirm.');
  const { handoff: reservation, ...copy } = checked;
  return validateReportDocument(
    {
      ...copy,
      id: reservation.submissionId,
      status: 'submitted',
      confirmation: { handoffId: checked.id },
      submittedAt: now,
      updatedAt: now,
    },
    { fieldRules: true },
  );
}
export function assertReportConfirmation(
  submitted: ReportDocument,
  handoff: ReportDocument | undefined,
): void {
  if (
    !handoff ||
    handoff.status !== 'handoff' ||
    !submitted.submittedAt ||
    !sameReportValue(submitted, confirmReportHandoff(handoff, true, submitted.submittedAt))
  )
    throw new Error('Submission must retain the exact owned handoff and its reserved identity.');
}
/** All native relationships are portable, acyclic, owned within this inventory and exact. */
export function validateReportRelationships(reports: readonly ReportDocument[]): void {
  const byId = new Map(reports.map((report) => [report.id, report]));
  const reservations = new Set<string>();
  for (const report of reports) {
    if (report.revisionOf && byId.get(report.revisionOf)?.status !== 'submitted')
      throw new Error('A correction must link to submitted history in this account or backup.');
    if (report.status === 'handoff') {
      const reserved = report.handoff!.submissionId;
      if (reservations.has(reserved))
        throw new Error('Each handoff reserves a distinct submitted identity.');
      reservations.add(reserved);
      const used = byId.get(reserved);
      if (used) assertReportConfirmation(used, report);
    }
    if (report.confirmation)
      assertReportConfirmation(report, byId.get(report.confirmation.handoffId));
    let cursor: ReportDocument | undefined = report;
    const seen = new Set<string>();
    while (cursor?.revisionOf) {
      if (seen.has(cursor.id)) throw new Error('Report correction links cannot form a cycle.');
      seen.add(cursor.id);
      cursor = byId.get(cursor.revisionOf);
    }
  }
}
/** Insert portable parents before their dependent submissions/corrections. */
export function orderReportCopies(reports: readonly ReportDocument[]): ReportDocument[] {
  const byId = new Map(reports.map((report) => [report.id, report]));
  const done = new Set<string>();
  const result: ReportDocument[] = [];
  const visit = (report: ReportDocument) => {
    if (done.has(report.id)) return;
    done.add(report.id);
    for (const id of [report.revisionOf, report.confirmation?.handoffId]) {
      const parent = id && byId.get(id);
      if (parent) visit(parent);
    }
    result.push(report);
  };
  for (const report of reports) visit(report);
  return result;
}
/** HTTPS GET handoff only; configured mapping replaces stale query answers, including blanks. */
export function reportPrefillUrl(report: ReportDocument): string {
  const checked = validateReportDocument(report, { fieldRules: true });
  const errors = validateAdvisorReportAnswers(checked.definition, checked.answers);
  if (errors.length) throw new Error('Complete the configured answers before opening the form.');
  if (!checked.definition.formUrl) throw new Error('Configure an HTTPS responder form URL first.');
  const url = new URL(checked.definition.formUrl);
  if (/\/(?:formResponse|submit|submission|send)(?:\/|$)/i.test(url.pathname))
    throw new Error('Use the responder form page, not a submission endpoint.');
  const missing = checked.definition.fields.filter((field) => !field.externalId);
  if (missing.length)
    throw new Error(
      `Configure external field IDs for: ${missing.map((field) => field.label).join(', ')}. Copy or print the captured answers meanwhile.`,
    );
  for (const field of checked.definition.fields)
    url.searchParams.set(field.externalId!, checked.answers[field.key] ?? '');
  if (url.href.length > 32_000)
    throw new Error('Prefill URL is too long. Copy or print this captured report instead.');
  return url.href;
}
