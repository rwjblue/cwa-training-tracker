import type { Profile, PracticeSession } from '../shared/training';
import type { AccountSnapshot } from '../shared/account-sync';
import { validateAccountSnapshot } from '../shared/account-sync';
import type { LifecycleIdentity, LifecycleResult } from '../shared/account-lifecycle';
import type { AccountLifecycleTransports } from './account-lifecycle';

export interface User {
  id: string;
  email: string;
}
export interface Passkey {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt?: string;
}
export interface ApiOptions {
  /** Frozen owner for queued requests, independent of the currently selected account. */
  accountId?: string;
  revision?: number;
  generation?: number;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly state?: AccountSnapshot,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
let selectedAccount: string | undefined;
const identityPaths = new Set([
  '/me',
  '/auth/logout',
  '/auth/email/request',
  '/auth/email/verify',
  '/auth/passkeys/login/options',
  '/auth/passkeys/login/verify',
]);
export function setApiAccount(accountId?: string) {
  selectedAccount = accountId;
}
export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
  signal?: AbortSignal,
  options: ApiOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const accountId = options.accountId ?? (identityPaths.has(path) ? undefined : selectedAccount);
  if (accountId) headers['X-CWA-Account'] = accountId;
  if (options.revision !== undefined) headers['If-Match'] = String(options.revision);
  if (options.generation !== undefined) headers['X-CWA-Generation'] = String(options.generation);
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: Object.keys(headers).length ? headers : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  signal?.throwIfAborted();
  if (!response.ok)
    throw new ApiError(
      typeof result.error === 'string'
        ? result.error
        : `The request could not be completed (${response.status}).`,
      response.status,
      result.state as AccountSnapshot | undefined,
      typeof result.code === 'string' ? result.code : undefined,
    );
  return result as T;
}
export interface EntriesSnapshot {
  entries: PracticeSession[];
  accountId: string;
  generation: number;
  revision: number;
}
export const getEntries = (options: ApiOptions = {}, signal?: AbortSignal) =>
  api<EntriesSnapshot>('/entries', undefined, 'GET', signal, options);
export const getSettings = () => api<{ settings: Profile }>('/settings');

/** Every retry retains the reviewed account; current selection cannot redirect it. */
export function accountLifecycleTransports(user: User): AccountLifecycleTransports {
  const request = (path: string, identity: LifecycleIdentity) =>
    api<LifecycleResult>(path, identity, 'POST', AbortSignal.timeout(10_000), {
      accountId: user.id,
    });
  return {
    prepare: (identity) => request('/account-lifecycle/prepare', identity),
    lookup: (identity) => request('/account-lifecycle/outcome', identity),
    cancel: (identity) => request('/account-lifecycle/cancel', identity),
    apply: (identity, payload) =>
      api<LifecycleResult>(
        identity.kind === 'reset' ? '/reset' : '/import',
        { ...(payload as Record<string, unknown>), lifecycle: identity },
        'POST',
        AbortSignal.timeout(10_000),
        { accountId: user.id, revision: identity.baseRevision, generation: identity.generation },
      ),
    refresh: async () => {
      const response = await api<{ state: AccountSnapshot }>(
        '/account-state',
        undefined,
        'GET',
        AbortSignal.timeout(10_000),
        { accountId: user.id },
      );
      const state = validateAccountSnapshot(response.state);
      if (state.accountId !== user.id)
        throw new Error('The returned account does not match this request.');
      return state;
    },
  };
}
