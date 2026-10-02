import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDeviceScopeToken, invalidateDeviceScope } from './device-scope';
import { parseCustomWords, wordPracticeRound } from './word-content';
import {
  clearWordContent,
  DEFAULT_WORD_CONTENT,
  loadWordContent,
  readWordContent,
  saveWordContent,
  validateWordContent,
  wordContentKey,
  type WordContent,
} from './word-storage';

let values: Map<string, string>;
let storage: Storage;
const source: WordContent = { version: 1, wordList: 'custom', customText: ' e\tE\n<AR> HW? ' };
beforeEach(() => {
  values = new Map();
  storage = {
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    clear: () => values.clear(),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal(
    'CustomEvent',
    class<T> extends Event {
      detail: T;
      constructor(type: string, options: CustomEventInit<T>) {
        super(type);
        this.detail = options.detail!;
      }
    },
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('private device word sources', () => {
  it('keeps raw source order, repeats and prosigns separate from shuffled playback', () => {
    const saved = saveWordContent('guest', 'initial', source);
    expect(saved).toEqual(source);
    expect(readWordContent('guest')).toEqual(source);
    expect(parseCustomWords(saved.customText)).toEqual(['E', 'E', '<AR>', 'HW?']);
    expect(wordPracticeRound('custom', saved.customText, true, () => 0).sort()).toEqual(
      ['E', 'E', '<AR>', 'HW?'].sort(),
    );
    expect(readWordContent('guest').customText).toBe(source.customText);
    expect(saved).not.toHaveProperty('seconds');
  });
  it('isolates guest/account keys and never adopts a shared custom selection', () => {
    values.set('cwa.practice.preferences.v1', JSON.stringify({ wordList: 'custom' }));
    saveWordContent('guest', 'initial', source);
    saveWordContent('account:one', 'initial', { ...source, customText: 'CQ CQ' });
    expect(readWordContent('account:two')).toEqual(DEFAULT_WORD_CONTENT);
    clearWordContent('account:one', 'initial');
    expect(readWordContent('account:one')).toEqual(DEFAULT_WORD_CONTENT);
    expect(readWordContent('guest')).toEqual(source);
    expect(values.get('cwa.practice.preferences.v1')).toContain('custom');
  });
  it('rejects invalid and unbounded input before replacing a valid source', () => {
    saveWordContent('guest', 'initial', source);
    for (const customText of [
      ' ',
      'E '.repeat(201),
      'E'.repeat(41),
      ' '.repeat(8201),
      'E\u0000 T',
      'E\u000bT',
      'E\u0085T',
      'E 💡',
      '<ZZ>',
    ]) {
      expect(() => saveWordContent('guest', 'initial', { ...source, customText })).toThrow();
      expect(readWordContent('guest')).toEqual(source);
      expect(() => wordPracticeRound('custom', customText, false)).toThrow();
    }
    expect(validateWordContent({ version: 1, wordList: 'custom', customText: '' }).customText).toBe(
      '',
    );
    expect(() => wordPracticeRound('custom', '', false)).toThrow('1 and 200');
  });
  it('refuses unsupported records without erasing them and permits explicit scoped clear', () => {
    for (const raw of [
      '{',
      JSON.stringify({ ...source, version: 2 }),
      JSON.stringify({ ...source, elapsed: 10 }),
    ]) {
      values.set(wordContentKey('guest'), raw);
      expect(loadWordContent('guest').error).toContain('could not be read');
      expect(() => saveWordContent('guest', 'initial', source)).toThrow();
      expect(values.get(wordContentKey('guest'))).toBe(raw);
      clearWordContent('guest', 'initial');
      expect(loadWordContent('guest')).toEqual({ value: DEFAULT_WORD_CONTENT, error: '' });
    }
  });
  it('requires readback and protects a retired lifecycle owner from save or clear', () => {
    const ignored = { ...storage, setItem: vi.fn(), removeItem: vi.fn() };
    expect(() => saveWordContent('guest', 'initial', source, ignored)).toThrow('did not retain');
    saveWordContent('guest', 'initial', source);
    expect(() => clearWordContent('guest', 'initial', ignored)).toThrow('did not clear');
    invalidateDeviceScope('guest');
    expect(getDeviceScopeToken('guest')).not.toBe('initial');
    expect(() => saveWordContent('guest', 'initial', { ...source, customText: 'T' })).toThrow(
      'changed',
    );
    expect(() => clearWordContent('guest', 'initial')).toThrow('changed');
    expect(readWordContent('guest')).toEqual(source);
  });
});
