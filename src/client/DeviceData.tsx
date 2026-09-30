import { useEffect, useRef, useState } from 'react';
import { Download, RotateCcw, Upload } from 'lucide-react';
import Modal from './Modal';
import {
  captureDeviceBackup,
  clearDeviceWork,
  DeviceMutationError,
  inspectDeviceRestore,
  MAX_DEVICE_BACKUP_BYTES,
  restoreDeviceBackup,
  summarizeDeviceBackup,
  validateDeviceBackup,
  type DeviceBackup,
} from './device-backup';
import { getDeviceScopeState, subscribeDeviceScope } from './device-scope';

function downloadBackup(backup: DeviceBackup) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `cw-companion-device-${backup.scope.id === 'guest' ? 'guest' : 'account'}-${backup.createdAt.slice(0, 10)}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Inventory({ backup }: { backup: DeviceBackup }) {
  const items = summarizeDeviceBackup(backup);
  return (
    <div className="device-inventory">
      {[false, true].map((shared) => (
        <section
          key={String(shared)}
          aria-label={shared ? 'Shared device preferences' : 'Scoped device work'}
        >
          <h3>
            {shared ? 'Shared by every account on this device' : 'Only this account or guest scope'}
          </h3>
          <dl>
            {items
              .filter((item) => item.shared === shared)
              .map((item) => (
                <div key={item.id}>
                  <dt>{item.label}</dt>
                  <dd>{item.count}</dd>
                </div>
              ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function RequestIdentities({
  practice,
  accountOperations,
}: {
  practice: string[];
  accountOperations: string[];
}) {
  const ids = [
    ...practice.map((id) => `Practice: ${id}`),
    ...accountOperations.map((id) => `Account edit: ${id}`),
  ];
  if (!ids.length) return null;
  return (
    <details className="device-request-identities">
      <summary>Request identities with an uncertain server outcome ({ids.length})</summary>
      <ul>
        {ids.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
    </details>
  );
}

export default function DeviceData({
  scope,
  label,
  onClose,
}: {
  scope: string;
  label: string;
  onClose: () => void;
}) {
  const [backup, setBackup] = useState<DeviceBackup>();
  const [restore, setRestore] = useState<{ name: string; backup: DeviceBackup }>();
  const [restoreShared, setRestoreShared] = useState(false);
  const [replaceCopy, setReplaceCopy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [recovery, setRecovery] = useState<DeviceBackup>();
  const [uncertain, setUncertain] = useState({
    practice: [] as string[],
    accountOperations: [] as string[],
  });
  const [busy, setBusy] = useState(false);
  const [interrupted, setInterrupted] = useState(() => getDeviceScopeState(scope).mutating);
  const [closedOtherPages, setClosedOtherPages] = useState(false);
  const [retryRecovery, setRetryRecovery] = useState<(() => void) | undefined>();
  const busyRef = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const close = () => {
    if (!busyRef.current) onClose();
  };
  const refresh = () => {
    try {
      const captured = captureDeviceBackup(scope, label);
      setBackup(captured);
      return captured;
    } catch (failure) {
      setBackup(undefined);
      setError(
        failure instanceof Error ? failure.message : 'Device work could not be read. Try again.',
      );
    }
  };
  useEffect(() => {
    refresh();
  }, [scope]);
  useEffect(
    () =>
      subscribeDeviceScope((state) => {
        if (state.scope !== scope) return;
        setInterrupted(state.mutating);
        if (!state.mutating) {
          setClosedOtherPages(false);
          refresh();
        }
      }),
    [scope],
  );
  const download = () => {
    setError('');
    const captured = refresh();
    if (!captured) return;
    downloadBackup(captured);
    setMessage('Device backup downloaded. Keep this private file somewhere you can find it.');
  };
  const chooseFile = async (file?: File) => {
    if (!file) return;
    setError('');
    setMessage('');
    setRestore(undefined);
    try {
      if (file.size > MAX_DEVICE_BACKUP_BYTES)
        throw new Error('Choose a device backup no larger than 16 MB.');
      const decoded = validateDeviceBackup(await file.text(), scope);
      setRestore({ name: file.name, backup: decoded });
      setRestoreShared(false);
      setReplaceCopy(false);
      setConfirmClear(false);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'This device backup could not be read. Choose another file.',
      );
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };
  let inspection: ReturnType<typeof inspectDeviceRestore> | undefined;
  let inspectionError = '';
  if (restore) {
    try {
      inspection = inspectDeviceRestore(restore.backup, {
        restoreSharedPreferences: restoreShared,
        replaceCopyDraft: replaceCopy,
      });
    } catch (failure) {
      inspectionError =
        failure instanceof Error
          ? failure.message
          : 'The restore cannot be prepared. Try reading the file again.';
    }
  }
  const mutate = (action: 'restore' | 'clear') => {
    if (busyRef.current || (interrupted && !closedOtherPages)) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result =
        action === 'restore' && restore
          ? restoreDeviceBackup(restore.backup, {
              restoreSharedPreferences: restoreShared,
              replaceCopyDraft: replaceCopy,
              recoverInterrupted: interrupted && closedOtherPages,
            })
          : clearDeviceWork(scope, { recoverInterrupted: interrupted && closedOtherPages });
      setUncertain(result.uncertain);
      setRecovery(undefined);
      setRetryRecovery(undefined);
      setRestore(undefined);
      setConfirmClear(false);
      setMessage(
        action === 'clear'
          ? `Device work cleared for ${label}. Other accounts, shared preferences and confirmed account history are retained.`
          : `Device work restored for ${label}.${result.retainedScratchpads ? ` ${result.retainedScratchpads} newer scratchpads were kept.` : ''} Pending work keeps its original save identities.`,
      );
      refresh();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Device work could not be updated. Try again.',
      );
      if (failure instanceof DeviceMutationError) {
        if (failure.recovery) setRecovery(failure.recovery);
        const recoverOriginal = failure.retryRecovery;
        if (failure.rollbackFailed && recoverOriginal)
          setRetryRecovery(() => () => {
            try {
              const result = recoverOriginal();
              setUncertain(result.uncertain);
              setError('');
              setRetryRecovery(undefined);
              setRecovery(undefined);
              setMessage('Original device work restored. The interrupted update was rolled back.');
              refresh();
            } catch (retryFailure) {
              setError(
                retryFailure instanceof Error
                  ? retryFailure.message
                  : 'Recovery could not finish. Enable browser storage and try again.',
              );
            }
          });
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal title="This device" onClose={close} wide>
      <div className="device-data">
        <p className="modal-intro">
          Selected scope: <strong>{label}</strong>
          {scope !== 'guest' && <span className="device-scope-id">Account ID: {scope}</span>}
        </p>
        <p>
          A device backup keeps finished pending saves, queued account edits, copy drafts,
          scratchpads and retained preferences. Account backup keeps confirmed server history, your
          plan and preserved imports; download it separately from Your account.
        </p>
        <p className="field-hint">
          Device backups contain private training work. They contain no sign-in credentials. Active
          elapsed time from other practice tools is not backed up.
        </p>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="alert" role="status">
            {message}
          </p>
        )}
        {interrupted && (
          <section className="alert" aria-label="Interrupted device update">
            <p>
              An earlier device update has not finished. Practice and uploads remain paused. Try
              restoring the original work below. After reopening the app, restore a valid device
              backup or deliberately clear this scope’s retained work.
            </p>
            <p>
              Close other Companion pages for this scope before taking over recovery, so they cannot
              continue the earlier update.
            </p>
            <label className="device-choice">
              <input
                type="checkbox"
                checked={closedOtherPages}
                onChange={(event) => setClosedOtherPages(event.target.checked)}
              />{' '}
              I closed other Companion pages for this scope
            </label>
          </section>
        )}
        {recovery && (
          <button className="button outline" onClick={() => downloadBackup(recovery)}>
            <Download size={16} /> Download recovery backup
          </button>
        )}
        {retryRecovery && (
          <button className="button outline" disabled={busy} onClick={retryRecovery}>
            Retry restoring original device work
          </button>
        )}
        <RequestIdentities {...uncertain} />
        {uncertain.practice.length + uncertain.accountOperations.length > 0 && (
          <p className="field-hint">
            These requests may already have reached your account. Clearing this device stops retries
            and local acknowledgements; it cannot erase a server write that already committed.
            Refresh confirmed account history to check.
          </p>
        )}
        {restore ? (
          <section aria-label="Review device restore" className="device-restore-review">
            <h3>Review {restore.name}</h3>
            <p>
              Scope: <strong>{restore.backup.scope.label}</strong>. Exported{' '}
              {new Date(restore.backup.createdAt).toLocaleString()}.
            </p>
            <Inventory backup={restore.backup} />
            <label className="device-choice">
              <input
                type="checkbox"
                checked={restoreShared}
                onChange={(event) => setRestoreShared(event.target.checked)}
              />{' '}
              Also restore shared device preferences used by every account
            </label>
            {inspection?.replaceCopyDraftRequired && (
              <label className="device-choice">
                <input
                  type="checkbox"
                  checked={replaceCopy}
                  onChange={(event) => setReplaceCopy(event.target.checked)}
                />{' '}
                Replace the current copy draft with the draft in this backup
              </label>
            )}
            {!!inspection?.retainedScratchpads && (
              <p>
                {inspection.retainedScratchpads} existing scratchpads differ; your current notes
                will be kept.
              </p>
            )}
            {!!inspection?.conflicts.length && (
              <div className="alert error" role="alert">
                <p>
                  Some saved identities already hold different work. Nothing will be restored. Keep
                  your current work or choose a matching backup.
                </p>
                <ul>
                  {inspection.conflicts.slice(0, 20).map((conflict) => (
                    <li key={conflict}>{conflict}</li>
                  ))}
                </ul>
              </div>
            )}
            {inspectionError && (
              <p className="alert error" role="alert">
                {inspectionError}
              </p>
            )}
            <div className="device-actions">
              <button
                className="button dark"
                disabled={
                  busy ||
                  (interrupted && !closedOtherPages) ||
                  !inspection ||
                  !!inspection.conflicts.length ||
                  (inspection.replaceCopyDraftRequired && !replaceCopy)
                }
                onClick={() => mutate('restore')}
              >
                <Upload size={16} /> Restore device work
              </button>
              <button
                className="button outline"
                disabled={busy}
                onClick={() => {
                  setRestore(undefined);
                  setError('');
                }}
              >
                Cancel restore
              </button>
            </div>
          </section>
        ) : confirmClear ? (
          <section aria-label="Confirm local clear" className="device-clear-review">
            <h3>Clear device work for {label}?</h3>
            <p>
              This stops affected practice and removes this scope’s drafts, scratchpads and pending
              retries. Confirmed account history, other account scopes and shared preferences stay.
            </p>
            {scope !== 'guest' && (
              <p>
                Previously sent requests may already be stored on the server even when their
                acknowledgement is missing. Local clear cannot remove those records.
              </p>
            )}
            <p>Download a device backup first if you want to recover this work.</p>
            <div className="device-actions">
              <button className="button outline" disabled={busy} onClick={download}>
                <Download size={16} /> Download device backup
              </button>
              <button
                className="button outline danger-text"
                disabled={busy || (interrupted && !closedOtherPages)}
                onClick={() => mutate('clear')}
              >
                Clear device work
              </button>
              <button
                className="button outline"
                disabled={busy}
                onClick={() => setConfirmClear(false)}
              >
                Cancel clear
              </button>
            </div>
          </section>
        ) : (
          <>
            {backup && <Inventory backup={backup} />}
            <p className="field-hint">
              Shared preferences are included in the backup’s separate section. Restore them only if
              you choose; clearing one scope keeps them.
            </p>
            <div className="device-actions">
              <button className="button outline" disabled={busy} onClick={download}>
                <Download size={16} /> Download device backup
              </button>
              <button
                className="button outline"
                disabled={busy}
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={16} /> Choose device backup
              </button>
              <button
                className="button outline danger-text"
                disabled={busy}
                onClick={() => {
                  setError('');
                  setMessage('');
                  refresh();
                  setConfirmClear(true);
                }}
              >
                <RotateCcw size={16} /> Clear local device work
              </button>
              {!backup && (
                <button
                  className="button outline"
                  disabled={busy}
                  onClick={() => {
                    setError('');
                    refresh();
                  }}
                >
                  Try reading device work again
                </button>
              )}
            </div>
          </>
        )}
        <input
          ref={fileInput}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          aria-label="Choose a device backup file"
          tabIndex={-1}
          onChange={(event) => void chooseFile(event.target.files?.[0])}
        />
      </div>
    </Modal>
  );
}
