import { validateAccountOperation, validateAccountSnapshot } from '../shared/account-sync';
import {
  COPY_MODES,
  defaultCopyRecipe,
  validateCopyRecipe,
  type CopyRecipe,
} from '../shared/copy-practice';
import { validatePracticeSession } from '../shared/training';
import {
  getSelectedAccountId,
  invalidateAccountMemory,
  listInFlightAccountOperationIds,
  loadAccountOperations,
  restoreAccountMemory,
  resumeAccountUploads,
  suspendAccountUploads,
  type CachedAccount,
  type QueuedAccountOperation,
} from './account-outbox';
import { validateCopyDraft } from './copy-draft-validator';
import { copyStorageKey, type CopyDraft } from './copy-storage';
import {
  captureSupportedDeviceWork,
  completeDeviceScopeMutation,
  getDeviceScopeToken,
  hasAccountLifecycleBoundary,
  invalidateDeviceScope,
  isDeviceScopeMutating,
} from './device-scope';
import {
  invalidatePracticeMemory,
  captureInFlightPractice,
  listInFlightPracticeIds,
  loadPracticeSaveStates,
  restorePracticeMemory,
  resumePracticeUploads,
  suspendPracticeUploads,
  type PracticeSaveOrigin,
  type PracticeSaveState,
} from './practice-autosave';
import {
  DEFAULT_PRACTICE_PREFERENCES,
  normalizePracticePreferences,
  PRACTICE_PREFERENCES_KEY,
  type PracticePreferences,
} from './practice-preferences';
import { COURSE_REPLAY_STORAGE_KEY } from './course-replay';
import { RECORDING_SPEED_STORAGE_KEY } from './recording-variants';
import {
  MAX_TASK_RECORDING_CHOICES,
  taskRecordingChoiceKey,
  taskRecordingChoiceTaskId,
  validateTaskRecordingChoice,
  type TaskRecordingChoice,
} from './task-recording-choice';
import {
  captureScratchpadMemory,
  captureStudioNotes,
  invalidateScratchpadMemory,
  restoreScratchpadMemory,
} from './studio-session';

export const MAX_DEVICE_BACKUP_BYTES = 16 * 1024 * 1024;
const MAX_RESULTS = 5000;
// Session metadata itself may be 200,000 characters, plus notes and envelope fields.
const MAX_RESULT_BODY_CHARACTERS = 300_000;
const MAX_OPERATIONS = 1000;
const MAX_SCRATCHPADS = 500;
type DeviceStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
interface RetainedPractice {
  id: string;
  /** Exact original retry serialization, including old valid evidence versions. */
  body: string;
  origin: PracticeSaveOrigin & { version: 1 };
  state?: PracticeSaveState;
}
interface RetainedOperation {
  id: string;
  /** Contains the immutable semantic operation and its original queue order. */
  body: string;
  state?: Pick<QueuedAccountOperation, 'status' | 'error' | 'failure'>;
}
export interface DeviceBackup {
  format: 'cwa-device';
  version: 1;
  scope: { id: string; label: string };
  createdAt: string;
  stores: {
    practice: RetainedPractice[];
    accountOperations: RetainedOperation[];
    accountContext?: { identity?: { id: string; email: string }; cache?: CachedAccount };
    copyDraft?: CopyDraft;
    copySettings: CopyRecipe[];
    scratchpads: { context: string; text: string }[];
    recordingChoices?: TaskRecordingChoice[];
  };
  shared: {
    practicePreferences?: PracticePreferences;
    recordingSpeed?: 'assigned' | 'next';
    courseReplay?: boolean;
  };
}
export interface DeviceRestoreOptions {
  /** Bind the file to the displayed scope; public Guest work grants no account authority. */
  expectedScope?: string;
  restoreSharedPreferences?: boolean;
  replaceCopyDraft?: boolean;
  /** Explicit recovery after closing other pages; never silently unlock partial work. */
  recoverInterrupted?: boolean;
}
export interface DeviceRestoreInspection {
  conflicts: string[];
  replaceCopyDraftRequired: boolean;
  retainedScratchpads: number;
  retainedRecordingChoices: number;
}
export interface DeviceMutationResult {
  uncertain: { practice: string[]; accountOperations: string[] };
  retainedScratchpads: number;
}

/** Later report, list and sending stores must join this code-owned inventory. */
export const DEVICE_STORE_INVENTORY = [
  { id: 'practice', label: 'Finished practice results', shared: false },
  { id: 'accountOperations', label: 'Pending plan and account edits', shared: false },
  { id: 'accountContext', label: 'Offline account context', shared: false },
  { id: 'copyDraft', label: 'Retained copy draft', shared: false },
  { id: 'copySettings', label: 'Copy exercise preferences', shared: false },
  { id: 'scratchpads', label: 'Scratchpads', shared: false },
  { id: 'recordingChoices', label: 'Task recording choices', shared: false },
  { id: 'practicePreferences', label: 'Shared practice defaults', shared: true },
  { id: 'recordingSpeed', label: 'Shared recording speed preference', shared: true },
  { id: 'courseReplay', label: 'Shared course replay preference', shared: true },
] as const;

const encoded = (scope: string) => encodeURIComponent(scope);
const practiceKey = (scope: string, part: 'pending' | 'origin' | 'status', id: string) =>
  `cwa:practice:${part}:v1:${encoded(scope)}:${encodeURIComponent(id)}`;
const operationKey = (scope: string, id: string) =>
  `cwa:account:operation:v1:${encoded(scope)}:${encodeURIComponent(id)}`;
const operationStatusKey = (scope: string, id: string) =>
  `cwa:account:status:v1:${encoded(scope)}:${encodeURIComponent(id)}`;
const accountContextKey = (scope: string, part: 'identity' | 'cache') =>
  `cwa:account:${part}:v1:${encoded(scope)}`;
const notesKey = (scope: string, context: string) =>
  `cwa.studio.scratchpad.v1:${JSON.stringify([scope, context])}`;

function object(
  value: unknown,
  label: string,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new Error(`${label} contains an unsupported field.`);
  return input;
}
function text(value: unknown, label: string, maximum: number, required = false): string {
  if (typeof value !== 'string' || value.length > maximum || (required && !value.trim()))
    throw new Error(`${label} must be text of at most ${maximum} characters.`);
  return value;
}
function id(value: unknown, label: string): string {
  const result = text(value, label, 200, true);
  if (!/^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]*$/.test(result))
    throw new Error(`${label} contains invalid characters.`);
  return result;
}
function integer(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label} must be a nonnegative whole number.`);
  return value;
}
function timestamp(value: unknown, label: string): string {
  const result = text(value, label, 40, true);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    throw new Error(`${label} must be a valid timestamp.`);
  return result;
}
function list(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum)
    throw new Error(`${label} must contain at most ${maximum} items.`);
  return value;
}
function unique(values: string[], label: string): void {
  if (new Set(values).size !== values.length)
    throw new Error(`${label} contains duplicate identities.`);
}
function parse(raw: string, label: string, maximum: number): unknown {
  if (raw.length > maximum)
    throw new Error(`${label} is too large (maximum ${maximum} characters).`);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}
function size(text: string): void {
  if (new TextEncoder().encode(text).byteLength > MAX_DEVICE_BACKUP_BYTES)
    throw new Error('The device backup is too large. The maximum file size is 16 MiB.');
}
function validateStatus(
  value: unknown,
  allowedStatuses: readonly string[],
  label: string,
  expectedId?: string,
): Pick<QueuedAccountOperation, 'status' | 'error' | 'failure'> & { id?: string } {
  const input = object(
    value,
    label,
    expectedId === undefined
      ? ['status', 'error', 'failure']
      : ['id', 'status', 'error', 'failure'],
  );
  if (expectedId !== undefined && input.id !== expectedId)
    throw new Error(`${label} belongs to a different result.`);
  if (typeof input.status !== 'string' || !allowedStatuses.includes(input.status))
    throw new Error(`${label} has an invalid status.`);
  if (
    input.failure !== undefined &&
    (typeof input.failure !== 'string' || !['network', 'auth', 'permanent'].includes(input.failure))
  )
    throw new Error(`${label} has an invalid failure reason.`);
  return {
    ...(expectedId === undefined ? {} : { id: expectedId }),
    status: input.status as QueuedAccountOperation['status'],
    ...(input.error === undefined ? {} : { error: text(input.error, `${label} error`, 1000) }),
    ...(input.failure === undefined
      ? {}
      : { failure: input.failure as QueuedAccountOperation['failure'] }),
  };
}
function validateOrigin(
  value: unknown,
  scope: string,
  resultId: string,
): RetainedPractice['origin'] {
  const input = object(value, 'Practice origin', ['version', 'id', 'accountId', 'generation']);
  if (input.version !== 1 || input.id !== resultId || input.accountId !== scope)
    throw new Error('Practice origin version, result or account does not match the backup.');
  return {
    version: 1,
    id: resultId,
    accountId: scope,
    ...(input.generation === undefined
      ? {}
      : { generation: integer(input.generation, 'Practice origin generation') }),
  };
}
function validateOperationBody(body: string, scope: string, expectedId: string) {
  const input = object(parse(body, 'Pending account edit', 300_000), 'Pending account edit', [
    'operation',
    'order',
    'status',
    'error',
    'failure',
  ]);
  if (input.operation && typeof input.operation === 'object') {
    const change = (input.operation as { change?: Record<string, unknown> }).change;
    if (change?.type === 'task-create') strictTaskEnums(change.task);
    if (change?.type === 'task-edit') strictTaskEnums(change.changes);
  }
  const operation = validateAccountOperation(input.operation);
  if (operation.accountId !== scope || operation.id !== expectedId)
    throw new Error('A pending account edit belongs to a different account or ID.');
  const order =
    input.order === undefined
      ? { position: operation.baseRevision, createdAt: operation.createdAt, id: operation.id }
      : object(input.order, 'Account edit order', ['position', 'createdAt', 'id']);
  const checkedOrder = {
    position: integer(order.position, 'Account edit position'),
    createdAt: timestamp(order.createdAt, 'Account edit order time'),
    id: id(order.id, 'Account edit order ID'),
  };
  validateStatus(
    {
      status: input.status,
      ...(input.error === undefined ? {} : { error: input.error }),
      ...(input.failure === undefined ? {} : { failure: input.failure }),
    },
    ['pending', 'failed', 'conflict'],
    'Pending account edit',
  );
  return { operation, order: checkedOrder };
}
function validateRecipe(value: unknown): CopyRecipe {
  const input = object(value, 'Copy preference', Object.keys(defaultCopyRecipe()));
  for (const key of Object.keys(defaultCopyRecipe()))
    if (key !== 'toneMode' && input[key] === undefined)
      throw new Error(`Copy preference is missing ${key}.`);
  return validateCopyRecipe(input);
}
function validateSharedPreferences(value: unknown): PracticePreferences {
  const input = object(
    value,
    'Shared practice preferences',
    Object.keys(DEFAULT_PRACTICE_PREFERENCES),
  );
  for (const key of Object.keys(DEFAULT_PRACTICE_PREFERENCES))
    if (input[key] === undefined)
      throw new Error(`Shared practice preferences are missing ${key}.`);
  for (const key of ['tool', 'wordList', 'mode', 'qsoScenario'])
    if (typeof input[key] !== 'string')
      throw new Error(`Shared practice preference ${key} must be a supported string value.`);
  const normalized = normalizePracticePreferences(input);
  for (const [key, normalizedValue] of Object.entries(normalized))
    if (input[key] !== normalizedValue)
      throw new Error(
        `Shared practice preference ${key} is invalid. Choose a valid value before exporting.`,
      );
  return normalized;
}
function validateIdentity(value: unknown, scope: string) {
  const input = object(value, 'Account identity', ['id', 'email']);
  if (input.id !== scope) throw new Error('The account identity does not match the backup scope.');
  return { id: scope, email: text(input.email, 'Account email', 320, true) };
}
function validateCache(value: unknown, scope: string): CachedAccount {
  const input = object(value, 'Offline account cache', ['user', 'state']);
  if (JSON.stringify(input).length > 4_000_000)
    throw new Error('The offline account cache is too large.');
  const user = validateIdentity(input.user, scope);
  const rawState = input.state as { plan?: unknown } | undefined;
  if (Array.isArray(rawState?.plan)) rawState.plan.forEach(strictTaskEnums);
  const state = validateAccountSnapshot(input.state);
  if (state.accountId !== scope)
    throw new Error('The cached account state does not match the backup scope.');
  return { user, state };
}
/** Domain loaders may normalize recipes; files cannot supply coerced discriminator values. */
function strictTaskEnums(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const exercise = (value as { exercise?: unknown }).exercise;
  if (
    exercise &&
    typeof exercise === 'object' &&
    !Array.isArray(exercise) &&
    typeof (exercise as { type?: unknown }).type !== 'string'
  )
    throw new Error('Exercise resource type must be a supported string value.');
}
function strictRunnerEnums(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const run = value as { status?: unknown; errorCode?: unknown };
  if (
    typeof run.status !== 'string' ||
    (run.errorCode !== undefined && typeof run.errorCode !== 'string')
  )
    throw new Error('Runner result status and error code must be supported string values.');
}
function strictPracticeEnums(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const entry = value as { source?: unknown; metadata?: unknown };
  if (entry.source !== undefined && typeof entry.source !== 'string')
    throw new Error('Practice result source must be a supported string value.');
  if (entry.metadata && typeof entry.metadata === 'object' && !Array.isArray(entry.metadata)) {
    const metadata = entry.metadata as {
      runner?: unknown;
      evidence?: { type?: unknown; run?: unknown };
    };
    if (metadata.runner !== undefined) strictRunnerEnums(metadata.runner);
    if (metadata.evidence?.type === 'runner') strictRunnerEnums(metadata.evidence.run);
  }
}
function validatePracticeBody(body: string) {
  const value = object(
    parse(body, 'Practice result body', MAX_RESULT_BODY_CHARACTERS),
    'Practice result body',
    [
      'id',
      'date',
      'kind',
      'minutes',
      'characterWpm',
      'effectiveWpm',
      'accuracy',
      'notes',
      'lesson',
      'qsoCount',
      'context',
      'source',
      'sourceId',
      'createdAt',
      'evidenceMode',
      'historicalPlannedTaskId',
      'metadata',
    ],
  );
  strictPracticeEnums(value);
  return validatePracticeSession(value);
}

/** Validate the whole file before any lifecycle fence, queue or storage mutation. */
export function validateDeviceBackup(raw: string, expectedScope: string): DeviceBackup {
  size(raw);
  const input = object(parse(raw, 'Device backup', MAX_DEVICE_BACKUP_BYTES), 'Device backup', [
    'format',
    'version',
    'scope',
    'createdAt',
    'stores',
    'shared',
  ]);
  if (input.format !== 'cwa-device' || input.version !== 1)
    throw new Error(
      'Unsupported device backup format or version. Choose a version 1 Companion device backup.',
    );
  const scope = object(input.scope, 'Device backup scope', ['id', 'label']);
  const scopeId = id(scope.id, 'Device backup scope ID');
  if (scopeId !== expectedScope)
    throw new Error(
      `This device backup belongs to ${text(scope.label, 'Scope label', 320, true)}. Open that same account or guest scope before restoring it.`,
    );
  const stores = object(input.stores, 'Device stores', [
    'practice',
    'accountOperations',
    'accountContext',
    'copyDraft',
    'copySettings',
    'scratchpads',
    'recordingChoices',
  ]);
  const practice: RetainedPractice[] = list(stores.practice, 'Finished results', MAX_RESULTS).map(
    (value) => {
      const item = object(value, 'Finished result', ['id', 'body', 'origin', 'state']);
      const resultId = id(item.id, 'Practice result ID');
      const body = text(item.body, 'Practice result body', MAX_RESULT_BODY_CHARACTERS, true);
      const result = validatePracticeBody(body);
      if (result.id !== resultId) throw new Error('A practice result body does not match its ID.');
      return {
        id: resultId,
        body,
        origin: validateOrigin(item.origin, scopeId, resultId),
        ...(item.state === undefined
          ? {}
          : {
              state: validateStatus(
                item.state,
                ['pending', 'failed'],
                'Practice upload state',
                resultId,
              ) as PracticeSaveState,
            }),
      };
    },
  );
  unique(
    practice.map((item) => item.id),
    'Finished results',
  );
  const accountOperations: RetainedOperation[] = list(
    stores.accountOperations,
    'Pending account edits',
    MAX_OPERATIONS,
  ).map((value) => {
    const item = object(value, 'Account operation', ['id', 'body', 'state']);
    const operationId = id(item.id, 'Account operation ID');
    const body = text(item.body, 'Account operation body', 300_000, true);
    validateOperationBody(body, scopeId, operationId);
    return {
      id: operationId,
      body,
      ...(item.state === undefined
        ? {}
        : {
            state: validateStatus(
              item.state,
              ['pending', 'failed', 'conflict'],
              'Account operation state',
            ),
          }),
    };
  });
  unique(
    accountOperations.map((item) => item.id),
    'Pending account edits',
  );
  let accountContext: DeviceBackup['stores']['accountContext'];
  if (stores.accountContext !== undefined) {
    const context = object(stores.accountContext, 'Account context', ['identity', 'cache']);
    if (scopeId === 'guest')
      throw new Error('A guest device backup cannot contain account context.');
    accountContext = {
      ...(context.identity === undefined
        ? {}
        : { identity: validateIdentity(context.identity, scopeId) }),
      ...(context.cache === undefined ? {} : { cache: validateCache(context.cache, scopeId) }),
    };
  }
  if (scopeId === 'guest' && accountOperations.length)
    throw new Error('A guest device backup cannot contain account edits.');
  if (
    stores.copyDraft &&
    typeof stores.copyDraft === 'object' &&
    !Array.isArray(stores.copyDraft)
  ) {
    const draft = stores.copyDraft as { task?: unknown; pending?: unknown };
    strictTaskEnums(draft.task);
    strictPracticeEnums(draft.pending);
  }
  const copyDraft =
    stores.copyDraft === undefined ? undefined : validateCopyDraft(stores.copyDraft);
  if (copyDraft?.pending) {
    const queued = practice.find((item) => item.id === copyDraft.pending!.id);
    if (!queued)
      throw new Error(
        'The copy draft’s finished pending result is missing from the device result inventory. Export it again from the original device.',
      );
    if (
      JSON.stringify(validatePracticeSession(JSON.parse(queued.body))) !==
      JSON.stringify(validatePracticeSession(copyDraft.pending))
    )
      throw new Error(
        'The retained copy draft and queued result contain different bodies for the same ID.',
      );
  }
  const copySettings = list(stores.copySettings, 'Copy preferences', COPY_MODES.length).map(
    validateRecipe,
  );
  unique(
    copySettings.map((recipe) => recipe.mode),
    'Copy preference modes',
  );
  const scratchpads = list(stores.scratchpads, 'Scratchpads', MAX_SCRATCHPADS).map((value) => {
    const note = object(value, 'Scratchpad', ['context', 'text']);
    return {
      context: text(note.context, 'Scratchpad context', 500, true),
      text: text(note.text, 'Scratchpad text', 10000),
    };
  });
  unique(
    scratchpads.map((note) => note.context),
    'Scratchpads',
  );
  const recordingChoices =
    stores.recordingChoices === undefined
      ? undefined
      : list(stores.recordingChoices, 'Task recording choices', MAX_TASK_RECORDING_CHOICES).map(
          validateTaskRecordingChoice,
        );
  if (recordingChoices)
    unique(
      recordingChoices.map((choice) => choice.taskId),
      'Task recording choices',
    );
  const shared = object(input.shared, 'Shared device preferences', [
    'practicePreferences',
    'recordingSpeed',
    'courseReplay',
  ]);
  if (shared.courseReplay !== undefined && typeof shared.courseReplay !== 'boolean')
    throw new Error('Choose a valid shared course replay preference.');
  if (
    shared.recordingSpeed !== undefined &&
    (typeof shared.recordingSpeed !== 'string' ||
      !['assigned', 'next'].includes(shared.recordingSpeed))
  )
    throw new Error('Choose a valid shared recording speed preference.');
  return {
    format: 'cwa-device',
    version: 1,
    scope: { id: scopeId, label: text(scope.label, 'Scope label', 320, true) },
    createdAt: timestamp(input.createdAt, 'Device backup creation time'),
    stores: {
      practice,
      accountOperations,
      ...(accountContext ? { accountContext } : {}),
      ...(copyDraft ? { copyDraft } : {}),
      copySettings,
      scratchpads,
      ...(recordingChoices === undefined ? {} : { recordingChoices }),
    },
    shared: {
      ...(shared.courseReplay === undefined
        ? {}
        : { courseReplay: shared.courseReplay as boolean }),
      ...(shared.practicePreferences === undefined
        ? {}
        : { practicePreferences: validateSharedPreferences(shared.practicePreferences) }),
      ...(shared.recordingSpeed === undefined
        ? {}
        : { recordingSpeed: shared.recordingSpeed as 'assigned' | 'next' }),
    },
  };
}

function names(storage: DeviceStorage): string[] {
  const result: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const name = storage.key(index);
    if (name !== null) result.push(name);
  }
  return result.sort();
}
function selectedNotes(scope: string, storage: DeviceStorage): { context: string; text: string }[] {
  const result: { context: string; text: string }[] = [];
  for (const key of names(storage)) {
    if (!key.startsWith('cwa.studio.scratchpad.v1:')) continue;
    try {
      const tuple = JSON.parse(key.slice('cwa.studio.scratchpad.v1:'.length));
      if (
        Array.isArray(tuple) &&
        tuple.length === 2 &&
        tuple[0] === scope &&
        typeof tuple[1] === 'string' &&
        notesKey(scope, tuple[1]) === key
      )
        result.push({ context: tuple[1], text: storage.getItem(key) ?? '' });
    } catch {
      /* An unrelated malformed key never selects another scope. */
    }
  }
  return result;
}

export function captureDeviceBackup(
  scope: string,
  label: string,
  storage: DeviceStorage = localStorage,
): DeviceBackup {
  id(scope, 'Device scope');
  captureSupportedDeviceWork(scope);
  const all = names(storage);
  const practiceStates = new Map(loadPracticeSaveStates(scope).map((state) => [state.id, state]));
  const practice: RetainedPractice[] = all
    .filter((name) => name.startsWith(`cwa:practice:pending:v1:${encoded(scope)}:`))
    .map((name) => {
      const body = storage.getItem(name)!;
      const entry = validatePracticeBody(body);
      if (name !== practiceKey(scope, 'pending', entry.id))
        throw new Error('A retained practice result has an inconsistent storage identity.');
      const origin = storage.getItem(practiceKey(scope, 'origin', entry.id));
      const persistedState = storage.getItem(practiceKey(scope, 'status', entry.id));
      const state = practiceStates.get(entry.id);
      if (persistedState)
        validateStatus(
          parse(persistedState, 'Practice state', 3000),
          ['pending', 'failed'],
          'Practice state',
          entry.id,
        );
      return {
        id: entry.id,
        body,
        origin:
          origin === null
            ? { version: 1 as const, id: entry.id, accountId: scope }
            : validateOrigin(parse(origin, 'Practice origin', 1000), scope, entry.id),
        ...(state ? { state } : {}),
      };
    });
  for (const item of captureInFlightPractice(scope)) {
    if (practice.some((result) => result.id === item.entry.id)) continue;
    practice.push({
      id: item.entry.id,
      body: JSON.stringify(item.entry),
      origin: { version: 1, ...item.origin },
      state: { id: item.entry.id, status: 'pending' },
    });
  }
  const operationStates = new Map(
    loadAccountOperations(scope).map((item) => [item.operation.id, item]),
  );
  const accountOperations = all
    .filter((name) => name.startsWith(`cwa:account:operation:v1:${encoded(scope)}:`))
    .map((name) => {
      const body = storage.getItem(name)!;
      const input = parse(body, 'Retained account operation', 300_000) as {
        operation?: { id?: unknown };
      };
      const operationId = id(input?.operation?.id, 'Retained operation ID');
      const immutable = validateOperationBody(body, scope, operationId);
      if (name !== operationKey(scope, operationId))
        throw new Error('A retained account edit has an inconsistent storage identity.');
      const statusRaw = storage.getItem(operationStatusKey(scope, operationId));
      if (statusRaw !== null) {
        const status = object(
          parse(statusRaw, 'Retained account edit status', 302_000),
          'Retained account edit status',
          ['identity', 'status', 'error', 'failure'],
        );
        text(status.identity, 'Retained account status identity', 300_000, true);
        if (status.identity === JSON.stringify(immutable))
          validateStatus(
            {
              status: status.status,
              ...(status.error === undefined ? {} : { error: status.error }),
              ...(status.failure === undefined ? {} : { failure: status.failure }),
            },
            ['pending', 'failed', 'conflict'],
            'Retained account edit status',
          );
      }
      const state = operationStates.get(operationId);
      return {
        id: operationId,
        body,
        ...(state
          ? {
              state: {
                status: state.status,
                ...(state.error === undefined ? {} : { error: state.error }),
                ...(state.failure === undefined ? {} : { failure: state.failure }),
              },
            }
          : {}),
      };
    });
  const identityRaw = storage.getItem(accountContextKey(scope, 'identity'));
  const cacheRaw = storage.getItem(accountContextKey(scope, 'cache'));
  let identity: { id: string; email: string } | undefined;
  if (identityRaw) {
    const value = object(
      parse(identityRaw, 'Offline account identity', 1000),
      'Offline account identity',
      ['version', 'id', 'email'],
    );
    if (value.version !== 1) throw new Error('Unsupported offline account identity version.');
    identity = validateIdentity({ id: value.id, email: value.email }, scope);
  }
  const cache = cacheRaw
    ? validateCache(parse(cacheRaw, 'Offline account cache', 4_000_000), scope)
    : undefined;
  const copyRaw = storage.getItem(copyStorageKey(scope));
  const copyDraft =
    copyRaw === null
      ? undefined
      : validateCopyDraft(parse(copyRaw, 'Retained copy draft', 300_000));
  if (copyDraft?.pending && !practice.some((item) => item.id === copyDraft.pending!.id)) {
    const entry = copyDraft.pending;
    const originRaw = storage.getItem(practiceKey(scope, 'origin', entry.id));
    practice.push({
      id: entry.id,
      body: JSON.stringify(entry),
      origin:
        originRaw === null
          ? { version: 1, id: entry.id, accountId: scope }
          : validateOrigin(parse(originRaw, 'Practice origin', 1000), scope, entry.id),
      state: { id: entry.id, status: 'pending' },
    });
  }
  const copySettings = COPY_MODES.flatMap((mode) => {
    const raw = storage.getItem(`${copyStorageKey(scope)}:settings:${mode}`);
    if (raw === null) return [];
    const recipe = validateRecipe(parse(raw, 'Retained copy preference', 10_000));
    if (recipe.mode !== mode)
      throw new Error('A retained copy preference is stored under a different mode.');
    return [recipe];
  });
  const scratchpads =
    storage === localStorage ? captureStudioNotes(scope) : selectedNotes(scope, storage);
  const preferencesRaw = storage.getItem(PRACTICE_PREFERENCES_KEY);
  const recordingSpeed = storage.getItem(RECORDING_SPEED_STORAGE_KEY);
  const courseReplay = storage.getItem(COURSE_REPLAY_STORAGE_KEY);
  const recordingChoices = names(storage).flatMap((name) => {
    const taskId = taskRecordingChoiceTaskId(name, scope);
    if (taskId === undefined) return [];
    const choice = validateTaskRecordingChoice(
      parse(storage.getItem(name)!, 'Task recording choice', 6000),
    );
    if (choice.taskId !== taskId)
      throw new Error('A remembered recording is stored under another task.');
    return [choice];
  });
  const backup: DeviceBackup = {
    format: 'cwa-device',
    version: 1,
    scope: { id: scope, label },
    createdAt: new Date().toISOString(),
    stores: {
      practice,
      accountOperations,
      ...(identity || cache
        ? { accountContext: { ...(identity ? { identity } : {}), ...(cache ? { cache } : {}) } }
        : {}),
      ...(copyDraft ? { copyDraft } : {}),
      copySettings,
      scratchpads,
      recordingChoices,
    },
    shared: {
      ...(courseReplay === null
        ? {}
        : { courseReplay: parse(courseReplay, 'Shared course replay preference', 10) as boolean }),
      ...(preferencesRaw === null
        ? {}
        : {
            practicePreferences: validateSharedPreferences(
              parse(preferencesRaw, 'Shared practice preferences', 10_000),
            ),
          }),
      ...(recordingSpeed === null ? {} : { recordingSpeed: recordingSpeed as 'assigned' | 'next' }),
    },
  };
  return validateDeviceBackup(JSON.stringify(backup), scope);
}

export function summarizeDeviceBackup(
  backup: DeviceBackup,
): { id: string; label: string; count: number; shared: boolean }[] {
  return DEVICE_STORE_INVENTORY.map((item) => {
    const value = item.shared
      ? backup.shared[item.id as keyof DeviceBackup['shared']]
      : backup.stores[item.id as keyof DeviceBackup['stores']];
    return { ...item, count: Array.isArray(value) ? value.length : value === undefined ? 0 : 1 };
  });
}

export function inspectDeviceRestore(
  backup: DeviceBackup,
  _options: DeviceRestoreOptions = {},
  storage: DeviceStorage = localStorage,
): DeviceRestoreInspection {
  const checked = validateDeviceBackup(JSON.stringify(backup), backup.scope.id);
  const scope = checked.scope.id;
  const conflicts: string[] = [];
  for (const item of checked.stores.practice) {
    const existing = storage.getItem(practiceKey(scope, 'pending', item.id));
    if (existing !== null && existing !== item.body)
      conflicts.push(
        `Practice result ${item.id} already exists with a different immutable body. Keep both files and resolve this result before restoring.`,
      );
    const origin = storage.getItem(practiceKey(scope, 'origin', item.id));
    if (existing !== null && origin !== null) {
      try {
        const current = validateOrigin(JSON.parse(origin), scope, item.id);
        if (JSON.stringify(current) !== JSON.stringify(item.origin))
          conflicts.push(`Practice result ${item.id} has a different original account generation.`);
      } catch {
        conflicts.push(
          `Practice result ${item.id} has a damaged origin. Keep a recovery file before repairing it.`,
        );
      }
    }
  }
  for (const item of checked.stores.accountOperations) {
    const existing = storage.getItem(operationKey(scope, item.id));
    if (existing !== null && existing !== item.body)
      conflicts.push(
        `Account edit ${item.id} already exists with a different immutable operation or order.`,
      );
  }
  const existingNames = names(storage);
  const mergedResults = new Set([
    ...existingNames.filter((name) =>
      name.startsWith(`cwa:practice:pending:v1:${encoded(scope)}:`),
    ),
    ...checked.stores.practice.map((item) => practiceKey(scope, 'pending', item.id)),
  ]);
  const mergedOperations = new Set([
    ...existingNames.filter((name) =>
      name.startsWith(`cwa:account:operation:v1:${encoded(scope)}:`),
    ),
    ...checked.stores.accountOperations.map((item) => operationKey(scope, item.id)),
  ]);
  if (mergedResults.size > MAX_RESULTS)
    conflicts.push(
      `Restoring would exceed ${MAX_RESULTS} retained results. Export and clear some device work first.`,
    );
  if (mergedOperations.size > MAX_OPERATIONS)
    conflicts.push(
      `Restoring would exceed ${MAX_OPERATIONS} pending account edits. Resolve or export them first.`,
    );
  const copy = storage.getItem(copyStorageKey(scope));
  let retainedScratchpads = 0;
  const currentNotes = new Map(
    (storage === localStorage ? captureStudioNotes(scope) : selectedNotes(scope, storage)).map(
      (note) => [note.context, note.text],
    ),
  );
  const currentChoices = existingNames.flatMap((name) => {
    const taskId = taskRecordingChoiceTaskId(name, scope);
    return taskId === undefined ? [] : [taskId];
  });
  const retainedRecordingChoices = (checked.stores.recordingChoices ?? []).filter((choice) => {
    const raw = storage.getItem(taskRecordingChoiceKey(scope, choice.taskId));
    return raw !== null && raw !== JSON.stringify(choice);
  }).length;
  if (
    new Set([
      ...currentChoices,
      ...(checked.stores.recordingChoices ?? []).map((choice) => choice.taskId),
    ]).size > MAX_TASK_RECORDING_CHOICES
  )
    conflicts.push(
      `Restoring would exceed ${MAX_TASK_RECORDING_CHOICES} task recording choices. Export and clear some device work first.`,
    );
  if (
    new Set([...currentNotes.keys(), ...checked.stores.scratchpads.map((note) => note.context)])
      .size > MAX_SCRATCHPADS
  )
    conflicts.push(
      `Restoring would exceed ${MAX_SCRATCHPADS} scratchpads. Export and clear some device work first.`,
    );
  for (const note of checked.stores.scratchpads)
    if (currentNotes.has(note.context) && currentNotes.get(note.context) !== note.text)
      retainedScratchpads++;
  return {
    conflicts,
    replaceCopyDraftRequired:
      checked.stores.copyDraft !== undefined &&
      copy !== null &&
      copy !== JSON.stringify(checked.stores.copyDraft),
    retainedScratchpads,
    retainedRecordingChoices,
  };
}

export class DeviceMutationError extends Error {
  constructor(
    message: string,
    public readonly recovery?: DeviceBackup,
    public readonly rollbackFailed = false,
    public readonly retryRecovery?: () => DeviceMutationResult,
  ) {
    super(message);
    this.name = 'DeviceMutationError';
  }
}
function invalidateMemory(scope: string): void {
  invalidatePracticeMemory(scope);
  invalidateAccountMemory(scope);
  invalidateScratchpadMemory(scope);
}
function applyChanges(
  scope: string,
  changes: Map<string, string | null>,
  recovery?: DeviceBackup,
  recoverInterrupted = false,
): DeviceMutationResult {
  if (hasAccountLifecycleBoundary(scope))
    throw new Error(
      'Finish the account reset or replacement recovery before changing device work.',
    );
  // Runtime memory remains recoverable even when a damaged registered record
  // prevents a complete, valid user export. Persistent originals stay opaque.
  const rollbackMemory = {
    scratchpads: captureScratchpadMemory(scope),
    practiceStates: loadPracticeSaveStates(scope).flatMap((state) => {
      try {
        return [
          validateStatus(
            state,
            ['pending', 'failed'],
            'Practice state',
            state.id,
          ) as PracticeSaveState,
        ];
      } catch {
        return [];
      }
    }),
    accountOperations: loadAccountOperations(scope),
  };
  const retainedIds = (prefix: string) =>
    names(localStorage)
      .filter((name) => name.startsWith(prefix))
      .flatMap((name) => {
        try {
          return [id(decodeURIComponent(name.slice(prefix.length)), 'Retained request ID')];
        } catch {
          return [];
        }
      });
  const uncertain = {
    // A retained request can have lost its response before this page opened.
    practice:
      scope === 'guest'
        ? []
        : [
            ...new Set([
              ...listInFlightPracticeIds(scope),
              ...retainedIds(`cwa:practice:pending:v1:${encoded(scope)}:`),
            ]),
          ],
    accountOperations: [
      ...new Set([
        ...listInFlightAccountOperationIds(scope),
        ...retainedIds(`cwa:account:operation:v1:${encoded(scope)}:`),
      ]),
    ],
  };
  const originals = new Map<string, string | null>();
  // The old copy owner loses its token. Its lease must not block a new owner
  // after restore or a coherent rollback, and is never retained user work.
  const retiredLease = `${copyStorageKey(scope)}:lease`;
  changes.set(retiredLease, null);
  for (const name of changes.keys())
    originals.set(name, name === retiredLease ? null : localStorage.getItem(name));
  suspendPracticeUploads(scope);
  suspendAccountUploads(scope);
  let token: string;
  try {
    token = invalidateDeviceScope(scope, { recoverInterrupted });
  } catch (error) {
    resumePracticeUploads(scope);
    resumeAccountUploads(scope);
    throw error;
  }
  invalidateMemory(scope);
  const write = (name: string, value: string | null) => {
    if (getDeviceScopeToken(scope) !== token)
      throw new Error(
        'Another page started device recovery. This older update cannot change its work.',
      );
    if (value === null) localStorage.removeItem(name);
    else localStorage.setItem(name, value);
    if (localStorage.getItem(name) !== value || getDeviceScopeToken(scope) !== token)
      throw new Error('This browser did not retain the complete device update.');
  };
  const rollback = () => {
    let failed = false;
    for (const [name, value] of originals) {
      try {
        write(name, value);
      } catch {
        failed = true;
      }
    }
    invalidateMemory(scope);
    if (!failed) {
      try {
        restoreScratchpadMemory(scope, rollbackMemory.scratchpads);
        restorePracticeMemory(scope, rollbackMemory.practiceStates);
        restoreAccountMemory(scope, rollbackMemory.accountOperations);
        completeDeviceScopeMutation(scope, token);
      } catch {
        failed = true;
      }
    }
    if (!failed) {
      resumePracticeUploads(scope);
      resumeAccountUploads(scope);
    }
    return failed;
  };
  const retryRecovery = (): DeviceMutationResult => {
    if (rollback())
      throw new DeviceMutationError(
        'The original device work could not be restored yet. Uploads remain paused. Enable browser storage or free space, then retry recovery.',
        recovery,
        true,
        retryRecovery,
      );
    return { uncertain, retainedScratchpads: 0 };
  };
  try {
    for (const [name, value] of changes) write(name, value);
    invalidateMemory(scope);
    completeDeviceScopeMutation(scope, token);
  } catch (error) {
    const rollbackFailed = rollback();
    throw new DeviceMutationError(
      rollbackFailed
        ? 'Device storage failed and the original work could not be fully restored. Uploads remain paused. Download the recovery backup, free storage, then retry restoring the original device work.'
        : `Device storage failed; the original stored work was restored. Free storage or enable browser storage, then try again. ${error instanceof Error ? error.message : ''}`,
      recovery,
      rollbackFailed,
      rollbackFailed ? retryRecovery : undefined,
    );
  }
  resumePracticeUploads(scope);
  resumeAccountUploads(scope);
  return { uncertain, retainedScratchpads: 0 };
}

export function restoreDeviceBackup(
  backup: DeviceBackup,
  options: DeviceRestoreOptions = {},
  storage: DeviceStorage = localStorage,
): DeviceMutationResult {
  if (storage !== localStorage)
    throw new Error('Device updates must use this browser’s current storage.');
  const selectedScope = getSelectedAccountId() ?? 'guest';
  const currentScope = options.expectedScope ?? selectedScope;
  if (currentScope !== 'guest' && currentScope !== selectedScope)
    throw new Error('The selected account changed. Reopen its device work before restoring.');
  const checked = validateDeviceBackup(JSON.stringify(backup), currentScope);
  const scope = checked.scope.id;
  if (isDeviceScopeMutating(scope) && !options.recoverInterrupted)
    throw new Error(
      'Device work is already being updated. Finish its recovery before trying again.',
    );
  const inspection = inspectDeviceRestore(checked, options, storage);
  if (inspection.conflicts.length) throw new Error(inspection.conflicts.join(' '));
  if (inspection.replaceCopyDraftRequired && !options.replaceCopyDraft)
    throw new Error(
      'This device already has a different copy draft. Choose explicitly whether to replace it before restoring.',
    );
  const recovery = captureDeviceBackup(scope, checked.scope.label, storage);
  const changes = new Map<string, string | null>();
  // Current task choices win: restoring an older file must not silently replace them.
  for (const choice of checked.stores.recordingChoices ?? []) {
    const key = taskRecordingChoiceKey(scope, choice.taskId);
    if (storage.getItem(key) === null) changes.set(key, JSON.stringify(choice));
  }
  for (const item of checked.stores.practice) {
    if (storage.getItem(practiceKey(scope, 'pending', item.id)) !== null) continue;
    // Origin is durable before the result is exposed, including explicitly unknown generations.
    changes.set(practiceKey(scope, 'origin', item.id), JSON.stringify(item.origin));
    if (item.state) changes.set(practiceKey(scope, 'status', item.id), JSON.stringify(item.state));
    else changes.set(practiceKey(scope, 'status', item.id), null);
    changes.set(practiceKey(scope, 'pending', item.id), item.body);
  }
  for (const item of checked.stores.accountOperations) {
    if (storage.getItem(operationKey(scope, item.id)) !== null) continue;
    const identity = JSON.stringify(validateOperationBody(item.body, scope, item.id));
    changes.set(
      operationStatusKey(scope, item.id),
      item.state ? JSON.stringify({ identity, ...item.state }) : null,
    );
    changes.set(operationKey(scope, item.id), item.body);
  }
  if (
    checked.stores.accountContext?.identity &&
    storage.getItem(accountContextKey(scope, 'identity')) === null
  )
    changes.set(
      accountContextKey(scope, 'identity'),
      JSON.stringify({ version: 1, ...checked.stores.accountContext.identity }),
    );
  if (checked.stores.accountContext?.cache) {
    const previous = storage.getItem(accountContextKey(scope, 'cache'));
    const incoming = checked.stores.accountContext.cache;
    const old =
      previous === null
        ? undefined
        : validateCache(parse(previous, 'Existing account cache', 4_000_000), scope);
    if (
      !old ||
      old.state.generation < incoming.state.generation ||
      (old.state.generation === incoming.state.generation &&
        old.state.revision < incoming.state.revision)
    )
      changes.set(accountContextKey(scope, 'cache'), JSON.stringify(incoming));
  }
  if (checked.stores.copyDraft)
    changes.set(copyStorageKey(scope), JSON.stringify(checked.stores.copyDraft));
  for (const recipe of checked.stores.copySettings)
    changes.set(`${copyStorageKey(scope)}:settings:${recipe.mode}`, JSON.stringify(recipe));
  const currentNotes = new Map(captureStudioNotes(scope).map((note) => [note.context, note.text]));
  // Preserve navigation-only notes too: invalidating their owner memory must not lose them.
  for (const [context, text] of currentNotes) changes.set(notesKey(scope, context), text);
  for (const note of checked.stores.scratchpads)
    if (!currentNotes.has(note.context))
      changes.set(notesKey(scope, note.context), note.text || null);
  if (options.restoreSharedPreferences) {
    if (checked.shared.courseReplay !== undefined)
      changes.set(COURSE_REPLAY_STORAGE_KEY, JSON.stringify(checked.shared.courseReplay));
    if (checked.shared.practicePreferences)
      changes.set(PRACTICE_PREFERENCES_KEY, JSON.stringify(checked.shared.practicePreferences));
    if (checked.shared.recordingSpeed)
      changes.set(RECORDING_SPEED_STORAGE_KEY, checked.shared.recordingSpeed);
  }
  for (const [name, value] of changes) if (storage.getItem(name) === value) changes.delete(name);
  if (changes.size === 0 && !options.recoverInterrupted)
    return {
      uncertain: { practice: [], accountOperations: [] },
      retainedScratchpads: inspection.retainedScratchpads,
    };
  const result = applyChanges(scope, changes, recovery, options.recoverInterrupted);
  return { ...result, retainedScratchpads: inspection.retainedScratchpads };
}

/** Exact registered scope matching also removes orphan status/origin/lease records. */
function isScopedStore(name: string, scope: string): boolean {
  if (taskRecordingChoiceTaskId(name, scope) !== undefined) return true;
  if (
    name === copyStorageKey(scope) ||
    name === `${copyStorageKey(scope)}:lease` ||
    COPY_MODES.some((mode) => name === `${copyStorageKey(scope)}:settings:${mode}`) ||
    name === accountContextKey(scope, 'identity') ||
    name === accountContextKey(scope, 'cache')
  )
    return true;
  for (const part of ['pending', 'status', 'origin'])
    if (name.startsWith(`cwa:practice:${part}:v1:${encoded(scope)}:`)) return true;
  for (const part of ['operation', 'status'])
    if (name.startsWith(`cwa:account:${part}:v1:${encoded(scope)}:`)) return true;
  if (name.startsWith('cwa.studio.scratchpad.v1:')) {
    try {
      const tuple = JSON.parse(name.slice('cwa.studio.scratchpad.v1:'.length));
      return Array.isArray(tuple) && tuple.length === 2 && tuple[0] === scope;
    } catch {
      return false;
    }
  }
  return false;
}

export interface AccountLifecycleDeviceWork {
  scope: string;
  backup: DeviceBackup;
  memory: {
    scratchpads: { context: string; text: string }[];
    practiceStates: PracticeSaveState[];
    accountOperations: QueuedAccountOperation[];
  };
}

/** Capture remains useful when optional status/note storage cannot be rewritten. */
export function captureAccountLifecycleDeviceWork(
  scope: string,
  label: string,
): AccountLifecycleDeviceWork {
  const backup = captureDeviceBackup(scope, label);
  const memory = {
    scratchpads: captureScratchpadMemory(scope),
    practiceStates: loadPracticeSaveStates(scope),
    accountOperations: loadAccountOperations(scope),
  };
  return { scope, backup, memory };
}

/** Preserve optional volatile state before changing its owning token or dispatching a request. */
export function prepareAccountLifecycleDeviceWork(
  scope: string,
  label: string,
): AccountLifecycleDeviceWork {
  const captured = captureAccountLifecycleDeviceWork(scope, label);
  const { backup, memory } = captured;
  const changes = new Map<string, string | null>();
  for (const result of backup.stores.practice) {
    if (localStorage.getItem(practiceKey(scope, 'origin', result.id)) === null)
      changes.set(practiceKey(scope, 'origin', result.id), JSON.stringify(result.origin));
    if (localStorage.getItem(practiceKey(scope, 'pending', result.id)) === null) {
      if (result.state)
        changes.set(practiceKey(scope, 'status', result.id), JSON.stringify(result.state));
      changes.set(practiceKey(scope, 'pending', result.id), result.body);
    }
  }
  for (const note of memory.scratchpads)
    changes.set(notesKey(scope, note.context), note.text || null);
  for (const state of memory.practiceStates)
    changes.set(practiceKey(scope, 'status', state.id), JSON.stringify(state));
  for (const item of memory.accountOperations) {
    const body = localStorage.getItem(operationKey(scope, item.operation.id));
    if (body === null) continue;
    changes.set(
      operationStatusKey(scope, item.operation.id),
      JSON.stringify({
        identity: JSON.stringify(validateOperationBody(body, scope, item.operation.id)),
        status: item.status,
        ...(item.error === undefined ? {} : { error: item.error }),
        ...(item.failure === undefined ? {} : { failure: item.failure }),
      }),
    );
  }
  const originals = new Map([...changes.keys()].map((name) => [name, localStorage.getItem(name)]));
  try {
    for (const [name, value] of changes) {
      if (value === null) localStorage.removeItem(name);
      else localStorage.setItem(name, value);
      if (localStorage.getItem(name) !== value)
        throw new Error('The waiting work was not retained.');
    }
  } catch (error) {
    for (const [name, value] of originals) {
      try {
        if (value === null) localStorage.removeItem(name);
        else localStorage.setItem(name, value);
      } catch {
        // The original current-token memory remains available for recovery/export.
      }
    }
    throw error;
  }
  return captured;
}

/** The token belongs to the coordinator; this function never rotates or releases it. */
export function retireAccountLifecycleDeviceWork(scope: string, token: string): void {
  const assertOwner = () => {
    if (getDeviceScopeToken(scope) !== token || !hasAccountLifecycleBoundary(scope))
      throw new Error('Another page owns this account recovery. Reopen its current status.');
  };
  assertOwner();
  for (const name of names(localStorage).filter((name) => isScopedStore(name, scope))) {
    assertOwner();
    localStorage.removeItem(name);
    if (localStorage.getItem(name) !== null)
      throw new Error('Old device work could not be fully retired.');
  }
  invalidateMemory(scope);
}

/** Not-applied recovery keeps exact durable bodies/order and restores current-token optional state. */
export function recoverAccountLifecycleDeviceWork(
  scope: string,
  token: string,
  captured?: AccountLifecycleDeviceWork,
): void {
  if (getDeviceScopeToken(scope) !== token || !hasAccountLifecycleBoundary(scope))
    throw new Error('Another page owns this account recovery. Reopen its current status.');
  const lease = `${copyStorageKey(scope)}:lease`;
  localStorage.removeItem(lease);
  if (localStorage.getItem(lease) !== null)
    throw new Error('The old copy owner could not be retired.');
  if (captured) {
    restoreScratchpadMemory(scope, captured.memory.scratchpads);
    restorePracticeMemory(scope, captured.memory.practiceStates);
    restoreAccountMemory(scope, captured.memory.accountOperations);
  }
}

/** Preparation failed before any request could be sent; no server authority needs releasing. */
export function rollbackAccountLifecycleDevicePreparation(
  scope: string,
  token: string,
  captured: AccountLifecycleDeviceWork,
): void {
  if (getDeviceScopeToken(scope) !== token || hasAccountLifecycleBoundary(scope))
    throw new Error('Another page owns this account recovery. Reopen its current status.');
  const lease = `${copyStorageKey(scope)}:lease`;
  localStorage.removeItem(lease);
  if (localStorage.getItem(lease) !== null)
    throw new Error('The old copy owner could not be retired.');
  restoreScratchpadMemory(scope, captured.memory.scratchpads);
  restorePracticeMemory(scope, captured.memory.practiceStates);
  restoreAccountMemory(scope, captured.memory.accountOperations);
}
export function clearDeviceWork(
  scope: string,
  options: Pick<DeviceRestoreOptions, 'recoverInterrupted'> = {},
  storage: DeviceStorage = localStorage,
): DeviceMutationResult {
  id(scope, 'Device scope');
  if (storage !== localStorage)
    throw new Error('Device updates must use this browser’s current storage.');
  let recovery: DeviceBackup | undefined;
  try {
    recovery = captureDeviceBackup(scope, scope === 'guest' ? 'Guest' : scope, storage);
  } catch {
    /* Damaged registered data can still be cleared; never claim a complete valid backup. */
  }
  const changes = new Map(
    names(storage)
      .filter((name) => isScopedStore(name, scope))
      .map((name) => [name, null]),
  );
  return applyChanges(scope, changes, recovery, options.recoverInterrupted);
}
