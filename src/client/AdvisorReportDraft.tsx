import AdvisorReportAnswers from './AdvisorReportAnswers';
import AdvisorReportEvidence from './AdvisorReportEvidence';
import type { LcwoData } from '../shared/lcwo';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { AccountChange } from '../shared/account-sync';
import type { PlannedTask } from '../shared/plan';
import {
  dateInTimezone,
  type Profile,
  type PracticeSession,
  type TrainingExport,
} from '../shared/training';
import { advisorReportWindow } from '../shared/report-window';
import {
  validateAdvisorReportAnswers,
  type AdvisorReportDefinition,
} from '../shared/report-definition';
import {
  sameReportValue,
  createReportDocument,
  copyReportDocument,
  copyOriginalDeviceDraft,
  originalDeviceDrafts,
  refreshReportDocument,
  reportDocumentText,
  validateReportDocument,
  type ReportDocument,
  type OriginalDeviceDraft,
} from '../shared/report-document';
import {
  getDeviceScopeToken,
  isDeviceScopeCurrent,
  requireCurrentDeviceScope,
  DEVICE_CAPTURE_EVENT,
} from './device-scope';
import {
  loadReportDraftStore,
  saveReportDraftStore,
  invalidateReportDraftMemory,
  type ReportDraftState,
} from './report-drafts';
import { loadAccountOperations } from './account-outbox';

function download(report: ReportDocument) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `advisor-session-${report.window.session}-${report.id}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function AdvisorReportDraft({
  active,
  scope,
  generation,
  definition,
  profile,
  tasks,
  entries,
  reports,
  lcwo,
  revision,
  onChange,
  onConfigure,
  notice,
}: {
  active: boolean;
  scope: string;
  generation: number;
  definition: AdvisorReportDefinition;
  profile: Profile;
  tasks: PlannedTask[];
  entries: PracticeSession[];
  reports: ReportDocument[];
  lcwo?: LcwoData | null;
  revision: number;
  onChange: (change: AccountChange, revision: number) => Promise<unknown>;
  onConfigure: () => void;
  notice: string;
}) {
  const token = useRef(getDeviceScopeToken(scope));
  const mounted = useRef(true);
  const [state, setState] = useState<ReportDraftState>(() =>
    loadReportDraftStore(scope, generation),
  );
  const current = useRef(state);
  current.current = state;
  const [checked, setChecked] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const savedCapture = useRef<{ fingerprint: string; report: ReportDocument } | undefined>(
    undefined,
  );
  const firstSelect = useRef<HTMLSelectElement>(null);
  const [dateError, setDateError] = useState('');
  const [archive, setArchive] = useState<{ id: string; drafts: OriginalDeviceDraft[] } | null>(
    null,
  );
  const [selectedArchive, setSelectedArchive] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [openingDate, setOpeningDate] = useState(() =>
    dateInTimezone(new Date(), profile.classSchedule?.timezone ?? profile.timezone),
  );
  const selected = state.value.selectedSession;
  const draft = state.value.drafts.find((draft) => draft.window.session === selected);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (active) firstSelect.current?.focus();
  }, [active]);
  function persist(value: ReportDraftState['value']) {
    try {
      requireCurrentDeviceScope(scope, token.current);
      const next = saveReportDraftStore(scope, token.current, current.current, value);
      current.current = next;
      setState(next);
      setError('');
      setChecked(false);
      setMessage('');
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function select(
    session: number,
    date = dateInTimezone(new Date(), profile.classSchedule?.timezone ?? profile.timezone),
  ) {
    let drafts = current.current.value.drafts;
    if (!drafts.some((draft) => draft.window.session === session)) {
      try {
        drafts = [
          ...drafts,
          createReportDocument(definition, profile, tasks, session, date, entries, lcwo),
        ];
      } catch (error) {
        setError((error as Error).message);
        return;
      }
    }
    persist({ ...current.current.value, selectedSession: session, drafts });
    setDateError('');
  }
  useEffect(() => {
    if (!draft && !state.error) select(selected);
  }, []);
  useEffect(() => {
    const capture = (event: Event) => {
      if ((event as CustomEvent<{ scope: string }>).detail.scope === scope)
        persist(current.current.value);
    };
    globalThis.window.addEventListener(DEVICE_CAPTURE_EVENT, capture);
    return () => globalThis.window.removeEventListener(DEVICE_CAPTURE_EVENT, capture);
  }, [scope]);
  function refresh(next: ReportDocument, message?: string) {
    try {
      update(refreshReportDocument(next, profile, entries, undefined, { lcwo, tasks }));
      if (message) setMessage(message);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  function update(next: ReportDocument) {
    persist({
      ...current.current.value,
      drafts: current.current.value.drafts.map((item) =>
        item.window.session === next.window.session ? next : item,
      ),
    });
  }
  function reopenDeviceDrafts() {
    try {
      requireCurrentDeviceScope(scope, token.current);
      invalidateReportDraftMemory(scope);
      const next = loadReportDraftStore(scope, generation);
      if (next.error) {
        setError(next.error);
        return;
      }
      current.current = next;
      setState(next);
      setDateError('');
      setError('');
      setMessage(
        'Reopened the stored device draft. Your previous text is in the recovery download.',
      );
      if (!next.value.drafts.some((item) => item.window.session === next.value.selectedSession))
        select(next.value.selectedSession);
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function saveAccount() {
    if (!draft || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      requireCurrentDeviceScope(scope, token.current);
      validateReportDocument(draft, { fieldRules: true });
      const signature = (report: ReportDocument) => [
        report.definition,
        report.window,
        report.answers,
        report.editedKeys,
        report.evidence,
        report.provenance,
      ];
      const retained = reports.find(
        (report) =>
          report.status === 'draft' &&
          ((report.source?.kind === 'native' && report.source.id === draft.id) ||
            (report.source?.kind === 'original-device' &&
              draft.source?.kind === 'original-device' &&
              report.source.id === draft.source.id &&
              report.source.archiveId === draft.source.archiveId)) &&
          sameReportValue(signature(report), signature(draft)),
      );
      if (retained) {
        const pending = loadAccountOperations(scope).some(
          (item) =>
            item.operation.change.type === 'report-save' &&
            item.operation.change.report.id === retained.id,
        );
        setMessage(
          pending
            ? 'This exact copy is waiting to upload. Retry account sync is available after closing this report.'
            : 'This exact copy is already saved in your account.',
        );
        return;
      }
      const fingerprint = JSON.stringify(draft);
      if (savedCapture.current?.fingerprint !== fingerprint)
        savedCapture.current = { fingerprint, report: copyReportDocument(draft) };
      const captured = savedCapture.current.report;
      if (reports.some((report) => report.id === captured.id)) {
        const pending = loadAccountOperations(scope).some(
          (item) =>
            item.operation.change.type === 'report-save' &&
            item.operation.change.report.id === captured.id,
        );
        setMessage(
          pending
            ? 'This exact copy is waiting to upload. Retry account sync is available after closing this report.'
            : 'This exact copy is already saved in your account.',
        );
        return;
      }
      const result = await onChange({ type: 'report-save', report: captured }, revision);
      if (!mounted.current || !isDeviceScopeCurrent(scope, token.current)) return;
      setMessage(
        result &&
          typeof result === 'object' &&
          'destination' in result &&
          result.destination === 'device'
          ? 'Report copy saved on this device. Waiting to upload; Retry account sync is available after closing this report.'
          : 'Report copy saved in your account.',
      );
    } catch (error) {
      if (mounted.current && isDeviceScopeCurrent(scope, token.current))
        setError((error as Error).message);
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function loadArchive() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const exported = await api<TrainingExport>(
        '/export',
        undefined,
        'GET',
        AbortSignal.timeout(10000),
        { accountId: scope, generation },
      );
      const data = exported.legacy?.data;
      const bytes = new TextEncoder().encode(JSON.stringify(exported.legacy ?? null));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      if (!mounted.current || !isDeviceScopeCurrent(scope, token.current)) return;
      const id = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      const drafts = originalDeviceDrafts(data);
      setArchive({ id, drafts });
      setSelectedArchive(drafts[0]?.id ?? '');
    } catch (error) {
      if (mounted.current && isDeviceScopeCurrent(scope, token.current))
        setError((error as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  if (!draft)
    return (
      <section aria-label="Advisor report drafts">
        <p role="alert">{state.error || error || 'Opening your class draft…'}</p>
        <label>
          Report date to open draft
          <input
            type="date"
            value={openingDate}
            onChange={(event) => setOpeningDate(event.target.value)}
          />
        </label>
        <button className="button outline" onClick={() => select(selected, openingDate)}>
          Open draft for chosen report date
        </button>
        <button className="button outline" onClick={reopenDeviceDrafts}>
          Reopen device drafts
        </button>
        <button className="button outline" onClick={onConfigure}>
          Configure advisor fields
        </button>
      </section>
    );
  const errors = checked ? validateAdvisorReportAnswers(draft.definition, draft.answers) : [];
  const window = draft.window;
  const pendingIds = new Set(
    loadAccountOperations(scope)
      .filter((item) => item.operation.change.type === 'report-save')
      .map((item) =>
        item.operation.change.type === 'report-save' ? item.operation.change.report.id : '',
      ),
  );
  const changedDefinition = JSON.stringify(definition) !== JSON.stringify(draft.definition);
  return (
    <section className="advisor-report-setup" aria-label="Advisor report setup">
      <h3>{draft.definition.title}</h3>
      {notice && <p role="status">{notice}</p>}
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <p role={state.error ? 'alert' : 'status'}>
        {state.error ||
          'Draft saved on this device. Use Save account copy to retain an immutable account snapshot.'}
      </p>
      {state.error && (
        <div className="plan-form-actions">
          <button className="button outline" onClick={() => persist(current.current.value)}>
            Retry device save
          </button>
          <button
            className="button outline"
            onClick={() => {
              download(draft);
              reopenDeviceDrafts();
            }}
          >
            Download current and reopen device drafts
          </button>
        </div>
      )}
      <button className="button outline small" onClick={onConfigure}>
        Configure advisor fields
      </button>
      {changedDefinition && (
        <div className="alert advisor-definition-notice">
          <p>
            Your working draft keeps its original field definition. Download or save it before
            starting a new draft with the current configuration.
          </p>
          <button
            className="button outline"
            onClick={() => {
              try {
                update(
                  createReportDocument(
                    definition,
                    profile,
                    tasks,
                    selected,
                    window.reportDate,
                    entries,
                    lcwo,
                  ),
                );
              } catch (error) {
                setError((error as Error).message);
              }
            }}
          >
            Use current definition for new draft
          </button>
        </div>
      )}
      <div className="plan-form-grid">
        <label>
          Class session
          <select
            ref={firstSelect}
            value={selected}
            onChange={(event) => select(Number(event.target.value))}
          >
            {Array.from({ length: 16 }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Session {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label>
          Report date
          <input
            type="date"
            value={window.reportDate}
            onChange={(event) => {
              try {
                const nextWindow = advisorReportWindow(
                  profile,
                  tasks,
                  selected,
                  event.target.value,
                );
                update(
                  refreshReportDocument(
                    { ...draft, window: nextWindow },
                    profile,
                    entries,
                    undefined,
                    { lcwo, tasks },
                  ),
                );
                setDateError('');
              } catch (error) {
                setDateError((error as Error).message);
              }
            }}
          />
        </label>
      </div>
      {dateError && <p role="alert">{dateError}</p>}
      <section className="advisor-window" aria-label="Report preparation window">
        <p>
          <strong>Course timezone:</strong> {window.timezone}
        </p>
        <p>
          <strong>Source preparation dates:</strong>{' '}
          {window.preparationDates.length
            ? window.preparationDates.join(', ')
            : 'No dated preparation exercises'}
        </p>
        <p>
          <strong>Class:</strong> {window.meetingDate ?? 'No scheduled date'}
        </p>
        {window.meetingStartsAt && (
          <p>
            <strong>Class time:</strong>{' '}
            {new Intl.DateTimeFormat('en-US', {
              timeZone: window.timezone,
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(window.meetingStartsAt))}{' '}
            ({window.timezone})
          </p>
        )}
        <p>
          <strong>Inclusive report window:</strong>{' '}
          {window.empty
            ? `Empty — preparation starts ${window.fromDate}; report ends ${window.toDate}`
            : `${window.fromDate} through ${window.toDate}`}
        </p>
        <p>{window.explanation} Meeting exceptions do not move curriculum preparation dates.</p>
      </section>
      <p>
        Edits and intentional blanks are protected. Refresh changes only untouched suggestions and
        updates their source references. No external form has been submitted.
      </p>
      <button
        className="button outline"
        onClick={() => {
          refresh(
            draft,
            'Practice answers refreshed. Your edited answers and deliberate blanks are preserved.',
          );
        }}
      >
        Refresh from saved practice
      </button>
      <p>
        {draft.evidence.length} saved practice source references. Review the original results in
        your practice history.
      </p>
      {draft.provenance && draft.provenance.warnings.length > 0 && (
        <aside className="advisor-evidence-cautions" aria-label="Suggestion cautions">
          <ul>
            {draft.provenance.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </aside>
      )}
      <AdvisorReportEvidence report={draft} entries={entries} lcwo={lcwo} />
      <AdvisorReportAnswers
        definition={draft.definition}
        answers={draft.answers}
        editedKeys={draft.editedKeys}
        errors={errors}
        onEdit={(key, value) =>
          update({
            ...draft,
            answers: { ...draft.answers, [key]: value },
            editedKeys: [...new Set([...draft.editedKeys, key])],
            updatedAt: new Date().toISOString(),
          })
        }
        onSuggestion={(key) =>
          refresh({ ...draft, editedKeys: draft.editedKeys.filter((item) => item !== key) })
        }
      />
      <div className="plan-form-actions">
        <button
          className="button outline"
          disabled={Boolean(dateError)}
          onClick={() => setChecked(true)}
        >
          Check preview answers
        </button>
        <button
          className="button outline"
          disabled={busy || Boolean(dateError)}
          onClick={() => void saveAccount()}
        >
          {busy ? 'Saving report…' : 'Save account copy'}
        </button>
        <button className="button outline" onClick={() => download(draft)}>
          Download working report
        </button>
        <button
          className="button outline"
          disabled={Boolean(dateError)}
          onClick={async () => {
            setChecked(true);
            if (validateAdvisorReportAnswers(draft.definition, draft.answers).length) return;
            try {
              await navigator.clipboard.writeText(reportDocumentText(draft));
              setMessage('Preview copied.');
            } catch {
              setMessage('Select the preview text below and use your device’s copy command.');
            }
          }}
        >
          Copy advisor preview
        </button>
      </div>
      {checked && !errors.length && !dateError && (
        <p role="status">
          Preview answers satisfy your configured field rules. Nothing has been submitted.
        </p>
      )}
      <pre className="plan-report-text" tabIndex={0} aria-label="Advisor preview text">
        {reportDocumentText(draft)}
      </pre>
      <details>
        <summary>Saved report copies ({reports.length})</summary>
        <p>
          These snapshots are read only. Reopening creates a new working identity and replaces only
          the selected session’s device draft.
        </p>
        {reports
          .slice()
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .map((report) => (
            <details key={report.id}>
              <summary>
                Session {report.window.session} · {report.window.reportDate} · {report.status} ·{' '}
                {pendingIds.has(report.id) ? 'waiting to upload' : 'account-saved'}
              </summary>
              <pre className="plan-report-text" tabIndex={0}>
                {reportDocumentText(report)}
              </pre>
              <AdvisorReportEvidence report={report} entries={entries} lcwo={lcwo} />
              <button
                className="button outline"
                onClick={() => {
                  const copy = copyReportDocument(report);
                  persist({
                    ...state.value,
                    selectedSession: copy.window.session,
                    drafts: [
                      ...state.value.drafts.filter(
                        (draft) => draft.window.session !== copy.window.session,
                      ),
                      copy,
                    ],
                  });
                  setMessage(
                    'Saved snapshot reopened as a new draft. The original remains unchanged.',
                  );
                }}
              >
                Reopen session {report.window.session} copy as new draft
              </button>
              {report.status === 'draft' &&
                (removing === report.id ? (
                  <div role="group" aria-label="Confirm removing saved report">
                    <p>
                      Remove this immutable draft copy from your account? Download a private backup
                      first. Your working device draft remains separate.
                    </p>
                    <button
                      className="button outline"
                      disabled={busy}
                      onClick={() => setRemoving(null)}
                    >
                      Cancel report removal
                    </button>
                    <button
                      className="button outline"
                      disabled={busy}
                      onClick={async () => {
                        if (saving.current) return;
                        saving.current = true;
                        setBusy(true);
                        try {
                          const result = await onChange(
                            { type: 'report-delete', id: report.id },
                            revision,
                          );
                          if (!mounted.current || !isDeviceScopeCurrent(scope, token.current))
                            return;
                          setRemoving(null);
                          setMessage(
                            result &&
                              typeof result === 'object' &&
                              'destination' in result &&
                              result.destination === 'device'
                              ? 'Report removal retained on this device, waiting to sync.'
                              : 'Saved report copy removed.',
                          );
                        } catch (error) {
                          if (mounted.current && isDeviceScopeCurrent(scope, token.current))
                            setError((error as Error).message);
                        } finally {
                          saving.current = false;
                          if (mounted.current) setBusy(false);
                        }
                      }}
                    >
                      Confirm remove report copy
                    </button>
                  </div>
                ) : (
                  <button className="button outline" onClick={() => setRemoving(report.id)}>
                    Remove session {report.window.session} draft copy
                  </button>
                ))}
            </details>
          ))}
      </details>
      <details>
        <summary>Copy a preserved original device draft</summary>
        <p>
          Load your private original archive, select a device draft, then copy it into the matching
          selected session and compatible field keys. The source archive and submitted snapshots
          remain unchanged. Download your current working draft first.
        </p>
        <button className="button outline" disabled={busy} onClick={() => void loadArchive()}>
          Load original device drafts
        </button>
        {archive &&
          (archive.drafts.length ? (
            <>
              <label>
                Original device draft
                <select
                  value={selectedArchive}
                  onChange={(event) => setSelectedArchive(event.target.value)}
                >
                  {archive.drafts.map((original) => (
                    <option key={original.id} value={original.id}>
                      Session {String(original.session)} · {original.id}
                    </option>
                  ))}
                </select>
              </label>
              <pre className="plan-report-text" tabIndex={0}>
                {JSON.stringify(
                  archive.drafts.find((original) => original.id === selectedArchive),
                  null,
                  2,
                )}
              </pre>
              <button
                className="button outline"
                onClick={() => {
                  try {
                    const original = archive.drafts.find(
                      (original) => original.id === selectedArchive,
                    )!;
                    if (
                      state.value.drafts.some(
                        (draft) =>
                          draft.source?.kind === 'original-device' &&
                          draft.source.id === original.id &&
                          draft.source.archiveId === archive.id,
                      ) ||
                      reports.some(
                        (report) =>
                          report.source?.kind === 'original-device' &&
                          report.source.id === original.id &&
                          report.source.archiveId === archive.id,
                      )
                    )
                      throw new Error(
                        'This original draft has already been copied. Reopen the existing copy instead.',
                      );
                    const copy = copyOriginalDeviceDraft(
                      original,
                      archive.id,
                      definition,
                      profile,
                      tasks,
                      selected,
                    );
                    update(copy);
                    setMessage(
                      'Original draft copied explicitly. Source identifiers remain in its unchanged private archive.',
                    );
                  } catch (error) {
                    setError((error as Error).message);
                  }
                }}
              >
                Copy original draft into selected session
              </button>
            </>
          ) : (
            <p>
              No preserved device report drafts were found. Saved/submitted snapshots remain
              readable in Imported history.
            </p>
          ))}
      </details>
    </section>
  );
}
