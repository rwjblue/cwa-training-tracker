import { useRef, useState } from 'react';
import { isDeviceScopeCurrent, isDeviceScopeMutating } from './device-scope';
import { parseCustomWords, type WordList } from './word-content';
import {
  clearWordContent,
  DEFAULT_WORD_CONTENT,
  loadWordContent,
  saveWordContent,
  type WordContent,
} from './word-storage';

function initialState(scope: string, token: string, mutating: boolean) {
  const loaded = mutating
    ? {
        value: { ...DEFAULT_WORD_CONTENT },
        error: 'Device work is being updated. Finish its recovery before editing words.',
      }
    : loadWordContent(scope);
  return {
    scope,
    token,
    mutating,
    saved: loaded.value,
    draft: loaded.value.customText,
    selection: loaded.value.wordList,
    error: loaded.error,
    remembered: !loaded.error,
  };
}
/** One scoped source owner outlives individual practice blocks, never their clocks. */
export function useWordContent(scope: string, token: string) {
  const mutating = isDeviceScopeMutating(scope);
  const [state, setState] = useState(() => initialState(scope, token, mutating));
  let current = state;
  if (state.scope !== scope || state.token !== token || state.mutating !== mutating) {
    current = initialState(scope, token, mutating);
    // Reset before children commit; a new account must never render the old source.
    setState(current);
  }
  const owner = useRef({ scope, token });
  owner.current = { scope, token };
  const owns = () =>
    owner.current.scope === scope &&
    owner.current.token === token &&
    isDeviceScopeCurrent(scope, token);
  const update = (changes: Partial<typeof state>) =>
    setState((live) =>
      live.scope === scope && live.token === token ? { ...live, ...changes } : live,
    );
  const { saved, draft, selection, error, remembered } = current;
  const persist = (value: WordContent) => {
    if (!owns()) return false;
    try {
      update({ saved: saveWordContent(scope, token, value), error: '', remembered: true });
      return true;
    } catch (failure) {
      update({
        remembered: false,
        error: `Words were not saved on this device. Enable browser storage or free space, then retry. ${failure instanceof Error ? failure.message : ''}`,
      });
      return false;
    }
  };
  const edit = (wordList: WordList, text: string) => {
    if (!owns()) return;
    update({ selection: wordList, draft: text });
    try {
      parseCustomWords(text);
    } catch (failure) {
      update({ error: `${(failure as Error).message} Your last valid saved words are retained.` });
      return;
    }
    persist({ version: 1, wordList, customText: text });
  };
  const select = (wordList: WordList) => {
    if (!owns()) return;
    update({ selection: wordList });
    let text = draft.trim() ? draft : saved.customText;
    try {
      if (text) parseCustomWords(text);
    } catch {
      text = saved.customText;
    }
    persist({ version: 1, wordList, customText: text });
  };
  const clear = () => {
    if (!owns()) return false;
    try {
      clearWordContent(scope, token);
      update({
        saved: { ...DEFAULT_WORD_CONTENT },
        draft: '',
        selection: DEFAULT_WORD_CONTENT.wordList,
        error: '',
        remembered: true,
      });
      return true;
    } catch (failure) {
      update({
        error: `Saved words could not be cleared. Your current words are retained. ${failure instanceof Error ? failure.message : ''}`,
      });
      return false;
    }
  };
  return {
    draft,
    saved,
    selection,
    error,
    remembered,
    edit,
    select,
    clear,
    retry: () => {
      if (selection === 'custom') edit(selection, draft);
      else select(selection);
    },
  };
}
export type WordContentEditor = ReturnType<typeof useWordContent>;
