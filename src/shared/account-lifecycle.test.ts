import { describe, expect, it } from 'vitest';
import {
  canonicalLifecyclePayload,
  hashLifecyclePayload,
  validateLifecycleIdentity,
  validateLifecycleResult,
} from './account-lifecycle';
import { DEFAULT_PROFILE } from './training';

describe('immutable lifecycle identity', () => {
  const identity = {
    version: 1,
    id: 'reset-one',
    accountId: 'account-a',
    kind: 'reset',
    baseRevision: 7,
    generation: 2,
    payloadHash: 'a'.repeat(64),
  };
  it('binds all supplied content while accepting reordered JSON members', async () => {
    const first = {
      mode: 'replace',
      data: { sessions: [{ id: 'one', notes: 'private' }], version: 1 },
    };
    const reordered = {
      data: { version: 1, sessions: [{ notes: 'private', id: 'one' }] },
      mode: 'replace',
    };
    expect(await hashLifecyclePayload('replace', first)).toBe(
      await hashLifecyclePayload('replace', reordered),
    );
    expect(await hashLifecyclePayload('replace', first)).not.toBe(
      await hashLifecyclePayload('replace', { ...first, data: { ...first.data, extra: true } }),
    );
    expect(await hashLifecyclePayload('reset', { confirmation: 'RESET' })).not.toBe(
      await hashLifecyclePayload('replace', { confirmation: 'RESET' }),
    );
    expect(canonicalLifecyclePayload('replace', [1, 2])).not.toBe(
      canonicalLifecyclePayload('replace', [2, 1]),
    );
  });
  it.each([
    { generation: '2' },
    { generation: -1 },
    { baseRevision: Number.MAX_SAFE_INTEGER + 1 },
    { id: 'a'.repeat(201) },
    { accountId: '' },
    { kind: 'merge' },
    { payloadHash: 'A'.repeat(64) },
    { version: 2 },
    { restamp: true },
  ])('rejects unsupported or ambiguous authority %j', (changes) => {
    expect(() => validateLifecycleIdentity({ ...identity, ...changes })).toThrow();
  });
  it('distinguishes a terminal receipt from its newer current state', () => {
    const state = {
      accountId: 'account-a',
      revision: 10,
      generation: 4,
      settings: DEFAULT_PROFILE,
      plan: [],
    };
    const applied = { revision: 8, generation: 3 };
    expect(validateLifecycleResult({ identity, outcome: 'applied', applied, state })).toMatchObject(
      { applied, state },
    );
    expect(() =>
      validateLifecycleResult({ identity, outcome: 'unknown', applied, state }),
    ).toThrow();
    expect(() =>
      validateLifecycleResult({
        identity,
        outcome: 'applied',
        applied: { ...applied, generation: 4 },
        state,
      }),
    ).toThrow();
    expect(
      validateLifecycleResult({ identity, outcome: 'unknown', reserved: true, state }),
    ).toMatchObject({ reserved: true });
    expect(() =>
      validateLifecycleResult({ identity, outcome: 'canceled', reserved: true, state }),
    ).toThrow();
    expect(() =>
      validateLifecycleResult({ identity, outcome: 'unknown', reserved: 'yes', state }),
    ).toThrow();
    expect(() =>
      validateLifecycleResult({
        identity,
        outcome: 'canceled',
        state: { ...state, accountId: 'account-b' },
      }),
    ).toThrow();
  });
});
