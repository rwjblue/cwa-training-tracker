import { createReportDocument } from '../shared/report-document';
import { starterAdvisorReportDefinition } from '../shared/report-definition';
import { captureReportHandoff, confirmReportHandoff } from '../shared/report-handoff';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applyAccountChange, type AccountSnapshot } from '../shared/account-sync';
import { DEFAULT_PROFILE } from '../shared/training';
import {
  flushAccountOperations,
  forgetActiveAccount,
  loadAccountOperations,
  loadCachedAccount,
  projectAccountState,
  queueAccountChange,
  rememberAccount,
  resolveAccountConflict,
  retryAccountOperations,
  suspendAccountUploads,
  getSelectedAccountId,
  selectAccountIdentity,
  resumeAccountUploads,
  loadSelectedAccountIdentity,
  isSelectedAccount,
  getAccountStorageStatus,
  listInFlightAccountOperationIds,
} from './account-outbox';
import {
  completeDeviceScopeMutation,
  getDeviceScopeToken,
  invalidateDeviceScope,
} from './device-scope';

const fetchMock = vi.fn();
let values: Map<string, string>;
let scope = '';
let counter = 0;
const state = (revision = 0): AccountSnapshot => ({
  accountId: scope,
  revision,
  generation: 0,
  settings: { ...DEFAULT_PROFILE },
  plan: [],
});
const owner = () => ({ id: scope, email: 'synthetic@example.test' });
beforeEach(() => {
  scope = `account-${++counter}`;
  values = new Map();
  vi.stubGlobal('localStorage', {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  rememberAccount(owner(), state());
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('projects offline semantic edits in order and freezes each origin revision', () => {
  queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0SYN' } });
  queueAccountChange(state(), { type: 'settings', changes: { dailyGoalMinutes: 35 } });
  const operations = loadAccountOperations(scope);
  expect(operations.map((item) => item.operation.baseRevision)).toEqual([0, 1]);
  expect(projectAccountState(state())).toMatchObject({
    revision: 2,
    settings: { callsign: 'N0SYN', dailyGoalMinutes: 35, timezone: DEFAULT_PROFILE.timezone },
  });
  expect(loadAccountOperations('another-account')).toEqual([]);
  expect(loadCachedAccount()).toEqual({ user: owner(), state: state() });
  forgetActiveAccount();
  expect(loadCachedAccount()).toBeNull();
  expect(loadCachedAccount(scope)?.state).toEqual(state());
  expect(loadAccountOperations(scope)).toHaveLength(2);
});

it('does not join canceled account uploads or publish their acknowledgement after exact restore', async () => {
  const token = getDeviceScopeToken(scope);
  const item = queueAccountChange(
    state(),
    { type: 'settings', changes: { callsign: 'N0RESTORE' } },
    { deviceToken: token },
  );
  const acknowledge: ((response: Response) => void)[] = [];
  fetchMock.mockImplementation(() => new Promise<Response>((resolve) => acknowledge.push(resolve)));
  const oldPublished = vi.fn();
  const oldUpload = flushAccountOperations(scope, oldPublished);
  expect(listInFlightAccountOperationIds(scope)).toEqual([item.operation.id]);
  suspendAccountUploads(scope);
  const next = invalidateDeviceScope(scope);
  // Retaining the exact immutable operation represents its deterministic restoration.
  completeDeviceScopeMutation(scope, next);
  resumeAccountUploads(scope);
  const newPublished = vi.fn();
  const freshUpload = flushAccountOperations(scope, newPublished);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const response = {
    state: { ...applyAccountChange(state(), item.operation.change), revision: 1 },
    operationId: item.operation.id,
  };
  acknowledge[0](Response.json(response));
  await oldUpload;
  expect(oldPublished).not.toHaveBeenCalled();
  expect(loadCachedAccount(scope)?.state.revision).toBe(0);
  expect(loadAccountOperations(scope)[0].operation.id).toBe(item.operation.id);
  const joinedFresh = flushAccountOperations(scope, newPublished);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  acknowledge[1](Response.json(response));
  await freshUpload;
  await joinedFresh;
  expect(newPublished).toHaveBeenCalledTimes(1);
  expect(loadAccountOperations(scope)).toEqual([]);
  expect(() =>
    queueAccountChange(
      state(1),
      { type: 'settings', changes: { callsign: 'N0STALE' } },
      { deviceToken: token },
    ),
  ).toThrow('device work changed');
});

it('retries a lost acknowledgement with the exact operation ID, body, owner and revision', async () => {
  const item = queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0SYN' } });
  fetchMock.mockRejectedValueOnce(new Error('Lost acknowledgement'));
  await flushAccountOperations(scope);
  expect(loadAccountOperations(scope)[0]).toMatchObject({
    status: 'failed',
    failure: 'network',
    operation: item.operation,
  });
  retryAccountOperations(scope);
  const next = { ...applyAccountChange(state(), item.operation.change), revision: 1 };
  fetchMock.mockResolvedValueOnce(Response.json({ state: next, operationId: item.operation.id }));
  await flushAccountOperations(scope);
  expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
  expect(fetchMock.mock.calls[1][1].headers['X-CWA-Account']).toBe(scope);
  expect(loadAccountOperations(scope)).toEqual([]);
  expect(loadCachedAccount(scope)?.state).toEqual(next);
});

it('requires an actual acknowledged revision before clearing device intent', async () => {
  const item = queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0LOCAL' } });
  fetchMock.mockResolvedValueOnce(
    Response.json({ state: state(), operationId: item.operation.id }),
  );
  expect(await flushAccountOperations(scope)).toEqual(new Set());
  expect(loadAccountOperations(scope)[0]).toMatchObject({
    operation: item.operation,
    status: 'failed',
    error: 'The server did not acknowledge this account edit.',
  });
});

it('sends queued changes FIFO and incorporates a new edit created while an upload is pending', async () => {
  const first = queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0SYN' } });
  let acknowledge!: (value: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        acknowledge = resolve;
      }),
  );
  const uploading = flushAccountOperations(scope);
  const second = queueAccountChange(state(), {
    type: 'settings',
    changes: { dailyGoalMinutes: 20 },
  });
  const firstState = { ...applyAccountChange(state(), first.operation.change), revision: 1 };
  const secondState = { ...applyAccountChange(firstState, second.operation.change), revision: 2 };
  fetchMock.mockResolvedValueOnce(
    Response.json({ state: secondState, operationId: second.operation.id }),
  );
  acknowledge(Response.json({ state: firstState, operationId: first.operation.id }));
  await uploading;
  expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body).baseRevision)).toEqual([
    0, 1,
  ]);
  expect(loadCachedAccount(scope)?.state).toEqual(secondState);
  expect(loadAccountOperations(scope)).toEqual([]);
});

it('preserves a stale edit and newer confirmed state until explicit reapplication', async () => {
  const item = queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0LOCAL' } });
  const newer = {
    ...state(4),
    settings: { ...DEFAULT_PROFILE, displayName: 'Newer server name', callsign: 'N0REMOTE' },
  };
  fetchMock.mockResolvedValueOnce(
    Response.json({ error: 'A newer revision was saved.', state: newer }, { status: 409 }),
  );
  await flushAccountOperations(scope);
  expect(loadAccountOperations(scope)[0]).toMatchObject({
    status: 'conflict',
    operation: item.operation,
  });
  expect(loadCachedAccount(scope)?.state).toEqual(newer);
  expect(projectAccountState(newer).settings).toMatchObject({
    displayName: 'Newer server name',
    callsign: 'N0LOCAL',
  });
  retryAccountOperations(scope, true);
  expect(loadAccountOperations(scope)[0].status).toBe('conflict');
  const replacement = resolveAccountConflict(scope, item.operation.id, 'reapply', newer)!;
  expect(replacement.operation).toMatchObject({ baseRevision: 4, change: item.operation.change });
  expect(replacement.operation.id).not.toBe(item.operation.id);
});

it('keeps a reapplied create before its later dependent edit regardless of their frozen revisions', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-30T12:00:00.000Z'));
  const task = {
    id: 'offline-exercise',
    title: 'Offline exercise',
    kind: 'sending' as const,
    done: false,
    notes: '',
    createdAt: new Date().toISOString(),
  };
  const create = queueAccountChange(state(), { type: 'task-create', task });
  const edit = queueAccountChange(state(), {
    type: 'task-edit',
    id: task.id,
    changes: { notes: 'My offline notes' },
  });
  const newer = {
    ...state(5),
    settings: { ...DEFAULT_PROFILE, displayName: 'A newer server preference' },
  };
  fetchMock.mockResolvedValueOnce(
    Response.json({ error: 'A newer revision was saved.', state: newer }, { status: 409 }),
  );
  await flushAccountOperations(scope);
  const reapplied = resolveAccountConflict(scope, create.operation.id, 'reapply', newer)!;
  expect(loadAccountOperations(scope).map((item) => item.operation.id)).toEqual([
    reapplied.operation.id,
    edit.operation.id,
  ]);
  expect(reapplied.order).toEqual(create.order);
  expect(reapplied.operation.baseRevision).toBe(5);
  const created = { ...applyAccountChange(newer, reapplied.operation.change), revision: 6 };
  fetchMock.mockResolvedValueOnce(
    Response.json({ state: created, operationId: reapplied.operation.id }),
  );
  fetchMock.mockResolvedValueOnce(
    Response.json(
      { error: 'Your dependent edit needs the newer revision.', state: created },
      { status: 409 },
    ),
  );
  expect(await flushAccountOperations(scope)).toEqual(new Set([reapplied.operation.id]));
  expect(loadAccountOperations(scope)).toHaveLength(1);
  expect(loadAccountOperations(scope)[0]).toMatchObject({
    status: 'conflict',
    operation: edit.operation,
  });
  expect(loadCachedAccount(scope)?.state.plan).toEqual([task]);
  const reappliedEdit = resolveAccountConflict(scope, edit.operation.id, 'reapply', created)!;
  const edited = { ...applyAccountChange(created, reappliedEdit.operation.change), revision: 7 };
  fetchMock.mockResolvedValueOnce(
    Response.json({ state: edited, operationId: reappliedEdit.operation.id }),
  );
  await flushAccountOperations(scope);
  expect(loadCachedAccount(scope)?.state).toMatchObject({
    revision: 7,
    settings: { displayName: 'A newer server preference' },
    plan: [{ id: task.id, notes: 'My offline notes' }],
  });
  expect(loadAccountOperations(scope)).toEqual([]);
});

it('retains expired authentication and permanent validation failures without automatic blind retries', async () => {
  queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0SYN' } });
  fetchMock.mockResolvedValueOnce(Response.json({ error: 'Sign in again.' }, { status: 401 }));
  await flushAccountOperations(scope);
  expect(loadAccountOperations(scope)[0]).toMatchObject({ status: 'failed', failure: 'auth' });
  retryAccountOperations(scope);
  fetchMock.mockResolvedValueOnce(
    Response.json({ error: 'The field cannot be changed.' }, { status: 400 }),
  );
  await flushAccountOperations(scope);
  retryAccountOperations(scope);
  await flushAccountOperations(scope);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(loadAccountOperations(scope)[0]).toMatchObject({ status: 'failed', failure: 'permanent' });
});

it('retains a cookie-account mismatch as auth work and retries its exact body after the owner signs in again', async () => {
  const accountA = scope;
  const originalState = state();
  const item = queueAccountChange(originalState, {
    type: 'settings',
    changes: { callsign: 'N0LOCAL' },
  });
  fetchMock.mockResolvedValueOnce(
    Response.json(
      { error: 'The signed-in account changed.', code: 'account_changed' },
      { status: 409 },
    ),
  );
  await flushAccountOperations(accountA);
  expect(loadAccountOperations(accountA)[0]).toMatchObject({
    status: 'failed',
    failure: 'auth',
    operation: item.operation,
  });
  const firstBody = fetchMock.mock.calls[0][1].body;
  selectAccountIdentity({ id: 'another-account', email: 'another@example.test' });
  expect(loadAccountOperations('another-account')).toEqual([]);
  await flushAccountOperations('another-account');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  selectAccountIdentity(owner());
  resumeAccountUploads(accountA);
  retryAccountOperations(accountA);
  const accepted = { ...applyAccountChange(originalState, item.operation.change), revision: 1 };
  fetchMock.mockResolvedValueOnce(
    Response.json({ state: accepted, operationId: item.operation.id }),
  );
  await flushAccountOperations(accountA);
  expect(fetchMock.mock.calls[1][1].body).toBe(firstBody);
  expect(fetchMock.mock.calls[1][1].headers['X-CWA-Account']).toBe(accountA);
  expect(loadAccountOperations(accountA)).toEqual([]);
});

it('aborts actual scoped requests and fences a late acknowledgement after account selection changes', async () => {
  const item = queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0SYN' } });
  let acknowledge!: (value: Response) => void;
  let signal!: AbortSignal;
  fetchMock.mockImplementationOnce((_url, options) => {
    signal = options.signal;
    return new Promise<Response>((resolve) => {
      acknowledge = resolve;
    });
  });
  const publish = vi.fn();
  const uploading = flushAccountOperations(scope, publish);
  suspendAccountUploads(scope);
  expect(signal.aborted).toBe(true);
  acknowledge(Response.json({ state: state(1), operationId: item.operation.id }));
  await uploading;
  expect(publish).not.toHaveBeenCalled();
  expect(loadAccountOperations(scope)[0].operation).toEqual(item.operation);
  expect(loadCachedAccount(scope)?.state.revision).toBe(0);
});

it('does not erase a replaced queued record when an older upload completes', async () => {
  const item = queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0SYN' } });
  let acknowledge!: (value: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        acknowledge = resolve;
      }),
  );
  const uploading = flushAccountOperations(scope);
  const name = [...values.keys()].find((key) => key.includes(':operation:'))!;
  values.set(
    name,
    JSON.stringify({
      ...item,
      operation: {
        ...item.operation,
        change: { type: 'settings', changes: { callsign: 'N0REPLACED' } },
      },
      status: 'failed',
      error: 'A later device change',
      failure: 'network',
    }),
  );
  acknowledge(Response.json({ state: state(1), operationId: item.operation.id }));
  await uploading;
  expect(loadAccountOperations(scope)[0]).toMatchObject({
    status: 'failed',
    error: 'A later device change',
  });
});

it('drains the next pending edit promptly when another tab acknowledged and removed the in-flight head', async () => {
  const first = queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0NEWER' } });
  let acknowledge!: (value: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        acknowledge = resolve;
      }),
  );
  const uploading = flushAccountOperations(scope);
  const firstState = { ...applyAccountChange(state(), first.operation.change), revision: 1 };
  const firstKey = [...values.keys()].find((name) => name.includes(':operation:'))!;
  localStorage.removeItem(firstKey);
  rememberAccount(owner(), firstState);
  const stale = queueAccountChange(
    firstState,
    { type: 'settings', changes: { callsign: 'N0OLDER' } },
    { baseRevision: 0 },
  );
  const joined = flushAccountOperations(scope);
  fetchMock.mockResolvedValueOnce(
    Response.json({ error: 'A newer revision was saved.', state: firstState }, { status: 409 }),
  );
  acknowledge(Response.json({ state: firstState, operationId: first.operation.id }));
  await Promise.all([uploading, joined]);
  expect(fetchMock.mock.calls.map(([, options]) => JSON.parse(options.body).id)).toEqual([
    first.operation.id,
    stale.operation.id,
  ]);
  expect(loadAccountOperations(scope)[0]).toMatchObject({
    status: 'conflict',
    operation: stale.operation,
  });
});

it('skips a removed head after a late failure without recreating it or abandoning the following edit', async () => {
  const first = queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0FIRST' } });
  let rejectUpload!: (error: Error) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((_resolve, reject) => {
        rejectUpload = reject;
      }),
  );
  const uploading = flushAccountOperations(scope);
  const second = queueAccountChange(state(), {
    type: 'settings',
    changes: { dailyGoalMinutes: 20 },
  });
  const firstState = { ...applyAccountChange(state(), first.operation.change), revision: 1 };
  const secondState = { ...applyAccountChange(firstState, second.operation.change), revision: 2 };
  const firstKey = [...values.keys()].find((name) => name.includes(':operation:'))!;
  localStorage.removeItem(firstKey);
  rememberAccount(owner(), firstState);
  fetchMock.mockResolvedValueOnce(
    Response.json({ state: secondState, operationId: second.operation.id }),
  );
  rejectUpload(new Error('An old response was lost.'));
  expect(await uploading).toEqual(new Set([second.operation.id]));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(loadAccountOperations(scope)).toEqual([]);
  expect(localStorage.getItem(firstKey)).toBeNull();
});

it('cannot resurrect an operation even if another tab removes it during a late failure-status write', async () => {
  queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0FIRST' } });
  const firstKey = [...values.keys()].find((name) => name.includes(':operation:'))!;
  const originalStorage = localStorage;
  vi.stubGlobal('localStorage', {
    ...originalStorage,
    get length() {
      return values.size;
    },
    setItem: (name: string, value: string) => {
      if (name.startsWith('cwa:account:status:')) originalStorage.removeItem(firstKey);
      originalStorage.setItem(name, value);
    },
  });
  fetchMock.mockRejectedValueOnce(new Error('Lost acknowledgement'));
  await flushAccountOperations(scope);
  expect(localStorage.getItem(firstKey)).toBeNull();
  expect(loadAccountOperations(scope)).toEqual([]);
});

it('keeps a small offline identity when a valid full account snapshot exceeds the cache bound', () => {
  const user = { id: 'large-plan-account', email: 'synthetic@example.test' };
  const plan = Array.from({ length: 500 }, (_, index) => ({
    id: `large-task-${index}`,
    title: 'Synthetic exercise',
    kind: 'other' as const,
    done: false,
    notes: 'x'.repeat(10000),
    createdAt: '2026-09-30T12:00:00.000Z',
  }));
  rememberAccount(user, { ...state(), accountId: user.id, plan });
  expect(loadCachedAccount(user.id)).toBeNull();
  expect(getSelectedAccountId()).toBe(user.id);
  expect(loadSelectedAccountIdentity()).toEqual(user);
});

it('keeps a freshly confirmed logical account selectable when a full device cannot replace its old pointer', async () => {
  const accountA = scope;
  const accountB = { id: 'fresh-full-device-account', email: 'another@example.test' };
  queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0FIRST' } });
  vi.stubGlobal('localStorage', {
    ...localStorage,
    setItem: () => {
      throw new Error('Quota');
    },
  });
  selectAccountIdentity(accountB);
  expect(localStorage.getItem('cwa:account:active:v1')).toBeNull();
  expect(getSelectedAccountId()).toBe(accountB.id);
  expect(isSelectedAccount(accountB.id)).toBe(true);
  expect(isSelectedAccount(accountA)).toBe(false);
  await flushAccountOperations(accountA);
  expect(fetchMock).not.toHaveBeenCalled();
  forgetActiveAccount();
  expect(getSelectedAccountId()).toBeUndefined();
});

it.each(['throw', 'no-op', 'wrong-readback'])(
  'invalidates obsolete offline selection after a fresh account %s write failure',
  async (failure) => {
    const accountA = owner();
    const accountB = { id: 'newly-selected-account', email: 'another@example.test' };
    const snapshotB = { ...state(), accountId: accountB.id };
    rememberAccount(accountB, snapshotB, false);
    const pendingA = queueAccountChange(state(), {
      type: 'settings',
      changes: { callsign: 'N0FIRST' },
    });
    const pendingB = queueAccountChange(snapshotB, {
      type: 'settings',
      changes: { dailyGoalMinutes: 35 },
    });
    const retainedA = localStorage.getItem(`cwa:account:cache:v1:${accountA.id}`);
    const retainedB = localStorage.getItem(`cwa:account:cache:v1:${accountB.id}`);
    const originalStorage = localStorage;
    vi.stubGlobal('localStorage', {
      ...originalStorage,
      get length() {
        return values.size;
      },
      setItem: (name: string, value: string) => {
        if (name === 'cwa:account:active:v1') {
          if (failure === 'throw') throw new Error('Quota');
          if (failure === 'no-op') return;
          originalStorage.setItem(name, accountA.id);
          return;
        }
        originalStorage.setItem(name, value);
      },
    });
    selectAccountIdentity(accountB);
    expect(localStorage.getItem('cwa:account:active:v1')).toBeNull();
    expect(getSelectedAccountId()).toBe(accountB.id);
    expect(isSelectedAccount(accountB.id)).toBe(true);
    expect(isSelectedAccount(accountA.id)).toBe(false);
    expect(getAccountStorageStatus(accountB.id)).toContain('offline reopening');
    expect(getAccountStorageStatus(accountA.id)).toBeUndefined();
    vi.resetModules();
    const reopened = await import('./account-outbox');
    expect(reopened.getSelectedAccountId()).toBeUndefined();
    expect(reopened.loadSelectedAccountIdentity()).toBeNull();
    expect(reopened.loadCachedAccount()).toBeNull();
    expect(reopened.getAccountStorageStatus()).toContain('offline reopening');
    expect(reopened.loadAccountOperations(accountA.id)[0].operation).toEqual(pendingA.operation);
    expect(reopened.loadAccountOperations(accountB.id)[0].operation).toEqual(pendingB.operation);
    expect(localStorage.getItem(`cwa:account:cache:v1:${accountA.id}`)).toBe(retainedA);
    expect(localStorage.getItem(`cwa:account:cache:v1:${accountB.id}`)).toBe(retainedB);
    vi.stubGlobal('localStorage', originalStorage);
    selectAccountIdentity(accountB);
    expect(getSelectedAccountId()).toBe(accountB.id);
    expect(getAccountStorageStatus(accountB.id)).toBeUndefined();
    expect(localStorage.getItem('cwa:account:selection-failure:v1')).toBeNull();
  },
);

it('a persisted storage-failure marker blocks an obsolete pointer even if its removal also fails', async () => {
  const accountA = scope;
  const accountB = { id: 'failed-removal-account', email: 'another@example.test' };
  const originalStorage = localStorage;
  vi.stubGlobal('localStorage', {
    ...originalStorage,
    setItem: (name: string, value: string) => {
      if (name === 'cwa:account:active:v1') throw new Error('Cannot select');
      originalStorage.setItem(name, value);
    },
    removeItem: (name: string) => {
      if (name === 'cwa:account:active:v1') throw new Error('Cannot remove');
      originalStorage.removeItem(name);
    },
  });
  selectAccountIdentity(accountB);
  expect(localStorage.getItem('cwa:account:active:v1')).toBe(accountA);
  expect(getSelectedAccountId()).toBe(accountB.id);
  vi.resetModules();
  const reopened = await import('./account-outbox');
  expect(reopened.getSelectedAccountId()).toBeUndefined();
  expect(reopened.loadSelectedAccountIdentity()).toBeNull();
});

it('does not trust an old cached selection when its persisted failure marker is damaged', async () => {
  localStorage.setItem('cwa:account:selection-failure:v1', '{damaged');
  vi.resetModules();
  const reopened = await import('./account-outbox');
  expect(reopened.getSelectedAccountId()).toBeUndefined();
  expect(reopened.loadSelectedAccountIdentity()).toBeNull();
  expect(reopened.getAccountStorageStatus()).toContain('offline reopening');
});

it('reads the selected identity before its snapshot is available and fences a stale tab acknowledgement', async () => {
  const item = queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0LOCAL' } });
  let acknowledge!: (value: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        acknowledge = resolve;
      }),
  );
  const uploading = flushAccountOperations(scope);
  localStorage.setItem('cwa:account:active:v1', 'account-without-cache');
  expect(getSelectedAccountId()).toBe('account-without-cache');
  expect(loadCachedAccount()).toBeNull();
  acknowledge(Response.json({ state: state(1), operationId: item.operation.id }));
  expect(await uploading).toEqual(new Set());
  expect(getSelectedAccountId()).toBe('account-without-cache');
  expect(loadAccountOperations(scope)[0].operation).toEqual(item.operation);
  expect(loadCachedAccount(scope)?.state.revision).toBe(0);
  selectAccountIdentity({ id: scope, email: 'synthetic@example.test' });
  expect(getSelectedAccountId()).toBe(scope);
});

it('reports durable storage failure and does not invent a successful edit', () => {
  vi.stubGlobal('localStorage', {
    ...localStorage,
    setItem: () => {
      throw new Error('Quota');
    },
  });
  expect(() =>
    queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0SYN' } }),
  ).toThrow('could not retain');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('requires readable durable storage rather than an apparent write without a receipt', () => {
  vi.stubGlobal('localStorage', { ...localStorage, setItem: () => {} });
  expect(() =>
    queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0SYN' } }),
  ).toThrow('could not retain');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('bounds a stalled response body and keeps the original edit retryable', async () => {
  vi.useFakeTimers();
  const item = queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0SYN' } });
  let signal!: AbortSignal;
  fetchMock.mockImplementationOnce((_url, options) => {
    signal = options.signal;
    return {
      ok: true,
      json: () =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        ),
    };
  });
  const uploading = flushAccountOperations(scope);
  await vi.advanceTimersByTimeAsync(10_000);
  await uploading;
  expect(signal.aborted).toBe(true);
  expect(loadAccountOperations(scope)[0]).toMatchObject({
    operation: item.operation,
    status: 'failed',
    failure: 'network',
  });
  expect(vi.getTimerCount()).toBe(0);
});

it('ignores malformed or wrong-owner records without hiding valid queued work', () => {
  const item = queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0SYN' } });
  values.set(`cwa:account:operation:v1:${scope}:damaged`, '{broken');
  values.set(
    `cwa:account:operation:v1:${scope}:other`,
    JSON.stringify({ ...item, operation: { ...item.operation, accountId: 'another-account' } }),
  );
  expect(loadAccountOperations(scope)).toEqual([item]);
});

it('still exposes a conflict when the device cannot persist its larger error status', async () => {
  const item = queueAccountChange(state(), { type: 'settings', changes: { callsign: 'N0LOCAL' } });
  vi.stubGlobal('localStorage', {
    ...localStorage,
    setItem: () => {
      throw new Error('Quota');
    },
  });
  fetchMock.mockResolvedValueOnce(
    Response.json({ error: 'A newer revision was saved.', state: state(4) }, { status: 409 }),
  );
  await flushAccountOperations(scope);
  expect(loadAccountOperations(scope)[0]).toMatchObject({
    operation: item.operation,
    status: 'conflict',
    error: 'A newer revision was saved.',
  });
});

it('durably orders offline handoff and confirmation with exact retries, reserved identity and account isolation', async () => {
  const draft = createReportDocument(
    starterAdvisorReportDefinition(),
    DEFAULT_PROFILE,
    [],
    1,
    '2026-10-03',
    [],
  );
  const handoff = captureReportHandoff(draft);
  const submitted = confirmReportHandoff(handoff, true);
  queueAccountChange(state(), { type: 'report-handoff', report: handoff });
  queueAccountChange(state(), { type: 'report-confirm', report: submitted, confirmed: true });
  draft.answers.session = '9';
  expect(projectAccountState(state()).reports?.map((report) => report.id)).toEqual([
    handoff.id,
    submitted.id,
  ]);
  expect(projectAccountState(state()).reports?.[1].answers.session).toBe('1');
  expect(loadAccountOperations('foreign')).toEqual([]);
  fetchMock.mockRejectedValueOnce(new Error('Disconnected'));
  await flushAccountOperations(scope);
  const original = loadAccountOperations(scope);
  expect(original).toHaveLength(2);
  expect(original[0].status).toBe('failed');
  let online = state();
  fetchMock.mockImplementation(async (_url, options) => {
    const operation = JSON.parse(options.body);
    online = { ...applyAccountChange(online, operation.change), revision: online.revision + 1 };
    return Response.json({ state: online, operationId: operation.id });
  });
  retryAccountOperations(scope);
  await flushAccountOperations(scope);
  expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
  expect(loadAccountOperations(scope)).toEqual([]);
  expect(online.reports).toEqual([handoff, submitted]);
});
