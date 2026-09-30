/** Runtime coordination is deliberately excluded from device backups. */
export const DEVICE_SCOPE_EVENT = 'cwa:device-scope';
export const DEVICE_CAPTURE_EVENT = 'cwa:device-capture';
export const deviceScopeKey = (scope: string) => `cwa:device:scope:v1:${encodeURIComponent(scope)}`;
export const accountLifecycleKey = (scope: string) =>
  `cwa:account:lifecycle:v1:${encodeURIComponent(scope)}`;
const knownAccountBoundaries = new Set<string>();
export function rememberAccountLifecycleBoundary(scope: string, present: boolean): void {
  if (present) knownAccountBoundaries.add(scope);
  else knownAccountBoundaries.delete(scope);
}

/** A local-only recovery action cannot release an unresolved server boundary. */
export function hasAccountLifecycleBoundary(scope: string): boolean {
  try {
    const present = localStorage.getItem(accountLifecycleKey(scope)) !== null;
    rememberAccountLifecycleBoundary(scope, present);
    return present;
  } catch {
    return knownAccountBoundaries.has(scope);
  }
}

export interface DeviceScopeState {
  scope: string;
  token: string;
  mutating: boolean;
}

export function getDeviceScopeState(scope: string): DeviceScopeState {
  let raw: string | null;
  try {
    raw = localStorage.getItem(deviceScopeKey(scope));
  } catch {
    // Ordinary practice still works without storage; lifecycle actions require readback.
    return { scope, token: 'unavailable', mutating: hasAccountLifecycleBoundary(scope) };
  }
  if (!raw) return { scope, token: 'initial', mutating: hasAccountLifecycleBoundary(scope) };
  try {
    const input = JSON.parse(raw) as { version?: unknown; token?: unknown; mutating?: unknown };
    if (
      raw.length <= 300 &&
      input.version === 1 &&
      typeof input.token === 'string' &&
      /^[a-zA-Z0-9-]{1,100}$/.test(input.token) &&
      typeof input.mutating === 'boolean'
    )
      return {
        scope,
        token: input.token,
        mutating: input.mutating || hasAccountLifecycleBoundary(scope),
      };
  } catch {
    /* An unreadable lifecycle record cannot authorize a stale owner to write. */
  }
  return { scope, token: 'invalid', mutating: true };
}

export const getDeviceScopeToken = (scope: string) => getDeviceScopeState(scope).token;
export const isDeviceScopeMutating = (scope: string) => getDeviceScopeState(scope).mutating;
export function isDeviceScopeCurrent(scope: string, token: string): boolean {
  const state = getDeviceScopeState(scope);
  return state.token === token && !state.mutating;
}
export function requireCurrentDeviceScope(scope: string, token: string): void {
  if (!isDeviceScopeCurrent(scope, token))
    throw new Error('This device work changed. Reopen the current work before saving again.');
}

function persist(state: DeviceScopeState): void {
  const raw = JSON.stringify({ version: 1, token: state.token, mutating: state.mutating });
  try {
    localStorage.setItem(deviceScopeKey(state.scope), raw);
    if (localStorage.getItem(deviceScopeKey(state.scope)) !== raw)
      throw new Error('The lifecycle record was not retained.');
  } catch {
    throw new Error(
      'This browser could not safely update device work. Free device storage or enable browser storage, then try again.',
    );
  }
  notifyDeviceScope(state.scope);
}

export function notifyDeviceScope(scope: string): void {
  window.dispatchEvent(new CustomEvent(DEVICE_SCOPE_EVENT, { detail: getDeviceScopeState(scope) }));
}

/** Persist before removing work: another mounted tab must lose permission to write. */
export function invalidateDeviceScope(
  scope: string,
  options: { recoverInterrupted?: boolean } = {},
): string {
  if (hasAccountLifecycleBoundary(scope))
    throw new Error(
      'Finish the account reset or replacement recovery before changing device work.',
    );
  if (isDeviceScopeMutating(scope) && !options.recoverInterrupted)
    throw new Error(
      'Device work is already being updated. Finish its recovery before trying again.',
    );
  const token = crypto.randomUUID();
  persist({ scope, token, mutating: true });
  return token;
}

/** Only a coherent completed apply or rollback may make the new scope usable. */
export function completeDeviceScopeMutation(
  scope: string,
  token: string,
  lifecycleId?: string,
): void {
  if (hasAccountLifecycleBoundary(scope)) {
    const record = JSON.parse(localStorage.getItem(accountLifecycleKey(scope))!) as {
      identity?: { id?: string; accountId?: string };
      token?: string;
      phase?: string;
    };
    if (
      !lifecycleId ||
      record.identity?.id !== lifecycleId ||
      record.identity.accountId !== scope ||
      record.token !== token ||
      !['applied', 'canceled', 'remote'].includes(record.phase ?? '')
    )
      throw new Error(
        'Finish the account reset or replacement recovery before releasing device work.',
      );
  }
  if (getDeviceScopeToken(scope) !== token)
    throw new Error('Another tab changed this device work. Reopen it before continuing.');
  persist({ scope, token, mutating: false });
}

/** Copy's existing retained draft is captured; non-copy elapsed time is not backed up. */
export function captureSupportedDeviceWork(scope: string): void {
  window.dispatchEvent(new CustomEvent(DEVICE_CAPTURE_EVENT, { detail: { scope } }));
}

/** Storage events carry a durable cross-tab boundary; same-tab changes are synchronous. */
export function subscribeDeviceScope(listener: (state: DeviceScopeState) => void): () => void {
  const local = (event: Event) => listener((event as CustomEvent<DeviceScopeState>).detail);
  const storage = (event: StorageEvent) => {
    if (!event.key?.startsWith('cwa:device:scope:v1:')) return;
    try {
      const scope = decodeURIComponent(event.key.slice('cwa:device:scope:v1:'.length));
      if (deviceScopeKey(scope) === event.key) listener(getDeviceScopeState(scope));
    } catch {
      /* Unregistered or malformed keys do not select a private scope. */
    }
  };
  window.addEventListener(DEVICE_SCOPE_EVENT, local);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(DEVICE_SCOPE_EVENT, local);
    window.removeEventListener('storage', storage);
  };
}
