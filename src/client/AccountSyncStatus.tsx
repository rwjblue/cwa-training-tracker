import { useState } from 'react';
import { validateRecordingMarkSet, recordingMarkSetDetails } from '../shared/recording-marks';
import type { AccountChange, AccountSnapshot } from '../shared/account-sync';
import type { QueuedAccountOperation } from './account-outbox';

const preferenceLabels: Record<string, string> = {
  displayName: 'Name',
  callsign: 'Callsign',
  level: 'Course level',
  timezone: 'Time zone',
  dailyGoalMinutes: 'Daily practice goal',
  firstClassDate: 'First class date',
  classDays: 'Class meeting days',
  useGravatar: 'Gravatar',
};
const valueLabel = (value: unknown) =>
  value === undefined || value === null || value === ''
    ? 'None'
    : Array.isArray(value)
      ? value.join(', ')
      : typeof value === 'boolean'
        ? value
          ? 'Yes'
          : 'No'
        : String(value);
const taskValueLabel = (key: string, value: unknown) => {
  if (key !== 'recordingMarks') return valueLabel(value);
  if (!Array.isArray(value) || !value.length) return 'None';
  return value.map(validateRecordingMarkSet).map(recordingMarkSetDetails).join(' / ');
};
function title(change: AccountChange, state?: AccountSnapshot): string {
  if (change.type === 'settings') return 'Practice preferences';
  if (change.type === 'task-create') return `Add ${change.task.title}`;
  if (change.type === 'task-status')
    return `${change.done === undefined ? 'Today visibility' : change.done ? 'Complete' : 'Reopen'} ${change.ids.length === 1 ? (state?.plan.find((task) => task.id === change.ids[0])?.title ?? 'exercise') : `${change.ids.length} exercises`}`;
  return `${change.type === 'task-delete' ? 'Delete' : 'Edit'} ${state?.plan.find((task) => task.id === change.id)?.title ?? 'exercise'}`;
}
function comparisons(change: AccountChange, state: AccountSnapshot): string[] {
  if (change.type === 'settings')
    return Object.entries(change.changes).map(
      ([key, value]) =>
        `${preferenceLabels[key] ?? key}: saved online ${valueLabel(state.settings[key as keyof typeof state.settings])}; your edit ${valueLabel(value)}.`,
    );
  if (change.type === 'task-edit') {
    const task = state.plan.find((task) => task.id === change.id);
    if (!task) return ['This exercise is no longer in the online plan.'];
    return Object.entries(change.changes).map(
      ([key, value]) =>
        `${key === 'targetMinutes' ? 'Suggested minutes' : key === 'recordingMarks' ? 'Difficult recording marks' : key}: saved online ${taskValueLabel(key, task[key as keyof typeof task])}; your edit ${taskValueLabel(key, value)}.`,
    );
  }
  if (change.type === 'task-create')
    return [
      `Your exercise: ${change.task.title}, ${change.task.kind}${change.task.notes ? ` — ${change.task.notes}` : ''}.`,
    ];
  const ids = change.type === 'task-status' ? change.ids : [change.id];
  return ids.map((id) => {
    const task = state.plan.find((task) => task.id === id);
    return task
      ? `${task.title}: online ${task.done ? 'complete' : 'incomplete'}${task.dismissedFromToday ? ', dismissed from Today' : ''}; your edit ${change.type === 'task-delete' ? 'delete' : [change.done === undefined ? '' : change.done ? 'complete' : 'incomplete', change.dismissedFromToday === undefined ? '' : change.dismissedFromToday ? 'dismiss from Today' : 'restore to Today'].filter(Boolean).join(', ')}.`
      : 'This exercise is no longer in the online plan.';
  });
}
export default function AccountSyncStatus({
  operations,
  confirmed,
  cachedIdentity,
  onRetry,
  onResolve,
  onSignIn,
}: {
  operations: QueuedAccountOperation[];
  confirmed?: AccountSnapshot;
  cachedIdentity: boolean;
  onRetry: () => Promise<unknown>;
  onResolve: (id: string, resolution: 'discard' | 'reapply') => Promise<unknown>;
  onSignIn: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!cachedIdentity && !operations.length) return null;
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="account-sync-status alert" aria-label="Account sync status">
      {cachedIdentity && (
        <p>
          You’re using this account’s saved device data. Reconnect or sign in to confirm access and
          upload pending work.
        </p>
      )}
      {!!operations.length && (
        <>
          <p role="status">
            <strong>
              {operations.length} account {operations.length === 1 ? 'edit' : 'edits'} saved on this
              device.
            </strong>{' '}
            Waiting to sync. Your plan and preferences include these edits.
          </p>
          <button
            className="button outline small"
            disabled={busy}
            onClick={() => void run(onRetry)}
          >
            Retry account sync
          </button>
          {operations.some((item) => item.failure === 'auth') && (
            <button className="button outline small" onClick={onSignIn}>
              Sign in to upload
            </button>
          )}
          <ul>
            {operations.map((item) => (
              <li key={item.operation.id}>
                <strong>{title(item.operation.change, confirmed)}</strong> —{' '}
                {item.status === 'conflict'
                  ? 'Conflicted'
                  : item.status === 'failed'
                    ? 'Upload failed'
                    : 'Pending'}
                {item.error && <p>{item.error}</p>}
                {(item.status === 'conflict' || item.failure === 'permanent') && confirmed && (
                  <details open>
                    <summary>Compare your edit with the saved online version</summary>
                    <ul>
                      {comparisons(item.operation.change, confirmed).map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                    </ul>
                    <div className="sync-actions">
                      <button
                        className="button outline small"
                        disabled={busy}
                        onClick={() => void run(() => onResolve(item.operation.id, 'discard'))}
                      >
                        Keep online version
                      </button>
                      <button
                        className="button dark small"
                        disabled={busy}
                        onClick={() => void run(() => onResolve(item.operation.id, 'reapply'))}
                      >
                        Apply my edit to this version
                      </button>
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
