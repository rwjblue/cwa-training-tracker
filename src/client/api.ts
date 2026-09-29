import type { Profile, PracticeSession } from '../shared/training';

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
export async function api<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? 'GET' : 'POST',
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok)
    throw new Error(
      typeof result.error === 'string'
        ? result.error
        : `The request could not be completed (${response.status}).`,
    );
  return result as T;
}
export const getEntries = () => api<{ entries: PracticeSession[] }>('/entries');
export const getSettings = () => api<{ settings: Profile }>('/settings');
