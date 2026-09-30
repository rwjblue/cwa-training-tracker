import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  completeDeviceScopeMutation,
  deviceScopeKey,
  getDeviceScopeState,
  getDeviceScopeToken,
  invalidateDeviceScope,
  isDeviceScopeCurrent,
  subscribeDeviceScope,
} from './device-scope';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => values.set(name, value),
  });
  vi.stubGlobal('window', new EventTarget());
});
afterEach(() => vi.unstubAllGlobals());

it('invalidates mounted owners before mutation and keeps another scope usable', () => {
  const old = getDeviceScopeToken('scope-a');
  const other = getDeviceScopeToken('scope-b');
  const changed = vi.fn();
  const stop = subscribeDeviceScope(changed);
  const next = invalidateDeviceScope('scope-a');
  expect(isDeviceScopeCurrent('scope-a', old)).toBe(false);
  expect(isDeviceScopeCurrent('scope-a', next)).toBe(false);
  expect(isDeviceScopeCurrent('scope-b', other)).toBe(true);
  expect(changed).toHaveBeenLastCalledWith({ scope: 'scope-a', token: next, mutating: true });
  completeDeviceScopeMutation('scope-a', next);
  expect(isDeviceScopeCurrent('scope-a', old)).toBe(false);
  expect(isDeviceScopeCurrent('scope-a', next)).toBe(true);
  expect(changed).toHaveBeenLastCalledWith({ scope: 'scope-a', token: next, mutating: false });
  stop();
});

it('reads a second tab’s durable fence before its storage notification arrives', () => {
  const old = getDeviceScopeToken('account:one');
  localStorage.setItem(
    deviceScopeKey('account:one'),
    JSON.stringify({ version: 1, token: 'other-tab', mutating: true }),
  );
  expect(isDeviceScopeCurrent('account:one', old)).toBe(false);
  const observed = vi.fn();
  const stop = subscribeDeviceScope(observed);
  const storage = new Event('storage');
  Object.assign(storage, { key: deviceScopeKey('account:one') });
  window.dispatchEvent(storage);
  expect(observed).toHaveBeenCalledWith({
    scope: 'account:one',
    token: 'other-tab',
    mutating: true,
  });
  expect(() => completeDeviceScopeMutation('account:one', old)).toThrow('Another tab');
  stop();
});

it('requires durable readback and does not announce a failed lifecycle boundary', () => {
  const original = getDeviceScopeToken('scope');
  const changed = vi.fn();
  const stop = subscribeDeviceScope(changed);
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {});
  expect(() => invalidateDeviceScope('scope')).toThrow('could not safely update');
  expect(changed).not.toHaveBeenCalled();
  expect(isDeviceScopeCurrent('scope', original)).toBe(true);
  stop();
});

it('blocks writes for malformed coordination rather than granting an initial owner', () => {
  localStorage.setItem(deviceScopeKey('scope'), '{broken');
  expect(getDeviceScopeState('scope').mutating).toBe(true);
  expect(isDeviceScopeCurrent('scope', getDeviceScopeToken('scope'))).toBe(false);
});
