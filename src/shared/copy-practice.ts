import {
  COPY_CONTENT_VERSION,
  COPY_MORSE,
  COPY_SENTENCES,
  COPY_WORD_COLLECTIONS,
} from './copy-content.ts';

export type CopyMode = 'groups' | 'words' | 'callsigns' | 'plaintext';
export interface CopyRecipe {
  mode: CopyMode;
  characterWpm: number;
  effectiveWpm: number;
  /** Omitted in legacy recipes, which must retain their fixed tone and JSON shape. */
  toneMode?: 'fixed' | 'random';
  toneHz: number;
  extraWordSpacing: number;
  startDelaySeconds: number;
  groupKind: 'letters' | 'figures' | 'mixed' | 'custom';
  customCharacters: string;
  groupLength: number | 'random';
  lengthMode: 'duration' | 'count';
  durationSeconds: number;
  groupCount: number;
  wordCollection: 'english' | 'short' | 'abbreviations' | 'qcodes';
  maxWordLength: number;
  adaptive: boolean;
  maxSpeed: number;
  callFilter: 'all' | 'short' | 'simple';
  autoSkipSeconds: number;
  stopOnError: boolean;
  blind: boolean;
}

export interface CopyTrial {
  answer: string;
  characterWpm: number;
  effectiveWpm: number;
  correct: boolean;
  points: number;
  distance: number;
  replayCount: number;
  responseSeconds: number;
}

export interface CopyAttempt {
  version: 1;
  scoringVersion: 'native-copy-v1';
  timingVersion: 'paris-farnsworth-v1';
  contentVersion: string;
  id: string;
  seed: string;
  recipe: CopyRecipe;
  targets: string[];
  trials: CopyTrial[];
  status: 'active' | 'completed' | 'abandoned';
  createdAt: string;
  updatedAt: string;
  audioSeconds: number;
  answerSeconds: number;
  reviewSeconds: number;
  revealCount: number;
  interruptionCount: number;
}

export interface CopyAlignment {
  kind: 'equal' | 'substitution' | 'insertion' | 'deletion';
  expected: string;
  received: string;
}

export const COPY_MODES: readonly CopyMode[] = ['groups', 'words', 'callsigns', 'plaintext'];
export const COPY_MAX_TEXT = 2000;
export const COPY_RANDOM_TONE_MIN_HZ = 500;
export const COPY_RANDOM_TONE_MAX_HZ = 900;
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const digits = '0123456789';

export function defaultCopyRecipe(mode: CopyMode = 'groups'): CopyRecipe {
  return {
    mode,
    characterWpm: 25,
    effectiveWpm: 10,
    toneMode: 'random',
    toneHz: 600,
    extraWordSpacing: 0,
    startDelaySeconds: 1,
    groupKind: 'letters',
    customCharacters: 'ESIHT',
    groupLength: 3,
    lengthMode: 'duration',
    durationSeconds: 60,
    groupCount: 10,
    wordCollection: 'english',
    maxWordLength: 3,
    adaptive: true,
    maxSpeed: 50,
    callFilter: 'simple',
    autoSkipSeconds: 0,
    stopOnError: false,
    blind: false,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Copy practice must be an object.');
  return value as Record<string, unknown>;
}
function numeric(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  ) {
    throw new Error(
      `${label} must be ${integer ? 'a whole number' : 'a number'} between ${min} and ${max}.`,
    );
  }
  return value;
}
function text(value: unknown, label: string, max: number, nonempty = false): string {
  if (typeof value !== 'string' || value.length > max || (nonempty && !value.trim()))
    throw new Error(`${label} must be text of at most ${max} characters.`);
  return value;
}
function option<T extends string>(value: unknown, choices: readonly T[], label: string): T {
  if (!choices.includes(value as T)) throw new Error(`Choose a valid ${label}.`);
  return value as T;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be true or false.`);
  return value;
}

export function validateCopyRecipe(value: unknown): CopyRecipe {
  const input = record(value);
  const mode = option(input.mode, COPY_MODES, 'copy mode');
  const p = { ...defaultCopyRecipe(mode), ...input };
  const recipe: CopyRecipe = {
    mode,
    characterWpm: numeric(p.characterWpm, 'Character speed', 5, 100),
    effectiveWpm: numeric(p.effectiveWpm, 'Effective speed', 1, 100),
    ...(input.toneMode === undefined
      ? {}
      : { toneMode: option(input.toneMode, ['fixed', 'random'] as const, 'tone mode') }),
    toneHz: numeric(p.toneHz, 'Tone', 200, 1200),
    extraWordSpacing: numeric(p.extraWordSpacing, 'Extra word spacing', 0, 40),
    startDelaySeconds: numeric(p.startDelaySeconds, 'Start delay', 0, 20),
    groupKind: option(p.groupKind, ['letters', 'figures', 'mixed', 'custom'], 'group kind'),
    customCharacters: [
      ...new Set(
        text(p.customCharacters, 'Custom characters', 100).toUpperCase().replace(/\s/g, ''),
      ),
    ].join(''),
    groupLength:
      p.groupLength === 'random' ? 'random' : numeric(p.groupLength, 'Group length', 1, 10, true),
    lengthMode: option(p.lengthMode, ['duration', 'count'], 'length mode'),
    durationSeconds: numeric(p.durationSeconds, 'Duration', 10, 600),
    groupCount: numeric(p.groupCount, 'Group count', 1, 100, true),
    wordCollection: option(
      p.wordCollection,
      ['english', 'short', 'abbreviations', 'qcodes'],
      'word collection',
    ),
    maxWordLength: numeric(p.maxWordLength, 'Maximum word length', 1, 15, true),
    adaptive: boolean(p.adaptive, 'Adaptive speed'),
    maxSpeed: numeric(p.maxSpeed, 'Maximum speed', 5, 100),
    callFilter: option(p.callFilter, ['all', 'short', 'simple'], 'callsign filter'),
    autoSkipSeconds: numeric(p.autoSkipSeconds, 'Automatic skip', 0, 60),
    stopOnError: boolean(p.stopOnError, 'Stop on error'),
    blind: boolean(p.blind, 'Blind mode'),
  };
  if ((mode === 'groups' || mode === 'plaintext') && recipe.effectiveWpm > recipe.characterWpm)
    throw new Error('Effective speed cannot exceed character speed.');
  if ((mode === 'words' || mode === 'callsigns') && recipe.effectiveWpm < 5)
    throw new Error('Word and callsign speed must be at least 5 WPM.');
  if ((mode === 'words' || mode === 'callsigns') && recipe.maxSpeed < recipe.effectiveWpm)
    throw new Error('Maximum speed must allow the starting speed.');
  if ([...recipe.customCharacters].some((c) => !COPY_MORSE[c]))
    throw new Error('Custom characters must have a supported Morse signal.');
  if (mode === 'groups' && recipe.groupKind === 'custom' && !recipe.customCharacters)
    throw new Error('Choose at least one custom character.');
  if (
    mode === 'words' &&
    !COPY_WORD_COLLECTIONS[recipe.wordCollection].some(
      (word) => word.length <= recipe.maxWordLength,
    )
  )
    throw new Error('No words fit this collection and maximum length.');
  return recipe;
}

/** Exact PARIS Farnsworth, in seconds. Extra spacing is additional whole word gaps. */
export function copyTiming(characterWpm: number, effectiveWpm: number, extraWordSpacing = 0) {
  numeric(characterWpm, 'Character speed', 1, 150);
  numeric(effectiveWpm, 'Effective speed', 1, 150);
  numeric(extraWordSpacing, 'Extra word spacing', 0, 40);
  const dit = 1.2 / characterWpm;
  const gapUnit = Math.max(dit, (60 / Math.min(characterWpm, effectiveWpm) - 31 * dit) / 19);
  return { dit, characterGap: 3 * gapUnit, wordGap: 7 * gapUnit * (1 + extraWordSpacing) };
}

export function copyTextSeconds(
  value: string,
  characterWpm: number,
  effectiveWpm: number,
  extraWordSpacing = 0,
): number {
  const timing = copyTiming(characterWpm, effectiveWpm, extraWordSpacing);
  const words = normalizeCopyText(value).split(' ').filter(Boolean);
  return words.reduce(
    (total, word, wi) =>
      total +
      (wi ? timing.wordGap : 0) +
      [...word].reduce((duration, c, ci) => {
        const signal = COPY_MORSE[c];
        if (!signal) throw new Error(`Unsupported Morse character: ${c}`);
        const units = [...signal].reduce(
          (sum, mark) => sum + (mark === '.' ? 1 : 3),
          signal.length - 1,
        );
        return duration + (ci ? timing.characterGap : 0) + units * timing.dit;
      }, 0),
    0,
  );
}

/** Stable non-cryptographic PRNG: reproducible exercises, never credentials or secrets. */
function randomFromSeed(seed: string, namespace = '') {
  text(seed, 'Exercise seed', 100, true);
  let state = 2166136261;
  for (const c of namespace + seed) state = Math.imul(state ^ c.codePointAt(0)!, 16777619) >>> 0;
  return (length: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor((state / 4294967296) * length);
  };
}

/**
 * Reproducible pitch for version-1 attempts. Keep this namespace and algorithm
 * stable: the saved seed and recipe are the pitch evidence for replay/recovery.
 * Code groups change per group; words/calls per target; plain text per recording.
 * A separate namespace leaves the target generator's random sequence untouched.
 */
export function copyToneHz(
  attempt: Pick<CopyAttempt, 'recipe' | 'seed' | 'targets'>,
  targetIndex = 0,
  wordIndex = 0,
): number {
  numeric(targetIndex, 'Tone target index', 0, attempt.targets.length - 1, true);
  numeric(wordIndex, 'Tone group index', 0, COPY_MAX_TEXT, true);
  const { recipe } = attempt;
  if (recipe.mode === 'groups') {
    const groups = normalizeCopyText(attempt.targets[targetIndex]).split(' ');
    numeric(wordIndex, 'Tone group index', 0, groups.length - 1, true);
  } else if (recipe.mode !== 'plaintext' && wordIndex !== 0) {
    throw new Error('Word and callsign targets each have one tone.');
  }
  if (recipe.toneMode !== 'random') return numeric(recipe.toneHz, 'Tone', 200, 1200);
  const groupIndex = recipe.mode === 'groups' ? wordIndex : 0;
  const random = randomFromSeed(attempt.seed, `copy-tone-v1\0${targetIndex}\0${groupIndex}\0`);
  return COPY_RANDOM_TONE_MIN_HZ + random(COPY_RANDOM_TONE_MAX_HZ - COPY_RANDOM_TONE_MIN_HZ + 1);
}

export function generateCopyTargets(value: CopyRecipe, seed: string): string[] {
  const recipe = validateCopyRecipe(value);
  const random = randomFromSeed(seed);
  const choose = (pool: string) => pool[random(pool.length)];
  if (recipe.mode === 'groups') {
    const pool =
      recipe.groupKind === 'custom'
        ? recipe.customCharacters
        : recipe.groupKind === 'figures'
          ? digits
          : recipe.groupKind === 'mixed'
            ? `${letters}${digits}?/.,=`
            : letters;
    const groups: string[] = [];
    let seconds = 0;
    const gap = copyTiming(
      recipe.characterWpm,
      recipe.effectiveWpm,
      recipe.extraWordSpacing,
    ).wordGap;
    // Weighted variable length has a broad middle and fewer very short/long groups.
    const lengths = [2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 7, 7];
    const maxGroups = recipe.lengthMode === 'count' ? recipe.groupCount : 1000;
    for (let i = 0; i < maxGroups; i++) {
      const length =
        recipe.groupLength === 'random' ? lengths[random(lengths.length)] : recipe.groupLength;
      const group = Array.from({ length }, () => choose(pool)).join('');
      const nextSeconds =
        seconds +
        (groups.length ? gap : 0) +
        copyTextSeconds(group, recipe.characterWpm, recipe.effectiveWpm);
      if (
        recipe.lengthMode === 'duration' &&
        groups.length &&
        nextSeconds >= recipe.durationSeconds
      ) {
        if (
          Math.abs(nextSeconds - recipe.durationSeconds) <
          Math.abs(seconds - recipe.durationSeconds)
        )
          groups.push(group);
        break;
      }
      groups.push(group);
      seconds = nextSeconds;
      if (recipe.lengthMode === 'duration' && seconds >= recipe.durationSeconds) break;
    }
    const result = groups.join(' ');
    if (
      result.length > COPY_MAX_TEXT ||
      copyTextSeconds(result, recipe.characterWpm, recipe.effectiveWpm, recipe.extraWordSpacing) >
        1200 - recipe.startDelaySeconds
    )
      throw new Error('This exercise is too long. Reduce group count, length, or spacing.');
    return [result];
  }
  if (recipe.mode === 'words') {
    const pool = COPY_WORD_COLLECTIONS[recipe.wordCollection].filter(
      (word) => word.length <= recipe.maxWordLength,
    );
    const output: string[] = [];
    while (output.length < 25) {
      const remaining = [...pool];
      while (remaining.length && output.length < 25)
        output.push(remaining.splice(random(remaining.length), 1)[0]);
    }
    return output;
  }
  if (recipe.mode === 'callsigns') {
    // Plausible international shapes only; these are not a directory or claims of ownership.
    const prefixes = [
      'K',
      'N',
      'W',
      'VE',
      'VA',
      'G',
      'M',
      'DL',
      'F',
      'I',
      'EA',
      'PA',
      'SM',
      'OH',
      'JA',
      'VK',
      'ZL',
      'ZS',
      'PY',
      'LU',
      '9A',
      '9V',
    ];
    return Array.from({ length: 25 }, () => {
      const prefix = prefixes[random(prefixes.length)];
      const eventNumber = recipe.callFilter === 'all' && random(6) === 0;
      const extendedSuffix = recipe.callFilter === 'all' && random(6) === 0;
      const number = eventNumber ? String(10 + random(90)) : choose(digits);
      const suffixLength = extendedSuffix ? 4 + random(3) : 1 + random(3);
      let call = `${prefix}${number}${Array.from({ length: suffixLength }, () => choose(letters)).join('')}`;
      if (recipe.callFilter !== 'simple' && random(5) === 0) call += random(2) ? '/P' : '/M';
      return call;
    });
  }
  return [COPY_SENTENCES[random(COPY_SENTENCES.length)]];
}

/** Normalize formatting, never discard unsupported received characters or punctuation. */
export function normalizeCopyText(value: string): string {
  return value.toUpperCase().replace(/\s+/gu, ' ').trim();
}

export function scoreCopyText(
  expected: string,
  answer: string,
  includeSpacesInDenominator = false,
) {
  text(expected, 'Expected text', COPY_MAX_TEXT);
  text(answer, 'Copied text', COPY_MAX_TEXT);
  const sent = [...normalizeCopyText(expected)];
  const received = [...normalizeCopyText(answer)];
  // Store a bounded backtrace (one byte/cell), and only two numeric distance rows.
  const width = received.length + 1;
  const trace = new Uint8Array((sent.length + 1) * width);
  let previous = Uint16Array.from({ length: width }, (_, j) => j);
  for (let j = 1; j < width; j++) trace[j] = 3;
  for (let i = 1; i <= sent.length; i++) {
    const row = new Uint16Array(width);
    row[0] = i;
    trace[i * width] = 2;
    for (let j = 1; j < width; j++) {
      const equal = sent[i - 1] === received[j - 1];
      row[j] = previous[j - 1] + (equal ? 0 : 1);
      trace[i * width + j] = equal ? 0 : 1;
      if (previous[j] + 1 < row[j]) {
        row[j] = previous[j] + 1;
        trace[i * width + j] = 2;
      }
      if (row[j - 1] + 1 < row[j]) {
        row[j] = row[j - 1] + 1;
        trace[i * width + j] = 3;
      }
    }
    previous = row;
  }
  const distance = previous[received.length];
  const alignment: CopyAlignment[] = [];
  let i = sent.length,
    j = received.length;
  while (i || j) {
    const direction = trace[i * width + j];
    if (direction < 2)
      alignment.push({
        kind: direction ? 'substitution' : 'equal',
        expected: sent[--i],
        received: received[--j],
      });
    else if (direction === 2)
      alignment.push({ kind: 'deletion', expected: sent[--i], received: '' });
    else alignment.push({ kind: 'insertion', expected: '', received: received[--j] });
  }
  alignment.reverse();
  const denominator = sent.filter((c) => includeSpacesInDenominator || c !== ' ').length;
  const errorPercent = denominator
    ? Math.min(100, Math.floor((1000 * distance) / denominator) / 10)
    : distance
      ? 100
      : 0;
  return {
    distance,
    denominator,
    errorPercent,
    accuracy: Math.round((100 - errorPercent) * 10) / 10,
    alignment,
  };
}

export function createCopyAttempt(
  recipe: CopyRecipe,
  options: { id: string; seed: string; now?: string },
): CopyAttempt {
  const now = options.now ?? new Date().toISOString();
  const checked = validateCopyRecipe(recipe);
  return {
    version: 1,
    scoringVersion: 'native-copy-v1',
    timingVersion: 'paris-farnsworth-v1',
    contentVersion: COPY_CONTENT_VERSION,
    id: attemptId(options.id),
    seed: options.seed,
    recipe: checked,
    targets: generateCopyTargets(checked, options.seed),
    trials: [],
    status: 'active',
    createdAt: timestamp(now),
    updatedAt: timestamp(now),
    audioSeconds: 0,
    answerSeconds: 0,
    reviewSeconds: 0,
    revealCount: 0,
    interruptionCount: 0,
  };
}

export function currentCopySpeeds(attempt: CopyAttempt) {
  const { recipe } = attempt;
  let effectiveWpm = recipe.effectiveWpm;
  if (recipe.adaptive && (recipe.mode === 'words' || recipe.mode === 'callsigns')) {
    for (const trial of attempt.trials)
      effectiveWpm = trial.correct
        ? Math.min(recipe.maxSpeed, effectiveWpm + 1)
        : Math.max(5, effectiveWpm - 1);
  }
  return { characterWpm: Math.max(recipe.characterWpm, effectiveWpm), effectiveWpm };
}

export function submitCopyAnswer(
  attempt: CopyAttempt,
  answer: string,
  options: { replayCount?: number; responseSeconds?: number; now?: string } = {},
): CopyAttempt {
  if (attempt.status !== 'active' || attempt.trials.length >= attempt.targets.length)
    throw new Error('This copy attempt has already ended.');
  text(answer, 'Copied text', COPY_MAX_TEXT);
  const speeds = currentCopySpeeds(attempt);
  const target = attempt.targets[attempt.trials.length];
  const discrete = attempt.recipe.mode === 'words' || attempt.recipe.mode === 'callsigns';
  // Whitespace in discrete answers is harmless; continuous-copy spaces remain graded.
  const normalizedAnswer = discrete
    ? normalizeCopyText(answer).replace(/ /g, '')
    : normalizeCopyText(answer);
  const correct = normalizeCopyText(target) === normalizedAnswer;
  const scoreSpeed = attempt.recipe.adaptive
    ? Math.min(attempt.recipe.maxSpeed, speeds.effectiveWpm + 1)
    : speeds.effectiveWpm;
  const trial: CopyTrial = {
    answer,
    ...speeds,
    correct,
    points: discrete && correct ? scoreSpeed * target.length : 0,
    distance: scoreCopyText(target, normalizedAnswer).distance,
    replayCount: numeric(options.replayCount ?? 0, 'Replay count', 0, 1000, true),
    responseSeconds: numeric(options.responseSeconds ?? 0, 'Response time', 0, 7200),
  };
  const trials = [...attempt.trials, trial];
  return {
    ...attempt,
    trials,
    status: trials.length === attempt.targets.length ? 'completed' : 'active',
    updatedAt: timestamp(options.now ?? new Date().toISOString()),
  };
}

export function summarizeCopyAttempt(attempt: CopyAttempt) {
  const correct = attempt.trials.filter((trial) => trial.correct).length;
  const continuous = attempt.recipe.mode === 'groups' || attempt.recipe.mode === 'plaintext';
  const textScore =
    continuous && attempt.trials.length
      ? scoreCopyText(
          attempt.targets[0],
          attempt.trials[0].answer,
          attempt.recipe.mode === 'plaintext',
        )
      : undefined;
  const accuracy =
    textScore?.accuracy ??
    (attempt.trials.length ? Math.round((1000 * correct) / attempt.trials.length) / 10 : 0);
  return {
    correct,
    total: attempt.targets.length,
    answered: attempt.trials.length,
    points: attempt.trials.reduce((sum, trial) => sum + trial.points, 0),
    maxSpeed: Math.max(
      0,
      ...attempt.trials.filter((trial) => trial.correct).map((trial) => trial.effectiveWpm),
    ),
    replays: attempt.trials.reduce((sum, trial) => sum + trial.replayCount, 0),
    firstPassCorrect: attempt.revealCount
      ? 0
      : attempt.trials.filter((trial) => trial.correct && !trial.replayCount).length,
    distance: textScore?.distance ?? attempt.trials.reduce((sum, trial) => sum + trial.distance, 0),
    errorPercent: textScore?.errorPercent ?? Math.round((100 - accuracy) * 10) / 10,
    accuracy,
    seconds: attempt.audioSeconds + attempt.answerSeconds + attempt.reviewSeconds,
  };
}

function timestamp(value: unknown): string {
  const result = text(value, 'Attempt time', 40, true);
  const parts =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(result);
  const date = parts && new Date(`${parts[1]}T00:00:00Z`);
  if (
    !parts ||
    !date ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== parts[1] ||
    Number(parts[2]) > 23 ||
    Number(parts[3]) > 59 ||
    Number(parts[4]) > 59 ||
    !Number.isFinite(Date.parse(result))
  )
    throw new Error('Attempt time must be a valid timestamp.');
  return new Date(result).toISOString();
}

function attemptId(value: unknown): string {
  const result = text(value, 'Attempt ID', 100, true);
  if (!/^[A-Za-z0-9:_-][A-Za-z0-9:._-]*$/.test(result))
    throw new Error('Attempt ID contains invalid characters.');
  return result;
}

/** Validate bounded evidence and recompute deterministic targets, speeds and scores. */
export function validateCopyAttempt(value: unknown): CopyAttempt {
  const input = record(value);
  if (
    input.version !== 1 ||
    input.scoringVersion !== 'native-copy-v1' ||
    input.timingVersion !== 'paris-farnsworth-v1' ||
    input.contentVersion !== COPY_CONTENT_VERSION
  )
    throw new Error('Unsupported copy result version.');
  const recipe = validateCopyRecipe(input.recipe);
  const createdAt = timestamp(input.createdAt);
  const updatedAt = timestamp(input.updatedAt);
  if (Date.parse(updatedAt) < Date.parse(createdAt))
    throw new Error('Attempt end cannot precede its start.');
  let attempt = createCopyAttempt(recipe, {
    id: attemptId(input.id),
    seed: text(input.seed, 'Exercise seed', 100, true),
    now: createdAt,
  });
  if (
    !Array.isArray(input.targets) ||
    JSON.stringify(input.targets) !== JSON.stringify(attempt.targets)
  )
    throw new Error('Copy targets do not match this exercise.');
  if (!Array.isArray(input.trials) || input.trials.length > attempt.targets.length)
    throw new Error('Invalid number of copied answers.');
  for (const raw of input.trials) {
    const trial = record(raw);
    attempt = submitCopyAnswer(attempt, text(trial.answer, 'Copied text', COPY_MAX_TEXT), {
      replayCount: numeric(trial.replayCount, 'Replay count', 0, 1000, true),
      responseSeconds: numeric(trial.responseSeconds, 'Response time', 0, 7200),
      now: updatedAt,
    });
    const computed = attempt.trials.at(-1)!;
    for (const key of ['correct', 'points', 'distance', 'characterWpm', 'effectiveWpm'] as const) {
      if (trial[key] !== computed[key]) throw new Error(`Copy result has inconsistent ${key}.`);
    }
  }
  const status = option(input.status, ['active', 'completed', 'abandoned'], 'attempt status');
  if ((status === 'completed') !== (attempt.trials.length === attempt.targets.length))
    throw new Error('Copy completion does not match its answers.');
  const audioSeconds = numeric(input.audioSeconds, 'Audio seconds', 0, 7200);
  const answerSeconds = numeric(input.answerSeconds, 'Answer seconds', 0, 7200);
  const reviewSeconds = numeric(input.reviewSeconds, 'Review seconds', 0, 7200);
  if (audioSeconds + answerSeconds + reviewSeconds > 7200)
    throw new Error('A copy attempt cannot credit more than two hours.');
  if (
    audioSeconds + answerSeconds + reviewSeconds >
    (Date.parse(updatedAt) - Date.parse(createdAt)) / 1000 + 2
  )
    throw new Error('Credited copy time exceeds the elapsed attempt time.');
  if (
    attempt.trials.reduce((seconds, trial) => seconds + trial.responseSeconds, 0) >
    (Date.parse(updatedAt) - Date.parse(createdAt)) / 1000 + 2
  )
    throw new Error('Response times exceed the elapsed attempt time.');
  return {
    ...attempt,
    status,
    updatedAt,
    audioSeconds,
    answerSeconds,
    reviewSeconds,
    revealCount: numeric(input.revealCount, 'Reveal count', 0, 1000, true),
    interruptionCount: numeric(input.interruptionCount, 'Interruption count', 0, 1000, true),
  };
}
