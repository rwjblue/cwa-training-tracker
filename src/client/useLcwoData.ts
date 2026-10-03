import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountSnapshot } from '../shared/account-sync';
import { validateAccountSnapshot } from '../shared/account-sync';
import { validateLcwoBackup, type LcwoData } from '../shared/lcwo';
import { api } from './api';
import { isDeviceScopeCurrent, isDeviceScopeMutating } from './device-scope';

/** Retained facts only: GET never signs into LCWO, and credentials never enter a queue. */
export function useLcwoData(authority: AccountSnapshot | null, token: string) {
  const current = useRef({ authority, token });
  current.current = { authority, token };
  const [retained, setRetained] = useState<{
    accountId: string;
    generation: number;
    token: string;
    data: LcwoData | null;
  }>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const serial = useRef(0);
  const owns = (captured: AccountSnapshot, capturedToken: string) =>
    current.current.authority?.accountId === captured.accountId &&
    current.current.authority.generation === captured.generation &&
    current.current.token === capturedToken &&
    isDeviceScopeCurrent(captured.accountId, capturedToken) &&
    !isDeviceScopeMutating(captured.accountId);
  const accept = (
    value: { state: unknown; data: unknown },
    captured: AccountSnapshot,
    capturedToken: string,
  ) => {
    const state = validateAccountSnapshot(value.state);
    if (state.accountId !== captured.accountId || state.generation !== captured.generation)
      throw new Error(
        'LCWO history belongs to a different account or replaced dataset. Refresh your account.',
      );
    let data: LcwoData | null = null;
    if (value.data !== null) {
      const row = value.data as LcwoData;
      if (typeof row.connected !== 'boolean')
        throw new Error('LCWO connection status could not be read.');
      data = { ...validateLcwoBackup({ ...row, connected: false }), connected: row.connected };
    }
    if (owns(captured, capturedToken))
      setRetained({
        accountId: state.accountId,
        generation: state.generation,
        token: capturedToken,
        data,
      });
    return data;
  };
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const { authority: captured, token: capturedToken } = current.current;
    if (!captured || !owns(captured, capturedToken)) return;
    const request = ++serial.current;
    setLoading(true);
    try {
      const response = await api<{ state: unknown; data: unknown }>(
        '/lcwo',
        undefined,
        'GET',
        signal ?? AbortSignal.timeout(10_000),
        { accountId: captured.accountId },
      );
      if (request !== serial.current || !owns(captured, capturedToken)) return;
      accept(response, captured, capturedToken);
      setError('');
    } catch (failure) {
      if (request === serial.current && owns(captured, capturedToken) && !signal?.aborted)
        setError(
          failure instanceof Error ? failure.message : 'Retained LCWO history could not be loaded.',
        );
    } finally {
      if (request === serial.current && owns(captured, capturedToken)) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setError('');
    void refresh(controller.signal);
    return () => {
      serial.current++;
      controller.abort();
    };
  }, [authority?.accountId, authority?.generation, authority?.revision, token, refresh]);
  const change = async (body: Record<string, unknown>, signal: AbortSignal) => {
    const { authority: captured, token: capturedToken } = current.current;
    if (!captured || !owns(captured, capturedToken))
      throw new Error('Refresh your account before changing this LCWO link.');
    const request = ++serial.current;
    const response = await api<{ state: unknown; data: unknown; imported: number }>(
      '/lcwo',
      body,
      'POST',
      signal,
      {
        accountId: captured.accountId,
        revision: captured.revision,
        generation: captured.generation,
      },
    );
    if (request !== serial.current || !owns(captured, capturedToken))
      throw new Error('The owning account changed. Reload retained history before retrying.');
    accept(response, captured, capturedToken);
    setError('');
    return response.imported;
  };
  const data =
    retained?.accountId === authority?.accountId &&
    retained?.generation === authority?.generation &&
    retained?.token === token &&
    authority &&
    isDeviceScopeCurrent(authority.accountId, token) &&
    !isDeviceScopeMutating(authority.accountId)
      ? retained.data
      : null;
  return { data, error, loading, refresh, change };
}
export type LcwoController = ReturnType<typeof useLcwoData>;
