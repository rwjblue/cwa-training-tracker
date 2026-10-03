import { afterEach, expect, it, vi } from 'vitest';
import {
  materialReadingKey,
  readMaterialReading,
  saveMaterialReading,
  validateMaterialReadingStore,
} from './material-reading';
import { getDeviceScopeToken, invalidateDeviceScope } from './device-scope';
afterEach(() => vi.unstubAllGlobals());
it('validates reader preferences and preserves ownership while exposing refused persistence', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  const token = getDeviceScopeToken('reader-owner');
  expect(saveMaterialReading('reader-owner', 'one', { size: 31, scroll: 450 }, token)).toBe(true);
  expect(readMaterialReading('reader-owner')).toEqual({ one: { size: 31, scroll: 450 } });
  expect(readMaterialReading('another-owner')).toEqual({});
  invalidateDeviceScope('reader-owner');
  expect(saveMaterialReading('reader-owner', 'one', { size: 48, scroll: 0 }, token)).toBe(false);
  const next = getDeviceScopeToken('reader-owner');
  const failure = vi.spyOn(storage, 'setItem').mockImplementation(() => {
    throw new Error('Synthetic storage failure');
  });
  expect(saveMaterialReading('reader-owner', 'one', { size: 48, scroll: 0 }, next)).toBe(false);
  expect(JSON.parse(values.get(materialReadingKey('reader-owner'))!).one.size).toBe(31);
  failure.mockRestore();
  for (const invalid of [
    { one: { size: 17, scroll: 0 } },
    { one: { size: 49, scroll: 0 } },
    { one: { size: 25.5, scroll: 0 } },
    { one: { size: 26, scroll: -1 } },
    { one: { size: 26, scroll: Infinity } },
    { one: { size: 26, scroll: 0, text: 'private' } },
  ])
    expect(() => validateMaterialReadingStore(invalid)).toThrow();
});
