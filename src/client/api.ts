import type { Profile, PracticeSession } from '../shared/training';
import type { AccountSnapshot } from '../shared/account-sync';

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
export const getEntries = () => api<{ entries: PracticeSession[] }>('/entries');
export const getSettings = () => api<{ settings: Profile }>('/settings');
