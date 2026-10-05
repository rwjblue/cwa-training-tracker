import { practiceStory, PRACTICE_STORIES } from '../shared/listening-stories';
import {
  type ListeningQsoRound,
  type ListeningStoryRound,
  type ListeningWordRound,
} from './listening-configuration';
import {
  DEFAULT_PRACTICE_PREFERENCES,
  listeningPreferences,
  normalizePracticePreferences,
  type PracticePreferences,
} from './practice-preferences';
import { qsoFromRecipe, QSO_TEMPLATES } from './qso-content';
import { WORD_LISTS } from './word-content';

export interface ListeningShareMaterial {
  /** Public QSO workspace only; copied answers and revealed-answer state stay local. */
  copyMode?: boolean;
  qso?: ListeningQsoRound;
  words?: ListeningWordRound | null;
  story?: ListeningStoryRound;
}
export interface ListeningShare extends ListeningShareMaterial {
  preferences: PracticePreferences;
  /** A damaged recipe is replaced only with this visible recovery explanation. */
  error?: string;
}

const encodeNumbers = (values: readonly number[]) =>
  values.map((value) => value.toString(36)).join('.');
const decodeNumbers = (value: string, count: number, min: number, max: number) => {
  if (value.length > 2000 || !/^[0-9a-z]+(?:\.[0-9a-z]+)*$/.test(value))
    throw new Error('Invalid listening recipe.');
  const numbers = value.split('.').map((item) => parseInt(item, 36));
  if (
    numbers.length !== count ||
    encodeNumbers(numbers) !== value ||
    numbers.some((number) => !Number.isSafeInteger(number) || number < min || number > max)
  )
    throw new Error('Invalid listening recipe.');
  return numbers;
};

/** Read only a whitelist of public selections. Device text and practice facts never enter a URL. */
export function readListeningShare(
  hash: string,
  current: PracticePreferences = DEFAULT_PRACTICE_PREFERENCES,
): ListeningShare {
  const match = /^#practice\/(words|qso|stories)(?:\?(.*))?$/.exec(hash);
  if (!match) return { preferences: current };
  const tool = match[1] as 'words' | 'qso' | 'stories';
  const params = new URLSearchParams((match[2] ?? '').slice(0, 5000));
  const updates: Partial<PracticePreferences> = { tool };
  const sound =
    tool === 'qso'
      ? { ...current.qsoSettings }
      : tool === 'stories'
        ? { ...current.storySettings }
        : {
            characterWpm: current.characterWpm,
            effectiveWpm: current.effectiveWpm,
            tone: current.tone,
            hideTrainerText: current.hideTrainerText,
          };
  const number = (key: string, min: number, max: number, step = 1) => {
    const value = params.get(key);
    if (value === null || !/^(?:\d+)(?:\.\d+)?$/.test(value)) return undefined;
    const result = Number(value);
    return Number.isFinite(result) &&
      result >= min &&
      result <= max &&
      Math.abs(result / step - Math.round(result / step)) < 0.000001
      ? result
      : undefined;
  };
  const boolean = (key: string) =>
    params.get(key) === '1' ? true : params.get(key) === '0' ? false : undefined;
  sound.characterWpm = number('cwpm', 5, 60) ?? sound.characterWpm;
  sound.effectiveWpm = Math.min(sound.characterWpm, number('ewpm', 3, 60) ?? sound.effectiveWpm);
  sound.tone = number('tone', 300, 1000) ?? sound.tone;
  if (params.get('text') === 'show') sound.hideTrainerText = false;
  if (params.get('text') === 'hide') sound.hideTrainerText = true;
  const volume = number('volume', 0, 100);
  if (volume !== undefined) updates.volume = volume;
  const variable = boolean('variable');
  if (tool === 'words') {
    Object.assign(updates, sound);
    const list = params.get('list');
    if (list === 'common-qso' || list === 'common-30') updates.wordList = list;
    if (list === 'custom') updates.wordList = 'common-qso';
    const gap = number('gap', 0, 5, 0.1);
    if (gap !== undefined) updates.wordGap = gap;
    for (const [key, field] of [
      ['shuffle', 'shuffleWords'],
      ['repeat', 'repeatList'],
      ['spoken', 'spokenAnswers'],
    ] as const) {
      const value = boolean(key);
      if (value !== undefined) updates[field] = value;
    }
    if (variable !== undefined) updates.variableWordPitch = variable;
  } else if (tool === 'qso') {
    updates.qsoSettings = { ...current.qsoSettings, ...sound };
    const scenario = params.get('scenario');
    if (QSO_TEMPLATES.some((template) => template.id === scenario)) updates.qsoScenario = scenario!;
    if (variable !== undefined) updates.variableQsoPitch = variable;
  } else {
    updates.storySettings = { ...current.storySettings, ...sound };
    const story = PRACTICE_STORIES.find((item) => item.id === params.get('story'));
    if (story) updates.storySettings.storyId = story.id;
    if (variable !== undefined) updates.variableStoryPitch = variable;
  }
  const result: ListeningShare = {
    preferences: normalizePracticePreferences({ ...current, ...updates }),
  };
  const p = result.preferences;
  if (tool === 'qso') result.copyMode = params.get('view') === 'copy';
  if (tool === 'words' && params.get('list') === 'custom')
    result.error =
      'Custom words stay private on the original device. This shared link opens Common QSO words with the shared sound settings.';
  try {
    const hasRecipe =
      params.has('qso') || params.has('order') || params.has('pitches') || params.has('pitch');
    if (hasRecipe && params.get('v') !== '1')
      throw new Error('This listening link uses an unsupported recipe version.');
    if (tool === 'qso' && params.has('qso')) {
      const qso = qsoFromRecipe(params.get('qso')!);
      if (params.has('scenario') && params.get('scenario') !== qso.id)
        throw new Error('This QSO link has conflicting scenarios.');
      const tonesHz = decodeNumbers(params.get('pitches') ?? '', 2, 500, 900) as [number, number];
      if (Math.abs(tonesHz[0] - tonesHz[1]) < 35)
        throw new Error('This QSO link has invalid station pitches.');
      result.qso = Object.freeze({ ...qso, tonesHz: Object.freeze(tonesHz) });
      result.preferences.qsoScenario = qso.id;
    } else if (tool === 'words' && params.has('order')) {
      if (!Object.hasOwn(WORD_LISTS, params.get('list') ?? ''))
        throw new Error('This word link has an unknown public list.');
      if (p.wordList === 'custom' || params.get('list') === 'custom')
        throw new Error('Custom word recipes are private.');
      const catalog = WORD_LISTS[p.wordList].words;
      const order = decodeNumbers(params.get('order')!, catalog.length, 0, catalog.length - 1);
      if (new Set(order).size !== catalog.length || (p.wordList === 'common-qso' && order[0] !== 0))
        throw new Error('This word link has an invalid list order.');
      const frequenciesHz = decodeNumbers(params.get('pitches') ?? '', catalog.length, 500, 900);
      result.words = Object.freeze({
        listId: p.wordList,
        shuffle: boolean('round-shuffle') ?? p.shuffleWords,
        words: Object.freeze(order.map((index) => catalog[index])),
        frequenciesHz: Object.freeze(frequenciesHz),
      });
    } else if (tool === 'stories' && params.has('pitch')) {
      if (!PRACTICE_STORIES.some((item) => item.id === params.get('story')))
        throw new Error('This story link has an unknown public story.');
      const toneHz = decodeNumbers(params.get('pitch')!, 1, 500, 900)[0];
      result.story = Object.freeze({ ...practiceStory(p.storySettings.storyId), toneHz });
    } else if (hasRecipe) throw new Error('This listening link has an incomplete recipe.');
  } catch (error) {
    result.error = `${(error as Error).message} A fresh public ${tool === 'qso' ? 'QSO' : tool === 'words' ? 'word round' : 'story recording'} has been prepared instead.`;
  }
  return result;
}

/** Explicit v1 choices preserve a recording through reload and sharing, without random regeneration. */
export function listeningShareRoute(
  preferences: PracticePreferences,
  material: ListeningShareMaterial,
): string {
  const p = listeningPreferences(preferences);
  if (p.tool !== 'words' && p.tool !== 'qso' && p.tool !== 'stories') return `#practice/${p.tool}`;
  const params = new URLSearchParams({
    v: '1',
    cwpm: String(p.characterWpm),
    ewpm: String(p.effectiveWpm),
    tone: String(p.tone),
    volume: String(p.volume),
    text: p.hideTrainerText ? 'hide' : 'show',
  });
  if (p.tool === 'qso') {
    if (material.copyMode) params.set('view', 'copy');
    params.set('scenario', material.qso?.id ?? p.qsoScenario);
    params.set('variable', p.variableQsoPitch ? '1' : '0');
    if (material.qso?.recipe) {
      params.set('qso', material.qso.recipe);
      params.set('pitches', encodeNumbers(material.qso.tonesHz));
    }
  } else if (p.tool === 'stories') {
    params.set('story', material.story?.id ?? p.storySettings.storyId);
    params.set('variable', p.variableStoryPitch ? '1' : '0');
    if (material.story) params.set('pitch', encodeNumbers([material.story.toneHz]));
  } else {
    params.set('list', material.words?.listId ?? p.wordList);
    params.set('variable', p.variableWordPitch ? '1' : '0');
    params.set('gap', String(p.wordGap));
    params.set('shuffle', p.shuffleWords ? '1' : '0');
    params.set('repeat', p.repeatList ? '1' : '0');
    params.set('spoken', p.spokenAnswers ? '1' : '0');
    if (material.words && material.words.listId !== 'custom') {
      const catalog: readonly string[] = WORD_LISTS[material.words.listId].words;
      params.set('order', encodeNumbers(material.words.words.map((word) => catalog.indexOf(word))));
      params.set('pitches', encodeNumbers(material.words.frequenciesHz));
      if (material.words.shuffle !== p.shuffleWords)
        params.set('round-shuffle', material.words.shuffle ? '1' : '0');
    }
  }
  return `#practice/${p.tool}?${params}`;
}
