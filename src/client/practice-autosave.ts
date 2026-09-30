import { validatePracticeSession, type PracticeSession } from '../shared/training';
import { api, ApiError } from './api';
import { getSelectedAccountId, loadAccountOperations, loadCachedAccount } from './account-outbox';
import {
  getDeviceScopeToken,
  isDeviceScopeCurrent,
  requireCurrentDeviceScope,
  subscribeDeviceScope,
} from './device-scope';

export const PRACTICE_SAVED_EVENT = 'cwa:practice-saved';
export const PRACTICE_UPLOADED_EVENT = 'cwa:practice-uploaded';
const prefix = (scope: string) => `cwa:practice:pending:v1:${encodeURIComponent(scope)}:`;
const key = (scope: string, id: string) => `${prefix(scope)}${encodeURIComponent(id)}`;
const stateKey = (scope: string, id: string) =>
  `cwa:practice:status:v1:${encodeURIComponent(scope)}:${encodeURIComponent(id)}`;
const originKey = (scope: string, id: string) =>
  `cwa:practice:origin:v1:${encodeURIComponent(scope)}:${encodeURIComponent(id)}`;
const changed = () => window.dispatchEvent(new Event(PRACTICE_SAVED_EVENT));
const volatileStates = new Map<
  string,
  { state: PracticeSaveState; body: string | null; deviceToken: string }
>();

/** Guest history and signed-in uploads waiting for acknowledgement stay account scoped. */
export function loadLocalPractice(scope: string): PracticeSession[] {
  const entries: PracticeSession[] = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const name = localStorage.key(index);
      if (!name?.startsWith(prefix(scope))) continue;
      try {
        entries.push(validatePracticeSession(JSON.parse(localStorage.getItem(name)!)));
      } catch {
        // A damaged record must not hide the other locally saved rounds.
      }
    }
  } catch {
    // Practice remains available when browser storage is disabled.
  }
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function removeLocalPractice(scope: string, id: string) {
  try {
    localStorage.removeItem(key(scope, id));
    localStorage.removeItem(stateKey(scope, id));
    localStorage.removeItem(originKey(scope, id));
    volatileStates.delete(stateKey(scope, id));
    changed();
  } catch {
    // A retained acknowledged record is safe to retry with the same id.
  }
}

export interface PracticeSaveOrigin {
  id: string;
  accountId: string;
  /** Missing means unknown historical origin, never the current dataset generation. */
  generation?: number;
}
export function loadPracticeSaveOrigin(scope: string, id: string): PracticeSaveOrigin {
  try {
    const raw = localStorage.getItem(originKey(scope, id));
    if (raw && raw.length <= 1000) {
      const input = JSON.parse(raw) as PracticeSaveOrigin & { version?: number };
      if (
        input.version === 1 &&
        input.id === id &&
        input.accountId === scope &&
        (input.generation === undefined ||
          (Number.isSafeInteger(input.generation) && input.generation >= 0))
      )
        return {
          id,
          accountId: scope,
          ...(input.generation === undefined ? {} : { generation: input.generation }),
        };
    }
  } catch {
    /* Unknown origins remain unknown through all retries. */
  }
  return { id, accountId: scope };
}

export interface PracticeSaveState {
  id: string;
  status: 'pending' | 'failed';
  error?: string;
  failure?: 'network' | 'auth' | 'permanent';
}
export function loadPracticeSaveStates(scope: string): PracticeSaveState[] {
  return loadLocalPractice(scope).map((entry) => {
    try {
      const volatile = volatileStates.get(stateKey(scope, entry.id));
      if (
        volatile &&
        isDeviceScopeCurrent(scope, volatile.deviceToken) &&
        volatile.body === localStorage.getItem(key(scope, entry.id))
      )
        return volatile.state;
      const raw = localStorage.getItem(stateKey(scope, entry.id));
      const value = raw ? (JSON.parse(raw) as PracticeSaveState) : undefined;
      if (value?.id === entry.id && ['pending', 'failed'].includes(value.status)) return value;
    } catch {
      /* A damaged status never hides the retained result. */
    }
    return { id: entry.id, status: 'pending' };
  });
}
function setSaveState(scope: string, state: PracticeSaveState) {
  try {
    volatileStates.set(stateKey(scope, state.id), {
      state,
      body: localStorage.getItem(key(scope, state.id)),
      deviceToken: getDeviceScopeToken(scope),
    });
    localStorage.setItem(stateKey(scope, state.id), JSON.stringify(state));
    if (localStorage.getItem(stateKey(scope, state.id)) !== JSON.stringify(state))
      throw new Error('The upload status was not retained.');
    volatileStates.delete(stateKey(scope, state.id));
    changed();
  } catch {
    /* Retained result remains authoritative. */
    changed();
  }
}

export interface PracticeSaveReceipt {
  entry: PracticeSession;
  destination: 'history' | 'device';
}
interface Upload {
  receipt: Promise<PracticeSaveReceipt>;
  completion: Promise<PracticeSaveReceipt>;
  controller: AbortController;
  deviceToken: string;
  id: string;
}
const uploads = new Map<string, Upload>();
const suspended = new Set<string>();
const epochs = new Map<string, number>();
let observedWindow: Window | undefined;
function observeDeviceScope() {
  if (observedWindow === window || typeof window.addEventListener !== 'function') return;
  observedWindow = window;
  subscribeDeviceScope(({ scope, mutating }) => {
    if (mutating) suspendPracticeUploads(scope);
    invalidatePracticeMemory(scope);
  });
}
export function listInFlightPracticeIds(scope: string): string[] {
  return [...uploads.entries()]
    .filter(([name]) => name.startsWith(prefix(scope)))
    .map(([, upload]) => upload.id);
}
export function invalidatePracticeMemory(scope: string): void {
  const statusPrefix = `cwa:practice:status:v1:${encodeURIComponent(scope)}:`;
  for (const name of volatileStates.keys())
    if (name.startsWith(statusPrefix)) volatileStates.delete(name);
}
/** Internal rollback retains a status whose optional sidecar could not be persisted. */
export function restorePracticeMemory(scope: string, states: PracticeSaveState[]): void {
  invalidatePracticeMemory(scope);
  for (const state of states) {
    const body = localStorage.getItem(key(scope, state.id));
    if (body !== null)
      volatileStates.set(stateKey(scope, state.id), {
        state,
        body,
        deviceToken: getDeviceScopeToken(scope),
      });
  }
}
/** Account changes or lifecycle actions fence actual network work and late acknowledgements. */
export function suspendPracticeUploads(scope: string) {
  suspended.add(scope);
  epochs.set(scope, (epochs.get(scope) ?? 0) + 1);
  for (const [name, upload] of uploads)
    if (name.startsWith(prefix(scope))) {
      upload.controller.abort(new Error('The selected account changed.'));
      // Restoring the same identity must start a fresh request, not join its canceled promise.
      uploads.delete(name);
    }
}
export function resumePracticeUploads(scope: string) {
  if (!isDeviceScopeCurrent(scope, getDeviceScopeToken(scope))) return;
  suspended.delete(scope);
}
const UPLOAD_TIMEOUT_MS = 10_000;
const LOCAL_RECEIPT_DELAY_MS = 750;

/** Freeze before uploading: a lost response or navigation can retry the exact same entry. */
export async function autoSavePractice(
  scope: string,
  input: PracticeSession,
  deviceToken = getDeviceScopeToken(scope),
): Promise<PracticeSaveReceipt> {
  requireCurrentDeviceScope(scope, deviceToken);
  observeDeviceScope();
  const entryKey = key(scope, input.id);
  const uploading = uploads.get(entryKey);
  if (uploading && uploading.deviceToken === deviceToken) {
    const receipt = await uploading.receipt;
    requireCurrentDeviceScope(scope, deviceToken);
    return receipt;
  }
  let entry = validatePracticeSession(input);
  let durable = false;
  try {
    const previous = localStorage.getItem(entryKey);
    if (previous) entry = validatePracticeSession(JSON.parse(previous));
    else {
      const frozen = JSON.stringify(entry);
      localStorage.setItem(entryKey, frozen);
      if (localStorage.getItem(entryKey) !== frozen)
        throw new Error('The result was not retained.');
      try {
        if (localStorage.getItem(originKey(scope, entry.id)) === null) {
          const generation =
            scope === 'guest' ? undefined : loadCachedAccount(scope)?.state.generation;
          localStorage.setItem(
            originKey(scope, entry.id),
            JSON.stringify({
              version: 1,
              id: entry.id,
              accountId: scope,
              ...(generation === undefined ? {} : { generation }),
            }),
          );
        }
      } catch {
        /* The result stays durable; absent origin must never be restamped on retry. */
      }
    }
    durable = true;
    changed();
  } catch {
    // Still try the server if local storage is unavailable.
  }
  if (scope === 'guest') {
    if (!durable)
      throw new Error(
        'This browser could not save your result. Keep it open and try again before starting another round.',
      );
    return { entry, destination: 'device' };
  }
  const selected = getSelectedAccountId();
  if (
    suspended.has(scope) ||
    (selected !== undefined && selected !== scope) ||
    loadAccountOperations(scope).length
  ) {
    if (!durable)
      throw new Error('This browser could not retain your result while account edits are waiting.');
    setSaveState(scope, { id: entry.id, status: 'pending' });
    return { entry, destination: 'device' };
  }
  const frozen = JSON.stringify(entry);
  const origin = loadPracticeSaveOrigin(scope, entry.id);
  const epoch = epochs.get(scope) ?? 0;
  setSaveState(scope, { id: entry.id, status: 'pending' });
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error('The upload timed out. Please try saving again.'));
  }, UPLOAD_TIMEOUT_MS);
  const upload = (async (): Promise<PracticeSaveReceipt> => {
    try {
      const response = await api<{ entry: PracticeSession }>(
        '/entries',
        entry,
        'POST',
        controller.signal,
        { accountId: scope, generation: origin.generation },
      );
      const acknowledged = validatePracticeSession(response.entry);
      if (acknowledged.id !== entry.id)
        throw new Error('The server did not acknowledge this result.');
      const selected = getSelectedAccountId();
      if (
        suspended.has(scope) ||
        (selected !== undefined && selected !== scope) ||
        epoch !== (epochs.get(scope) ?? 0) ||
        !isDeviceScopeCurrent(scope, deviceToken)
      )
        return { entry, destination: 'device' };
      // Clearing a newer replacement or publishing its old acknowledgement would lose work.
      if (durable && localStorage.getItem(entryKey) !== frozen)
        return { entry, destination: 'device' };
      removeLocalPractice(scope, entry.id);
      window.dispatchEvent(
        new CustomEvent(PRACTICE_UPLOADED_EVENT, { detail: { scope, entry: acknowledged } }),
      );
      return { entry: acknowledged, destination: 'history' };
    } catch (error) {
      if (!durable) throw error;
      if (
        !suspended.has(scope) &&
        epoch === (epochs.get(scope) ?? 0) &&
        isDeviceScopeCurrent(scope, deviceToken)
      )
        setSaveState(scope, {
          id: entry.id,
          status: 'failed',
          error: (error instanceof Error
            ? error.message
            : 'Your result could not be uploaded.'
          ).slice(0, 1000),
          failure:
            error instanceof ApiError
              ? error.code === 'account_changed' || [401, 403].includes(error.status)
                ? 'auth'
                : error.status >= 500
                  ? 'network'
                  : 'permanent'
              : 'network',
        });
      return { entry, destination: 'device' };
    } finally {
      clearTimeout(timeout);
      if (uploads.get(entryKey)?.controller === controller) uploads.delete(entryKey);
    }
  })();
  // Navigation need not wait for the network once its exact retry body is durable.
  // Keep the upload running; its acknowledgement event updates history later.
  let receiptTimer: ReturnType<typeof setTimeout> | undefined;
  const receipt = durable
    ? Promise.race([
        upload,
        new Promise<PracticeSaveReceipt>((resolve) => {
          receiptTimer = setTimeout(
            () => resolve({ entry, destination: 'device' }),
            LOCAL_RECEIPT_DELAY_MS,
          );
        }),
      ]).finally(() => clearTimeout(receiptTimer))
    : upload;
  uploads.set(entryKey, { receipt, completion: upload, controller, deviceToken, id: entry.id });
  const result = await receipt;
  requireCurrentDeviceScope(scope, deviceToken);
  return result;
}

export async function flushPracticeSaves(
  scope: string,
  onSaved: (entry: PracticeSession) => void,
  isCurrentAccount: () => boolean = () => true,
  retryPermanent = false,
) {
  if (scope === 'guest') return;
  const deviceToken = getDeviceScopeToken(scope);
  for (const entry of loadLocalPractice(scope)) {
    if (!isCurrentAccount() || !isDeviceScopeCurrent(scope, deviceToken)) return;
    const state = loadPracticeSaveStates(scope).find((item) => item.id === entry.id);
    if (!retryPermanent && state?.failure === 'permanent') break;
    const result = await autoSavePractice(scope, entry, deviceToken);
    if (result.destination !== 'history') break;
    if (isCurrentAccount() && isDeviceScopeCurrent(scope, deviceToken)) onSaved(result.entry);
  }
}
