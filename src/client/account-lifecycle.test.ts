import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AccountSnapshot } from '../shared/account-sync';
import type { LifecycleIdentity, LifecycleResult } from '../shared/account-lifecycle';
import { ApiError } from './api';
import { createRunnerRun } from '../shared/runner';
import { finishedRunnerSession } from './runner-session';
import { retainFinishedRunnerResult, readRunnerResults } from './runner-results';
import { DEFAULT_PROFILE, validatePracticeSession } from '../shared/training';
import {
  attachAccountLifecyclePayload,
  beginAccountLifecycle,
  checkAccountLifecycle,
  dispatchAccountLifecycle,
  getAccountLifecycleRecovery,
  loadAccountLifecycle,
  observeAccountGeneration,
  retryAccountLifecycleLocal,
  stopAccountLifecycle,
  type AccountLifecycleTransports,
} from './account-lifecycle';
import {
  flushAccountOperations,
  loadAccountOperations,
  loadCachedAccount,
  queueAccountChange,
  rememberAccount,
  restoreAccountMemory,
  resolveAccountConflict,
} from './account-outbox';
import { captureDeviceBackup, clearDeviceWork, restoreDeviceBackup } from './device-backup';
import {
  accountLifecycleKey,
  completeDeviceScopeMutation,
  getDeviceScopeToken,
  invalidateDeviceScope,
  isDeviceScopeCurrent,
} from './device-scope';
import {
  autoSavePractice,
  flushPracticeSaves,
  listInFlightPracticeIds,
  loadLocalPractice,
  loadPracticeSaveOrigin,
  loadPracticeSaveStates,
  restorePracticeMemory,
} from './practice-autosave';
import { loadStudioNotes, saveStudioNotes } from './studio-session';

let values: Map<string, string>;
let accountId = '';
let sequence = 0;
const user = () => ({ id: accountId, email: 'synthetic@example.test' });
const state = (generation = 0, revision = 0, historyRevision = 0): AccountSnapshot => ({
  accountId,
  generation,
  revision,
  historyRevision,
  settings: { ...DEFAULT_PROFILE },
  plan: [],
});
const entry = (id = 'waiting-result') =>
  validatePracticeSession({
    id,
    date: '2026-09-30',
    kind: 'other',
    minutes: 1,
    source: 'manual',
    notes: 'Synthetic waiting result',
    createdAt: '2026-09-30T12:00:00.000Z',
  });
const pendingKey = (id = 'waiting-result') => `cwa:practice:pending:v1:${accountId}:${id}`;
const originKey = (id = 'waiting-result') => `cwa:practice:origin:v1:${accountId}:${id}`;
const cacheKey = () => `cwa:account:cache:v1:${accountId}`;
const fetchMock = vi.fn();
function pending() {
  values.set(pendingKey(), JSON.stringify(entry()));
  values.set(
    originKey(),
    JSON.stringify({ version: 1, id: 'waiting-result', accountId, generation: 0 }),
  );
  return queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0WAIT' } });
}
const begin = (kind: 'reset' | 'replace' = 'reset', payload: unknown = { confirmation: 'RESET' }) =>
  beginAccountLifecycle({
    user: user(),
    state: state(),
    kind,
    payload,
    policy: 'keep-recovery-files',
  });
const result = (
  identity: LifecycleIdentity,
  outcome: LifecycleResult['outcome'],
): LifecycleResult => ({
  identity,
  outcome,
  state: outcome === 'applied' ? state(1, 1) : state(),
  ...(outcome === 'applied' ? { applied: { generation: 1, revision: 1 } } : {}),
});
function transports(outcome: LifecycleResult['outcome'] = 'applied'): AccountLifecycleTransports {
  return {
    prepare: vi.fn(async (identity) => ({ ...result(identity, 'unknown'), reserved: true })),
    apply: vi.fn(async (identity) => result(identity, outcome)),
    lookup: vi.fn(async (identity) => result(identity, 'unknown')),
    cancel: vi.fn(async (identity) => result(identity, 'canceled')),
    refresh: vi.fn(async () => state(1, 1)),
  };
}
beforeEach(() => {
  accountId = `lifecycle-account-${++sequence}`;
  values = new Map();
  vi.stubGlobal('localStorage', {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => values.set(name, value),
    removeItem: (name: string) => values.delete(name),
  });
  vi.stubGlobal('window', new EventTarget());
  fetchMock.mockReset().mockRejectedValue(new Error('Offline'));
  vi.stubGlobal('fetch', fetchMock);
  rememberAccount(user(), state());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('freezes the reviewed history authority without adding authority to a legacy snapshot', async () => {
  const reviewed = state(0, 0, 7);
  rememberAccount(user(), reviewed);
  const record = await beginAccountLifecycle({
    user: user(),
    state: reviewed,
    kind: 'reset',
    payload: { confirmation: 'RESET' },
    policy: 'keep-recovery-files',
  });
  reviewed.historyRevision = 8;
  expect(record.identity.baseHistoryRevision).toBe(7);
  expect(loadAccountLifecycle(accountId)?.identity).toEqual(record.identity);
  await stopAccountLifecycle(user(), transports());
  const { historyRevision: _historyRevision, ...legacy } = state();
  rememberAccount(user(), legacy);
  expect(loadCachedAccount(accountId)?.state).not.toHaveProperty('historyRevision');
  const legacyRecord = await beginAccountLifecycle({
    user: user(),
    state: legacy,
    kind: 'reset',
    payload: { confirmation: 'RESET' },
    policy: 'discard',
  });
  expect(legacyRecord.identity.baseHistoryRevision).toBe(0);
});

it('refuses a downloaded state when known history advances while preparing its identity', async () => {
  pending();
  const downloaded = state(0, 0, 4);
  rememberAccount(user(), downloaded);
  const token = getDeviceScopeToken(accountId);
  const preparing = beginAccountLifecycle({
    user: user(),
    state: downloaded,
    kind: 'reset',
    payload: { confirmation: 'RESET' },
    policy: 'keep-recovery-files',
  });
  rememberAccount(user(), state(0, 0, 5));
  await expect(preparing).rejects.toThrow('account changed during review');
  expect(loadAccountLifecycle(accountId)).toBeNull();
  expect(getDeviceScopeToken(accountId)).toBe(token);
  expect(loadLocalPractice(accountId)).toEqual([entry()]);
  expect(downloaded.historyRevision).toBe(4);
  expect(loadCachedAccount(accountId)?.state.historyRevision).toBe(5);
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(['reset', 'replace'] as const)(
  'retains exact %s authority through history validation errors and newer unknown outcomes',
  async (kind) => {
    pending();
    const pendingBody = values.get(pendingKey());
    const originBody = values.get(originKey());
    const reviewed = state(0, 0, 4);
    rememberAccount(user(), reviewed);
    const payload =
      kind === 'reset'
        ? { confirmation: 'RESET' }
        : { mode: 'replace', data: { version: 1, entries: [] } };
    const record = await beginAccountLifecycle({
      user: user(),
      state: reviewed,
      kind,
      payload,
      policy: 'keep-recovery-files',
    });
    const transport = transports();
    const advanced = state(0, 0, 5);
    vi.mocked(transport.prepare)
      .mockRejectedValueOnce(new ApiError('History changed.', 409, advanced, 'history_changed'))
      .mockResolvedValueOnce({
        ...result(record.identity, 'unknown'),
        state: advanced,
        reserved: true,
      });
    await expect(dispatchAccountLifecycle(user(), transport)).rejects.toThrow('History changed');
    expect(loadAccountLifecycle(accountId)?.phase).toBe('prepared');
    vi.mocked(transport.lookup).mockResolvedValueOnce({
      ...result(record.identity, 'unknown'),
      state: advanced,
    });
    await checkAccountLifecycle(user(), transport);
    vi.mocked(transport.apply).mockRejectedValueOnce(
      new ApiError('History changed.', 409, advanced, 'history_changed'),
    );
    await expect(dispatchAccountLifecycle(user(), transport)).rejects.toThrow('History changed');
    expect(loadAccountLifecycle(accountId)?.identity).toEqual(record.identity);
    expect(record.identity.baseHistoryRevision).toBe(4);
    expect(transport.prepare).toHaveBeenNthCalledWith(1, record.identity);
    expect(transport.prepare).toHaveBeenNthCalledWith(2, record.identity);
    expect(transport.lookup).toHaveBeenCalledWith(record.identity);
    expect(transport.apply).toHaveBeenCalledWith(record.identity, payload);
    expect(values.get(pendingKey())).toBe(pendingBody);
    expect(values.get(originKey())).toBe(originBody);
    vi.mocked(transport.cancel).mockResolvedValueOnce({
      ...result(record.identity, 'canceled'),
      state: advanced,
    });
    await stopAccountLifecycle(user(), transport);
    expect(transport.cancel).toHaveBeenCalledWith(record.identity);
    expect(values.get(pendingKey())).toBe(pendingBody);
    expect(values.get(originKey())).toBe(originBody);
  },
);

it('reconciles the exact retained replacement receipt after reload and later history advances', async () => {
  pending();
  const payload = { mode: 'replace', data: { version: 1, entries: [] } };
  const reviewed = state(0, 0, 4);
  rememberAccount(user(), reviewed);
  const record = await beginAccountLifecycle({
    user: user(),
    state: reviewed,
    kind: 'replace',
    payload,
    policy: 'keep-recovery-files',
  });
  const transport = transports();
  vi.mocked(transport.apply).mockRejectedValueOnce(new Error('Apply acknowledgement lost'));
  await expect(dispatchAccountLifecycle(user(), transport)).rejects.toThrow(
    'Apply acknowledgement lost',
  );
  vi.mocked(transport.lookup).mockResolvedValueOnce({
    ...result(record.identity, 'unknown'),
    state: state(0, 0, 5),
  });
  await checkAccountLifecycle(user(), transport);
  expect(loadAccountLifecycle(accountId)?.phase).toBe('unknown');
  expect(loadAccountLifecycle(accountId)?.identity).toEqual(record.identity);
  expect(transport.lookup).toHaveBeenCalledWith(record.identity);
  vi.resetModules();
  const reopened = await import('./account-lifecycle');
  expect(reopened.loadAccountLifecycle(accountId)?.identity).toEqual(record.identity);
  await reopened.attachAccountLifecyclePayload(accountId, payload);
  const later = state(1, 1, 9);
  vi.mocked(transport.prepare).mockResolvedValueOnce({
    ...result(record.identity, 'applied'),
    state: later,
  });
  vi.mocked(transport.refresh!).mockResolvedValueOnce(later);
  await reopened.dispatchAccountLifecycle(user(), transport);
  expect(transport.prepare).toHaveBeenNthCalledWith(2, record.identity);
  expect(record.identity.baseHistoryRevision).toBe(4);
  expect(transport.apply).toHaveBeenCalledTimes(1);
  expect(transport.apply).toHaveBeenCalledWith(record.identity, payload);
  expect(reopened.loadAccountLifecycle(accountId)).toBeNull();
  expect(loadCachedAccount(accountId)?.state.historyRevision).toBe(9);
});

it('does not publish known older history over authority observed here or cached by another page', () => {
  rememberAccount(user(), state(0, 0, 5));
  rememberAccount(user(), state(0, 0, 4));
  expect(loadCachedAccount(accountId)?.state.historyRevision).toBe(5);
  expect(loadAccountLifecycle(accountId)).toBeNull();
  values.set(cacheKey(), JSON.stringify({ user: user(), state: state(0, 0, 6) }));
  rememberAccount(user(), state(0, 0, 5));
  expect(loadCachedAccount(accountId)?.state.historyRevision).toBe(6);
  expect(() => observeAccountGeneration(user(), state(0, 0, -1))).toThrow('Invalid observed');
});

it('keeps applied cleanup paused when refresh would replace confirmed history with an older snapshot', async () => {
  pending();
  const record = await begin();
  const transport = transports();
  vi.mocked(transport.apply).mockResolvedValueOnce({
    ...result(record.identity, 'applied'),
    state: state(1, 1, 8),
  });
  vi.mocked(transport.refresh!)
    .mockResolvedValueOnce(state(1, 1, 7))
    .mockResolvedValueOnce(state(1, 1, 9));
  await expect(dispatchAccountLifecycle(user(), transport)).rejects.toThrow(
    'Reload the confirmed replacement account state',
  );
  expect(loadAccountLifecycle(accountId)?.phase).toBe('applied');
  expect(loadLocalPractice(accountId)).toEqual([entry()]);
  await retryAccountLifecycleLocal(user(), transport);
  expect(transport.apply).toHaveBeenCalledTimes(1);
  expect(loadAccountLifecycle(accountId)).toBeNull();
  expect(loadCachedAccount(accountId)?.state.historyRevision).toBe(9);
});

it('captures both real queues and stops in-flight acknowledgements before dispatch', async () => {
  vi.useFakeTimers();
  let acknowledge!: (response: Response) => void;
  let signal!: AbortSignal;
  fetchMock.mockImplementationOnce((_url, options) => {
    signal = options.signal;
    return new Promise<Response>((resolve) => {
      acknowledge = resolve;
    });
  });
  const oldToken = getDeviceScopeToken(accountId);
  const save = autoSavePractice(accountId, entry(), oldToken);
  const oldReceipt = expect(save).rejects.toThrow('device work changed');
  expect(listInFlightPracticeIds(accountId)).toEqual(['waiting-result']);
  queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0WAIT' } });
  const record = await begin();
  expect(record.counts).toMatchObject({ practice: 1, accountOperations: 1 });
  expect(signal.aborted).toBe(true);
  expect(listInFlightPracticeIds(accountId)).toEqual([]);
  expect(isDeviceScopeCurrent(accountId, oldToken)).toBe(false);
  acknowledge(Response.json({ entry: entry(), generation: 0, revision: 0 }));
  await vi.advanceTimersByTimeAsync(750);
  await oldReceipt;
  expect(loadLocalPractice(accountId)).toEqual([entry()]);
  const transport = transports();
  await dispatchAccountLifecycle(user(), transport);
  expect(loadLocalPractice(accountId)).toEqual([]);
  expect(loadAccountOperations(accountId)).toEqual([]);
  expect(loadCachedAccount(accountId)?.state.generation).toBe(1);
  expect(isDeviceScopeCurrent(accountId, oldToken)).toBe(false);
});

it('exports a server-only in-flight body and requires its recovery retention before dispatching reset', async () => {
  let rejectBody = true;
  const real = localStorage.setItem.bind(localStorage);
  vi.spyOn(localStorage, 'setItem').mockImplementation((name, value) => {
    if (name === pendingKey() && rejectBody) throw new Error('Result quota');
    real(name, value);
  });
  let acknowledge!: (response: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        acknowledge = resolve;
      }),
  );
  const oldToken = getDeviceScopeToken(accountId);
  const save = autoSavePractice(accountId, entry(), oldToken);
  const oldResult = expect(save).rejects.toThrow('selected account changed');
  const recovery = captureDeviceBackup(accountId, user().email);
  expect(recovery.stores.practice[0]).toMatchObject({
    id: 'waiting-result',
    body: JSON.stringify(entry()),
    origin: { generation: 0 },
  });
  await expect(begin()).rejects.toThrow('Result quota');
  expect(loadAccountLifecycle(accountId)).toBeNull();
  expect(isDeviceScopeCurrent(accountId, oldToken)).toBe(true);
  expect(listInFlightPracticeIds(accountId)).toEqual(['waiting-result']);
  rejectBody = false;
  await begin();
  expect(values.get(pendingKey())).toBe(JSON.stringify(entry()));
  acknowledge(Response.json({ entry: entry(), generation: 0 }));
  await oldResult;
  const transport = transports();
  await dispatchAccountLifecycle(user(), transport);
  expect(transport.apply).toHaveBeenCalledTimes(1);
  expect(loadLocalPractice(accountId)).toEqual([]);
});

it('does not send without durable identity readback and keeps exact pending data available', async () => {
  const edit = pending();
  restorePracticeMemory(accountId, [
    {
      id: 'waiting-result',
      status: 'failed',
      failure: 'auth',
      error: 'Volatile authentication failure',
    },
  ]);
  restoreAccountMemory(accountId, [
    { ...edit, status: 'conflict', failure: 'permanent', error: 'Volatile conflict' },
  ]);
  const original = localStorage.setItem.bind(localStorage);
  vi.spyOn(localStorage, 'setItem').mockImplementation((name, value) => {
    if (name === accountLifecycleKey(accountId)) return;
    original(name, value);
  });
  await expect(begin()).rejects.toThrow('could not retain account recovery');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(loadAccountLifecycle(accountId)).toBeNull();
  expect(loadLocalPractice(accountId)).toEqual([entry()]);
  expect(loadPracticeSaveStates(accountId)[0]).toMatchObject({
    error: 'Volatile authentication failure',
  });
  expect(loadAccountOperations(accountId)[0]).toMatchObject({
    status: 'conflict',
    error: 'Volatile conflict',
  });
  expect(isDeviceScopeCurrent(accountId, getDeviceScopeToken(accountId))).toBe(true);
});

it('fails before dispatch when optional volatile data cannot be durably retained', async () => {
  pending();
  const real = localStorage.setItem.bind(localStorage);
  vi.spyOn(localStorage, 'setItem').mockImplementation((name, value) => {
    if (name.startsWith('cwa.studio.scratchpad.')) throw new Error('Quota');
    real(name, value);
  });
  saveStudioNotes(accountId, 'public:words', 'Memory-only synthetic notes');
  await expect(begin()).rejects.toThrow('Quota');
  expect(loadAccountLifecycle(accountId)).toBeNull();
  expect(loadStudioNotes(accountId, 'public:words')).toBe('Memory-only synthetic notes');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('safe cancellation restores original body, origin, order, volatile failures and note tombstones', async () => {
  const edit = pending();
  const originalBody = values.get(pendingKey());
  const operationBody = [...values].find(([key]) => key.startsWith('cwa:account:operation:'))![1];
  saveStudioNotes(accountId, 'public:words', 'Original disk notes');
  const realRemove = localStorage.removeItem.bind(localStorage);
  vi.spyOn(localStorage, 'removeItem').mockImplementation((name) => {
    if (name.startsWith('cwa.studio.scratchpad.')) throw new Error('Quota');
    realRemove(name);
  });
  saveStudioNotes(accountId, 'public:words', '');
  vi.restoreAllMocks();
  restorePracticeMemory(accountId, [
    { id: 'waiting-result', status: 'failed', failure: 'auth', error: 'Sign in again.' },
  ]);
  restoreAccountMemory(accountId, [
    { ...edit, status: 'conflict', failure: 'permanent', error: 'Retained conflict' },
  ]);
  const record = await begin();
  // Current optional state is durable, so a reload also retains empty tombstones/status.
  expect(
    values.get('cwa.studio.scratchpad.v1:' + JSON.stringify([accountId, 'public:words'])),
  ).toBeUndefined();
  const transport = transports();
  vi.mocked(transport.apply).mockRejectedValueOnce(new Error('Lost response'));
  await expect(dispatchAccountLifecycle(user(), transport)).rejects.toThrow('Lost response');
  expect(loadAccountLifecycle(accountId)?.phase).toBe('unknown');
  await stopAccountLifecycle(user(), transport);
  expect(values.get(pendingKey())).toBe(originalBody);
  expect([...values].find(([key]) => key.startsWith('cwa:account:operation:'))![1]).toBe(
    operationBody,
  );
  expect(loadPracticeSaveOrigin(accountId, 'waiting-result').generation).toBe(0);
  expect(loadPracticeSaveStates(accountId)[0]).toMatchObject({
    failure: 'auth',
    error: 'Sign in again.',
  });
  expect(loadAccountOperations(accountId)[0]).toMatchObject({
    status: 'conflict',
    error: 'Retained conflict',
    order: edit.order,
  });
  expect(loadStudioNotes(accountId, 'public:words')).toBe('');
  expect(isDeviceScopeCurrent(accountId, record.token)).toBe(true);
});

it('absence remains unknown after reload and local restore/clear cannot bypass server recovery', async () => {
  pending();
  const backup = captureDeviceBackup(accountId, user().email);
  await begin();
  const transport = transports('unknown');
  await dispatchAccountLifecycle(user(), transport);
  vi.resetModules();
  const reopened = await import('./account-lifecycle');
  expect(reopened.loadAccountLifecycle(accountId)?.phase).toBe('unknown');
  await reopened.checkAccountLifecycle(user(), transport);
  expect(reopened.loadAccountLifecycle(accountId)?.phase).toBe('unknown');
  expect(() => clearDeviceWork(accountId, { recoverInterrupted: true })).toThrow('account reset');
  expect(() =>
    restoreDeviceBackup(backup, { expectedScope: accountId, recoverInterrupted: true }),
  ).toThrow('account reset');
  expect(() => invalidateDeviceScope(accountId, { recoverInterrupted: true })).toThrow(
    'account reset',
  );
  expect(() => completeDeviceScopeMutation(accountId, getDeviceScopeToken(accountId))).toThrow(
    'account reset',
  );
  expect(loadLocalPractice(accountId)).toEqual([entry()]);
});

it('retains only compact replacement identity and accepts matching reordered file content after reload', async () => {
  pending();
  const payload = {
    mode: 'replace',
    data: { version: 1, syntheticPadding: 'x'.repeat(20_000), entries: [] },
  };
  const record = await begin('replace', payload);
  const raw = values.get(accountLifecycleKey(accountId))!;
  expect(raw.length).toBeLessThan(2000);
  expect(raw).not.toContain('syntheticPadding');
  vi.resetModules();
  const reopened = await import('./account-lifecycle');
  const transport = transports();
  await expect(reopened.dispatchAccountLifecycle(user(), transport)).rejects.toThrow(
    'same replacement file',
  );
  await expect(
    reopened.attachAccountLifecyclePayload(accountId, {
      ...payload,
      data: { ...payload.data, entries: [1] },
    }),
  ).rejects.toThrow('does not match');
  await reopened.attachAccountLifecyclePayload(accountId, {
    data: { entries: [], syntheticPadding: payload.data.syntheticPadding, version: 1 },
    mode: 'replace',
  });
  await reopened.dispatchAccountLifecycle(user(), transport);
  expect(transport.apply).toHaveBeenCalledWith(record.identity, payload);
  expect(reopened.loadAccountLifecycle(accountId)).toBeNull();
});

it('retries applied cleanup locally after refresh failure without replaying reset', async () => {
  pending();
  await begin();
  const transport = transports();
  vi.mocked(transport.refresh!).mockRejectedValueOnce(new Error('Refresh offline'));
  await expect(dispatchAccountLifecycle(user(), transport)).rejects.toThrow('Refresh offline');
  expect(loadAccountLifecycle(accountId)?.phase).toBe('applied');
  expect(loadLocalPractice(accountId)).toEqual([entry()]);
  await retryAccountLifecycleLocal(user(), transport, 'keep-recovery-files');
  expect(transport.apply).toHaveBeenCalledTimes(1);
  expect(loadAccountLifecycle(accountId)).toBeNull();
  expect(loadLocalPractice(accountId)).toEqual([]);
});

it('does not restore old active work after partial cleanup failure and offers the frozen recovery file', async () => {
  pending();
  const captured = captureDeviceBackup(accountId, user().email);
  await begin();
  const real = localStorage.removeItem.bind(localStorage);
  let failed = false;
  vi.spyOn(localStorage, 'removeItem').mockImplementation((name) => {
    if (name === pendingKey() && !failed) {
      failed = true;
      throw new Error('Cleanup quota');
    }
    real(name);
  });
  const transport = transports();
  await expect(dispatchAccountLifecycle(user(), transport)).rejects.toThrow('Cleanup quota');
  expect(loadAccountLifecycle(accountId)?.phase).toBe('applied');
  expect(getAccountLifecycleRecovery(accountId)?.stores).toEqual(captured.stores);
  await retryAccountLifecycleLocal(user(), transport);
  expect(transport.apply).toHaveBeenCalledTimes(1);
  expect(loadLocalPractice(accountId)).toEqual([]);
  expect(loadAccountOperations(accountId)).toEqual([]);
});

it('retains applied authority across a reload and retries only local finalization', async () => {
  pending();
  await begin();
  const transport = transports();
  vi.mocked(transport.refresh!).mockRejectedValueOnce(new Error('Offline'));
  await expect(dispatchAccountLifecycle(user(), transport)).rejects.toThrow('Offline');
  vi.resetModules();
  const reopened = await import('./account-lifecycle');
  await reopened.dispatchAccountLifecycle(user(), transport);
  expect(transport.apply).toHaveBeenCalledTimes(1);
  expect(transport.refresh).toHaveBeenCalledTimes(2);
  expect(reopened.loadAccountLifecycle(accountId)).toBeNull();
});

it('stays fenced if releasing the durable applied record fails after device cleanup', async () => {
  pending();
  const record = await begin();
  const real = localStorage.removeItem.bind(localStorage);
  let failRelease = true;
  vi.spyOn(localStorage, 'removeItem').mockImplementation((name) => {
    if (name === accountLifecycleKey(accountId) && failRelease)
      throw new Error('Record release failed');
    real(name);
  });
  const transport = transports();
  await expect(dispatchAccountLifecycle(user(), transport)).rejects.toThrow(
    'Record release failed',
  );
  expect(loadAccountLifecycle(accountId)?.phase).toBe('applied');
  expect(isDeviceScopeCurrent(accountId, record.token)).toBe(false);
  expect(loadLocalPractice(accountId)).toEqual([]);
  vi.resetModules();
  failRelease = false;
  const reopened = await import('./account-lifecycle');
  await reopened.retryAccountLifecycleLocal(user(), transport);
  expect(transport.apply).toHaveBeenCalledTimes(1);
  expect(isDeviceScopeCurrent(accountId, record.token)).toBe(true);
});

it('keeps an applied live acknowledgement when its phase write fails and never sends a second destructive request', async () => {
  pending();
  await begin();
  const real = localStorage.setItem.bind(localStorage);
  let failApplied = true;
  vi.spyOn(localStorage, 'setItem').mockImplementation((name, value) => {
    if (
      name === accountLifecycleKey(accountId) &&
      JSON.parse(value).phase === 'applied' &&
      failApplied
    )
      throw new Error('Applied record quota');
    real(name, value);
  });
  const transport = transports();
  await expect(dispatchAccountLifecycle(user(), transport)).rejects.toThrow('Applied record quota');
  expect(loadAccountLifecycle(accountId)?.phase).toBe('unknown');
  failApplied = false;
  await dispatchAccountLifecycle(user(), transport);
  expect(transport.apply).toHaveBeenCalledTimes(1);
  expect(loadAccountLifecycle(accountId)).toBeNull();
});

it('keeps A paused while B stays independently usable and cannot release A', async () => {
  pending();
  const a = user();
  await begin();
  const b = { id: `${accountId}-other`, email: 'other@example.test' };
  rememberAccount(b, { ...state(), accountId: b.id });
  expect(isDeviceScopeCurrent(b.id, getDeviceScopeToken(b.id))).toBe(true);
  expect(() =>
    queueAccountChange(
      { ...state(), accountId: b.id },
      { type: 'settings', changes: { callsign: 'N0OTHER' } },
    ),
  ).not.toThrow();
  await expect(stopAccountLifecycle(a, transports())).rejects.toThrow('Select and sign in');
  expect(loadAccountLifecycle(a.id)).not.toBeNull();
  rememberAccount(a, state()); // Existing selection is deliberately independent of paused account cache.
  const { selectAccountIdentity } = await import('./account-outbox');
  selectAccountIdentity(a);
  await stopAccountLifecycle(a, transports());
  expect(loadAccountLifecycle(a.id)).toBeNull();
  expect(loadAccountOperations(b.id)).toHaveLength(1);
});

it('fences higher remote generations before publishing and retires old waiting work before new saves', async () => {
  pending();
  const oldToken = getDeviceScopeToken(accountId);
  rememberAccount(user(), state(1, 1));
  expect(loadCachedAccount(accountId)?.state.generation).toBe(0);
  expect(loadAccountLifecycle(accountId)?.phase).toBe('remote');
  expect(isDeviceScopeCurrent(accountId, oldToken)).toBe(false);
  const transport = transports();
  await expect(retryAccountLifecycleLocal(user(), transport)).rejects.toThrow(
    'Download device recovery',
  );
  await retryAccountLifecycleLocal(user(), transport, 'keep-recovery-files');
  expect(transport.apply).not.toHaveBeenCalled();
  expect(loadAccountOperations(accountId)).toEqual([]);
  fetchMock.mockResolvedValueOnce(
    Response.json({ entry: entry('new-result'), generation: 1, revision: 1 }),
  );
  await autoSavePractice(accountId, entry('new-result'));
  expect(fetchMock.mock.calls[0][1].headers['X-CWA-Generation']).toBe('1');
  expect(loadLocalPractice(accountId)).toEqual([]);
});

it('fences a known remote change despite optional note/status write failure and preserves live recovery', async () => {
  const edit = pending();
  const real = localStorage.setItem.bind(localStorage);
  vi.spyOn(localStorage, 'setItem').mockImplementation((name, value) => {
    if (
      name.startsWith('cwa:practice:status:') ||
      name.startsWith('cwa:account:status:') ||
      name.startsWith('cwa.studio.scratchpad.')
    )
      throw new Error('Optional storage quota');
    real(name, value);
  });
  saveStudioNotes(accountId, 'public:words', 'Live synthetic recovery notes');
  restorePracticeMemory(accountId, [
    {
      id: 'waiting-result',
      status: 'failed',
      failure: 'auth',
      error: 'Live authentication failure',
    },
  ]);
  restoreAccountMemory(accountId, [
    { ...edit, status: 'conflict', failure: 'permanent', error: 'Live edit conflict' },
  ]);
  const oldToken = getDeviceScopeToken(accountId);
  expect(observeAccountGeneration(user(), state(1, 1))).toBe(false);
  expect(loadAccountLifecycle(accountId)?.phase).toBe('remote');
  expect(isDeviceScopeCurrent(accountId, oldToken)).toBe(false);
  expect(loadCachedAccount(accountId)?.state.generation).toBe(0);
  const recovery = getAccountLifecycleRecovery(accountId)!;
  expect(recovery.stores.practice[0].state).toMatchObject({
    failure: 'auth',
    error: 'Live authentication failure',
  });
  expect(recovery.stores.accountOperations[0].state).toMatchObject({
    status: 'conflict',
    error: 'Live edit conflict',
  });
  expect(recovery.stores.scratchpads).toEqual([
    { context: 'public:words', text: 'Live synthetic recovery notes' },
  ]);
  await retryAccountLifecycleLocal(user(), transports(), 'keep-recovery-files');
  expect(loadAccountLifecycle(accountId)).toBeNull();
  expect(loadCachedAccount(accountId)?.state.generation).toBe(1);
});

it('detects a higher generation already written into cache by another tab', async () => {
  pending();
  const oldToken = getDeviceScopeToken(accountId);
  values.set(cacheKey(), JSON.stringify({ user: user(), state: state(2, 2) }));
  expect(observeAccountGeneration(user(), state(2, 2))).toBe(false);
  expect(loadAccountLifecycle(accountId)?.identity.generation).toBe(0);
  expect(isDeviceScopeCurrent(accountId, oldToken)).toBe(false);
});

it('recognizes old immutable origins restored without optional account context before first cache publication', async () => {
  pending();
  values.delete(cacheKey());
  values.delete(`cwa:account:identity:v1:${accountId}`);
  vi.resetModules();
  const reopened = await import('./account-lifecycle');
  const outbox = await import('./account-outbox');
  expect(reopened.observeAccountGeneration(user(), state(1, 1))).toBe(false);
  expect(reopened.loadAccountLifecycle(accountId)?.identity.generation).toBe(0);
  expect(outbox.loadCachedAccount(accountId)).toBeNull();
  await reopened.retryAccountLifecycleLocal(user(), transports(), 'discard');
  expect(loadLocalPractice(accountId)).toEqual([]);
  expect(outbox.loadCachedAccount(accountId)?.state.generation).toBe(1);
});

it('offers local disposition for unknown pending origins before initial account cache publication', async () => {
  values.set(pendingKey(), JSON.stringify(entry()));
  values.delete(cacheKey());
  vi.resetModules();
  const reopened = await import('./account-lifecycle');
  const outbox = await import('./account-outbox');
  outbox.rememberAccount(user(), state());
  expect(reopened.loadAccountLifecycle(accountId)?.phase).toBe('remote');
  expect(reopened.loadAccountLifecycle(accountId)?.error).toContain('unknown original dataset');
  expect(outbox.loadCachedAccount(accountId)).toBeNull();
  expect(
    reopened.getAccountLifecycleRecovery(accountId)?.stores.practice[0].origin,
  ).not.toHaveProperty('generation');
  await reopened.retryAccountLifecycleLocal(
    user(),
    { ...transports(), refresh: async () => state() },
    'keep-recovery-files',
  );
  expect(outbox.loadCachedAccount(accountId)?.state.generation).toBe(0);
  expect(loadLocalPractice(accountId)).toEqual([]);
});

it('keeps ordinary fresh server-acknowledged practice available when optional browser storage fails', async () => {
  const real = localStorage.setItem.bind(localStorage);
  vi.spyOn(localStorage, 'setItem').mockImplementation((name, value) => {
    if (name === 'cwa:account:active:v1' || name.startsWith('cwa:account:selection-failure:'))
      real(name, value);
    else throw new Error('Quota');
  });
  // Fresh server confirmation supplies authority even when optional caching fails.
  const fresh = { id: `${accountId}-fresh`, email: 'fresh@example.test' };
  rememberAccount(fresh, { ...state(7, 1), accountId: fresh.id });
  fetchMock.mockResolvedValueOnce(Response.json({ entry: entry('server-only'), generation: 7 }));
  expect((await autoSavePractice(fresh.id, entry('server-only'))).destination).toBe('history');
  expect(fetchMock.mock.calls[0][1].headers['X-CWA-Generation']).toBe('7');
  expect(loadAccountLifecycle(fresh.id)).toBeNull();
});

it('loads ordinary UI safely with unavailable storage, while unreadable existing coordination stays fenced', async () => {
  pending();
  const record = await begin();
  const real = localStorage.getItem.bind(localStorage);
  vi.spyOn(localStorage, 'getItem').mockImplementation((name) => {
    if (name === accountLifecycleKey(accountId)) throw new Error('Storage disabled');
    return real(name);
  });
  expect(loadAccountLifecycle(accountId)?.identity.id).toBe(record.identity.id);
  expect(isDeviceScopeCurrent(accountId, record.token)).toBe(false);
  expect(loadAccountLifecycle(`${accountId}-fresh`)).toBeNull();
});

it('admits a destructive request only after its exact cancellation reservation is acknowledged', async () => {
  pending();
  const record = await begin();
  const transport = transports();
  vi.mocked(transport.prepare).mockResolvedValueOnce(result(record.identity, 'unknown'));
  await expect(dispatchAccountLifecycle(user(), transport)).rejects.toThrow(
    'No reset or replacement was sent',
  );
  expect(transport.apply).not.toHaveBeenCalled();
  expect(loadAccountLifecycle(accountId)?.phase).toBe('prepared');
  await dispatchAccountLifecycle(user(), transport);
  expect(transport.apply).toHaveBeenCalledTimes(1);
  expect(transport.prepare).toHaveBeenCalledTimes(2);
});

it('retains undispatched preparation through lost responses and absent lookup until an explicit safe stop', async () => {
  pending();
  await begin();
  const transport = transports();
  vi.mocked(transport.prepare).mockRejectedValueOnce(new Error('Reservation acknowledgement lost'));
  await expect(dispatchAccountLifecycle(user(), transport)).rejects.toThrow(
    'Reservation acknowledgement lost',
  );
  await checkAccountLifecycle(user(), transport);
  expect(loadAccountLifecycle(accountId)?.phase).toBe('prepared');
  expect(transport.apply).not.toHaveBeenCalled();
  await stopAccountLifecycle(user(), transport);
  expect(loadAccountLifecycle(accountId)).toBeNull();
  expect(loadLocalPractice(accountId)).toEqual([entry()]);
});

it('releases an undispatched request when authoritative capacity rejection proves no apply admission', async () => {
  pending();
  await begin();
  const transport = transports();
  vi.mocked(transport.prepare).mockRejectedValueOnce(
    new ApiError('Control reservation is full.', 507, state(), 'lifecycle_capacity'),
  );
  await expect(dispatchAccountLifecycle(user(), transport)).rejects.toThrow(
    'Control reservation is full',
  );
  vi.mocked(transport.cancel).mockRejectedValueOnce(
    new ApiError('Control reservation is full.', 507, state(), 'lifecycle_capacity'),
  );
  expect((await stopAccountLifecycle(user(), transport))?.outcome).toBe('canceled');
  expect(transport.apply).not.toHaveBeenCalled();
  expect(loadAccountLifecycle(accountId)).toBeNull();
  expect(loadLocalPractice(accountId)).toEqual([entry()]);
});

it('cannot treat capacity failure as not-applied after the request was dispatched', async () => {
  pending();
  await begin();
  const transport = transports();
  vi.mocked(transport.apply).mockRejectedValueOnce(new Error('Apply acknowledgement lost'));
  await expect(dispatchAccountLifecycle(user(), transport)).rejects.toThrow(
    'Apply acknowledgement lost',
  );
  vi.mocked(transport.cancel).mockRejectedValueOnce(
    new ApiError('Synthetic capacity refusal', 507, state(), 'lifecycle_capacity'),
  );
  await expect(stopAccountLifecycle(user(), transport)).rejects.toThrow(
    'Synthetic capacity refusal',
  );
  expect(loadAccountLifecycle(accountId)?.phase).toBe('unknown');
  expect(isDeviceScopeCurrent(accountId, getDeviceScopeToken(accountId))).toBe(false);
});

it('does not dispatch a delayed reservation acknowledgement after another page stopped preparation', async () => {
  pending();
  const record = await begin();
  let reserved!: (result: LifecycleResult) => void;
  const transport = transports();
  vi.mocked(transport.prepare).mockImplementationOnce(
    () =>
      new Promise<LifecycleResult>((resolve) => {
        reserved = resolve;
      }),
  );
  const dispatching = dispatchAccountLifecycle(user(), transport);
  const rejected = expect(dispatching).rejects.toThrow('no pending account recovery');
  await vi.waitFor(() => expect(reserved).toBeDefined());
  // A second page has separate module promise ownership and the same durable identity/token.
  vi.resetModules();
  const otherPage = await import('./account-lifecycle');
  await otherPage.stopAccountLifecycle(user(), transports());
  reserved({ ...result(record.identity, 'unknown'), reserved: true });
  await rejected;
  expect(transport.apply).not.toHaveBeenCalled();
  expect(loadAccountLifecycle(accountId)).toBeNull();
  expect(loadLocalPractice(accountId)).toEqual([entry()]);
});

it('does not promote restored old or unknown practice and does not let it block current saves', async () => {
  const edit = pending();
  values.set(cacheKey(), JSON.stringify({ user: user(), state: state(1, 1) }));
  // Model explicit restore from an old file into an already-current fresh device owner.
  values.set(originKey(), JSON.stringify({ version: 1, id: 'waiting-result', accountId }));
  await flushPracticeSaves(accountId, vi.fn(), () => true, true);
  expect(fetchMock).not.toHaveBeenCalled();
  expect(loadPracticeSaveOrigin(accountId, 'waiting-result').generation).toBeUndefined();
  expect(() =>
    resolveAccountConflict(accountId, edit.operation.id, 'reapply', state(1, 1)),
  ).toThrow('retired dataset');
  fetchMock.mockResolvedValueOnce(Response.json({ state: state(1, 2), operationId: 'fresh-edit' }));
  queueAccountChange(
    state(1, 1),
    { type: 'settings', changes: { callsign: 'N0FRESH' } },
    { id: 'fresh-edit' },
  );
  await flushAccountOperations(accountId);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).id).toBe('fresh-edit');
  expect(loadAccountOperations(accountId)).toHaveLength(1);
});

it('counts finished Runner results in destructive recovery and reads older lifecycle records', async () => {
  const runner = finishedRunnerSession(
    {
      ...createRunnerRun('lifecycle-terminal', {
        mode: 'SingleCall',
        wpm: 20,
        durationSeconds: 60,
        activity: 1,
        conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
      }),
      status: 'stopped',
      elapsedSeconds: 12,
      runStartedAt: '2026-10-01T12:00:00.000Z',
      runEndedAt: '2026-10-01T12:00:12.000Z',
    },
    {},
    'UTC',
  );
  retainFinishedRunnerResult(accountId, runner, { id: runner.id, accountId, generation: 0 });
  retainFinishedRunnerResult('guest', runner, { id: runner.id, accountId: 'guest' });
  const guest = readRunnerResults('guest');
  const record = await begin();
  expect(record.counts).toMatchObject({ practice: 0, runnerResults: 1 });
  expect(loadAccountLifecycle(accountId)?.counts.runnerResults).toBe(1);
  const old = structuredClone(record);
  delete old.counts.runnerResults;
  values.set(accountLifecycleKey(accountId), JSON.stringify(old));
  expect(loadAccountLifecycle(accountId)?.counts.runnerResults).toBeUndefined();
  values.set(accountLifecycleKey(accountId), JSON.stringify(record));
  await dispatchAccountLifecycle(user(), transports());
  expect(readRunnerResults(accountId).results).toEqual([]);
  expect(readRunnerResults('guest')).toEqual(guest);
});
