import { useEffect, useRef, useState } from 'react';
import type { AccountChange } from '../shared/account-sync';
import {
  captureReportHandoff,
  confirmReportHandoff,
  reportPrefillUrl,
} from '../shared/report-handoff';
import { reportDocumentText, type ReportDocument } from '../shared/report-document';
import { validateAdvisorReportAnswers } from '../shared/report-definition';
import type { PracticeSession } from '../shared/training';
import type { LcwoData } from '../shared/lcwo';
import {
  getDeviceScopeToken,
  isDeviceScopeCurrent,
  requireCurrentDeviceScope,
} from './device-scope';
import { loadAccountOperations } from './account-outbox';
import AdvisorReportEvidence from './AdvisorReportEvidence';

function download(report: ReportDocument) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `advisor-${report.status}-${report.id}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
/** Print only the persisted capture, using text nodes rather than learner HTML. */
function printCapture(report: ReportDocument) {
  const frame = document.createElement('iframe');
  frame.title = 'Captured advisor report print';
  frame.style.display = 'none';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    throw new Error('Print unavailable. Download the captured report instead.');
  }
  const style = doc.createElement('style');
  style.textContent = 'pre{white-space:pre-wrap;overflow-wrap:anywhere;font:16px sans-serif}';
  doc.head.appendChild(style);
  const pre = doc.createElement('pre');
  pre.textContent = reportDocumentText(report);
  doc.body.appendChild(pre);
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 1000);
}
export default function AdvisorReportHandoff({
  draft,
  reports,
  scope,
  revision,
  onChange,
  onCheck,
  onCorrection,
  entries,
  lcwo,
  blocked,
}: {
  draft: ReportDocument;
  reports: ReportDocument[];
  scope: string;
  revision: number;
  onChange: (change: AccountChange, revision: number) => Promise<unknown>;
  onCheck: () => void;
  onCorrection: (report: ReportDocument) => void;
  entries: PracticeSession[];
  lcwo?: LcwoData | null;
  blocked: boolean;
}) {
  const token = useRef(getDeviceScopeToken(scope));
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );
  const [selected, setSelected] = useState('');
  const [confirmed, setConfirmed] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const capture = useRef<{ fingerprint: string; report: ReportDocument } | undefined>(undefined);
  const confirmations = useRef(new Map<string, ReportDocument>());
  const handoffs = reports
    .filter((report) => report.status === 'handoff')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || a.id.localeCompare(b.id));
  const current = handoffs.find((report) => report.id === selected) ?? handoffs[0];
  const submissions = reports.filter(
    (report) => report.status === 'submitted' && report.confirmation,
  );
  const submitted =
    current && submissions.find((report) => report.confirmation?.handoffId === current.id);
  const operations = loadAccountOperations(scope);
  const pending = new Map(
    operations.flatMap((item) =>
      'report' in item.operation.change ? [[item.operation.change.report.id, item] as const] : [],
    ),
  );
  let href = '';
  let destinationProblem = '';
  if (current) {
    try {
      href = reportPrefillUrl(current);
    } catch (error) {
      destinationProblem = (error as Error).message;
    }
  }
  function alive() {
    return mounted.current && isDeviceScopeCurrent(scope, token.current);
  }
  async function save(kind: 'prepare' | 'confirm') {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      requireCurrentDeviceScope(scope, token.current);
      let change: AccountChange;
      if (kind === 'prepare') {
        onCheck();
        if (blocked) throw new Error('Fix the report date before preparing a handoff.');
        const errors = validateAdvisorReportAnswers(draft.definition, draft.answers);
        if (errors.length) {
          document.getElementById(`advisor-answer-${errors[0].key}`)?.focus();
          throw new Error('Fix the marked answer fields before preparing a handoff.');
        }
        const fingerprint = JSON.stringify(draft);
        if (capture.current?.fingerprint !== fingerprint)
          capture.current = { fingerprint, report: captureReportHandoff(draft) };
        const report = capture.current.report;
        if (reports.some((existing) => existing.id === report.id)) {
          setSelected(report.id);
          setConfirmed('');
          setMessage('This exact reviewed handoff is already retained.');
          return;
        }
        change = { type: 'report-handoff', report };
      } else {
        if (!current || submitted) throw new Error('Choose an unconfirmed preserved handoff.');
        if (confirmed !== current.id)
          throw new Error('Confirm that the external form accepted this exact copy.');
        let report = confirmations.current.get(current.id);
        if (!report) {
          report = confirmReportHandoff(current, true);
          confirmations.current.set(current.id, report);
        }
        change = { type: 'report-confirm', report, confirmed: true };
      }
      const result = await onChange(change, revision);
      if (!alive()) return;
      if (kind === 'prepare') {
        setSelected(change.report.id);
        setConfirmed('');
      }
      const waiting = Boolean(
        result &&
        typeof result === 'object' &&
        'destination' in result &&
        result.destination === 'device',
      );
      setMessage(
        kind === 'prepare'
          ? `Reviewed handoff retained ${waiting ? 'on this device, waiting to upload' : 'in your account'}. Open, copy or print that captured copy below. Preparing a handoff does not submit a form.`
          : `Your confirmation of this exact copy is retained ${waiting ? 'on this device, waiting to upload' : 'in your account'}.`,
      );
    } catch (error) {
      if (alive()) setError((error as Error).message);
    } finally {
      busyRef.current = false;
      if (alive()) setBusy(false);
    }
  }
  return (
    <section className="advisor-handoff" aria-label="Advisor form handoff">
      <h4>Review and hand off</h4>
      <p>
        Prepare preserves the exact preview, field mapping and evidence before you open, copy or
        print it. Submit in the external form, then explicitly record its acceptance here.
      </p>
      <button
        className="button outline"
        disabled={busy || blocked}
        onClick={() => void save('prepare')}
      >
        Prepare reviewed handoff
      </button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      {current && (
        <>
          <label>
            Preserved handoff
            <select
              value={current.id}
              onChange={(event) => {
                setSelected(event.target.value);
                setConfirmed('');
                setError('');
                setMessage('');
              }}
            >
              {handoffs.map((report) => (
                <option key={report.id} value={report.id}>
                  Session {report.window.session} · {report.window.reportDate} · {report.id}
                </option>
              ))}
            </select>
          </label>
          <p>
            Capture ID: {current.id}.{' '}
            {pending.has(current.id) ? 'Waiting to upload.' : 'Account-saved.'}{' '}
            {submitted
              ? pending.has(submitted.id)
                ? 'Confirmation retained on this device, waiting to upload.'
                : 'Confirmation saved in account.'
              : 'No submission confirmation recorded.'}
          </p>
          {pending.get(current.id)?.error && (
            <p role="alert">
              {pending.get(current.id)!.error} Close this report to Retry account sync or review the
              conflict.
            </p>
          )}
          <details>
            <summary>Review preserved answers and field mapping</summary>
            <p>
              Destination:{' '}
              {current.definition.formUrl
                ? new URL(current.definition.formUrl).origin +
                  new URL(current.definition.formUrl).pathname
                : 'No external form configured'}
              . The captured field mapping below replaces any configured query answers.
            </p>
            <dl>
              {current.definition.fields.map((field) => (
                <div key={field.key}>
                  <dt>
                    {field.label} · {field.externalId ?? 'No external field ID'}
                  </dt>
                  <dd>{current.answers[field.key] ?? ''}</dd>
                </div>
              ))}
            </dl>
            <pre tabIndex={0} className="plan-report-text" aria-label="Captured handoff text">
              {reportDocumentText(current)}
            </pre>
            <AdvisorReportEvidence report={current} entries={entries} lcwo={lcwo} />
          </details>
          {destinationProblem && <p>{destinationProblem}</p>}
          <div className="plan-form-actions">
            {href && (
              <a className="button outline" href={href} target="_blank" rel="noopener noreferrer">
                Open captured form
              </a>
            )}
            <button
              className="button outline"
              onClick={async () => {
                try {
                  requireCurrentDeviceScope(scope, token.current);
                  await navigator.clipboard.writeText(reportDocumentText(current));
                  if (alive())
                    setMessage(
                      'Captured answers copied. External submission still requires your action and confirmation.',
                    );
                } catch {
                  if (alive())
                    setError(
                      'Copy unavailable. Open the preserved preview to select its exact text, or download it.',
                    );
                }
              }}
            >
              Copy captured answers
            </button>
            <button
              className="button outline"
              onClick={() => {
                try {
                  requireCurrentDeviceScope(scope, token.current);
                  printCapture(current);
                } catch (error) {
                  setError((error as Error).message);
                }
              }}
            >
              Print captured answers
            </button>
            <button className="button outline" onClick={() => download(current)}>
              Download handoff JSON
            </button>
          </div>
          {!submitted && (
            <div role="group" aria-label="Confirm external submission">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={confirmed === current.id}
                  onChange={(event) => setConfirmed(event.target.checked ? current.id : '')}
                />
                The external form confirmed acceptance of this exact captured copy.
              </label>
              <button
                className="button outline"
                disabled={busy || confirmed !== current.id}
                onClick={() => void save('confirm')}
              >
                Record confirmed submission
              </button>
            </div>
          )}
        </>
      )}
      <details>
        <summary>Confirmed submission history ({submissions.length})</summary>
        <p>
          Confirmation is your declaration that the external form accepted the copy. Companion
          cannot verify the external service. Historical imports without a native handoff remain
          readable reference snapshots in Saved report copies.
        </p>
        {submissions
          .sort(
            (a, b) =>
              Date.parse(b.submittedAt!) - Date.parse(a.submittedAt!) || a.id.localeCompare(b.id),
          )
          .map((report) => (
            <details key={report.id}>
              <summary>
                Session {report.window.session} · {report.window.reportDate} · confirmed{' '}
                {report.submittedAt} ·{' '}
                {pending.has(report.id) ? 'waiting to upload' : 'account-saved'}
              </summary>
              <p>
                Submission ID: {report.id}.{' '}
                {report.confirmation
                  ? `Exact handoff: ${report.confirmation.handoffId}.`
                  : 'Imported historical reference; no native handoff.'}{' '}
                {report.revisionOf && `Correction of ${report.revisionOf}.`}
              </p>
              {pending.get(report.id)?.error && (
                <p role="alert">
                  {pending.get(report.id)!.error} Close this report to Retry account sync or review
                  the conflict.
                </p>
              )}
              <pre className="plan-report-text" tabIndex={0}>
                {reportDocumentText(report)}
              </pre>
              <AdvisorReportEvidence report={report} entries={entries} lcwo={lcwo} />
              <button className="button outline" onClick={() => download(report)}>
                Download submitted JSON
              </button>
              <button className="button outline" onClick={() => onCorrection(report)}>
                Correct as a new linked draft
              </button>
            </details>
          ))}
      </details>
    </section>
  );
}
