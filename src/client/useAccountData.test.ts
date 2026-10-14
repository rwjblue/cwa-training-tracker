import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AccountSnapshot } from '../shared/account-sync';
import { DEFAULT_PROFILE } from '../shared/training';
import type { User } from './api';
import { loadCachedAccount, rememberAccount, selectAccountIdentity } from './account-outbox';
import { completeDeviceScopeMutation, invalidateDeviceScope } from './device-scope';
import { useAccountData } from './useAccountData';

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));

// Browser coverage owns scope effects and startup wiring. Retaining hook slots
// across explicit renders exercises concurrent requests and account/device fences
// with the real cache, generation observer and outbox, without a DOM runtime.
vi.mock('react', () => ({
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.slots))
      hooks.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [
      hooks.slots[index],
      (next: unknown) => {
        hooks.slots[index] = typeof next === 'function' ? next(hooks.slots[index]) : next;
      },
    ];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: () => {},
}));

let accountNumber = 0;
let user: User;
const fetchMock = vi.fn();
const state = (owner = user, revision = 0): AccountSnapshot => ({
  accountId: owner.id,
  revision,
  generation: 0,
  settings: { ...DEFAULT_PROFILE },
  plan: [],
});
const render = (owner: User | null = user) => {
  hooks.cursor = 0;
  return useAccountData(owner);
};
const deferredResponse = () => {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return {
    promise,
    resolve: (snapshot: AccountSnapshot) => resolve(Response.json({ state: snapshot })),
  };
};

beforeEach(() => {
  hooks.slots = [];
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
  vi.stubGlobal('window', new EventTarget());
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  user = { id: `refresh-account-${++accountNumber}`, email: 'synthetic@example.test' };
  rememberAccount(user, state());
});

afterEach(() => vi.unstubAllGlobals());

it('shares overlapping account refreshes and starts a fresh read after completion', async () => {
  const response = deferredResponse();
  fetchMock.mockReturnValueOnce(response.promise);
  const account = render();
  const first = account.refresh();
  const second = account.refresh();
  expect(fetchMock).toHaveBeenCalledOnce();
  response.resolve(state(user, 1));
  await Promise.all([first, second]);
  expect(render().confirmed?.revision).toBe(1);
  expect(loadCachedAccount(user.id)?.state.revision).toBe(1);

  fetchMock.mockResolvedValueOnce(Response.json({ state: state(user, 2) }));
  await account.refresh();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(render().confirmed?.revision).toBe(2);
});

it('retries a failed shared refresh with a new request', async () => {
  fetchMock.mockRejectedValueOnce(new Error('Offline'));
  const account = render();
  const results = await Promise.allSettled([account.refresh(), account.refresh()]);
  expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected']);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(render().error).toBe('Offline');

  fetchMock.mockResolvedValueOnce(Response.json({ state: state(user, 1) }));
  await account.refresh();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(render().error).toBe('');
});

it('keeps different accounts separate and ignores a superseded account response', async () => {
  const oldResponse = deferredResponse();
  const nextResponse = deferredResponse();
  fetchMock.mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(nextResponse.promise);
  const first = render().refresh();
  const nextUser = { id: `${user.id}-next`, email: 'next@example.test' };
  selectAccountIdentity(nextUser);
  const second = render(nextUser).refresh();
  expect(fetchMock).toHaveBeenCalledTimes(2);

  oldResponse.resolve(state(user, 1));
  await first;
  expect(loadCachedAccount(user.id)?.state.revision).toBe(0);
  expect(render(nextUser).confirmed).toBeNull();
  nextResponse.resolve(state(nextUser, 1));
  await second;
  expect(render(nextUser).confirmed?.accountId).toBe(nextUser.id);
});

it('starts a new refresh after device replacement and keeps its request owned when the old one settles', async () => {
  const oldResponse = deferredResponse();
  const nextResponse = deferredResponse();
  fetchMock.mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(nextResponse.promise);
  const first = render().refresh();
  const token = invalidateDeviceScope(user.id);
  completeDeviceScopeMutation(user.id, token);
  const current = render();
  const second = current.refresh();
  expect(fetchMock).toHaveBeenCalledTimes(2);

  oldResponse.resolve(state(user, 1));
  await first;
  expect(loadCachedAccount(user.id)?.state.revision).toBe(0);
  const third = current.refresh();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  nextResponse.resolve(state(user, 2));
  await Promise.all([second, third]);
  expect(render().confirmed?.revision).toBe(2);
});
