import {
  applyAccountChange,
  validateAccountChange,
  validateAccountOperation,
  validateAccountSnapshot,
  type AccountChange,
  type AccountOperation,
  type AccountSnapshot,
} from '../shared/account-sync';
import { api, ApiError, type User } from './api';

export const ACCOUNT_DATA_EVENT = 'cwa:account-data';
const ACTIVE_ACCOUNT_KEY = 'cwa:account:active:v1';
const CACHE_LIMIT = 4_000_000;
const MAX_OPERATIONS = 1000;
const operationPrefix = (scope: string) => `cwa:account:operation:v1:${encodeURIComponent(scope)}:`;
const operationKey = (scope: string, id: string) =>
  `${operationPrefix(scope)}${encodeURIComponent(id)}`;
const statusKey = (scope: string, id: string) =>
  `cwa:account:status:v1:${encodeURIComponent(scope)}:${encodeURIComponent(id)}`;
const cacheKey = (scope: string) => `cwa:account:cache:v1:${encodeURIComponent(scope)}`;
const identityKey = (scope: string) => `cwa:account:identity:v1:${encodeURIComponent(scope)}`;
const changed = () => window.dispatchEvent(new Event(ACCOUNT_DATA_EVENT));
let selectionOverride: { id?: string } | undefined;

export interface CachedAccount {
  user: User;
  state: AccountSnapshot;
}
export interface QueuedAccountOperation {
  operation: AccountOperation;
  /** Original queue position; resolving one edit cannot move it behind its dependents. */
  order: { position: number; createdAt: string; id: string };
  status: 'pending' | 'failed' | 'conflict';
  error?: string;
  failure?: 'network' | 'auth' | 'permanent';
}
const volatileFailures = new Map<string, QueuedAccountOperation>();
const operationIdentity = (item: QueuedAccountOperation) =>
  JSON.stringify({ operation: item.operation, order: item.order });

function validateQueued(value: unknown): QueuedAccountOperation {
  if (!value || typeof value !== 'object') throw new Error('Invalid pending account edit.');
  const input = value as QueuedAccountOperation;
  const operation = validateAccountOperation(input.operation);
  const order = input.order ?? {
    position: operation.baseRevision,
    createdAt: operation.createdAt,
    id: operation.id,
  };
  if (
    !Number.isSafeInteger(order.position) ||
    order.position < 0 ||
    typeof order.createdAt !== 'string' ||
    order.createdAt.length > 40 ||
    !Number.isFinite(Date.parse(order.createdAt)) ||
    typeof order.id !== 'string' ||
    !/^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]{0,199}$/.test(order.id)
  )
    throw new Error('Invalid pending edit order.');
  if (!['pending', 'failed', 'conflict'].includes(input.status))
    throw new Error('Invalid pending edit status.');
  if (input.error !== undefined && (typeof input.error !== 'string' || input.error.length > 1000))
    throw new Error('Invalid pending edit error.');
  if (input.failure !== undefined && !['network', 'auth', 'permanent'].includes(input.failure))
    throw new Error('Invalid pending edit failure.');
  return {
    operation,
    order,
    status: input.status,
    ...(input.error ? { error: input.error } : {}),
    ...(input.failure ? { failure: input.failure } : {}),
  };
}

/** The cache contains public identity and private data, never authentication credentials. */
export function loadCachedAccount(accountId?: string): CachedAccount | null {
  try {
    const scope = accountId ?? getSelectedAccountId();
    if (!scope) return null;
    const raw = localStorage.getItem(cacheKey(scope));
    if (!raw || raw.length > CACHE_LIMIT) return null;
    const input = JSON.parse(raw) as CachedAccount;
    if (
      input.user?.id !== scope ||
      typeof input.user.email !== 'string' ||
      input.user.email.length > 320
    )
      return null;
    const state = validateAccountSnapshot(input.state);
    if (state.accountId !== scope) return null;
    return { user: { id: scope, email: input.user.email }, state };
  } catch {
    return null;
  }
}

function retainAccountIdentity(user: User): void {
  try {
    localStorage.setItem(
      identityKey(user.id),
      JSON.stringify({ version: 1, id: user.id, email: user.email }),
    );
  } catch {
    /* Fresh server authority remains usable when the device is full. */
  }
}

export function loadAccountIdentity(scope: string): User | null {
  try {
    const raw = localStorage.getItem(identityKey(scope));
    if (raw && raw.length <= 1000) {
      const input = JSON.parse(raw) as User & { version?: number };
      if (
        input.version === 1 &&
        input.id === scope &&
        /^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]{0,199}$/.test(input.id) &&
        typeof input.email === 'string' &&
        input.email.length <= 320
      )
        return { id: input.id, email: input.email };
    }
  } catch {
    /* Older full caches remain a compatible identity source. */
  }
  return loadCachedAccount(scope)?.user ?? null;
}

/** This selects device-pending work offline; it grants no authenticated authority. */
export function loadSelectedAccountIdentity(): User | null {
  const scope = getSelectedAccountId();
  return scope ? loadAccountIdentity(scope) : null;
}

export function rememberAccount(user: User, input: AccountSnapshot, select = true): void {
  const state = validateAccountSnapshot(input);
  if (state.accountId !== user.id) throw new Error('The account state belongs to another account.');
  if (select) selectAccountIdentity(user);
  else retainAccountIdentity(user);
  const previous = loadCachedAccount(user.id);
  // A slower GET or acknowledgement must not replace a newer confirmed snapshot.
  if (
    previous &&
    (previous.state.generation > state.generation ||
      (previous.state.generation === state.generation && previous.state.revision > state.revision))
  ) {
    return;
  }
  const raw = JSON.stringify({ user: { id: user.id, email: user.email }, state });
  if (raw.length > CACHE_LIMIT) return;
  try {
    localStorage.setItem(cacheKey(user.id), raw);
    changed();
  } catch {
    /* Server-confirmed state remains usable when device caching is unavailable. */
  }
}

export function forgetActiveAccount(): void {
  const previous = getSelectedAccountId();
  if (previous) suspendAccountUploads(previous);
  try {
    localStorage.removeItem(ACTIVE_ACCOUNT_KEY);
    selectionOverride = localStorage.getItem(ACTIVE_ACCOUNT_KEY) === null ? undefined : {};
  } catch {
    selectionOverride = {};
  }
  changed();
}

/** Call only after a fresh identity check; cache selection is not authentication. */
export function selectAccountIdentity(user: User): void {
  const previous = getSelectedAccountId();
  if (previous && previous !== user.id) suspendAccountUploads(previous);
  retainAccountIdentity(user);
  try {
    localStorage.setItem(ACTIVE_ACCOUNT_KEY, user.id);
    selectionOverride =
      localStorage.getItem(ACTIVE_ACCOUNT_KEY) === user.id ? undefined : { id: user.id };
  } catch {
    selectionOverride = { id: user.id };
  }
  changed();
}

export function getSelectedAccountId(readStored = false): string | undefined {
  if (readStored) selectionOverride = undefined;
  if (selectionOverride) return selectionOverride.id;
  try {
    return localStorage.getItem(ACTIVE_ACCOUNT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Unavailable storage does not revoke current in-memory identity; an explicit clear does. */
export function isSelectedAccount(scope: string): boolean {
  if (selectionOverride) return selectionOverride.id === scope;
  try {
    return localStorage.getItem(ACTIVE_ACCOUNT_KEY) === scope;
  } catch {
    return true;
  }
}

export function loadAccountOperations(scope: string): QueuedAccountOperation[] {
  const operations: QueuedAccountOperation[] = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const name = localStorage.key(index);
      if (!name?.startsWith(operationPrefix(scope))) continue;
      try {
        const raw = localStorage.getItem(name);
        if (!raw || raw.length > 300_000) continue;
        let item = validateQueued(JSON.parse(raw));
        if (item.operation.accountId === scope && name === operationKey(scope, item.operation.id)) {
          try {
            const statusRaw = localStorage.getItem(statusKey(scope, item.operation.id));
            if (statusRaw && statusRaw.length <= 302_000) {
              const status = JSON.parse(statusRaw) as {
                identity?: string;
                status?: unknown;
                error?: unknown;
                failure?: unknown;
              };
              if (status.identity === operationIdentity(item))
                item = validateQueued({
                  operation: item.operation,
                  order: item.order,
                  status: status.status,
                  error: status.error,
                  failure: status.failure,
                });
            }
          } catch {
            /* Legacy embedded status and immutable intent remain readable. */
          }
          const failure = volatileFailures.get(name);
          operations.push(
            failure && operationIdentity(failure) === operationIdentity(item) ? failure : item,
          );
        }
      } catch {
        /* One damaged operation does not hide other recoverable edits. */
      }
    }
  } catch {
    /* Storage failures are reported by the next attempted mutation. */
  }
  return operations.sort(
    (a, b) =>
      a.order.position - b.order.position ||
      a.order.createdAt.localeCompare(b.order.createdAt) ||
      a.order.id.localeCompare(b.order.id),
  );
}

function operationOwnership(item: QueuedAccountOperation): 'same' | 'missing' | 'replaced' {
  try {
    const raw = localStorage.getItem(operationKey(item.operation.accountId, item.operation.id));
    if (raw === null) return 'missing';
    if (raw.length > 300_000) return 'replaced';
    return operationIdentity(validateQueued(JSON.parse(raw))) === operationIdentity(item)
      ? 'same'
      : 'replaced';
  } catch {
    return 'replaced';
  }
}

/** Error/retry writes cannot recreate an immutable operation that another tab removed. */
function writeStatus(item: QueuedAccountOperation): boolean {
  if (operationOwnership(item) !== 'same') return false;
  const raw = JSON.stringify({
    identity: operationIdentity(item),
    status: item.status,
    ...(item.error ? { error: item.error } : {}),
    ...(item.failure ? { failure: item.failure } : {}),
  });
  if (raw.length > 302_000)
    throw new Error('The upload status exceeds this device’s storage limit.');
  try {
    localStorage.setItem(statusKey(item.operation.accountId, item.operation.id), raw);
    if (localStorage.getItem(statusKey(item.operation.accountId, item.operation.id)) !== raw)
      throw new Error('The upload status was not retained.');
  } catch {
    throw new Error(
      'This browser could not retain the upload status. Free device storage and try again.',
    );
  }
  volatileFailures.delete(operationKey(item.operation.accountId, item.operation.id));
  changed();
  return operationOwnership(item) === 'same';
}

/** This is an origin revision for the next local edit, not a server acknowledgement. */
export function nextAccountRevision(
  state: AccountSnapshot,
  operations = loadAccountOperations(state.accountId),
): number {
  return operations.reduce(
    (revision, item) =>
      item.operation.accountId === state.accountId && item.operation.generation === state.generation
        ? Math.max(revision, item.operation.baseRevision + 1)
        : revision,
    state.revision,
  );
}

export function projectAccountState(
  state: AccountSnapshot,
  operations = loadAccountOperations(state.accountId),
): AccountSnapshot {
  let projected = state;
  for (const item of operations) {
    if (
      item.operation.accountId !== state.accountId ||
      item.operation.generation !== state.generation
    )
      continue;
    try {
      projected = applyAccountChange(projected, item.operation.change);
    } catch {
      /* Keep invalidated intent visible in the outbox for explicit resolution. */
    }
  }
  return { ...projected, revision: nextAccountRevision(state, operations) };
}

function writeOperation(item: QueuedAccountOperation): void {
  const raw = JSON.stringify(item);
  if (raw.length > 300_000)
    throw new Error('This pending edit is too large to save on this device.');
  try {
    localStorage.setItem(operationKey(item.operation.accountId, item.operation.id), raw);
    if (localStorage.getItem(operationKey(item.operation.accountId, item.operation.id)) !== raw)
      throw new Error('The pending edit was not retained.');
  } catch {
    throw new Error(
      'This browser could not retain your account edit. Free device storage and try again.',
    );
  }
  volatileFailures.delete(operationKey(item.operation.accountId, item.operation.id));
  changed();
}

export function queueAccountChange(
  state: AccountSnapshot,
  input: AccountChange,
  options: { baseRevision?: number; generation?: number; id?: string } = {},
): QueuedAccountOperation {
  const operations = loadAccountOperations(state.accountId);
  const frozen = options.id
    ? operations.find((item) => item.operation.id === options.id)
    : undefined;
  if (frozen) return frozen;
  if (operations.length >= MAX_OPERATIONS)
    throw new Error('Upload or resolve your pending edits before adding more.');
  const change = validateAccountChange(input);
  applyAccountChange(projectAccountState(state, operations), change);
  const operation = validateAccountOperation({
    version: 1,
    id: options.id ?? crypto.randomUUID(),
    accountId: state.accountId,
    baseRevision: options.baseRevision ?? nextAccountRevision(state, operations),
    generation: options.generation ?? state.generation,
    createdAt: new Date().toISOString(),
    change,
  });
  const position = operations.reduce((last, item) => Math.max(last, item.order.position + 1), 0);
  if (!Number.isSafeInteger(position))
    throw new Error('Resolve the existing pending edits before adding more.');
  const item: QueuedAccountOperation = {
    operation,
    order: { position, createdAt: operation.createdAt, id: operation.id },
    status: 'pending',
  };
  writeOperation(item);
  return item;
}

function setFailure(item: QueuedAccountOperation, error: unknown): boolean {
  if (operationOwnership(item) !== 'same') return false;
  const accountChanged = error instanceof ApiError && error.code === 'account_changed';
  const status =
    error instanceof ApiError && error.status === 409 && !accountChanged ? 'conflict' : 'failed';
  const failure =
    error instanceof ApiError
      ? accountChanged || [401, 403].includes(error.status)
        ? 'auth'
        : error.status >= 500
          ? 'network'
          : 'permanent'
      : 'network';
  const failed: QueuedAccountOperation = {
    operation: item.operation,
    order: item.order,
    status,
    error: (error instanceof Error ? error.message : 'The edit could not be uploaded.').slice(
      0,
      1000,
    ),
    failure,
  };
  volatileFailures.set(operationKey(item.operation.accountId, item.operation.id), failed);
  try {
    return writeStatus(failed);
  } catch {
    /* Original durable intent remains retained. */
    changed();
    return operationOwnership(item) === 'same';
  }
}

interface Upload {
  controller: AbortController;
  promise: Promise<Set<string>>;
  epoch: number;
}
const uploads = new Map<string, Upload>();
const suspended = new Set<string>();
const epochs = new Map<string, number>();

/** Stop real requests and fence their late acknowledgements without deleting pending work. */
export function suspendAccountUploads(scope: string): void {
  suspended.add(scope);
  epochs.set(scope, (epochs.get(scope) ?? 0) + 1);
  uploads.get(scope)?.controller.abort(new Error('The selected account changed.'));
}
export function resumeAccountUploads(scope: string): void {
  suspended.delete(scope);
}

export async function flushAccountOperations(
  scope: string,
  onState: (state: AccountSnapshot) => void = () => {},
  accountIsCurrent: () => boolean = () => true,
): Promise<Set<string>> {
  const isCurrentAccount = () => accountIsCurrent() && isSelectedAccount(scope);
  if (suspended.has(scope) || !isCurrentAccount()) return new Set();
  const previous = uploads.get(scope);
  if (previous) return previous.promise;
  const controller = new AbortController();
  const epoch = epochs.get(scope) ?? 0;
  const acknowledged = new Set<string>();
  const upload: Upload = { controller, epoch, promise: Promise.resolve(acknowledged) };
  upload.promise = (async () => {
    while (true) {
      const item = loadAccountOperations(scope)[0];
      if (!item) return acknowledged;
      if (!isCurrentAccount() || suspended.has(scope) || epoch !== (epochs.get(scope) ?? 0))
        return acknowledged;
      if (item.status !== 'pending') return acknowledged;
      const timeout = setTimeout(
        () => controller.abort(new Error('The account upload timed out. Try again.')),
        10_000,
      );
      try {
        const response = await api<{ state: AccountSnapshot; operationId: string }>(
          '/account-operations',
          item.operation,
          'POST',
          controller.signal,
          { accountId: scope },
        );
        const state = validateAccountSnapshot(response.state);
        if (
          state.accountId !== scope ||
          response.operationId !== item.operation.id ||
          state.generation !== item.operation.generation ||
          state.revision <= item.operation.baseRevision
        )
          throw new Error('The server did not acknowledge this account edit.');
        if (!isCurrentAccount() || suspended.has(scope) || epoch !== (epochs.get(scope) ?? 0))
          return acknowledged;
        const ownership = operationOwnership(item);
        if (ownership === 'missing') continue;
        if (ownership === 'replaced') return acknowledged;
        const cached = loadCachedAccount(scope);
        if (cached) rememberAccount(cached.user, state, false);
        localStorage.removeItem(operationKey(scope, item.operation.id));
        localStorage.removeItem(statusKey(scope, item.operation.id));
        volatileFailures.delete(operationKey(scope, item.operation.id));
        acknowledged.add(item.operation.id);
        changed();
        onState(state);
      } catch (error) {
        if (!isCurrentAccount() || suspended.has(scope) || epoch !== (epochs.get(scope) ?? 0))
          return acknowledged;
        const ownership = operationOwnership(item);
        if (ownership === 'missing') continue;
        if (ownership === 'replaced') return acknowledged;
        if (error instanceof ApiError && error.state) {
          try {
            const state = validateAccountSnapshot(error.state);
            if (state.accountId === scope) {
              const cached = loadCachedAccount(scope);
              if (cached) rememberAccount(cached.user, state, false);
              onState(state);
            }
          } catch {
            /* An invalid server conflict response cannot replace the confirmed cache. */
          }
        }
        if (!setFailure(item, error)) continue;
        return acknowledged;
      } finally {
        clearTimeout(timeout);
      }
    }
  })().finally(() => {
    if (uploads.get(scope) === upload) uploads.delete(scope);
  });
  uploads.set(scope, upload);
  return upload.promise;
}

/** Reconnect/auth retry retains the original operation body, including its revision. */
export function retryAccountOperations(scope: string, includePermanent = false): void {
  for (const item of loadAccountOperations(scope)) {
    if (item.status === 'failed' && (includePermanent || item.failure !== 'permanent'))
      writeStatus({ operation: item.operation, order: item.order, status: 'pending' });
  }
}

export function resolveAccountConflict(
  scope: string,
  id: string,
  resolution: 'discard' | 'reapply',
  state: AccountSnapshot,
): QueuedAccountOperation | undefined {
  if (state.accountId !== scope) throw new Error('Choose the account that owns this edit.');
  const item = loadAccountOperations(scope).find((item) => item.operation.id === id);
  if (!item) return;
  if (uploads.has(scope))
    throw new Error('Wait for the current upload before resolving this edit.');
  if (resolution === 'discard') {
    localStorage.removeItem(operationKey(scope, id));
    localStorage.removeItem(statusKey(scope, id));
    volatileFailures.delete(operationKey(scope, id));
    changed();
    return;
  }
  // Explicit reapplication is a new semantic operation against the displayed server state.
  const operation = validateAccountOperation({
    ...item.operation,
    id: crypto.randomUUID(),
    baseRevision: state.revision,
    generation: state.generation,
    createdAt: new Date().toISOString(),
  });
  applyAccountChange(state, operation.change);
  const reapplied: QueuedAccountOperation = { operation, order: item.order, status: 'pending' };
  writeOperation(reapplied);
  localStorage.removeItem(operationKey(scope, id));
  localStorage.removeItem(statusKey(scope, id));
  volatileFailures.delete(operationKey(scope, id));
  changed();
  return reapplied;
}
