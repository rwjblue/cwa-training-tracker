import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { api, ApiError, setApiAccount } from './api';

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal('fetch', fetchMock);
  setApiAccount('account-a');
});
afterEach(() => {
  setApiAccount();
  vi.unstubAllGlobals();
});

it('sends a frozen queued owner rather than the newly selected account', async () => {
  setApiAccount('account-b');
  await api('/entries', { id: 'finished' }, 'POST', undefined, {
    accountId: 'account-a',
    revision: 7,
  });
  expect(fetchMock.mock.calls[0][1].headers).toEqual({
    'Content-Type': 'application/json',
    'X-CWA-Account': 'account-a',
    'If-Match': '7',
  });
  await api('/export');
  expect(fetchMock.mock.calls[1][1].headers).toEqual({ 'X-CWA-Account': 'account-b' });
});

it('allows fresh identity checks and sign-in after account selection changes', async () => {
  await api('/me');
  await api('/auth/email/verify', { code: 'synthetic' });
  expect(fetchMock.mock.calls[0][1].headers).toBeUndefined();
  expect(fetchMock.mock.calls[1][1].headers).toEqual({ 'Content-Type': 'application/json' });
});

it('retains status and current account state for visible conflict resolution', async () => {
  const state = { accountId: 'account-a', revision: 9, generation: 0 };
  fetchMock.mockResolvedValueOnce(
    Response.json({ error: 'A newer edit was saved.', state }, { status: 409 }),
  );
  const error = await api('/account-operations', {}).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(ApiError);
  expect(error).toMatchObject({ message: 'A newer edit was saved.', status: 409, state });
});

it('preserves an account-selection error code separately from mutable revision conflicts', async () => {
  fetchMock.mockResolvedValueOnce(
    Response.json(
      { error: 'Sign in to the account that owns this work.', code: 'account_changed' },
      { status: 409 },
    ),
  );
  const error = await api('/entries', { id: 'finished' }).catch((error: unknown) => error);
  expect(error).toMatchObject({ status: 409, code: 'account_changed', state: undefined });
});
