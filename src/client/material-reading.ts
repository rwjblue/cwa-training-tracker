import { getDeviceScopeToken, isDeviceScopeCurrent } from './device-scope';
export interface MaterialReading {
  size: number;
  scroll: number;
}
export type MaterialReadingStore = Record<string, MaterialReading>;
const memory = new Map<string, { token: string; value: MaterialReadingStore }>();
export const materialReadingKey = (scope: string) => `cwa.material.reading.v1:${scope}`;
export function validateMaterialReadingStore(value: unknown): MaterialReadingStore {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length > 200
  )
    throw new Error('Invalid material reading preferences.');
  const result: MaterialReadingStore = {};
  for (const [id, preference] of Object.entries(value)) {
    if (
      !/^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]{0,199}$/.test(id) ||
      !preference ||
      typeof preference !== 'object' ||
      Object.keys(preference).some((key) => !['size', 'scroll'].includes(key))
    )
      throw new Error('Invalid material reading preference.');
    const { size, scroll } = preference as MaterialReading;
    if (
      !Number.isInteger(size) ||
      size < 18 ||
      size > 48 ||
      !Number.isFinite(scroll) ||
      scroll < 0 ||
      scroll > 10_000_000
    )
      throw new Error('Invalid material reading position or text size.');
    Object.defineProperty(result, id, {
      value: { size, scroll },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return result;
}
export function readMaterialReading(
  scope: string,
  storage: Pick<Storage, 'getItem'> = localStorage,
): MaterialReadingStore {
  const retained = memory.get(scope);
  if (storage === localStorage && retained?.token === getDeviceScopeToken(scope))
    return structuredClone(retained.value);
  try {
    return validateMaterialReadingStore(
      JSON.parse(storage.getItem(materialReadingKey(scope)) ?? '{}'),
    );
  } catch {
    return {};
  }
}
export function saveMaterialReading(
  scope: string,
  id: string,
  preference: MaterialReading,
  token: string,
): boolean {
  if (!isDeviceScopeCurrent(scope, token)) return false;
  try {
    const value = validateMaterialReadingStore({ ...readMaterialReading(scope), [id]: preference });
    memory.set(scope, { token, value });
    const body = JSON.stringify(value);
    localStorage.setItem(materialReadingKey(scope), body);
    return localStorage.getItem(materialReadingKey(scope)) === body;
  } catch {
    return false;
  }
}
export const materialReadingToken = getDeviceScopeToken;

export function captureMaterialReadingMemory(scope: string): MaterialReadingStore | undefined {
  const retained = memory.get(scope);
  return retained?.token === getDeviceScopeToken(scope)
    ? structuredClone(retained.value)
    : undefined;
}
export function invalidateMaterialReadingMemory(scope: string): void {
  memory.delete(scope);
}
export function restoreMaterialReadingMemory(scope: string, value?: MaterialReadingStore): void {
  memory.delete(scope);
  if (value)
    memory.set(scope, {
      token: getDeviceScopeToken(scope),
      value: validateMaterialReadingStore(value),
    });
}
