import { useCallback, useEffect, useRef, useState } from 'react';
import {
  validateAccountSnapshot,
  type AccountChange,
  type AccountSnapshot,
} from '../shared/account-sync';
import { api, type User } from './api';
import {
  ACCOUNT_DATA_EVENT,
  flushAccountOperations,
  loadAccountOperations,
  loadCachedAccount,
  projectAccountState,
  queueAccountChange,
  rememberAccount,
  resolveAccountConflict,
  resumeAccountUploads,
  retryAccountOperations,
  suspendAccountUploads,
  isSelectedAccount,
} from './account-outbox';

export {
  loadCachedAccount,
  rememberAccount,
  forgetActiveAccount,
  selectAccountIdentity,
  getSelectedAccountId,
  loadAccountIdentity,
  loadSelectedAccountIdentity,
  ACCOUNT_DATA_EVENT,
} from './account-outbox';

/** One owner for confirmed account data and device-pending semantic edits. */
export function useAccountData(user: User | null) {
  const scope = user?.id;
  const active = useRef(scope);
  active.current = scope;
  const [confirmed, setConfirmed] = useState<AccountSnapshot | null>(() =>
    scope ? (loadCachedAccount(scope)?.state ?? null) : null,
  );
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cached, setCached] = useState(Boolean(scope && loadCachedAccount(scope)));
  const publish = useCallback((state: AccountSnapshot) => {
    if (active.current !== state.accountId || !isSelectedAccount(state.accountId)) return;
    setConfirmed((previous) =>
      previous?.accountId === state.accountId &&
      (previous.generation > state.generation ||
        (previous.generation === state.generation && previous.revision > state.revision))
        ? previous
        : state,
    );
  }, []);

  const flush = useCallback(
    async (accountId: string) => {
      return flushAccountOperations(
        accountId,
        publish,
        () => active.current === accountId && isSelectedAccount(accountId),
      );
    },
    [publish],
  );

  const refresh = useCallback(
    async (target = user): Promise<AccountSnapshot> => {
      if (!target) throw new Error('Sign in to reload your account.');
      if (active.current === target.id) setLoading(true);
      try {
        const result = await api<{ state: AccountSnapshot }>(
          '/account-state',
          undefined,
          'GET',
          undefined,
          { accountId: target.id },
        );
        const state = validateAccountSnapshot(result.state);
        if (state.accountId !== target.id)
          throw new Error('The returned state belongs to another account.');
        if (active.current === target.id && isSelectedAccount(target.id)) {
          rememberAccount(target, state);
          publish(state);
        }
        if (active.current === target.id && isSelectedAccount(target.id)) {
          setError('');
          setCached(false);
        }
        if (active.current === target.id && isSelectedAccount(target.id)) {
          retryAccountOperations(target.id);
          await flush(target.id);
        }
        return state;
      } catch (failure) {
        if (active.current === target.id) {
          setError(
            failure instanceof Error ? failure.message : 'Your account could not be refreshed.',
          );
          setCached(Boolean(loadCachedAccount(target.id)));
        }
        throw failure;
      } finally {
        if (active.current === target.id) setLoading(false);
      }
    },
    [user, publish, flush],
  );

  useEffect(() => {
    setConfirmed(scope ? (loadCachedAccount(scope)?.state ?? null) : null);
    setError('');
    setCached(Boolean(scope && loadCachedAccount(scope)));
    if (!scope || !user) return;
    resumeAccountUploads(scope);
    void refresh(user).catch(() => {});
    const interval = setInterval(() => {
      void flush(scope).catch(() => {});
    }, 30_000);
    return () => {
      clearInterval(interval);
      suspendAccountUploads(scope);
    };
    // Account selection is the boundary; refreshing does not recreate the scope owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  useEffect(() => {
    const update = () => {
      setVersion((value) => value + 1);
      const state = scope ? loadCachedAccount(scope)?.state : undefined;
      if (state) publish(state);
    };
    const online = () => {
      if (user) void refresh(user).catch(() => {});
    };
    window.addEventListener(ACCOUNT_DATA_EVENT, update);
    window.addEventListener('storage', update);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener(ACCOUNT_DATA_EVENT, update);
      window.removeEventListener('storage', update);
      window.removeEventListener('online', online);
    };
  }, [scope, user, publish, refresh]);

  const operations = scope ? loadAccountOperations(scope) : [];
  const current = confirmed?.accountId === scope ? confirmed : null;
  const state = current ? projectAccountState(current, operations) : null;
  // `version` causes local durable changes to refresh this projection synchronously.
  void version;

  const mutate = useCallback(
    async (change: AccountChange, baseRevision?: number) => {
      if (!scope || !current || !user || !isSelectedAccount(scope))
        throw new Error('Your account must be loaded before saving this edit.');
      const item = queueAccountChange(current, change, { baseRevision });
      setVersion((value) => value + 1);
      let receiptTimer: ReturnType<typeof setTimeout> | undefined;
      const acknowledged = await Promise.race([
        flush(scope),
        new Promise<Set<string>>((resolve) => {
          receiptTimer = setTimeout(() => resolve(new Set()), 750);
        }),
      ]).finally(() => clearTimeout(receiptTimer));
      return {
        destination: acknowledged.has(item.operation.id)
          ? ('server' as const)
          : ('device' as const),
        operation: item.operation,
      };
    },
    [scope, current, user, flush],
  );

  const retry = useCallback(async () => {
    if (!scope) return;
    retryAccountOperations(scope, true);
    await flush(scope);
  }, [scope, flush]);

  const resolve = useCallback(
    async (id: string, resolution: 'discard' | 'reapply') => {
      if (!scope || !current) throw new Error('Reload your account before resolving this edit.');
      resolveAccountConflict(scope, id, resolution, current);
      setVersion((value) => value + 1);
      if (resolution === 'reapply') await flush(scope);
    },
    [scope, current, flush],
  );

  return {
    confirmed: current,
    state,
    operations,
    loading,
    error,
    cached,
    refresh,
    mutate,
    retry,
    resolve,
  };
}
