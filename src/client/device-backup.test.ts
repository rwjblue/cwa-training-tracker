import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE, validatePracticeSession } from '../shared/training';
import { createCopyAttempt, defaultCopyRecipe, submitCopyAnswer } from '../shared/copy-practice';
import { copyAttemptSessionFields } from '../shared/copy-report';
import { validatePlannedTask, type PlannedTask } from '../shared/plan';
import { RUNNER_REVISION } from '../shared/runner';
import {
  flushAccountOperations,
  loadAccountOperations,
  queueAccountChange,
  rememberAccount,
} from './account-outbox';
import { claimCopyLease, copyStorageKey, ownsCopyLease, type CopyDraft } from './copy-storage';
import {
  captureDeviceBackup,
  clearDeviceWork,
  DEVICE_STORE_INVENTORY,
  DeviceMutationError,
  inspectDeviceRestore,
  MAX_DEVICE_BACKUP_BYTES,
  restoreDeviceBackup,
  summarizeDeviceBackup,
  validateDeviceBackup,
  type DeviceBackup,
} from './device-backup';
import {
  deviceScopeKey,
  getDeviceScopeToken,
  invalidateDeviceScope,
  isDeviceScopeMutating,
  subscribeDeviceScope,
} from './device-scope';
import {
  autoSavePractice,
  flushPracticeSaves,
  loadLocalPractice,
  loadPracticeSaveOrigin,
  loadPracticeSaveStates,
} from './practice-autosave';
import { DEFAULT_PRACTICE_PREFERENCES, PRACTICE_PREFERENCES_KEY } from './practice-preferences';
import { COURSE_REPLAY_STORAGE_KEY } from './course-replay';
import { RECORDING_SPEED_STORAGE_KEY } from './recording-variants';
import { loadStudioNotes, saveStudioNotes } from './studio-session';

let values: Map<string, string>;
let storage: Storage;
const scope = 'synthetic-account';
const pendingKey = (scope: string, id: string) =>
  `cwa:practice:pending:v1:${encodeURIComponent(scope)}:${encodeURIComponent(id)}`;
const originKey = (scope: string, id: string) =>
  `cwa:practice:origin:v1:${encodeURIComponent(scope)}:${encodeURIComponent(id)}`;
function session(id = 'retained-manual') {
  return validatePracticeSession({
    id,
    date: '2026-09-30',
    kind: 'other',
    minutes: 77 / 60,
    notes: 'Synthetic finished practice',
    source: 'manual',
    createdAt: '2026-09-30T12:00:00.000Z',
  });
}
function draft(): CopyDraft {
  const attempt = createCopyAttempt(
    { ...defaultCopyRecipe(), lengthMode: 'count', groupCount: 1 },
    { id: 'synthetic-copy', seed: 'device-backup-fixture', now: '2026-09-30T12:00:00.000Z' },
  );
  return {
    attempt,
    answer: 'Retained answer',
    position: 0,
    replayCount: 0,
    trialAnswerStartedAt: 0,
    heard: false,
    notes: 'Synthetic copy notes',
  };
}
function account(revision = 0, generation = 0) {
  return { accountId: scope, revision, generation, settings: { ...DEFAULT_PROFILE }, plan: [] };
}
function seed(owner = scope) {
  if (owner !== 'guest')
    rememberAccount(
      { id: owner, email: `${owner}@example.test` },
      { ...account(), accountId: owner },
    );
  const body = JSON.stringify(session());
  values.set(pendingKey(owner, 'retained-manual'), body);
  values.set(
    originKey(owner, 'retained-manual'),
    JSON.stringify({ version: 1, id: 'retained-manual', accountId: owner }),
  );
  values.set(copyStorageKey(owner), JSON.stringify(draft()));
  values.set(`${copyStorageKey(owner)}:settings:groups`, JSON.stringify(defaultCopyRecipe()));
  saveStudioNotes(owner, 'public:words', 'Synthetic scratchpad');
  values.set(
    PRACTICE_PREFERENCES_KEY,
    JSON.stringify({ ...DEFAULT_PRACTICE_PREFERENCES, tone: 725 }),
  );
  values.set(RECORDING_SPEED_STORAGE_KEY, 'next');
  if (owner !== 'guest')
    queueAccountChange(
      { ...account(), accountId: owner },
      { type: 'settings', changes: { callsign: 'N0SYN' } },
    );
  return body;
}
function snapshot() {
  return [...values]
    .filter(([key]) => !key.startsWith('cwa:device:scope:v1:'))
    .sort(([a], [b]) => a.localeCompare(b));
}
function rewrite(backup: DeviceBackup, change: (input: DeviceBackup) => void): string {
  const input = structuredClone(backup);
  change(input);
  return JSON.stringify(input);
}
beforeEach(() => {
  values = new Map();
  storage = {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => {
      values.clear();
    },
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal(
    'CustomEvent',
    class<T> extends Event {
      detail: T;
      constructor(name: string, options: CustomEventInit<T>) {
        super(name);
        this.detail = options.detail!;
      }
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the explicit device inventory', () => {
  it('captures every supported store, exact identities, unknown origin and separately labeled shared defaults', () => {
    const body = seed();
    values.set(
      'cwa:account:selection-failure:v1',
      JSON.stringify({ version: 1, accountId: 'another' }),
    );
    values.set(
      `${copyStorageKey(scope)}:lease`,
      JSON.stringify({ owner: 'runtime', expires: Date.now() }),
    );
    values.set('lcwo.password', 'excluded credential fixture');
    values.set('unregistered-secret', 'excluded secret fixture');
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    expect(backup.stores.practice).toMatchObject([
      {
        id: 'retained-manual',
        body,
        origin: { version: 1, id: 'retained-manual', accountId: scope },
      },
    ]);
    expect(backup.stores.practice[0].origin).not.toHaveProperty('generation');
    expect(backup.stores.accountOperations).toHaveLength(1);
    expect(backup.stores.copyDraft).toEqual(draft());
    expect(backup.stores.scratchpads).toEqual([
      { context: 'public:words', text: 'Synthetic scratchpad' },
    ]);
    expect(backup.shared).toMatchObject({
      practicePreferences: { tone: 725 },
      recordingSpeed: 'next',
    });
    const serialized = JSON.stringify(backup);
    for (const excluded of [
      'selection-failure',
      'runtime',
      'credential fixture',
      'secret fixture',
      'active:v1',
    ])
      expect(serialized).not.toContain(excluded);
    const inventory = summarizeDeviceBackup(backup);
    expect(inventory.filter((item) => item.shared).map((item) => item.id)).toEqual([
      'practicePreferences',
      'recordingSpeed',
      'courseReplay',
    ]);
    expect(inventory.map((item) => item.id)).toEqual(DEVICE_STORE_INVENTORY.map((item) => item.id));
    expect(Object.keys(backup.stores).sort()).toEqual(
      inventory
        .filter((item) => !item.shared)
        .map((item) => item.id)
        .sort(),
    );
    expect(inventory.filter((item) => item.count > 0)).toHaveLength(8);
  });

  it('restores a guest copy draft and finished local history without requiring an account', () => {
    seed('guest');
    const backup = captureDeviceBackup('guest', 'Guest');
    expect(backup.stores.accountContext).toBeUndefined();
    expect(backup.stores.accountOperations).toEqual([]);
    clearDeviceWork('guest');
    restoreDeviceBackup(backup);
    expect(loadLocalPractice('guest')).toEqual([session()]);
    expect(values.get(copyStorageKey('guest'))).toBe(JSON.stringify(draft()));
    expect(values.has('cwa:account:active:v1')).toBe(false);
  });

  it('restores the displayed Guest scope without changing a retained account selection and still rejects private scope mismatches', () => {
    seed('guest');
    const guest = captureDeviceBackup('guest', 'Guest');
    clearDeviceWork('guest');
    seed();
    const privateBackup = captureDeviceBackup(scope, 'Synthetic learner');
    const selected = values.get('cwa:account:active:v1');
    const before = snapshot();
    expect(() => restoreDeviceBackup(guest)).toThrow();
    expect(snapshot()).toEqual(before);
    expect(() => restoreDeviceBackup(privateBackup, { expectedScope: 'guest' })).toThrow();
    expect(() => restoreDeviceBackup(privateBackup, { expectedScope: 'another-account' })).toThrow(
      'The selected account changed',
    );
    expect(snapshot()).toEqual(before);

    restoreDeviceBackup(guest, { expectedScope: 'guest' });
    expect(loadLocalPractice('guest')).toEqual([session()]);
    expect(values.get(copyStorageKey('guest'))).toBe(JSON.stringify(draft()));
    expect(loadStudioNotes('guest', 'public:words')).toBe('Synthetic scratchpad');
    expect(values.get('cwa:account:active:v1')).toBe(selected);
    for (const [key, value] of before) expect(values.get(key)).toBe(value);
  });

  it('captures scratchpad memory when browser persistence failed instead of silently omitting it', () => {
    const original = storage.setItem;
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key.startsWith('cwa.studio.scratchpad')) throw new Error('quota');
      original(key, value);
    });
    expect(saveStudioNotes('guest', 'memory-only', 'Retained in memory')).toBe(false);
    const backup = captureDeviceBackup('guest', 'Guest');
    expect(backup.stores.scratchpads).toContainEqual({
      context: 'memory-only',
      text: 'Retained in memory',
    });
  });
});

describe('strict complete file validation', () => {
  it('rejects coerced nested exercise and Runner enums while the existing recipe validators reject coerced modes', () => {
    seed();
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    const task = validatePlannedTask({
      id: 'synthetic-task',
      title: 'Synthetic linked exercise',
      kind: 'other',
      done: false,
      notes: '',
      createdAt: '2026-09-30T12:00:00.000Z',
      exercise: { type: 'external', url: 'https://example.test/exercise' },
    });
    const malformedTask = () => {
      const value = JSON.parse(JSON.stringify(task));
      value.exercise.type = ['external'];
      return value as PlannedTask;
    };
    const run = {
      runId: 'synthetic-run',
      revision: RUNNER_REVISION,
      status: 'stopped',
      elapsedSeconds: 1,
      settings: {
        mode: 'SingleCall',
        wpm: 20,
        durationSeconds: 60,
        activity: 1,
        conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
      },
    };
    const runnerBody = (metadata: Record<string, unknown>) =>
      JSON.parse(JSON.stringify(validatePracticeSession({ ...session(), metadata })));
    const replacements = [
      (item: DeviceBackup) => {
        const body = JSON.parse(item.stores.accountOperations[0].body);
        body.operation.change = { type: 'task-create', task: malformedTask() };
        item.stores.accountOperations[0].body = JSON.stringify(body);
      },
      (item: DeviceBackup) => {
        const body = JSON.parse(item.stores.accountOperations[0].body);
        body.operation.change = {
          type: 'task-edit',
          id: task.id,
          changes: { exercise: malformedTask().exercise },
        };
        item.stores.accountOperations[0].body = JSON.stringify(body);
      },
      (item: DeviceBackup) => {
        item.stores.accountContext!.cache!.state.plan = [malformedTask()];
      },
      (item: DeviceBackup) => {
        item.stores.copyDraft!.task = malformedTask();
      },
      (item: DeviceBackup) => {
        item.stores.copySettings[0].mode = ['groups'] as unknown as 'groups';
      },
      (item: DeviceBackup) => {
        item.stores.copyDraft!.attempt.recipe.groupKind = ['letters'] as unknown as 'letters';
      },
      (item: DeviceBackup) => {
        item.shared.practicePreferences!.tool = ['words'] as unknown as 'words';
      },
      (item: DeviceBackup) => {
        item.shared.practicePreferences!.wordList = ['custom'] as unknown as 'custom';
      },
      (item: DeviceBackup) => {
        item.shared.practicePreferences!.mode = ['words'] as unknown as 'words';
      },
      (item: DeviceBackup) => {
        const body = runnerBody({ evidence: { version: 1, type: 'runner', run } });
        body.metadata.evidence.run.status = ['stopped'];
        item.stores.practice[0].body = JSON.stringify(body);
      },
      (item: DeviceBackup) => {
        const body = runnerBody({ runner: { ...run, status: 'error', errorCode: 'engine' } });
        body.metadata.runner.errorCode = ['engine'];
        item.stores.practice[0].body = JSON.stringify(body);
      },
    ];
    const before = snapshot();
    const token = getDeviceScopeToken(scope);
    for (const replacement of replacements) {
      const raw = rewrite(backup, replacement);
      expect(() => validateDeviceBackup(raw, scope)).toThrow();
      expect(() => restoreDeviceBackup(JSON.parse(raw))).toThrow();
      expect(snapshot()).toEqual(before);
      expect(getDeviceScopeToken(scope)).toBe(token);
    }
  });
  it('rejects coercible queue statuses, failures and recording speeds before changing storage or owner tokens', () => {
    seed();
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    const before = snapshot();
    const token = getDeviceScopeToken(scope);
    const replacements = [
      (item: DeviceBackup) => {
        const body = JSON.parse(item.stores.practice[0].body);
        body.source = ['manual'];
        item.stores.practice[0].body = JSON.stringify(body);
      },
      (item: DeviceBackup) => {
        const body = JSON.parse(item.stores.accountOperations[0].body);
        body.status = ['pending'];
        item.stores.accountOperations[0].body = JSON.stringify(body);
        delete item.stores.accountOperations[0].state;
      },
      (item: DeviceBackup) => {
        const body = JSON.parse(item.stores.accountOperations[0].body);
        body.failure = ['auth'];
        item.stores.accountOperations[0].body = JSON.stringify(body);
      },
      (item: DeviceBackup) => {
        item.stores.accountOperations[0].state = { status: ['conflict'] as unknown as 'conflict' };
      },
      (item: DeviceBackup) => {
        item.stores.accountOperations[0].state = {
          status: 'failed',
          failure: ['permanent'] as unknown as 'permanent',
        };
      },
      (item: DeviceBackup) => {
        item.stores.practice[0].state = {
          id: item.stores.practice[0].id,
          status: ['pending'] as unknown as 'pending',
        };
      },
      (item: DeviceBackup) => {
        item.stores.practice[0].state = {
          id: item.stores.practice[0].id,
          status: 'failed',
          failure: ['network'] as unknown as 'network',
        };
      },
      (item: DeviceBackup) => {
        item.shared.recordingSpeed = ['next'] as unknown as 'next';
      },
    ];
    for (const replacement of replacements) {
      const raw = rewrite(backup, replacement);
      expect(() => validateDeviceBackup(raw, scope)).toThrow();
      expect(() => restoreDeviceBackup(JSON.parse(raw))).toThrow();
      expect(snapshot()).toEqual(before);
      expect(getDeviceScopeToken(scope)).toBe(token);
    }
  });
  it('rejects malformed, incompatible, duplicate and wrong-scope files before touching any owned data', () => {
    seed();
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    const before = snapshot();
    const token = getDeviceScopeToken(scope);
    const inputs = [
      'broken json',
      rewrite(backup, (item) => {
        item.version = 2 as 1;
      }),
      rewrite(backup, (item) => {
        item.scope.id = 'other-account';
      }),
      rewrite(backup, (item) => {
        item.stores.practice.push(item.stores.practice[0]);
      }),
      rewrite(backup, (item) => {
        item.stores.practice[0].origin.accountId = 'other-account';
      }),
      rewrite(backup, (item) => {
        item.stores.copyDraft!.heard = 'yes' as unknown as boolean;
      }),
      rewrite(backup, (item) => {
        item.shared.practicePreferences!.tone = 777;
      }),
      rewrite(backup, (item) => {
        (item.stores as unknown as Record<string, unknown>).credentials = 'never';
      }),
    ];
    for (const raw of inputs) expect(() => validateDeviceBackup(raw, scope)).toThrow();
    expect(snapshot()).toEqual(before);
    expect(getDeviceScopeToken(scope)).toBe(token);
  });

  it('rejects UTF-8 byte overflow and count overflow without waiting for a storage failure', () => {
    const backup = captureDeviceBackup('guest', 'Guest');
    const large = `{"padding":"${'é'.repeat(MAX_DEVICE_BACKUP_BYTES / 2)}"}`;
    expect(() => validateDeviceBackup(large, 'guest')).toThrow('16 MiB');
    const crowded = rewrite(backup, (item) => {
      item.stores.scratchpads = Array.from({ length: 501 }, (_, index) => ({
        context: `note-${index}`,
        text: '',
      }));
    });
    expect(() => validateDeviceBackup(crowded, 'guest')).toThrow('at most 500');
    expect(snapshot()).toEqual([]);
  });

  it('rejects a mismatched frozen copy result and unsupported draft fields', () => {
    seed('guest');
    const backup = captureDeviceBackup('guest', 'Guest');
    const current = backup.stores.copyDraft!;
    current.attempt = submitCopyAnswer(current.attempt, current.attempt.targets[0], {
      now: current.attempt.updatedAt,
    });
    current.pending = validatePracticeSession({
      ...copyAttemptSessionFields(current.attempt),
      date: '2026-09-30',
      kind: 'icr',
      notes: '',
    });
    backup.stores.practice.push({
      id: current.pending.id,
      body: JSON.stringify(current.pending),
      origin: { version: 1, id: current.pending.id, accountId: 'guest' },
    });
    expect(validateDeviceBackup(JSON.stringify(backup), 'guest').stores.copyDraft?.pending).toEqual(
      current.pending,
    );
    const coercedPendingSource = rewrite(backup, (item) => {
      item.stores.copyDraft!.pending!.source = ['morse'] as unknown as 'morse';
    });
    expect(() => validateDeviceBackup(coercedPendingSource, 'guest')).toThrow(
      'supported string value',
    );
    const mismatched = rewrite(backup, (item) => {
      item.stores.copyDraft!.pending!.id = 'copy:different-attempt';
    });
    expect(() => validateDeviceBackup(mismatched, 'guest')).toThrow('match its attempt');
    const unknown = rewrite(backup, (item) => {
      (item.stores.copyDraft!.attempt as unknown as Record<string, unknown>).password =
        'unsupported';
    });
    expect(() => validateDeviceBackup(unknown, 'guest')).toThrow('unsupported fields');
  });

  it('refuses damaged owned records instead of exporting an incomplete apparently valid backup', () => {
    seed();
    values.set(pendingKey(scope, 'retained-manual'), '{broken');
    expect(() => captureDeviceBackup(scope, 'Synthetic learner')).toThrow('not valid JSON');
    clearDeviceWork(scope);
    expect(values.has(pendingKey(scope, 'retained-manual'))).toBe(false);
  });
});

describe('identity-preserving restore', () => {
  it('restores finished recording pass facts and retries their exact frozen body without portable active coverage', async () => {
    rememberAccount({ id: scope, email: 'recording-backup@example.test' }, account());
    const recordings = [
      {
        url: 'https://cwa.cwops.org/wp-content/uploads/WD101_10.mp3',
        speedWpm: 10,
        seconds: 24.25,
        passes: {
          version: 1,
          method: 'native-1x',
          durations: [{ durationSeconds: 12, completedPasses: 2 }],
        },
      },
    ];
    const finished = validatePracticeSession({
      ...session('finished-recording-passes'),
      kind: 'listening',
      source: 'timer',
      metadata: {
        elapsedSeconds: 29.25,
        recallSeconds: 5,
        recordings,
        evidence: {
          version: 1,
          type: 'timed',
          measurement: { seconds: 29.25, recallSeconds: 5 },
          recordings,
        },
      },
    });
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Temporary synthetic save failure' }), {
        status: 503,
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const receipt = await autoSavePractice(scope, finished);
    expect(receipt.destination).toBe('device');
    const frozen = values.get(pendingKey(scope, finished.id))!;
    expect(JSON.parse(frozen)).toEqual(finished);
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    expect(backup.stores.practice).toMatchObject([
      {
        id: finished.id,
        body: frozen,
        origin: { version: 1, id: finished.id, accountId: scope, generation: 0 },
        state: { status: 'failed', failure: 'network' },
      },
    ]);
    const before = snapshot();
    const unfinishedCoverage = rewrite(backup, (item) => {
      const body = JSON.parse(item.stores.practice[0].body);
      body.metadata.evidence.recordings[0].passes.coverage = [[0, 6]];
      item.stores.practice[0].body = JSON.stringify(body);
    });
    expect(() => validateDeviceBackup(unfinishedCoverage, scope)).toThrow('unsupported field');
    expect(snapshot()).toEqual(before);
    const checked = validateDeviceBackup(JSON.stringify(backup), scope);
    expect(checked.stores.practice[0].body).toBe(frozen);
    const raw = JSON.stringify(checked);
    for (const excluded of ['coverage', 'position', 'mediaStartedAt', 'activeSeconds'])
      expect(raw).not.toContain(`"${excluded}"`);

    clearDeviceWork(scope);
    rememberAccount({ id: scope, email: 'recording-backup@example.test' }, account());
    restoreDeviceBackup(checked);
    expect(values.get(pendingKey(scope, finished.id))).toBe(frozen);
    expect(loadLocalPractice(scope)).toEqual([finished]);
    expect(loadPracticeSaveStates(scope)).toMatchObject([
      { id: finished.id, status: 'failed', failure: 'network' },
    ]);
    const restored = snapshot();
    restoreDeviceBackup(checked);
    expect(snapshot()).toEqual(restored);
    await autoSavePractice(scope, { ...finished, notes: 'Later unsubmitted note' });
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, options] of fetch.mock.calls) expect(options.body).toBe(frozen);
    expect(values.get(pendingKey(scope, finished.id))).toBe(frozen);
    expect(loadLocalPractice(scope)[0].metadata?.evidence).toEqual(finished.metadata?.evidence);
  });

  it('captures a finished copy retry retained only in its draft and restores an explicitly unknown origin', () => {
    seed();
    const current = draft();
    delete current.attempt.recipe.toneMode;
    current.attempt = submitCopyAnswer(current.attempt, current.attempt.targets[0], {
      now: current.attempt.updatedAt,
    });
    current.pending = validatePracticeSession({
      ...copyAttemptSessionFields(current.attempt),
      date: '2026-09-30',
      kind: 'icr',
      notes: 'Finished pending copy',
    });
    values.set(copyStorageKey(scope), JSON.stringify(current));
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    const retained = backup.stores.practice.find((item) => item.id === current.pending!.id)!;
    expect(retained.body).toBe(JSON.stringify(current.pending));
    expect(retained.origin).toEqual({ version: 1, id: current.pending.id, accountId: scope });
    expect(backup.stores.copyDraft!.attempt.recipe).not.toHaveProperty('toneMode');
    const incomplete = rewrite(backup, (item) => {
      item.stores.practice = item.stores.practice.filter(
        (result) => result.id !== current.pending!.id,
      );
    });
    expect(() => validateDeviceBackup(incomplete, scope)).toThrow(
      'missing from the device result inventory',
    );
    clearDeviceWork(scope);
    rememberAccount({ id: scope, email: `${scope}@example.test` }, account(17, 8));
    restoreDeviceBackup(backup);
    expect(values.get(pendingKey(scope, current.pending.id))).toBe(JSON.stringify(current.pending));
    expect(loadPracticeSaveOrigin(scope, current.pending.id)).toEqual({
      id: current.pending.id,
      accountId: scope,
    });
  });

  it('preserves valid results near the metadata limit together with their notes and outer fields', () => {
    const retained = validatePracticeSession({
      ...session(),
      notes: 'N'.repeat(10000),
      metadata: { syntheticPadding: 'X'.repeat(199000) },
    });
    const body = JSON.stringify(retained);
    expect(body.length).toBeGreaterThan(200000);
    values.set(pendingKey('guest', retained.id), body);
    const backup = captureDeviceBackup('guest', 'Guest');
    clearDeviceWork('guest');
    restoreDeviceBackup(backup);
    expect(values.get(pendingKey('guest', retained.id))).toBe(body);
  });

  it('restores twice exactly once, retains original operation order/body, and does not restamp unknown generations', () => {
    const body = seed();
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    const originalEdit = backup.stores.accountOperations[0];
    clearDeviceWork(scope);
    rememberAccount({ id: scope, email: `${scope}@example.test` }, account(9, 7));
    restoreDeviceBackup(backup);
    const afterFirst = snapshot();
    const firstToken = getDeviceScopeToken(scope);
    restoreDeviceBackup(backup);
    expect(snapshot()).toEqual(afterFirst);
    expect(getDeviceScopeToken(scope)).toBe(firstToken);
    expect(values.get(pendingKey(scope, 'retained-manual'))).toBe(body);
    expect(loadLocalPractice(scope)).toHaveLength(1);
    expect(loadPracticeSaveOrigin(scope, 'retained-manual')).toEqual({
      id: 'retained-manual',
      accountId: scope,
    });
    const retained = loadAccountOperations(scope);
    expect(retained).toHaveLength(1);
    expect(retained[0].order).toEqual(JSON.parse(originalEdit.body).order);
    expect(
      values.get(`cwa:account:operation:v1:${scope}:${encodeURIComponent(originalEdit.id)}`),
    ).toBe(originalEdit.body);
    expect(JSON.parse(values.get(`cwa:account:cache:v1:${scope}`)!).state).toMatchObject({
      revision: 9,
      generation: 7,
    });
  });

  it('does not replace existing newer retry failures when an identical file is restored', () => {
    seed();
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    values.set(
      `cwa:practice:status:v1:${scope}:retained-manual`,
      JSON.stringify({
        id: 'retained-manual',
        status: 'failed',
        failure: 'auth',
        error: 'Sign in again',
      }),
    );
    const edit = backup.stores.accountOperations[0];
    const body = JSON.parse(edit.body);
    values.set(
      `cwa:account:status:v1:${scope}:${encodeURIComponent(edit.id)}`,
      JSON.stringify({
        identity: JSON.stringify({ operation: body.operation, order: body.order }),
        status: 'conflict',
        error: 'Newer revision',
      }),
    );
    restoreDeviceBackup(backup);
    expect(JSON.parse(values.get(`cwa:practice:status:v1:${scope}:retained-manual`)!).failure).toBe(
      'auth',
    );
    expect(loadAccountOperations(scope)[0].status).toBe('conflict');
  });

  it('makes same-ID changed bodies and generation changes explicit conflicts before mutation', () => {
    seed();
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    values.set(
      pendingKey(scope, 'retained-manual'),
      JSON.stringify({ ...session(), notes: 'Different body' }),
    );
    const before = snapshot();
    expect(inspectDeviceRestore(backup).conflicts[0]).toContain('different immutable body');
    expect(() => restoreDeviceBackup(backup)).toThrow('different immutable body');
    expect(snapshot()).toEqual(before);
    values.set(pendingKey(scope, 'retained-manual'), backup.stores.practice[0].body);
    values.set(
      originKey(scope, 'retained-manual'),
      JSON.stringify({ version: 1, id: 'retained-manual', accountId: scope, generation: 3 }),
    );
    expect(() => restoreDeviceBackup(backup)).toThrow('different original account generation');
  });

  it('requires deliberate singleton draft replacement and preserves colliding notes and shared defaults by default', () => {
    seed();
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    values.set(
      copyStorageKey(scope),
      JSON.stringify({ ...draft(), answer: 'Newer current answer' }),
    );
    saveStudioNotes(scope, 'public:words', 'Newer current notes');
    values.set(RECORDING_SPEED_STORAGE_KEY, 'assigned');
    expect(inspectDeviceRestore(backup)).toMatchObject({
      replaceCopyDraftRequired: true,
      retainedScratchpads: 1,
    });
    expect(() => restoreDeviceBackup(backup)).toThrow('Choose explicitly');
    expect(restoreDeviceBackup(backup, { replaceCopyDraft: true }).retainedScratchpads).toBe(1);
    expect(values.get(copyStorageKey(scope))).toBe(JSON.stringify(draft()));
    expect(loadStudioNotes(scope, 'public:words')).toBe('Newer current notes');
    expect(values.get(RECORDING_SPEED_STORAGE_KEY)).toBe('assigned');
    restoreDeviceBackup(backup, { restoreSharedPreferences: true });
    expect(values.get(RECORDING_SPEED_STORAGE_KEY)).toBe('next');
  });

  it('materializes memory-only current notes so an unrelated restored store cannot erase them', () => {
    const backup = captureDeviceBackup('guest', 'Guest');
    backup.stores.copySettings = [defaultCopyRecipe('words')];
    const original = storage.setItem;
    vi.spyOn(storage, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });
    saveStudioNotes('guest', 'memory-note', 'Keep current memory');
    storage.setItem = original;
    restoreDeviceBackup(backup);
    expect(loadStudioNotes('guest', 'memory-note')).toBe('Keep current memory');
    expect(values.get('cwa.studio.scratchpad.v1:["guest","memory-note"]')).toBe(
      'Keep current memory',
    );
  });
});

describe('local clear and storage recovery', () => {
  it('restores memory-only notes and empty tombstones even when corrupt registered data prevents a valid backup', () => {
    const originalSet = storage.setItem;
    vi.spyOn(storage, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });
    expect(saveStudioNotes('guest', 'memory-only', 'Must survive failed clear')).toBe(false);
    storage.setItem = originalSet;
    saveStudioNotes('guest', 'emptied-note', 'Earlier stored note');
    const originalRemove = storage.removeItem;
    vi.spyOn(storage, 'removeItem').mockImplementationOnce(() => {
      throw new Error('remove unavailable');
    });
    expect(saveStudioNotes('guest', 'emptied-note', '')).toBe(false);
    storage.removeItem = originalRemove;
    values.set(pendingKey('guest', 'damaged-result'), '{broken');
    values.set('cwa.studio.scratchpad.v1:["guest","invalid-persisted"]', 'X'.repeat(10001));
    let rejected = false;
    vi.spyOn(storage, 'removeItem').mockImplementation((key) => {
      if (!rejected && key === pendingKey('guest', 'damaged-result')) {
        rejected = true;
        throw new Error('storage unavailable');
      }
      originalRemove(key);
    });
    let failure: DeviceMutationError | undefined;
    try {
      clearDeviceWork('guest');
    } catch (error) {
      failure = error as DeviceMutationError;
    }
    expect(failure?.rollbackFailed).toBe(false);
    expect(failure?.recovery).toBeUndefined();
    expect(values.get(pendingKey('guest', 'damaged-result'))).toBe('{broken');
    expect(values.get('cwa.studio.scratchpad.v1:["guest","emptied-note"]')).toBe(
      'Earlier stored note',
    );
    expect(loadStudioNotes('guest', 'memory-only')).toBe('Must survive failed clear');
    expect(loadStudioNotes('guest', 'emptied-note')).toBe('');
    expect(loadStudioNotes('guest', 'invalid-persisted')).toBe('');
  });

  it('preserves real observed volatile permanent failures and conflicts through rollback ready before any retry resumes', async () => {
    rememberAccount({ id: scope, email: 'synthetic@example.test' }, account());
    const originalSet = storage.setItem;
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key.startsWith('cwa:practice:status:') || key.startsWith('cwa:account:status:'))
        throw new Error('quota');
      originalSet(key, value);
    });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: 'Retain permanent failure' }, { status: 400 }));
    vi.stubGlobal('fetch', fetch);
    await autoSavePractice(scope, session('observed-result'));
    const operation = queueAccountChange(account(), {
      type: 'settings',
      changes: { callsign: 'N0SYN' },
    });
    fetch.mockResolvedValueOnce(
      Response.json({ error: 'Retain conflict', state: account(4) }, { status: 409 }),
    );
    await flushAccountOperations(scope);
    expect(loadPracticeSaveStates(scope)[0].failure).toBe('permanent');
    expect(loadAccountOperations(scope)[0].status).toBe('conflict');
    storage.setItem = originalSet;
    values.set(pendingKey(scope, 'damaged-result'), '{broken');
    const body = values.get(pendingKey(scope, 'observed-result'))!;
    const editKey = `cwa:account:operation:v1:${scope}:${encodeURIComponent(operation.operation.id)}`;
    const editBody = values.get(editKey)!;
    const readyViews: { practice: string | undefined; account: string | undefined }[] = [];
    const unsubscribe = subscribeDeviceScope((state) => {
      if (state.scope === scope && !state.mutating)
        readyViews.push({
          practice: loadPracticeSaveStates(scope).find((state) => state.id === 'observed-result')
            ?.failure,
          account: loadAccountOperations(scope)[0]?.status,
        });
    });
    const originalRemove = storage.removeItem;
    let rejected = false;
    vi.spyOn(storage, 'removeItem').mockImplementation((key) => {
      if (!rejected && key === pendingKey(scope, 'observed-result')) {
        rejected = true;
        throw new Error('storage unavailable');
      }
      originalRemove(key);
    });
    expect(() => clearDeviceWork(scope)).toThrow('original stored work was restored');
    expect(readyViews).toEqual([{ practice: 'permanent', account: 'conflict' }]);
    expect(loadPracticeSaveStates(scope)).toContainEqual({
      id: 'observed-result',
      status: 'failed',
      error: 'Retain permanent failure',
      failure: 'permanent',
    });
    expect(loadAccountOperations(scope)[0]).toMatchObject({
      operation: operation.operation,
      order: operation.order,
      status: 'conflict',
      error: 'Retain conflict',
    });
    expect(values.get(pendingKey(scope, 'observed-result'))).toBe(body);
    expect(values.get(editKey)).toBe(editBody);
    await flushPracticeSaves(scope, vi.fn());
    await flushAccountOperations(scope);
    expect(fetch).toHaveBeenCalledTimes(2);
    unsubscribe();
    clearDeviceWork(scope);
    values.set(pendingKey(scope, 'observed-result'), body);
    values.set(editKey, editBody);
    expect(loadPracticeSaveStates(scope).find((state) => state.id === 'observed-result')).toEqual({
      id: 'observed-result',
      status: 'pending',
    });
    expect(loadAccountOperations(scope)[0].status).toBe('pending');
  });

  it('retires the invalidated copy lease after restore and after coherent rollback so the new owner can resume immediately', () => {
    seed('guest');
    const backup = captureDeviceBackup('guest', 'Guest');
    backup.stores.copySettings[0].toneHz = 800;
    const old = getDeviceScopeToken('guest');
    expect(claimCopyLease('guest', 'old-owner', false, old)).toBe(true);
    restoreDeviceBackup(backup);
    expect(ownsCopyLease('guest', 'old-owner', old)).toBe(false);
    expect(claimCopyLease('guest', 'restored-owner')).toBe(true);
    const originalSet = storage.setItem;
    let rejected = false;
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (!rejected && key === `${copyStorageKey('guest')}:settings:groups`) {
        rejected = true;
        throw new Error('quota');
      }
      originalSet(key, value);
    });
    backup.stores.copySettings[0].toneHz = 900;
    expect(() => restoreDeviceBackup(backup)).toThrow('original stored work was restored');
    expect(values.get(`${copyStorageKey('guest')}:lease`)).toBeUndefined();
    expect(claimCopyLease('guest', 'rollback-owner')).toBe(true);
    expect(JSON.parse(values.get(`${copyStorageKey('guest')}:settings:groups`)!).toneHz).toBe(800);
  });

  it('does not report ready when invalidated lease removal fails, and exact-original recovery retires it before resuming', () => {
    seed('guest');
    const backup = captureDeviceBackup('guest', 'Guest');
    backup.stores.copySettings[0].toneHz = 800;
    claimCopyLease('guest', 'old-owner');
    const originalRemove = storage.removeItem;
    const lease = `${copyStorageKey('guest')}:lease`;
    vi.spyOn(storage, 'removeItem').mockImplementation((key) => {
      if (key === lease) return; // Apparent success without durable readback.
      originalRemove(key);
    });
    let failure: DeviceMutationError | undefined;
    try {
      restoreDeviceBackup(backup);
    } catch (error) {
      failure = error as DeviceMutationError;
    }
    expect(failure?.rollbackFailed).toBe(true);
    expect(isDeviceScopeMutating('guest')).toBe(true);
    expect(claimCopyLease('guest', 'new-owner')).toBe(false);
    storage.removeItem = originalRemove;
    failure!.retryRecovery!();
    expect(isDeviceScopeMutating('guest')).toBe(false);
    expect(values.get(lease)).toBeUndefined();
    expect(claimCopyLease('guest', 'recovered-owner')).toBe(true);
  });
  it('removes exactly the selected scope including orphans and notes memory, preserving other scopes/shared/runtime selection/server authority', () => {
    seed();
    values.set(
      pendingKey('other-account', 'other-result'),
      JSON.stringify(session('other-result')),
    );
    values.set('cwa:practice:status:v1:synthetic-account:orphan', 'damaged orphan');
    values.set('cwa:practice:origin:v1:synthetic-account:orphan', 'damaged orphan');
    values.set('cwa:account:status:v1:synthetic-account:orphan', 'damaged orphan');
    values.set(`${copyStorageKey(scope)}:lease`, 'runtime lease');
    values.set(
      'cwa:account:selection-failure:v1',
      JSON.stringify({ version: 1, accountId: 'other-account' }),
    );
    values.set('unrelated', 'preserved');
    const operation = loadAccountOperations(scope)[0].operation.id;
    const result = clearDeviceWork(scope);
    expect(result.uncertain).toEqual({
      practice: ['retained-manual'],
      accountOperations: [operation],
    });
    expect(loadLocalPractice(scope)).toEqual([]);
    expect(loadAccountOperations(scope)).toEqual([]);
    expect(loadStudioNotes(scope, 'public:words')).toBe('');
    expect(values.get(copyStorageKey(scope))).toBeUndefined();
    expect(values.has('cwa:practice:status:v1:synthetic-account:orphan')).toBe(false);
    expect(values.has('cwa:practice:origin:v1:synthetic-account:orphan')).toBe(false);
    expect(values.has('cwa:account:status:v1:synthetic-account:orphan')).toBe(false);
    expect(values.has(pendingKey('other-account', 'other-result'))).toBe(true);
    expect(values.get(PRACTICE_PREFERENCES_KEY)).toBeDefined();
    expect(values.get(RECORDING_SPEED_STORAGE_KEY)).toBe('next');
    expect(values.get('cwa:account:active:v1')).toBe(scope);
    expect(values.get('cwa:account:selection-failure:v1')).toContain('other-account');
    expect(values.get('unrelated')).toBe('preserved');
    expect(isDeviceScopeMutating(scope)).toBe(false);
  });

  it('rolls back partial writes after quota/readback failures without claiming a restored result', () => {
    seed('guest');
    const backup = captureDeviceBackup('guest', 'Guest');
    clearDeviceWork('guest');
    saveStudioNotes('guest', 'original-note', 'Retain original');
    const before = snapshot();
    const original = storage.setItem;
    let rejected = false;
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (!rejected && key === pendingKey('guest', 'retained-manual')) {
        rejected = true;
        throw new Error('quota');
      }
      original(key, value);
    });
    expect(() => restoreDeviceBackup(backup)).toThrow('original stored work was restored');
    expect(snapshot()).toEqual(before);
    expect(loadStudioNotes('guest', 'original-note')).toBe('Retain original');
    expect(isDeviceScopeMutating('guest')).toBe(false);
  });

  it('keeps an actionable recovery backup and exact-original retry when rollback also fails', () => {
    seed('guest');
    const backup = captureDeviceBackup('guest', 'Guest');
    backup.stores.copySettings[0].toneHz = 800;
    const before = snapshot();
    const original = storage.setItem;
    const key = `${copyStorageKey('guest')}:settings:groups`;
    vi.spyOn(storage, 'setItem').mockImplementation((name, value) => {
      if (name === key) throw new Error('quota persists');
      original(name, value);
    });
    let failure: DeviceMutationError | undefined;
    try {
      restoreDeviceBackup(backup);
    } catch (error) {
      failure = error as DeviceMutationError;
    }
    expect(failure).toBeInstanceOf(DeviceMutationError);
    expect(failure!.rollbackFailed).toBe(true);
    expect(failure!.recovery?.stores.copySettings[0].toneHz).toBe(600);
    expect(isDeviceScopeMutating('guest')).toBe(true);
    storage.setItem = original;
    failure!.retryRecovery!();
    expect(snapshot()).toEqual(before);
    expect(isDeviceScopeMutating('guest')).toBe(false);
  });

  it('requires durable invalidation before deleting anything and treats write-without-readback as a failure', () => {
    seed('guest');
    const before = snapshot();
    const original = storage.setItem;
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key === deviceScopeKey('guest')) return;
      original(key, value);
    });
    expect(() => clearDeviceWork('guest')).toThrow('safely update device work');
    expect(snapshot()).toEqual(before);
  });

  it('supports deliberate fresh-shell recovery of an interrupted update without automatically unlocking it', () => {
    seed('guest');
    const backup = captureDeviceBackup('guest', 'Guest');
    invalidateDeviceScope('guest');
    expect(() => restoreDeviceBackup(backup)).toThrow('already being updated');
    expect(isDeviceScopeMutating('guest')).toBe(true);
    restoreDeviceBackup(backup, { recoverInterrupted: true });
    expect(isDeviceScopeMutating('guest')).toBe(false);
    invalidateDeviceScope('guest');
    clearDeviceWork('guest', { recoverInterrupted: true });
    expect(loadLocalPractice('guest')).toEqual([]);
    expect(isDeviceScopeMutating('guest')).toBe(false);
  });
});

describe('portable public course replay choice', () => {
  it('keeps old version 1 files compatible and captures no choice when unset', () => {
    const backup = captureDeviceBackup('guest', 'Guest');
    expect(backup.shared).not.toHaveProperty('courseReplay');
    expect(validateDeviceBackup(JSON.stringify(backup), 'guest')).toEqual(backup);
  });
  it('captures true and false exactly, restores only by opt-in, and survives private clear', () => {
    values.set(COURSE_REPLAY_STORAGE_KEY, 'true');
    const enabled = captureDeviceBackup('guest', 'Guest');
    expect(enabled.shared.courseReplay).toBe(true);
    values.set(COURSE_REPLAY_STORAGE_KEY, 'false');
    const disabled = captureDeviceBackup('guest', 'Guest');
    expect(disabled.shared.courseReplay).toBe(false);
    restoreDeviceBackup(enabled, { expectedScope: 'guest' });
    expect(values.get(COURSE_REPLAY_STORAGE_KEY)).toBe('false');
    restoreDeviceBackup(enabled, { expectedScope: 'guest', restoreSharedPreferences: true });
    expect(values.get(COURSE_REPLAY_STORAGE_KEY)).toBe('true');
    restoreDeviceBackup(disabled, { expectedScope: 'guest', restoreSharedPreferences: true });
    expect(values.get(COURSE_REPLAY_STORAGE_KEY)).toBe('false');
    clearDeviceWork('guest');
    expect(values.get(COURSE_REPLAY_STORAGE_KEY)).toBe('false');
  });
  it.each(['true', 1, null, ['true'], { account: 'private' }])(
    'rejects coerced/private choice %j before any mutation',
    (invalid) => {
      const backup = captureDeviceBackup('guest', 'Guest');
      const before = snapshot();
      expect(() =>
        validateDeviceBackup(
          JSON.stringify({ ...backup, shared: { courseReplay: invalid } }),
          'guest',
        ),
      ).toThrow('valid shared course replay');
      expect(snapshot()).toEqual(before);
    },
  );
});
