import { defaultCopyRecipe, validateCopyAttempt } from '../shared/copy-practice';
import { validatePlannedTask } from '../shared/plan';
import { validatePracticeSession } from '../shared/training';
import type { CopyDraft } from './copy-storage';

/** File import must reject malformed data; recovery loading may catch this error. */
export function validateCopyDraft(value: unknown): CopyDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('The copy draft must be an object.');
  const input = value as Record<string, unknown>;
  const allowed = [
    'attempt',
    'answer',
    'position',
    'replayCount',
    'trialAnswerStartedAt',
    'heard',
    'autoSkipAt',
    'notes',
    'task',
    'pending',
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new Error('The copy draft contains an unsupported field.');
  if (JSON.stringify(input).length > 300_000)
    throw new Error('The copy draft is too large (maximum 300,000 characters).');
  const fields = (value: unknown, allowed: string[], label: string) => {
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).some((key) => !allowed.includes(key))
    )
      throw new Error(`${label} contains unsupported fields.`);
    return value as Record<string, unknown>;
  };
  const rawAttempt = fields(
    input.attempt,
    [
      'version',
      'scoringVersion',
      'timingVersion',
      'contentVersion',
      'id',
      'seed',
      'recipe',
      'targets',
      'trials',
      'status',
      'createdAt',
      'updatedAt',
      'audioSeconds',
      'answerSeconds',
      'reviewSeconds',
      'revealCount',
      'interruptionCount',
    ],
    'Copy attempt',
  );
  const rawRecipe = fields(rawAttempt.recipe, Object.keys(defaultCopyRecipe()), 'Copy recipe');
  for (const key of Object.keys(defaultCopyRecipe()))
    if (key !== 'toneMode' && rawRecipe[key] === undefined)
      throw new Error(`Copy recipe is missing ${key}.`);
  if (Array.isArray(rawAttempt.trials))
    for (const trial of rawAttempt.trials)
      fields(
        trial,
        [
          'answer',
          'characterWpm',
          'effectiveWpm',
          'correct',
          'points',
          'distance',
          'replayCount',
          'responseSeconds',
        ],
        'Copy answer',
      );
  const attempt = validateCopyAttempt(input.attempt);
  for (const [key, maximum] of [
    ['answer', 2000],
    ['notes', 10000],
  ] as const)
    if (typeof input[key] !== 'string' || input[key].length > maximum)
      throw new Error(`Copy draft ${key} must be text of at most ${maximum} characters.`);
  for (const [key, maximum, integer] of [
    ['position', 1220, false],
    ['replayCount', 1000, true],
    ['trialAnswerStartedAt', attempt.answerSeconds, false],
  ] as const) {
    const number = input[key];
    if (
      typeof number !== 'number' ||
      !Number.isFinite(number) ||
      number < 0 ||
      number > maximum ||
      (integer && !Number.isInteger(number))
    )
      throw new Error(`The copy draft has an invalid ${key}.`);
  }
  if (typeof input.heard !== 'boolean')
    throw new Error('The copy draft heard state must be true or false.');
  if (
    input.autoSkipAt !== undefined &&
    (typeof input.autoSkipAt !== 'number' ||
      !Number.isFinite(input.autoSkipAt) ||
      input.autoSkipAt < 0 ||
      input.autoSkipAt > 7260)
  )
    throw new Error('The copy draft has an invalid auto-skip time.');
  const task =
    input.task === undefined
      ? undefined
      : validatePlannedTask(
          fields(
            input.task,
            [
              'id',
              'title',
              'kind',
              'lesson',
              'dueDate',
              'link',
              'targetMinutes',
              'targetMinutesExplicit',
              'done',
              'dismissedFromToday',
              'notes',
              'createdAt',
              'source',
              'curriculum',
              'exercise',
            ],
            'Copy exercise',
          ),
        );
  const pending =
    input.pending === undefined
      ? undefined
      : validatePracticeSession(
          fields(
            input.pending,
            [
              'id',
              'date',
              'kind',
              'context',
              'minutes',
              'characterWpm',
              'effectiveWpm',
              'accuracy',
              'qsoCount',
              'sourceId',
              'lesson',
              'notes',
              'source',
              'createdAt',
              'metadata',
              'evidenceMode',
              'historicalPlannedTaskId',
            ],
            'Copy pending result',
          ),
        );
  if (
    pending &&
    (pending.id !== `copy:${attempt.id}` ||
      JSON.stringify(pending.metadata?.copyAttempt) !== JSON.stringify(attempt))
  )
    throw new Error('The copy draft pending result does not match its attempt.');
  if (
    pending &&
    task &&
    pending.metadata?.plannedTaskId !== task.id &&
    pending.historicalPlannedTaskId !== task.id
  )
    throw new Error('The copy draft pending result does not match its exercise.');
  // Keep legacy recipes and the original pending body rather than migrating defaults.
  return structuredClone(input) as unknown as CopyDraft;
}
