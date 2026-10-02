import { requireCurrentDeviceScope } from './device-scope';
import { parseCustomWords, type WordList } from './word-content';

export interface WordContent {
  version: 1;
  wordList: WordList;
  customText: string;
}
export const DEFAULT_WORD_CONTENT: WordContent = {
  version: 1,
  wordList: 'common-qso',
  customText: '',
};
export const wordContentKey = (scope: string) =>
  `cwa.words.content.v1:${encodeURIComponent(scope)}`;
type WordStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const target = (storage?: WordStorage) => storage ?? localStorage;

/** Portable private source, never a shuffled rendering or an elapsed clock. */
export function validateWordContent(value: unknown): WordContent {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Saved words must be a version 1 source record.');
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some((key) => !['version', 'wordList', 'customText'].includes(key)) ||
    input.version !== 1 ||
    typeof input.wordList !== 'string' ||
    !['common-qso', 'common-30', 'custom'].includes(input.wordList) ||
    typeof input.customText !== 'string'
  )
    throw new Error('Saved words have invalid fields or an unsupported version.');
  // Empty is a valid initial editing state, never a playable custom source.
  if (input.customText !== '') parseCustomWords(input.customText);
  return { version: 1, wordList: input.wordList as WordList, customText: input.customText };
}
export function readWordContent(scope: string, storage?: WordStorage): WordContent {
  const raw = target(storage).getItem(wordContentKey(scope));
  if (raw === null) return { ...DEFAULT_WORD_CONTENT };
  if (raw.length > 60_000) throw new Error('The saved word source is too large.');
  return validateWordContent(JSON.parse(raw));
}
export function loadWordContent(scope: string): { value: WordContent; error: string } {
  try {
    return { value: readWordContent(scope), error: '' };
  } catch {
    return {
      value: { ...DEFAULT_WORD_CONTENT },
      error:
        'Saved words could not be read. Reopen after enabling storage, or explicitly clear this scope’s saved words. Existing stored work has not been changed.',
    };
  }
}
export function saveWordContent(
  scope: string,
  token: string,
  value: WordContent,
  storage?: WordStorage,
): WordContent {
  requireCurrentDeviceScope(scope, token);
  const checked = validateWordContent(value);
  const store = target(storage);
  // Do not silently replace damaged/newer work when its source could not be read.
  readWordContent(scope, store);
  const raw = JSON.stringify(checked);
  store.setItem(wordContentKey(scope), raw);
  if (store.getItem(wordContentKey(scope)) !== raw)
    throw new Error('The browser did not retain the word source.');
  requireCurrentDeviceScope(scope, token);
  return checked;
}
export function clearWordContent(scope: string, token: string, storage?: WordStorage): void {
  requireCurrentDeviceScope(scope, token);
  const store = target(storage);
  store.removeItem(wordContentKey(scope));
  if (store.getItem(wordContentKey(scope)) !== null)
    throw new Error('The browser did not clear the saved words.');
  requireCurrentDeviceScope(scope, token);
}
