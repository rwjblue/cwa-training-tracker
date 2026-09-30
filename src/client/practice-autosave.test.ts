import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { validatePracticeSession } from '../shared/training';
import {
  autoSavePractice,
  flushPracticeSaves,
  loadLocalPractice,
  removeLocalPractice,
  PRACTICE_UPLOADED_EVENT,
} from './practice-autosave';

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
