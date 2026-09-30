import { validateAccountSnapshot, type AccountSnapshot } from './account-sync';

export type LifecycleKind = 'reset' | 'replace';

/** Immutable runtime authority; portable training files cannot grant it. */
export interface LifecycleIdentity {
  version: 1;
  id: string;
  accountId: string;
  kind: LifecycleKind;
  baseRevision: number;
  generation: number;
  payloadHash: string;
}

export interface LifecycleApplied {
  revision: number;
  generation: number;
  imported?: number;
  skipped?: number;
  historicalLinks?: number;
}

export interface LifecycleResult {
  identity: LifecycleIdentity;
  outcome: 'unknown' | 'applied' | 'canceled';
  state: AccountSnapshot;
  applied?: LifecycleApplied;
  /** A bounded cancellation slot has been reserved before destructive admission. */
  reserved?: boolean;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an account lifecycle object.');
  return value as Record<string, unknown>;
}

function keys(input: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new Error('Unsupported account lifecycle field.');
}

function counter(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid account lifecycle revision, generation or count.');
  return value;
}

function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]{0,199}$/.test(value))
    throw new Error('Invalid account lifecycle ID.');
  return value;
}

export function validateLifecycleIdentity(value: unknown): LifecycleIdentity {
  const input = record(value);
  keys(input, ['version', 'id', 'accountId', 'kind', 'baseRevision', 'generation', 'payloadHash']);
  if (input.version !== 1) throw new Error('Unsupported account lifecycle version.');
  if (input.kind !== 'reset' && input.kind !== 'replace')
    throw new Error('Choose reset or replace for this account lifecycle.');
  if (typeof input.payloadHash !== 'string' || !/^[a-f0-9]{64}$/.test(input.payloadHash))
    throw new Error('Invalid account lifecycle payload hash.');
  return {
    version: 1,
    id: id(input.id),
    accountId: id(input.accountId),
    kind: input.kind,
    baseRevision: counter(input.baseRevision),
    generation: counter(input.generation),
    payloadHash: input.payloadHash,
  };
}

export function validateLifecycleResult(value: unknown): LifecycleResult {
  const input = record(value);
  keys(input, ['identity', 'outcome', 'state', 'applied', 'reserved']);
  const identity = validateLifecycleIdentity(input.identity);
  const state = validateAccountSnapshot(input.state);
  if (state.accountId !== identity.accountId)
    throw new Error('Lifecycle outcome belongs to another account.');
  if (input.outcome !== 'unknown' && input.outcome !== 'applied' && input.outcome !== 'canceled')
    throw new Error('Invalid account lifecycle outcome.');
  let applied: LifecycleApplied | undefined;
  if (input.outcome === 'applied') {
    const result = record(input.applied);
    keys(result, ['revision', 'generation', 'imported', 'skipped', 'historicalLinks']);
    applied = { revision: counter(result.revision), generation: counter(result.generation) };
    if (
      applied.revision !== identity.baseRevision + 1 ||
      applied.generation !== identity.generation + 1
    )
      throw new Error('Invalid applied lifecycle authority.');
    if (state.revision < applied.revision || state.generation < applied.generation)
      throw new Error('Lifecycle state precedes its applied outcome.');
    for (const key of ['imported', 'skipped', 'historicalLinks'] as const)
      if (result[key] !== undefined) applied[key] = counter(result[key]);
  } else if (input.applied !== undefined)
    throw new Error('Only an applied lifecycle has an applied result.');
  if (
    input.reserved !== undefined &&
    (typeof input.reserved !== 'boolean' || input.outcome !== 'unknown')
  )
    throw new Error('Only an unknown lifecycle can have a reservation.');
  return {
    identity,
    outcome: input.outcome,
    state,
    ...(applied ? { applied } : {}),
    ...(input.reserved !== undefined ? { reserved: input.reserved as boolean } : {}),
  };
}

/** Object order is immaterial; arrays and every supplied JSON value remain part of identity. */
function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  throw new Error('The lifecycle payload must contain only JSON values.');
}

export function canonicalLifecyclePayload(kind: LifecycleKind, payload: unknown): string {
  return canonical({ kind, payload });
}

export async function hashLifecyclePayload(kind: LifecycleKind, payload: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalLifecyclePayload(kind, payload)),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
