import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { validatePracticeSession } from '../shared/training';
import {
  autoSavePractice,
  flushPracticeSaves,
  loadLocalPractice,
  removeLocalPractice,
  PRACTICE_UPLOADED_EVENT,
  loadPracticeSaveStates,
  suspendPracticeUploads,
  loadPracticeSaveOrigin,
  resumePracticeUploads,
  listInFlightPracticeIds,
} from './practice-autosave';
import { queueAccountChange, rememberAccount } from './account-outbox';
import { DEFAULT_PROFILE } from '../shared/training';
import {
  completeDeviceScopeMutation,
  getDeviceScopeToken,
  invalidateDeviceScope,
} from './device-scope';

const entry = (id = 'round-one') =>
  validatePracticeSession({
    id,
    date: '2026-09-29',
    kind: 'listening',
    minutes: 1,
    createdAt: '2026-09-29T12:00:00.000Z',
    source: 'morse',
    notes: 'A complete round',
  });
const fetchMock = vi.fn();
beforeEach(() => {
  const values = new Map<string, string>();
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
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('retains the local result unless the server acknowledges that exact entry', async () => {
  for (const response of [{}, { entry: entry('another-round') }]) {
    fetchMock.mockResolvedValueOnce(Response.json(response));
    expect((await autoSavePractice('account', entry())).destination).toBe('device');
    expect(loadLocalPractice('account')).toEqual([entry()]);
  }
});

it('suppresses a delayed device receipt and old acknowledgement across clear and exact-ID restore', async () => {
  vi.useFakeTimers();
  const scope = 'cleared-result-owner';
  const original = entry('cleared-result');
  const token = getDeviceScopeToken(scope);
  const acknowledge: ((response: Response) => void)[] = [];
  fetchMock.mockImplementation(() => new Promise<Response>((resolve) => acknowledge.push(resolve)));
  const oldReceipt = autoSavePractice(scope, original, token);
  const failedReceipt = expect(oldReceipt).rejects.toThrow('device work changed');
  expect(listInFlightPracticeIds(scope)).toEqual([original.id]);
  suspendPracticeUploads(scope);
  const next = invalidateDeviceScope(scope);
  removeLocalPractice(scope, original.id);
  completeDeviceScopeMutation(scope, next);
  resumePracticeUploads(scope);
  const restored = autoSavePractice(scope, original, next);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
  await vi.advanceTimersByTimeAsync(750);
  await failedReceipt;
  expect((await restored).destination).toBe('device');
  acknowledge[0](Response.json({ entry: original }));
  await vi.advanceTimersByTimeAsync(0);
  expect(loadLocalPractice(scope)).toEqual([original]);
  expect(listInFlightPracticeIds(scope)).toEqual([original.id]);
  await autoSavePractice(scope, original, next);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  acknowledge[1](Response.json({ entry: original }));
  await vi.advanceTimersByTimeAsync(0);
  expect(loadLocalPractice(scope)).toEqual([]);
  expect(
    vi
      .mocked(window.dispatchEvent)
      .mock.calls.filter(([event]) => event.type === PRACTICE_UPLOADED_EVENT),
  ).toHaveLength(1);
  await expect(autoSavePractice(scope, entry('stale-new-result'), token)).rejects.toThrow(
    'device work changed',
  );
  expect(loadLocalPractice(scope)).toEqual([]);
});

it('returns a durable device receipt promptly, shares the background upload, and publishes its late acknowledgement', async () => {
  vi.useFakeTimers();
  let acknowledge!: (response: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        acknowledge = resolve;
      }),
  );
  const original = entry('late-ack');
  const saved = vi.fn();
  const result = autoSavePractice('late-account', original).then((receipt) => {
    saved(receipt);
    return receipt;
  });
  expect(loadLocalPractice('late-account')).toEqual([original]);
  await vi.advanceTimersByTimeAsync(749);
  expect(saved).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toEqual({ entry: original, destination: 'device' });
  expect(
    await autoSavePractice('late-account', { ...original, notes: 'Changed during upload' }),
  ).toEqual({ entry: original, destination: 'device' });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(original);
  await vi.advanceTimersByTimeAsync(2_000);
  acknowledge(Response.json({ entry: original }));
  await vi.advanceTimersByTimeAsync(0);
  expect(loadLocalPractice('late-account')).toEqual([]);
  const uploaded = vi
    .mocked(window.dispatchEvent)
    .mock.calls.map(([event]) => event)
    .filter((event) => event.type === PRACTICE_UPLOADED_EVENT);
  expect(uploaded).toHaveLength(1);
  expect(uploaded[0]).toMatchObject({ detail: { scope: 'late-account', entry: original } });
  expect(vi.getTimerCount()).toBe(0);
});

it('aborts a stalled response body after ten seconds and leaves its immutable local body retryable', async () => {
  vi.useFakeTimers();
  let signal!: AbortSignal;
  fetchMock.mockImplementationOnce(async (_url, options: RequestInit) => {
    signal = options.signal!;
    return {
      ok: true,
      json: () =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    };
  });
  const original = entry('hung-upload');
  const result = autoSavePractice('hung-account', original);
  await vi.advanceTimersByTimeAsync(750);
  expect((await result).destination).toBe('device');
  await vi.advanceTimersByTimeAsync(9_250);
  expect(signal.aborted).toBe(true);
  expect(loadLocalPractice('hung-account')).toEqual([original]);
  fetchMock.mockResolvedValueOnce(Response.json({ entry: original }));
  expect((await autoSavePractice('hung-account', { ...original, minutes: 5 })).destination).toBe(
    'history',
  );
  expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
  expect(loadLocalPractice('hung-account')).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});

it('does not claim a device save when storage is unavailable, and bounds the server-only attempt', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new Error('Quota');
    },
  });
  let acknowledge!: (response: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        acknowledge = resolve;
      }),
  );
  const original = entry('server-only');
  const saved = vi.fn();
  const result = autoSavePractice('server-only-account', original).then(saved);
  await vi.advanceTimersByTimeAsync(750);
  expect(saved).not.toHaveBeenCalled();
  acknowledge(Response.json({ entry: original }));
  await result;
  expect(saved).toHaveBeenCalledWith({ entry: original, destination: 'history' });
  fetchMock.mockImplementationOnce(
    (_url, options: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        options.signal!.addEventListener('abort', () => reject(options.signal!.reason), {
          once: true,
        });
      }),
  );
  const failed = expect(
    autoSavePractice('server-only-account', entry('timed-out')),
  ).rejects.toThrow('upload timed out');
  await vi.advanceTimersByTimeAsync(10_000);
  await failed;
  expect(vi.getTimerCount()).toBe(0);
});

it('retains successive guest rounds without uploading or touching another scope', async () => {
  await autoSavePractice('guest', entry());
  await autoSavePractice('guest', entry('round-two'));
  expect(loadLocalPractice('guest')).toHaveLength(2);
  expect(loadLocalPractice('account')).toEqual([]);
  await flushPracticeSaves('guest', vi.fn());
  expect(fetchMock).not.toHaveBeenCalled();
  removeLocalPractice('guest', 'round-one');
  expect(loadLocalPractice('guest').map((item) => item.id)).toEqual(['round-two']);
});

it('freezes uncertain uploads, then retries the same body and removes only acknowledged entries', async () => {
  fetchMock.mockRejectedValueOnce(new Error('Lost acknowledgement'));
  expect((await autoSavePractice('account', entry())).destination).toBe('device');
  expect(loadLocalPractice('account')).toEqual([entry()]);
  const firstBody = fetchMock.mock.calls[0][1].body;
  fetchMock.mockResolvedValueOnce(Response.json({ entry: entry() }));
  const result = await autoSavePractice('account', {
    ...entry(),
    notes: 'Later edits must not change an uncertain retry',
  });
  expect(result.destination).toBe('history');
  expect(fetchMock.mock.calls[1][1].body).toBe(firstBody);
  expect(loadLocalPractice('account')).toEqual([]);
});

it('stops queued uploads when the account changes during a request', async () => {
  fetchMock.mockRejectedValue(new Error('Offline'));
  await autoSavePractice('account-a', entry());
  await autoSavePractice('account-a', entry('round-two'));
  let active = true;
  fetchMock.mockReset().mockImplementationOnce(async () => {
    active = false;
    return Response.json({ entry: entry() });
  });
  const saved = vi.fn();
  await flushPracticeSaves('account-a', saved, () => active);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(saved).not.toHaveBeenCalled();
  expect(loadLocalPractice('account-a')).toHaveLength(1);
  expect(loadLocalPractice('account-b')).toEqual([]);
});

it('reports failure if neither the browser nor the server retained the result', async () => {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new Error('Quota');
    },
  });
  await expect(autoSavePractice('guest', entry())).rejects.toThrow('could not save');
  expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockRejectedValueOnce(new Error('Offline'));
  await expect(autoSavePractice('account', entry())).rejects.toThrow('Offline');
  fetchMock.mockResolvedValueOnce(Response.json({ entry: entry() }));
  expect((await autoSavePractice('account', entry())).destination).toBe('history');
});

it('uses the frozen result owner and retains an expired-authentication failure for that account', async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ error: 'Sign in again.' }, { status: 401 }));
  await autoSavePractice('expired-account', entry('expired-result'));
  expect(fetchMock.mock.calls[0][1].headers['X-CWA-Account']).toBe('expired-account');
  expect(loadPracticeSaveStates('expired-account')).toEqual([
    { id: 'expired-result', status: 'failed', failure: 'auth', error: 'Sign in again.' },
  ]);
  expect(loadPracticeSaveStates('another-account')).toEqual([]);
});

it('keeps a result local until its queued plan edits have been acknowledged', async () => {
  queueAccountChange(
    {
      accountId: 'planning-account',
      revision: 0,
      generation: 0,
      settings: DEFAULT_PROFILE,
      plan: [],
    },
    { type: 'settings', changes: { callsign: 'N0SYN' } },
  );
  const result = await autoSavePractice('planning-account', entry('planned-result'));
  expect(result.destination).toBe('device');
  expect(loadLocalPractice('planning-account')).toEqual([entry('planned-result')]);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('aborts a real upload and fences its late acknowledgement after its account is suspended', async () => {
  vi.useFakeTimers();
  let signal!: AbortSignal;
  let acknowledge!: (response: Response) => void;
  fetchMock.mockImplementationOnce((_url, options) => {
    signal = options.signal;
    return new Promise<Response>((resolve) => {
      acknowledge = resolve;
    });
  });
  const result = autoSavePractice('suspended-account', entry('suspended-result'));
  suspendPracticeUploads('suspended-account');
  expect(signal.aborted).toBe(true);
  acknowledge(Response.json({ entry: entry('suspended-result') }));
  await vi.advanceTimersByTimeAsync(0);
  expect((await result).destination).toBe('device');
  expect(loadLocalPractice('suspended-account')).toEqual([entry('suspended-result')]);
  expect(
    vi
      .mocked(window.dispatchEvent)
      .mock.calls.some(([event]) => event.type === PRACTICE_UPLOADED_EVENT),
  ).toBe(false);
});

it('does not clear or publish an older acknowledgement when the durable result was replaced', async () => {
  vi.useFakeTimers();
  let acknowledge!: (response: Response) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        acknowledge = resolve;
      }),
  );
  const original = entry('replaced-result');
  const result = autoSavePractice('replace-account', original);
  const name = Array.from({ length: localStorage.length }, (_, index) =>
    localStorage.key(index),
  ).find((name) => name?.startsWith('cwa:practice:pending:'))!;
  const replacement = { ...original, notes: 'Newer retained payload' };
  localStorage.setItem(name, JSON.stringify(replacement));
  acknowledge(Response.json({ entry: original }));
  await vi.advanceTimersByTimeAsync(0);
  expect((await result).destination).toBe('device');
  expect(loadLocalPractice('replace-account')).toEqual([replacement]);
  expect(
    vi
      .mocked(window.dispatchEvent)
      .mock.calls.some(([event]) => event.type === PRACTICE_UPLOADED_EVENT),
  ).toBe(false);
});

it('does not endlessly retry permanent result failures during automatic flushing', async () => {
  fetchMock.mockResolvedValueOnce(
    Response.json({ error: 'The linked exercise no longer exists.' }, { status: 400 }),
  );
  await autoSavePractice('invalid-account', entry('invalid-result'));
  await flushPracticeSaves('invalid-account', vi.fn());
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockResolvedValueOnce(Response.json({ entry: entry('invalid-result') }));
  await flushPracticeSaves('invalid-account', vi.fn(), () => true, true);
  expect(loadLocalPractice('invalid-account')).toEqual([]);
});

it('exposes an upload failure even if result storage leaves no room for its error status', async () => {
  const originalStorage = localStorage;
  vi.stubGlobal('localStorage', {
    ...originalStorage,
    get length() {
      return originalStorage.length;
    },
    setItem: (name: string, value: string) => {
      if (name.startsWith('cwa:practice:status:')) throw new Error('Quota');
      originalStorage.setItem(name, value);
    },
  });
  fetchMock.mockResolvedValueOnce(Response.json({ error: 'Sign in again.' }, { status: 401 }));
  await autoSavePractice('full-device-account', entry('full-device-result'));
  expect(loadPracticeSaveStates('full-device-account')).toEqual([
    { id: 'full-device-result', status: 'failed', error: 'Sign in again.', failure: 'auth' },
  ]);
});

it('captures a result’s known dataset generation once and retains it through exact retries', async () => {
  const user = { id: 'origin-account', email: 'synthetic@example.test' };
  const snapshot = {
    accountId: user.id,
    revision: 0,
    generation: 7,
    settings: DEFAULT_PROFILE,
    plan: [],
  };
  rememberAccount(user, snapshot);
  fetchMock.mockRejectedValueOnce(new Error('Lost acknowledgement'));
  const original = entry('origin-result');
  await autoSavePractice(user.id, original);
  expect(loadPracticeSaveOrigin(user.id, original.id)).toEqual({
    id: original.id,
    accountId: user.id,
    generation: 7,
  });
  rememberAccount(user, { ...snapshot, generation: 8 });
  fetchMock.mockResolvedValueOnce(Response.json({ entry: original }));
  await autoSavePractice(user.id, {
    ...original,
    notes: 'A different retry must not replace original content',
  });
  expect(fetchMock.mock.calls.map(([, options]) => options.headers['X-CWA-Generation'])).toEqual([
    '7',
    '7',
  ]);
  expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
});

it('does not stamp a historical queue with the current dataset generation', async () => {
  const user = { id: 'historical-origin-account', email: 'synthetic@example.test' };
  const original = entry('historical-origin-result');
  localStorage.setItem(
    `cwa:practice:pending:v1:${user.id}:${original.id}`,
    JSON.stringify(original),
  );
  rememberAccount(user, {
    accountId: user.id,
    revision: 0,
    generation: 9,
    settings: DEFAULT_PROFILE,
    plan: [],
  });
  fetchMock.mockRejectedValueOnce(new Error('Offline'));
  await autoSavePractice(user.id, original);
  expect(loadPracticeSaveOrigin(user.id, original.id)).toEqual({
    id: original.id,
    accountId: user.id,
  });
  expect(fetchMock.mock.calls[0][1].headers['X-CWA-Generation']).toBeUndefined();
});

it('treats a changed cookie account as retained authentication work rather than a permanent result failure', async () => {
  const user = { id: 'mismatched-result-account', email: 'synthetic@example.test' };
  const snapshot = {
    accountId: user.id,
    revision: 0,
    generation: 0,
    settings: DEFAULT_PROFILE,
    plan: [],
  };
  rememberAccount(user, snapshot);
  const original = entry('mismatched-cookie-result');
  fetchMock.mockResolvedValueOnce(
    Response.json(
      { error: 'The signed-in account changed.', code: 'account_changed' },
      { status: 409 },
    ),
  );
  await autoSavePractice(user.id, original);
  expect(loadPracticeSaveStates(user.id)).toEqual([
    { id: original.id, status: 'failed', failure: 'auth', error: 'The signed-in account changed.' },
  ]);
  const firstBody = fetchMock.mock.calls[0][1].body;
  rememberAccount(
    { id: 'different-result-account', email: 'different@example.test' },
    { ...snapshot, accountId: 'different-result-account' },
  );
  await flushPracticeSaves('different-result-account', vi.fn());
  expect(loadLocalPractice('different-result-account')).toEqual([]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  rememberAccount(user, snapshot);
  fetchMock.mockResolvedValueOnce(Response.json({ entry: original }));
  await flushPracticeSaves(user.id, vi.fn());
  expect(fetchMock.mock.calls[1][1].body).toBe(firstBody);
  expect(fetchMock.mock.calls[1][1].headers['X-CWA-Account']).toBe(user.id);
  expect(loadLocalPractice(user.id)).toEqual([]);
});
