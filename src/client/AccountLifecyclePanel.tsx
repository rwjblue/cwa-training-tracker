import { useEffect, useRef, useState } from 'react';
import { Download, RotateCcw } from 'lucide-react';
import type { AccountSnapshot } from '../shared/account-sync';
import type { LifecycleResult } from '../shared/account-lifecycle';
import { getLifecycleBackup, accountLifecycleTransports, type User } from './api';
import Modal from './Modal';
import { captureDeviceBackup, type DeviceBackup } from './device-backup';
import {
  attachAccountLifecyclePayload,
  beginAccountLifecycle,
  checkAccountLifecycle,
  dispatchAccountLifecycle,
  getAccountLifecycleRecovery,
  loadAccountLifecycle,
  retryAccountLifecycleLocal,
  stopAccountLifecycle,
  subscribeAccountLifecycle,
  type AccountLifecycleRecord,
} from './account-lifecycle';

export interface LifecycleReview {
  kind: 'reset' | 'replace';
  payload: unknown;
  name?: string;
  count?: number;
}

function download(data: unknown, name: string) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadRecovery(backup: DeviceBackup) {
  download(backup, `cw-companion-device-recovery-${backup.createdAt.slice(0, 10)}.json`);
}

/** Stays mounted while practice owners and page content are fenced/remounted. */
export default function AccountLifecyclePanel({
  user,
  state,
  review,
  onReview,
  notify,
  onComplete,
  onSignIn,
}: {
  user: User;
  state: AccountSnapshot | null;
  review: LifecycleReview | null;
  onReview: (value: LifecycleReview | null) => void;
  notify: (message: string) => void;
  onComplete: () => Promise<unknown>;
  onSignIn: () => void;
}) {
  const [initial] = useState(() => {
    try {
      return { record: loadAccountLifecycle(user.id), error: '' };
    } catch (failure) {
      return { record: null as AccountLifecycleRecord | null, error: (failure as Error).message };
    }
  });
  const [record, setRecord] = useState(initial.record);
  const [policy, setPolicy] = useState<'keep-recovery-files' | 'discard'>('keep-recovery-files');
  const [confirmation, setConfirmation] = useState('');
  const [serverBackup, setServerBackup] = useState<AccountSnapshot | null>(null);
  const [deviceDownloaded, setDeviceDownloaded] = useState(false);
  const [discardRemote, setDiscardRemote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initial.error);
  const [recoveryError, setRecoveryError] = useState('');
  const [inventory, setInventory] = useState<DeviceBackup>();
  const fileInput = useRef<HTMLInputElement>(null);
  const currentUser = useRef(user.id);
  currentUser.current = user.id;
  const currentReview = useRef(review);
  currentReview.current = review;
  const currentState = useRef(state);
  currentState.current = state;
  const busyRef = useRef(false);
  const readRecord = () => {
    try {
      return loadAccountLifecycle(user.id);
    } catch (failure) {
      setError((failure as Error).message);
      return null;
    }
  };
  useEffect(() => {
    currentUser.current = user.id;
    setRecord(readRecord());
    const stop = subscribeAccountLifecycle((next, scope) => {
      if (scope === user.id) setRecord(next);
    });
    return () => {
      currentUser.current = '';
      stop();
    };
  }, [user.id]);
  useEffect(() => {
    setConfirmation('');
    setPolicy('keep-recovery-files');
    setServerBackup(null);
    setDeviceDownloaded(false);
    setDiscardRemote(false);
    setRecoveryError('');
    setInventory(undefined);
    if (!review) return;
    setError('');
    try {
      setInventory(captureDeviceBackup(user.id, user.email));
    } catch (failure) {
      setRecoveryError((failure as Error).message);
    }
  }, [review, user.id, user.email]);

  useEffect(() => {
    // Once admitted, the immutable request owns recovery. Its own successful
    // generation change must not produce a stale-download warning afterward.
    if (!review || record || busy) return;
    if (
      serverBackup &&
      state &&
      (state.accountId !== serverBackup.accountId ||
        state.generation !== serverBackup.generation ||
        state.revision > serverBackup.revision ||
        (state.historyRevision ?? 0) > (serverBackup.historyRevision ?? 0))
    ) {
      setServerBackup(null);
      setError(
        'Your server data changed after the download. Download a fresh server backup before continuing.',
      );
    }
  }, [state, serverBackup, review, record, busy]);

  const transports = () => accountLifecycleTransports(user);
  const reportResult = async (
    result: LifecycleResult | undefined,
    kind = record?.identity.kind,
  ) => {
    if (currentUser.current !== user.id) return;
    const remaining = readRecord();
    setRecord(remaining);
    if (result?.outcome === 'canceled' || (!remaining && record?.phase === 'canceled')) {
      // A safely stopped request is a new review, never permission to erase a
      // newer server snapshot using files downloaded for the original request.
      setServerBackup(null);
      setDeviceDownloaded(false);
      const generation = result?.state.generation ?? record?.resultGeneration;
      const originalGeneration = result?.identity.generation ?? record?.identity.generation;
      const changedElsewhere =
        generation !== undefined &&
        originalGeneration !== undefined &&
        generation > originalGeneration;
      if (changedElsewhere) onReview(null);
      notify(
        changedElsewhere
          ? 'Request stopped safely. The server log changed elsewhere; old waiting work cannot upload into it.'
          : 'Request stopped safely. Your original account data and waiting work are available.',
      );
    } else if (
      result?.outcome === 'applied' ||
      (!remaining && ['applied', 'remote'].includes(record?.phase ?? ''))
    ) {
      setServerBackup(null);
      setError('');
      onReview(null);
      notify(
        record?.phase === 'remote'
          ? 'The current server log is ready.'
          : kind === 'replace'
            ? 'Replacement imported. Old waiting work cannot upload into this log.'
            : 'Practice data reset. Old waiting work cannot return to this log.',
      );
      try {
        await onComplete();
      } catch (failure) {
        setError(
          `The server change succeeded. Refresh could not finish: ${(failure as Error).message}`,
        );
      }
    }
  };
  const act = async (action: () => Promise<LifecycleResult | undefined>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await reportResult(await action());
    } catch (failure) {
      if (currentUser.current === user.id) setError((failure as Error).message);
    } finally {
      busyRef.current = false;
      if (currentUser.current === user.id) {
        setBusy(false);
        setRecord(readRecord());
      }
    }
  };
  const exportServer = async () => {
    if (busyRef.current) return;
    const requestedReview = review;
    setError('');
    setBusy(true);
    busyRef.current = true;
    try {
      const backup = await getLifecycleBackup(user);
      if (currentUser.current !== user.id || currentReview.current !== requestedReview) return;
      const known = currentState.current;
      if (
        known &&
        (known.accountId !== backup.state.accountId ||
          known.generation > backup.state.generation ||
          known.revision > backup.state.revision ||
          (known.historyRevision ?? 0) > backup.state.historyRevision!)
      )
        throw new Error(
          'Your server data changed during the download. Download a fresh server backup before continuing.',
        );
      download(
        backup.data,
        `cw-academy-before-${review?.kind ?? record?.identity.kind ?? 'change'}.json`,
      );
      setServerBackup(backup.state);
      // Refresh confirmed authority so a newer download can be reviewed, and
      // changes committed while it was downloading invalidate its permission.
      await onComplete();
    } catch (failure) {
      if (currentUser.current === user.id && currentReview.current === requestedReview) {
        setServerBackup(null);
        setError((failure as Error).message);
      }
    } finally {
      busyRef.current = false;
      if (currentUser.current === user.id) setBusy(false);
    }
  };
  const exportDevice = () => {
    try {
      const backup = record
        ? getAccountLifecycleRecovery(user.id)
        : captureDeviceBackup(user.id, user.email);
      if (!backup)
        throw new Error(
          'The device recovery file could not be read. Resolve storage before continuing.',
        );
      downloadRecovery(backup);
      setInventory(backup);
      setDeviceDownloaded(true);
      setRecoveryError('');
    } catch (failure) {
      setRecoveryError((failure as Error).message);
    }
  };
  const begin = async () => {
    if (!review || !state || state.accountId !== user.id || busyRef.current) return;
    const requested = review;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      const reviewedState =
        policy === 'keep-recovery-files' ? serverBackup : await transports().refresh!();
      if (!reviewedState) throw new Error('Download a fresh server backup before continuing.');
      if (currentUser.current !== user.id || currentReview.current !== requested) return;
      await beginAccountLifecycle({
        user,
        state: reviewedState,
        kind: requested.kind,
        payload: requested.payload,
        policy,
      });
      if (currentUser.current !== user.id) return;
      // Download the exact fenced snapshot too: it includes work that arrived
      // after the review's first recovery download.
      if (policy === 'keep-recovery-files') {
        const recovery = getAccountLifecycleRecovery(user.id);
        if (!recovery)
          throw new Error(
            'Device recovery could not be read. The request is paused before sending.',
          );
        downloadRecovery(recovery);
      }
      await reportResult(await dispatchAccountLifecycle(user, transports()), requested.kind);
    } catch (failure) {
      if (currentUser.current === user.id) setError((failure as Error).message);
    } finally {
      busyRef.current = false;
      if (currentUser.current === user.id) {
        setBusy(false);
        setRecord(readRecord());
      }
    }
  };
  const attachFile = async (file?: File) => {
    if (!file || !record) return;
    setError('');
    try {
      if (file.size > 8 * 1024 * 1024)
        throw new Error('Choose the original JSON backup smaller than 8 MB.');
      await attachAccountLifecyclePayload(user.id, {
        mode: 'replace',
        data: JSON.parse(await file.text()),
      });
      notify('The original replacement file matches. You can retry the same request.');
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };
  const reset = review?.kind === 'reset';
  const remoteChanged =
    record?.phase === 'remote' && (record.resultGeneration ?? 0) > record.identity.generation;
  const canContinue =
    !!state &&
    (!reset || confirmation === 'RESET') &&
    (policy === 'discard' ||
      (serverBackup &&
        serverBackup.accountId === state.accountId &&
        serverBackup.generation === state.generation &&
        serverBackup.revision === state.revision &&
        serverBackup.historyRevision === state.historyRevision &&
        deviceDownloaded &&
        !recoveryError));
  return (
    <>
      {(record || (!review && error)) && (
        <section className="alert lifecycle-status" aria-label="Account data change">
          {record && (
            <>
              <p role="status">
                <strong>
                  {record.phase === 'applied'
                    ? 'The server change succeeded; device cleanup is pending.'
                    : record.phase === 'remote'
                      ? remoteChanged
                        ? 'Your server data changed on another page or device.'
                        : 'Device work needs recovery review.'
                      : record.phase === 'canceled'
                        ? 'The request stopped safely; device recovery is pending.'
                        : record.phase === 'prepared'
                          ? 'Your account work is paused before this request is sent.'
                          : 'The server outcome has not been confirmed.'}
                </strong>{' '}
                Practice and uploads for {user.email} stay paused until this boundary is resolved.
              </p>
              <p>
                {record.counts.practice} waiting results · {record.counts.accountOperations} account
                edits · {record.counts.scratchpads} notes · {record.counts.copyDraft} Copy drafts
              </p>
              {record.error && <p>{record.error}</p>}
              {record.phase === 'remote' && (
                <>
                  <p>
                    Download the old device work or choose to discard it before using the current
                    server log. This removes it from the active workspace.
                  </p>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={discardRemote}
                      onChange={(event) => setDiscardRemote(event.target.checked)}
                      disabled={busy}
                    />{' '}
                    Discard old device work without a recovery file
                  </label>
                </>
              )}
              <div className="lifecycle-actions">
                <button className="button outline small" onClick={exportDevice} disabled={busy}>
                  <Download size={15} /> Download device recovery
                </button>
                {['prepared', 'unknown'].includes(record.phase) && (
                  <>
                    <button
                      className="button outline small"
                      onClick={() => void act(() => checkAccountLifecycle(user, transports()))}
                      disabled={busy}
                    >
                      Check outcome
                    </button>
                    <button
                      className="button outline small"
                      onClick={() => void act(() => dispatchAccountLifecycle(user, transports()))}
                      disabled={busy}
                    >
                      Retry exact request
                    </button>
                    <button
                      className="button outline small"
                      onClick={() => void act(() => stopAccountLifecycle(user, transports()))}
                      disabled={busy}
                    >
                      Stop request safely
                    </button>
                    {record.identity.kind === 'replace' && (
                      <button
                        className="button outline small"
                        onClick={() => fileInput.current?.click()}
                        disabled={busy}
                      >
                        Choose original replacement file
                      </button>
                    )}
                  </>
                )}
                {['applied', 'canceled', 'remote'].includes(record.phase) && (
                  <button
                    className="button outline small"
                    onClick={() =>
                      void act(() =>
                        retryAccountLifecycleLocal(
                          user,
                          transports(),
                          record.phase === 'remote'
                            ? deviceDownloaded
                              ? 'keep-recovery-files'
                              : 'discard'
                            : undefined,
                        ),
                      )
                    }
                    disabled={
                      busy || (record.phase === 'remote' && !deviceDownloaded && !discardRemote)
                    }
                  >
                    {record.phase === 'remote'
                      ? 'Use current server log'
                      : 'Finish device recovery'}
                  </button>
                )}
                <button className="text-button" onClick={onSignIn} disabled={busy}>
                  Verify this account’s sign-in
                </button>
              </div>
              <details>
                <summary>Request identity</summary>
                <p className="lifecycle-request-id">{record.identity.id}</p>
              </details>
            </>
          )}
          {busy && <p role="status">Checking this account’s request…</p>}
          {error && <p role="alert">{error}</p>}
          {recoveryError && <p role="alert">{recoveryError}</p>}
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-label="Original replacement backup"
            onChange={(event) => void attachFile(event.target.files?.[0])}
          />
        </section>
      )}
      {review && !record && (
        <Modal
          title={reset ? 'Start with a fresh page?' : 'Replace your practice data?'}
          onClose={() => {
            if (!busyRef.current) onReview(null);
          }}
        >
          <p className="modal-intro">
            Only <strong>{user.email}</strong> is affected.{' '}
            {reset ? (
              'Delete this account’s practice sessions, private plan, imported archive, and course preferences.'
            ) : (
              <>
                Replace this account’s sessions, private plan, imported archive, and course
                preferences using <strong>{review.name}</strong> ({review.count} records).
              </>
            )}{' '}
            Your account and passkeys stay active.
          </p>
          <p>
            Old waiting results, edits, notes, and Copy drafts will leave the active device
            workspace after success. They will never upload into the new log. Other accounts, Guest
            work, and shared practice preferences stay available.
          </p>
          {inventory && (
            <p>
              {inventory.stores.practice.length} waiting results ·{' '}
              {inventory.stores.accountOperations.length} account edits ·{' '}
              {inventory.stores.scratchpads.length} notes · {inventory.stores.copyDraft ? 1 : 0}{' '}
              Copy drafts
            </p>
          )}
          <fieldset className="lifecycle-policy" disabled={busy}>
            <legend>Choose how to recover your old work</legend>
            <label className="import-choice">
              <input
                type="radio"
                name="recovery-policy"
                checked={policy === 'keep-recovery-files'}
                onChange={() => setPolicy('keep-recovery-files')}
              />
              <span>
                <strong>Keep recovery files</strong>
                <small>
                  Download both backups before continuing. A refreshed device recovery file
                  downloads when the request starts. Keep these private files safely.
                </small>
              </span>
            </label>
            <label className="import-choice">
              <input
                type="radio"
                name="recovery-policy"
                checked={policy === 'discard'}
                onChange={() => setPolicy('discard')}
              />
              <span>
                <strong>Discard old waiting work</strong>
                <small>
                  Remove this account’s old device work after success. Without backups, it cannot be
                  recovered.
                </small>
              </span>
            </label>
          </fieldset>
          <div className="lifecycle-actions">
            <button
              className="button outline small"
              disabled={busy}
              onClick={() => void exportServer()}
            >
              <Download size={15} />{' '}
              {serverBackup ? 'Download server backup again' : 'Download server backup'}
            </button>
            <button className="button outline small" disabled={busy} onClick={exportDevice}>
              <Download size={15} />{' '}
              {deviceDownloaded ? 'Download device backup again' : 'Download device backup'}
            </button>
          </div>
          {reset && (
            <label className="field">
              Type RESET to continue
              <input
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="RESET"
                disabled={busy}
              />
            </label>
          )}
          {!state && <p role="alert">Refresh this account before starting the request.</p>}
          {recoveryError && <p role="alert">{recoveryError}</p>}
          {error && <p role="alert">{error}</p>}
          <div className="modal-actions">
            <button className="button outline" disabled={busy} onClick={() => onReview(null)}>
              Keep my data
            </button>
            <button
              className="button danger"
              disabled={busy || !canContinue}
              onClick={() => void begin()}
            >
              <RotateCcw size={15} />{' '}
              {busy ? 'Starting request…' : reset ? 'Reset practice data' : 'Replace and import'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
