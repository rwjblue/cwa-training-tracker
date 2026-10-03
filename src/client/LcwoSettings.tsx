import { useEffect, useRef, useState, type FormEvent } from 'react';
import Modal from './Modal';
import type { LcwoController } from './useLcwoData';
import { LCWO_EXPORT_TYPES } from '../shared/lcwo';
import './lcwo.css';

export default function LcwoSettings({
  source,
  onChanged,
}: {
  source: LcwoController;
  onChanged: () => Promise<unknown>;
}) {
  const [dialog, setDialog] = useState<'link' | 'refresh' | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(String(source.data?.estimateSeconds ?? 0));
  const controller = useRef<AbortController | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!dialog && !busy && !source.loading && restoreFocus.current) {
      restoreFocus.current = false;
      opener.current?.focus();
    }
  }, [dialog, busy, source.loading]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    setSeconds(String(source.data?.estimateSeconds ?? 0));
  }, [source.data?.estimateSeconds]);
  async function submit(body: Record<string, unknown>) {
    if (busy) return;
    const flight = new AbortController();
    controller.current = flight;
    setBusy(true);
    setError('');
    setMessage('');
    const timeout = setTimeout(() => flight.abort(), 50_000);
    try {
      const imported = await source.change(body, flight.signal);
      if (!mounted.current) return;
      setDialog(null);
      setMessage(
        body.action === 'disconnect'
          ? 'Disconnected. Retained results remain available.'
          : body.action === 'estimate'
            ? 'Estimate preference saved. Totals are recalculated against logged blocks.'
            : `Refresh saved: ${imported} new source results. Previously retained results are preserved.`,
      );
      await onChanged();
    } catch (failure) {
      if (!mounted.current) return;
      setError(
        flight.signal.aborted
          ? 'Request interrupted; it may already have saved. Check retained history before retrying with fresh credentials.'
          : failure instanceof Error
            ? failure.message
            : 'LCWO could not be refreshed. Check retained history before retrying.',
      );
      await onChanged().catch(() => {});
      await source.refresh();
    } finally {
      clearTimeout(timeout);
      if (mounted.current) setBusy(false);
      if (controller.current === flight) controller.current = null;
    }
  }
  const close = () => {
    controller.current?.abort();
    setDialog(null);
  };
  const data = source.data;
  return (
    <section className="card lcwo-settings" aria-label="Optional LCWO account link">
      <h2>Optional LCWO account link</h2>
      <p>
        Refresh your own LCWO results explicitly. Your password and temporary LCWO session are used
        for one request and discarded. They are never stored in your account, device queues,
        backups, or URLs. Native Copy remains your assignment tool.
      </p>
      {source.loading && <p role="status">Loading retained LCWO history…</p>}
      {(error || source.error) && (
        <p className="alert error" role="alert">
          {error || source.error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {data ? (
        <>
          <p>
            <strong>
              {data.connected ? 'Linked' : 'Disconnected'}: {data.identity.username}
            </strong>{' '}
            · Source account {data.identity.sourceUserId ?? 'unknown until a result is exported'}
          </p>
          <p>
            Last successful refresh: {data.syncedAt ?? 'not recorded'}. {data.runs.length} retained
            results.
          </p>
          <ul>
            {LCWO_EXPORT_TYPES.map((type) => (
              <li key={type}>
                {type === 'koch' ? 'Koch lessons' : type}:{' '}
                {data.runs.filter((run) => run.sourceType === type).length}
              </li>
            ))}
          </ul>
          {Boolean(data.skippedMixed) && (
            <p>
              {data.skippedMixed} mixed-group rows omitted because this source mode is not
              supported.
            </p>
          )}
          <p>
            Disconnect keeps history and preferences. Another LCWO identity requires a separate
            Companion account, or an exported backup followed by an explicit account reset.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit({ action: 'estimate', seconds: Number(seconds) });
            }}
          >
            <label className="field">
              Estimated seconds per completed code-group result
              <input
                type="number"
                min="0"
                max="300"
                step="1"
                required
                value={seconds}
                onChange={(event) => setSeconds(event.target.value)}
              />
            </label>
            <p>
              0 disables extra time. Up to 300 seconds is an explicit assumption, not measured
              listening. Matching logged blocks suppress extra estimates. Words, callsigns, and Koch
              retain unknown duration.
            </p>
            <button className="button outline" disabled={busy}>
              Save estimate preference
            </button>
          </form>
        </>
      ) : (
        <p>No LCWO identity linked. Linking is optional and does not affect public practice.</p>
      )}
      <div className="lcwo-actions">
        <button
          ref={opener}
          className="button outline"
          disabled={busy || source.loading}
          onClick={() => {
            restoreFocus.current = true;
            setError('');
            setMessage('');
            setDialog(data?.connected ? 'refresh' : 'link');
          }}
        >
          {data?.connected
            ? 'Refresh LCWO results'
            : data
              ? 'Link LCWO again'
              : 'Link LCWO account'}
        </button>
        {data?.connected && (
          <button
            className="button outline"
            disabled={busy}
            onClick={() => void submit({ action: 'disconnect' })}
          >
            Disconnect LCWO
          </button>
        )}
        <button className="text-button" disabled={busy} onClick={() => void source.refresh()}>
          Check retained LCWO history
        </button>
      </div>
      {busy && (
        <p role="status">
          Request in progress.{' '}
          <button className="text-button" onClick={() => controller.current?.abort()}>
            Cancel LCWO request
          </button>
        </p>
      )}
      {dialog && (
        <CredentialsDialog
          key={dialog}
          action={dialog}
          identity={data?.identity.username}
          busy={busy}
          error={error}
          onClose={close}
          onSubmit={submit}
        />
      )}
    </section>
  );
}
function CredentialsDialog({
  action,
  identity,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  action: 'link' | 'refresh';
  identity?: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const username = useRef<HTMLInputElement>(null),
    password = useRef<HTMLInputElement>(null);
  const [consent, setConsent] = useState(false);
  useEffect(
    () => () => {
      if (password.current) password.current.value = '';
    },
    [],
  );
  const close = () => {
    if (password.current) password.current.value = '';
    onClose();
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !consent) return;
    const body = {
      action,
      consent: true,
      username: username.current?.value ?? '',
      password: password.current?.value ?? '',
    };
    if (password.current) password.current.value = '';
    void onSubmit(body);
  }
  return (
    <Modal
      title={action === 'link' ? 'Link your LCWO account' : 'Refresh your LCWO results'}
      onClose={close}
    >
      <p>
        Sign in to{' '}
        <a href="https://lcwo.net/" target="_blank" rel="noreferrer">
          LCWO
        </a>{' '}
        for this request only. Companion will retain your verified source identity, completion
        timestamps and trainer measurements privately. No background refresh or saved password.
      </p>
      {identity && (
        <p>
          Retained identity: <strong>{identity}</strong>. A different identity will be rejected.
        </p>
      )}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      <form onSubmit={submit}>
        <label className="field">
          LCWO username
          <input
            ref={username}
            defaultValue={identity ?? ''}
            required
            pattern="[A-Za-z0-9]{1,24}"
            maxLength={24}
            autoComplete="off"
            disabled={busy}
          />
        </label>
        <label className="field">
          LCWO password
          <input
            ref={password}
            type="password"
            required
            maxLength={1024}
            autoComplete="off"
            disabled={busy}
          />
        </label>
        <label className="lcwo-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            disabled={busy}
          />
          I consent to one LCWO sign-in and private retention of this source account’s results.
        </label>
        <div className="modal-actions">
          <button className="button outline" type="button" onClick={close}>
            Cancel
          </button>
          <button className="button dark" disabled={busy || !consent}>
            {busy ? 'Refreshing…' : action === 'link' ? 'Link and refresh LCWO' : 'Refresh now'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
