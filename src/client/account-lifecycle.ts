import { validateAccountSnapshot, type AccountSnapshot } from '../shared/account-sync';
import {
  hashLifecyclePayload,
  validateLifecycleIdentity,
  validateLifecycleResult,
  type LifecycleIdentity,
  type LifecycleKind,
  type LifecycleResult,
} from '../shared/account-lifecycle';
import { ApiError, type User } from './api';
import { loadCopyDraft } from './copy-storage';
import {
  isSelectedAccount,
  loadCachedAccount,
  loadAccountOperations,
  resumeAccountUploads,
  suspendAccountUploads,
} from './account-outbox';
import {
  captureDeviceBackup,
  captureAccountLifecycleDeviceWork,
  prepareAccountLifecycleDeviceWork,
  recoverAccountLifecycleDeviceWork,
  retireAccountLifecycleDeviceWork,
  rollbackAccountLifecycleDevicePreparation,
  type AccountLifecycleDeviceWork,
  type DeviceBackup,
} from './device-backup';
import {
  accountLifecycleKey,
  completeDeviceScopeMutation,
  getDeviceScopeToken,
  hasAccountLifecycleBoundary,
  invalidateDeviceScope,
  notifyDeviceScope,
  requireCurrentDeviceScope,
  rememberAccountLifecycleBoundary,
} from './device-scope';
import {
  loadLocalPractice,
  loadPracticeSaveOrigin,
  resumePracticeUploads,
  suspendPracticeUploads,
} from './practice-autosave';

export const ACCOUNT_LIFECYCLE_EVENT = 'cwa:account-lifecycle';
export type AccountLifecyclePolicy = 'keep-recovery-files' | 'discard';
export interface AccountLifecycleRecord {
  version: 1;
  identity: LifecycleIdentity;
  policy: AccountLifecyclePolicy;
  token: string;
  phase: 'prepared' | 'unknown' | 'applied' | 'canceled' | 'remote';
  counts: { practice: number; accountOperations: number; scratchpads: number; copyDraft: number };
  resultGeneration?: number;
  error?: string;
}
export interface AccountLifecycleTransports {
  /** Reserve cancellation capacity before any destructive request can be admitted. */
  prepare: (identity: LifecycleIdentity) => Promise<LifecycleResult>;
  apply: (identity: LifecycleIdentity, payload: unknown) => Promise<LifecycleResult>;
  lookup: (identity: LifecycleIdentity) => Promise<LifecycleResult>;
  cancel: (identity: LifecycleIdentity) => Promise<LifecycleResult>;
  /** A raw account read: no queue retry, publication, or ready-scope requirement. */
  refresh?: () => Promise<AccountSnapshot>;
}
interface LiveLifecycle {
  record?: AccountLifecycleRecord;
  payload?: unknown;
  device?: AccountLifecycleDeviceWork;
  state?: AccountSnapshot;
  result?: LifecycleResult;
}
const live = new Map<string, LiveLifecycle>();
const running = new Map<string, Promise<LifecycleResult | undefined>>();
type AccountAuthority = Pick<AccountSnapshot, 'generation' | 'revision' | 'historyRevision'>;
const observed = new Map<string, AccountAuthority & { token: string }>();
const integer = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function hasNewerKnownHistory(
  previous: AccountAuthority | undefined,
  current: AccountAuthority,
): boolean {
  return (
    previous?.generation === current.generation &&
    previous.historyRevision !== undefined &&
    current.historyRevision !== undefined &&
    previous.historyRevision > current.historyRevision
  );
}

function validateRecord(value: unknown, scope: string): AccountLifecycleRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid account recovery record.');
  const input = value as AccountLifecycleRecord;
  if (
    Object.keys(input).some(
      (key) =>
        ![
          'version',
          'identity',
          'policy',
          'token',
          'phase',
          'counts',
          'resultGeneration',
          'error',
        ].includes(key),
    ) ||
    input.version !== 1 ||
    !['keep-recovery-files', 'discard'].includes(input.policy) ||
    typeof input.token !== 'string' ||
    !/^[a-zA-Z0-9-]{1,100}$/.test(input.token) ||
    !['prepared', 'unknown', 'applied', 'canceled', 'remote'].includes(input.phase) ||
    !input.counts ||
    Object.keys(input.counts).length !== 4 ||
    !['practice', 'accountOperations', 'scratchpads', 'copyDraft'].every((key) =>
      integer(input.counts[key as keyof typeof input.counts]),
    ) ||
    input.counts.practice > 5000 ||
    input.counts.accountOperations > 1000 ||
    input.counts.scratchpads > 500 ||
    input.counts.copyDraft > 1 ||
    (input.resultGeneration !== undefined && !integer(input.resultGeneration)) ||
    (input.error !== undefined && (typeof input.error !== 'string' || input.error.length > 1000))
  )
    throw new Error(
      'Invalid account recovery record. Keep a device export before repairing browser storage.',
    );
  const identity = validateLifecycleIdentity(input.identity);
  if (identity.accountId !== scope)
    throw new Error('The account recovery belongs to another account.');
  if (
    (['applied', 'canceled', 'remote'].includes(input.phase) &&
      input.resultGeneration === undefined) ||
    (input.phase === 'applied' && input.resultGeneration! <= identity.generation)
  )
    throw new Error('The completed account recovery is missing valid dataset authority.');
  return { ...input, identity };
}

/** Compact runtime authority; neither auth nor replacement file contents are retained here. */
export function loadAccountLifecycle(scope: string): AccountLifecycleRecord | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(accountLifecycleKey(scope));
  } catch {
    return live.get(scope)?.record ?? null;
  }
  if (raw === null) return null;
  if (raw.length > 3000) throw new Error('The account recovery record is too large.');
  return validateRecord(JSON.parse(raw), scope);
}
function changed(scope: string): void {
  window.dispatchEvent(new CustomEvent(ACCOUNT_LIFECYCLE_EVENT, { detail: { scope } }));
}
function persist(record: AccountLifecycleRecord): void {
  const checked = validateRecord(record, record.identity.accountId);
  const raw = JSON.stringify(checked);
  localStorage.setItem(accountLifecycleKey(checked.identity.accountId), raw);
  if (localStorage.getItem(accountLifecycleKey(checked.identity.accountId)) !== raw)
    throw new Error(
      'This browser could not retain account recovery. Enable browser storage or free space, then try again.',
    );
  rememberAccountLifecycleBoundary(checked.identity.accountId, true);
  live.set(checked.identity.accountId, {
    ...live.get(checked.identity.accountId),
    record: checked,
  });
  changed(checked.identity.accountId);
}
function requireOwner(user: User): AccountLifecycleRecord {
  if (!isSelectedAccount(user.id))
    throw new Error('Select and sign in to the account that owns this recovery.');
  const record = loadAccountLifecycle(user.id);
  if (!record) throw new Error('There is no pending account recovery.');
  if (getDeviceScopeToken(user.id) !== record.token)
    throw new Error('Another page changed this recovery. Reopen its current status.');
  return record;
}
function counts(backup: DeviceBackup): AccountLifecycleRecord['counts'] {
  return {
    practice: backup.stores.practice.length,
    accountOperations: backup.stores.accountOperations.length,
    scratchpads: backup.stores.scratchpads.length,
    copyDraft: backup.stores.copyDraft ? 1 : 0,
  };
}

export async function beginAccountLifecycle(options: {
  user: User;
  state: AccountSnapshot;
  kind: LifecycleKind;
  payload: unknown;
  policy: AccountLifecyclePolicy;
}): Promise<AccountLifecycleRecord> {
  const { user, kind, policy } = options;
  const state = validateAccountSnapshot(options.state);
  const oldToken = getDeviceScopeToken(user.id);
  requireCurrentDeviceScope(user.id, oldToken);
  if (state.accountId !== user.id || !isSelectedAccount(user.id))
    throw new Error('Select and sign in to the account whose history will change.');
  const payload = JSON.parse(JSON.stringify(options.payload)) as unknown;
  const identity = validateLifecycleIdentity({
    version: 1,
    id: crypto.randomUUID(),
    accountId: user.id,
    kind,
    baseRevision: state.revision,
    baseHistoryRevision: state.historyRevision ?? 0,
    generation: state.generation,
    payloadHash: await hashLifecyclePayload(kind, payload),
  });
  requireCurrentDeviceScope(user.id, oldToken);
  const cached = loadCachedAccount(user.id);
  if (
    cached &&
    (cached.state.generation !== state.generation ||
      cached.state.revision > state.revision ||
      hasNewerKnownHistory(cached.state, state))
  )
    throw new Error('Your account changed during review. Reload and review its current history.');
  const device = prepareAccountLifecycleDeviceWork(user.id, user.email);
  suspendPracticeUploads(user.id);
  suspendAccountUploads(user.id);
  let token: string;
  try {
    token = invalidateDeviceScope(user.id);
  } catch (error) {
    resumePracticeUploads(user.id);
    resumeAccountUploads(user.id);
    throw error;
  }
  const record: AccountLifecycleRecord = {
    version: 1,
    identity,
    policy,
    token,
    phase: 'prepared',
    counts: counts(device.backup),
  };
  live.set(user.id, { payload, device, state });
  try {
    persist(record);
  } catch (error) {
    // Never send without durable identity/readback. A partially retained boundary stays fenced.
    if (!hasAccountLifecycleBoundary(user.id)) {
      rollbackAccountLifecycleDevicePreparation(user.id, token, device);
      completeDeviceScopeMutation(user.id, token);
      // No server request exists. Restore volatile state under the new token.
      // recover requires durable boundary; materialized optional state already survives reload.
      resumePracticeUploads(user.id);
      resumeAccountUploads(user.id);
      live.delete(user.id);
    }
    throw error;
  }
  return record;
}

export function getAccountLifecycleRecovery(scope: string): DeviceBackup | undefined {
  const captured = live.get(scope)?.device?.backup;
  if (captured) return captured;
  if (!loadAccountLifecycle(scope)) return undefined;
  return captureDeviceBackup(scope, loadCachedAccount(scope)?.user.email ?? scope);
}

export async function attachAccountLifecyclePayload(
  scope: string,
  payload: unknown,
): Promise<void> {
  const record = loadAccountLifecycle(scope);
  if (!record || !['prepared', 'unknown'].includes(record.phase))
    throw new Error('This account request no longer needs an import file.');
  const frozen = JSON.parse(JSON.stringify(payload)) as unknown;
  if ((await hashLifecyclePayload(record.identity.kind, frozen)) !== record.identity.payloadHash)
    throw new Error(
      'Choose the same replacement file used for this request. Its content does not match the retained identity.',
    );
  const current = loadAccountLifecycle(scope);
  if (!current || current.identity.id !== record.identity.id || current.token !== record.token)
    throw new Error('The account recovery changed while reading the file.');
  live.set(scope, { ...live.get(scope), payload: frozen });
  changed(scope);
}

function retainError(record: AccountLifecycleRecord, error: unknown): void {
  const current = loadAccountLifecycle(record.identity.accountId);
  if (!current || current.identity.id !== record.identity.id || current.token !== record.token)
    return;
  persist({
    ...current,
    error: (error instanceof Error ? error.message : 'Account recovery could not finish.').slice(
      0,
      1000,
    ),
  });
}

async function finalize(user: User, transports: AccountLifecycleTransports): Promise<void> {
  const record = requireOwner(user);
  if (!['applied', 'canceled', 'remote'].includes(record.phase))
    throw new Error('Check the server outcome before releasing this account work.');
  const item = live.get(user.id);
  if (
    record.phase === 'canceled' &&
    (record.resultGeneration ?? record.identity.generation) === record.identity.generation
  ) {
    recoverAccountLifecycleDeviceWork(user.id, record.token, item?.device);
  } else {
    const state = validateAccountSnapshot(
      transports.refresh ? await transports.refresh() : item?.state,
    );
    if (
      state.accountId !== user.id ||
      state.generation < (record.resultGeneration ?? record.identity.generation + 1) ||
      hasNewerKnownHistory(item?.state, state) ||
      hasNewerKnownHistory(loadCachedAccount(user.id)?.state, state)
    )
      throw new Error('Reload the confirmed replacement account state before finishing recovery.');
    requireOwner(user);
    // Applied server data is never rolled back into old active local work.
    retireAccountLifecycleDeviceWork(user.id, record.token);
    const raw = JSON.stringify({ user: { id: user.id, email: user.email }, state });
    const key = `cwa:account:cache:v1:${encodeURIComponent(user.id)}`;
    localStorage.setItem(key, raw);
    if (localStorage.getItem(key) !== raw)
      throw new Error('The new account state could not be retained. Retry local recovery.');
  }
  requireOwner(user);
  completeDeviceScopeMutation(user.id, record.token, record.identity.id);
  localStorage.removeItem(accountLifecycleKey(user.id));
  if (localStorage.getItem(accountLifecycleKey(user.id)) !== null)
    throw new Error('The account recovery record could not be released. Retry local recovery.');
  rememberAccountLifecycleBoundary(user.id, false);
  live.delete(user.id);
  const state = loadCachedAccount(user.id)?.state;
  if (state)
    observed.set(user.id, {
      token: record.token,
      generation: state.generation,
      revision: state.revision,
      ...(state.historyRevision === undefined ? {} : { historyRevision: state.historyRevision }),
    });
  notifyDeviceScope(user.id);
  changed(user.id);
  resumePracticeUploads(user.id);
  resumeAccountUploads(user.id);
}

async function accept(
  user: User,
  record: AccountLifecycleRecord,
  value: LifecycleResult,
  transports: AccountLifecycleTransports,
): Promise<LifecycleResult> {
  const result = validateLifecycleResult(value);
  const current = requireOwner(user);
  if (
    current.identity.id !== record.identity.id ||
    JSON.stringify(result.identity) !== JSON.stringify(record.identity)
  )
    throw new Error('The server outcome does not match this exact account request.');
  if (['applied', 'canceled'].includes(current.phase)) {
    const retained = live.get(user.id)?.result;
    await finalize(user, transports);
    return retained ?? result;
  }
  live.set(user.id, { ...live.get(user.id), state: result.state, result });
  if (result.outcome === 'unknown') {
    persist({
      ...current,
      phase: current.phase === 'prepared' ? 'prepared' : 'unknown',
      error:
        current.phase === 'prepared'
          ? 'The request has not been dispatched. Check preparation, retry the exact request, or stop it safely before reopening account work.'
          : 'The server outcome is still unknown. Keep this account paused; check again, retry the exact request, or stop it safely.',
    });
    return result;
  }
  persist({
    ...current,
    phase: result.outcome,
    resultGeneration: result.state.generation,
    error: undefined,
  });
  try {
    await finalize(user, transports);
  } catch (error) {
    retainError(record, error);
    throw error;
  }
  return result;
}

function run(
  user: User,
  transports: AccountLifecycleTransports,
  action: 'apply' | 'lookup' | 'cancel' | 'local',
  disposition?: AccountLifecyclePolicy,
): Promise<LifecycleResult | undefined> {
  const previous = running.get(user.id);
  if (previous) return previous;
  const task = (async () => {
    const record = requireOwner(user);
    try {
      const retained = live.get(user.id)?.result;
      if (
        retained &&
        retained.outcome !== 'unknown' &&
        !['applied', 'canceled', 'remote'].includes(record.phase)
      )
        persist({
          ...record,
          phase: retained.outcome,
          resultGeneration: retained.state.generation,
          error: undefined,
        });
      const current = requireOwner(user);
      if (current.phase === 'remote') {
        if (disposition !== 'keep-recovery-files' && disposition !== 'discard')
          throw new Error(
            'Download device recovery or explicitly discard old device work before finishing recovery.',
          );
        persist({ ...current, policy: disposition, error: undefined });
      }
      if (['applied', 'canceled', 'remote'].includes(current.phase)) {
        const result = live.get(user.id)?.result;
        await finalize(user, transports);
        return result;
      }
      if (action === 'local')
        throw new Error('The request outcome must be reconciled before local recovery.');
      if (action === 'apply') {
        let payload = live.get(user.id)?.payload;
        if (payload === undefined && record.identity.kind === 'reset')
          payload = { confirmation: 'RESET' };
        if (payload === undefined)
          throw new Error('Choose the same replacement file to retry this exact request.');
        if (
          (await hashLifecyclePayload(record.identity.kind, payload)) !==
          record.identity.payloadHash
        )
          throw new Error('The replacement payload no longer matches this request.');
        requireOwner(user);
        const reservation = validateLifecycleResult(await transports.prepare(record.identity));
        if (JSON.stringify(reservation.identity) !== JSON.stringify(record.identity))
          throw new Error('The server reservation does not match this exact account request.');
        if (reservation.outcome !== 'unknown')
          return await accept(user, record, reservation, transports);
        if (reservation.reserved !== true)
          throw new Error(
            'The server has not reserved safe cancellation for this request. No reset or replacement was sent.',
          );
        const dispatching = requireOwner(user);
        // Another page may have stopped/finished while preparation was in flight.
        if (
          dispatching.identity.id !== record.identity.id ||
          !['prepared', 'unknown'].includes(dispatching.phase)
        )
          throw new Error(
            'This request was stopped or completed while preparing. Reopen its current status.',
          );
        persist({ ...dispatching, phase: 'unknown', error: undefined });
        return await accept(
          user,
          record,
          await transports.apply(record.identity, payload),
          transports,
        );
      }
      try {
        return await accept(
          user,
          record,
          await transports[action === 'lookup' ? 'lookup' : 'cancel'](record.identity),
          transports,
        );
      } catch (error) {
        if (
          action === 'cancel' &&
          record.phase === 'prepared' &&
          error instanceof ApiError &&
          error.code === 'lifecycle_capacity'
        ) {
          const current = requireOwner(user);
          if (current.phase !== 'prepared' || current.identity.id !== record.identity.id)
            throw error;
          // Worker guarantees capacity rejection means this identity has no reservation,
          // hence no destructive apply admission. No page marked it dispatched.
          const state = validateAccountSnapshot(
            error.state ?? live.get(user.id)?.state ?? loadCachedAccount(user.id)?.state,
          );
          if (state.accountId !== user.id) throw error;
          const canceled: LifecycleResult = {
            identity: current.identity,
            outcome: 'canceled',
            state,
          };
          return await accept(user, current, canceled, transports);
        }
        throw error;
      }
    } catch (error) {
      retainError(record, error);
      throw error;
    }
  })().finally(() => {
    if (running.get(user.id) === task) running.delete(user.id);
  });
  running.set(user.id, task);
  return task;
}
export const dispatchAccountLifecycle = (user: User, transports: AccountLifecycleTransports) =>
  run(user, transports, 'apply');
export const checkAccountLifecycle = (user: User, transports: AccountLifecycleTransports) =>
  run(user, transports, 'lookup');
export const stopAccountLifecycle = (user: User, transports: AccountLifecycleTransports) =>
  run(user, transports, 'cancel');
export const retryAccountLifecycleLocal = (
  user: User,
  transports: AccountLifecycleTransports,
  disposition?: AccountLifecyclePolicy,
) => run(user, transports, 'local', disposition);

/** A newer authoritative dataset fences producers before anyone publishes its cache/history. */
export function observeAccountGeneration(
  user: User,
  input: AccountSnapshot | (AccountAuthority & { accountId?: string }),
): boolean {
  if (
    !integer(input.generation) ||
    !integer(input.revision) ||
    (input.historyRevision !== undefined && !integer(input.historyRevision)) ||
    (input.accountId !== undefined && input.accountId !== user.id)
  )
    throw new Error('Invalid observed account generation.');
  const pending = loadAccountLifecycle(user.id);
  if (pending) {
    if (input.generation > (pending.resultGeneration ?? pending.identity.generation)) {
      live.set(user.id, {
        ...live.get(user.id),
        ...('settings' in input ? { state: validateAccountSnapshot(input) } : {}),
      });
      // An unknown local request keeps its own immutable identity until reconciled.
      if (pending.phase === 'remote' || pending.phase === 'applied' || pending.phase === 'canceled')
        persist({ ...pending, resultGeneration: input.generation });
    }
    return false;
  }
  const tokenBefore = getDeviceScopeToken(user.id);
  const remembered = observed.get(user.id);
  const cached = loadCachedAccount(user.id)?.state;
  const origins = [
    ...loadAccountOperations(user.id).map((item) => item.operation.generation),
    ...loadLocalPractice(user.id).flatMap((item) => {
      const generation = loadPracticeSaveOrigin(user.id, item.id).generation;
      return generation === undefined ? [] : [generation];
    }),
  ];
  const uncertainRetainedWork =
    !cached &&
    remembered?.token !== tokenBefore &&
    (loadLocalPractice(user.id).some(
      (item) => loadPracticeSaveOrigin(user.id, item.id).generation === undefined,
    ) ||
      Boolean(loadCopyDraft(user.id)));
  const retainedGeneration = origins.length ? Math.min(...origins) : undefined;
  const previous: AccountAuthority | undefined =
    remembered?.token === tokenBefore
      ? remembered
      : (cached ??
        (retainedGeneration === undefined
          ? undefined
          : { generation: retainedGeneration, revision: 0 }));
  // History authority only guards confirmed snapshots; it never rebases queued edits.
  if (hasNewerKnownHistory(previous, input) || hasNewerKnownHistory(cached, input)) return false;
  if (!uncertainRetainedWork && (!previous || input.generation <= previous.generation)) {
    const historyRevision =
      previous && input.generation < previous.generation
        ? previous.historyRevision
        : previous?.historyRevision === undefined && input.historyRevision === undefined
          ? undefined
          : Math.max(previous?.historyRevision ?? 0, input.historyRevision ?? 0);
    observed.set(user.id, {
      token: tokenBefore,
      generation: Math.max(previous?.generation ?? 0, input.generation),
      revision: Math.max(previous?.revision ?? 0, input.revision),
      ...(historyRevision === undefined ? {} : { historyRevision }),
    });
    return true;
  }
  const base = previous ?? { generation: input.generation, revision: input.revision };
  const device = captureAccountLifecycleDeviceWork(user.id, user.email);
  suspendPracticeUploads(user.id);
  suspendAccountUploads(user.id);
  const token = invalidateDeviceScope(user.id);
  const record: AccountLifecycleRecord = {
    version: 1,
    identity: {
      version: 1,
      id: crypto.randomUUID(),
      accountId: user.id,
      kind: 'reset',
      baseRevision: base.revision,
      baseHistoryRevision: base.historyRevision ?? 0,
      generation: base.generation,
      payloadHash: '0'.repeat(64),
    },
    policy: 'keep-recovery-files',
    token,
    phase: 'remote',
    counts: counts(device.backup),
    resultGeneration: input.generation,
    error: uncertainRetainedWork
      ? 'Retained device work has an unknown original dataset. Download a recovery file or explicitly discard it before using the current log.'
      : 'This account was reset or replaced elsewhere. Download old device work before closing this page to preserve memory-only notes or failures, then finish local recovery before starting new work.',
  };
  live.set(user.id, {
    device,
    ...('settings' in input ? { state: validateAccountSnapshot(input) } : {}),
  });
  persist(record);
  return false;
}

export function subscribeAccountLifecycle(
  listener: (record: AccountLifecycleRecord | null, scope: string) => void,
): () => void {
  const local = (event: Event) => {
    const scope = (event as CustomEvent<{ scope: string }>).detail.scope;
    listener(loadAccountLifecycle(scope), scope);
  };
  const storage = (event: StorageEvent) => {
    const prefix = 'cwa:account:lifecycle:v1:';
    if (!event.key?.startsWith(prefix)) return;
    try {
      const scope = decodeURIComponent(event.key.slice(prefix.length));
      if (accountLifecycleKey(scope) === event.key) listener(loadAccountLifecycle(scope), scope);
    } catch {
      /* Invalid coordination remains fenced, without selecting another account. */
    }
  };
  window.addEventListener(ACCOUNT_LIFECYCLE_EVENT, local);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(ACCOUNT_LIFECYCLE_EVENT, local);
    window.removeEventListener('storage', storage);
  };
}
