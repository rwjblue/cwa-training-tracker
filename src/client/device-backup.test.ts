import { materialReadingKey } from './material-reading';
import { clearWordContent, readWordContent, saveWordContent, wordContentKey } from './word-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILE, validatePracticeSession } from '../shared/training';
import { createCopyAttempt, defaultCopyRecipe, submitCopyAnswer } from '../shared/copy-practice';
import { copyAttemptSessionFields } from '../shared/copy-report';
import { validatePlannedTask, type PlannedTask } from '../shared/plan';
import { RUNNER_REVISION, createRunnerRun } from '../shared/runner';
import { finishedRunnerSession } from './runner-session';
import {
  retainFinishedRunnerResult,
  readRunnerResults,
  runnerResultKey,
  retainRunnerReview,
} from './runner-results';
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
import { EVENT_TIME_MODE_KEY } from './event-preferences';
import {
  saveTaskRecordingChoice,
  taskRecordingChoiceKey,
  type TaskRecordingChoice,
} from './task-recording-choice';
import { loadStudioNotes, saveStudioNotes } from './studio-session';

let values: Map<string, string>;
let storage: Storage;
const recordingChoice = (taskId = 'task-a', wpm = 18): TaskRecordingChoice => ({
  version: 1,
  taskId,
  assignedUrl: 'https://cwa.cwops.org/wp-content/uploads/WD101_10.mp3',
  assignedWpm: 10,
  selectedUrl: `https://cwa.cwops.org/wp-content/uploads/WD101_${wpm}.mp3`,
});
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
function runnerEntry(id = 'device-finished-run') {
  return finishedRunnerSession(
    {
      ...createRunnerRun(id, {
        mode: 'SingleCall',
        wpm: 20,
        durationSeconds: 60,
        activity: 1,
        conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
      }),
      status: 'stopped',
      elapsedSeconds: 12.5,
      runStartedAt: '2026-10-01T03:59:59.000Z',
      runEndedAt: '2026-10-01T04:00:12.000Z',
    },
    {},
    'America/New_York',
  );
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
      constructor(name: string, options: CustomEventInit<T> = {}) {
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

describe('acknowledged Runner result device inventory', () => {
  it('round trips unreviewed start-attributed results without producing an upload and accepts older absent inventory', () => {
    seed();
    const entry = runnerEntry();
    retainFinishedRunnerResult(scope, entry, { id: entry.id, accountId: scope, generation: 0 });
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    expect(backup.stores.runnerResults).toHaveLength(1);
    expect(backup.stores.practice.some((result) => result.id === entry.id)).toBe(false);
    expect(summarizeDeviceBackup(backup)).toContainEqual({
      id: 'runnerResults',
      label: 'Finished Runner results awaiting review',
      count: 1,
      shared: false,
    });
    const old = structuredClone(backup);
    delete old.stores.runnerResults;
    expect(validateDeviceBackup(JSON.stringify(old), scope).stores.runnerResults).toBeUndefined();
    values.delete(runnerResultKey(scope, entry.id));
    restoreDeviceBackup(backup);
    expect(readRunnerResults(scope).results[0]).toMatchObject({
      entry,
      reviewed: false,
      origin: { generation: 0 },
    });
    expect(
      captureDeviceBackup(scope, 'Synthetic learner').stores.practice.some(
        (result) => result.id === entry.id,
      ),
    ).toBe(false);
    expect(() => validateDeviceBackup(JSON.stringify(backup), 'guest')).toThrow(/belongs/);
  });

  it('preserves frozen reviewed bodies and rejects conflicting reviews and contradictory queued facts', () => {
    seed();
    const entry = runnerEntry();
    retainFinishedRunnerResult(scope, entry, { id: entry.id, accountId: scope });
    const submitted = {
      ...entry,
      notes: 'Exact reviewed notes',
      metadata: { ...entry.metadata, runnerReviewedAt: '2026-10-02T12:00:00.000Z' },
    };
    retainRunnerReview(scope, submitted, true);
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    expect(backup.stores.runnerResults![0].entry).toEqual(submitted);
    const conflicting = structuredClone(backup);
    conflicting.stores.runnerResults![0].entry.notes = 'Conflicting review';
    expect(inspectDeviceRestore(conflicting).conflicts[0]).toContain('different retained review');
    const prior = snapshot();
    expect(() => restoreDeviceBackup(conflicting)).toThrow(/different retained review/);
    expect(snapshot()).toEqual(prior);
    const malformed = structuredClone(backup);
    malformed.stores.runnerResults![0].entry.date = '2026-10-01';
    expect(() => validateDeviceBackup(JSON.stringify(malformed), scope)).toThrow(
      /captured timezone/,
    );
  });

  it.each(['notes', 'review-time'] as const)(
    'rejects conflicting frozen %s across file and existing device stores before writes',
    (field) => {
      seed();
      const entry = runnerEntry();
      retainFinishedRunnerResult(scope, entry, { id: entry.id, accountId: scope, generation: 0 });
      const submitted = {
        ...entry,
        notes: 'First immutable body',
        metadata: { ...entry.metadata, runnerReviewedAt: '2026-10-02T12:00:00.000Z' },
      };
      retainRunnerReview(scope, submitted, true);
      const terminalOnly = captureDeviceBackup(scope, 'Synthetic learner');
      const different = structuredClone(submitted);
      if (field === 'notes') different.notes = 'Different immutable body';
      else different.metadata!.runnerReviewedAt = '2026-10-02T12:01:00.000Z';
      const queued = {
        id: entry.id,
        body: JSON.stringify(different),
        origin: { version: 1 as const, id: entry.id, accountId: scope, generation: 0 },
      };
      const contradictory = structuredClone(terminalOnly);
      contradictory.stores.practice = [queued];
      expect(() => validateDeviceBackup(JSON.stringify(contradictory), scope)).toThrow(
        /contradicts/,
      );
      const matching = structuredClone(contradictory);
      matching.stores.practice[0].body = JSON.stringify(submitted);
      expect(validateDeviceBackup(JSON.stringify(matching), scope).stores.practice).toHaveLength(1);
      const editable = structuredClone(contradictory);
      editable.stores.runnerResults![0].reviewed = false;
      expect(
        validateDeviceBackup(JSON.stringify(editable), scope).stores.runnerResults![0].reviewed,
      ).toBe(false);
      // Incoming queue must agree with an existing submitted terminal review.
      const queueOnly = structuredClone(contradictory);
      delete queueOnly.stores.runnerResults;
      let before = snapshot();
      expect(inspectDeviceRestore(queueOnly).conflicts.join(' ')).toContain(
        'retained Runner submission',
      );
      expect(() => restoreDeviceBackup(queueOnly)).toThrow(/retained Runner submission/);
      expect(snapshot()).toEqual(before);
      // Incoming terminal must agree with an existing immutable queued body.
      values.delete(runnerResultKey(scope, entry.id));
      values.set(pendingKey(scope, entry.id), queued.body);
      before = snapshot();
      expect(inspectDeviceRestore(terminalOnly).conflicts.join(' ')).toContain('queued submission');
      expect(() => restoreDeviceBackup(terminalOnly)).toThrow(/queued submission/);
      expect(snapshot()).toEqual(before);
    },
  );

  it('rolls back failed Runner restore including its original dataset and other device work', () => {
    seed();
    const entry = runnerEntry();
    retainFinishedRunnerResult(scope, entry, { id: entry.id, accountId: scope, generation: 0 });
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    values.delete(runnerResultKey(scope, entry.id));
    values.delete(originKey(scope, entry.id));
    const prior = snapshot();
    const originalSet = storage.setItem;
    let refuse = true;
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key === runnerResultKey(scope, entry.id) && refuse) {
        refuse = false;
        throw new Error('Synthetic quota');
      }
      originalSet(key, value);
    });
    expect(() => restoreDeviceBackup(backup)).toThrow(/original stored work was restored/);
    expect(snapshot()).toEqual(prior);
    expect(isDeviceScopeMutating(scope)).toBe(false);
    restoreDeviceBackup(backup);
    expect(readRunnerResults(scope).results).toHaveLength(1);
  });

  it('clears only selected scoped Runner records, including malformed data, without touching another account', () => {
    seed();
    const entry = runnerEntry();
    retainFinishedRunnerResult(scope, entry, { id: entry.id, accountId: scope });
    retainFinishedRunnerResult('guest', runnerEntry('guest-result'), {
      id: 'runner:guest-result',
      accountId: 'guest',
    });
    values.set(runnerResultKey(scope, 'runner:damaged'), '{malformed');
    clearDeviceWork(scope);
    expect(readRunnerResults(scope)).toEqual({ results: [], error: '' });
    expect(readRunnerResults('guest').results).toHaveLength(1);
  });
});

describe('private task recording preference inventory', () => {
  it('captures exact selected scope and compatible old v1 files without shared restoration', () => {
    seed();
    saveTaskRecordingChoice(scope, 'initial', recordingChoice(), storage);
    saveTaskRecordingChoice('guest', 'initial', recordingChoice('guest-task', 25), storage);
    saveTaskRecordingChoice('another', 'initial', recordingChoice('another-task', 13), storage);
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    expect(backup.stores.recordingChoices).toEqual([recordingChoice()]);
    expect(summarizeDeviceBackup(backup)).toContainEqual({
      id: 'recordingChoices',
      label: 'Task recording choices',
      count: 1,
      shared: false,
    });
    const old = structuredClone(backup);
    delete old.stores.recordingChoices;
    expect(
      validateDeviceBackup(JSON.stringify(old), scope).stores.recordingChoices,
    ).toBeUndefined();
    restoreDeviceBackup(old);
    expect(values.get(taskRecordingChoiceKey(scope, 'task-a'))).toBe(
      JSON.stringify(recordingChoice()),
    );
    expect(JSON.stringify(backup)).not.toContain('guest-task');
    expect(JSON.stringify(backup)).not.toContain('another-task');
  });
  it('restores missing choices, keeps current collisions, fences old owners and clears only selected private scope', () => {
    seed();
    saveTaskRecordingChoice(scope, 'initial', recordingChoice(), storage);
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    backup.stores.recordingChoices!.push(recordingChoice('task-b', 13));
    saveTaskRecordingChoice(scope, 'initial', recordingChoice('task-a', 25), storage);
    saveTaskRecordingChoice('another', 'initial', recordingChoice(), storage);
    expect(inspectDeviceRestore(backup).retainedRecordingChoices).toBe(1);
    restoreDeviceBackup(backup);
    expect(values.get(taskRecordingChoiceKey(scope, 'task-a'))).toBe(
      JSON.stringify(recordingChoice('task-a', 25)),
    );
    expect(values.get(taskRecordingChoiceKey(scope, 'task-b'))).toBe(
      JSON.stringify(recordingChoice('task-b', 13)),
    );
    expect(saveTaskRecordingChoice(scope, 'initial', recordingChoice(), storage)).toBe(false);
    const restored = captureDeviceBackup(scope, 'Synthetic learner');
    restoreDeviceBackup(backup);
    expect(captureDeviceBackup(scope, 'Synthetic learner').stores.recordingChoices).toEqual(
      restored.stores.recordingChoices,
    );
    values.set(taskRecordingChoiceKey(scope, 'damaged-task'), '{');
    clearDeviceWork(scope);
    expect(values.has(taskRecordingChoiceKey(scope, 'task-a'))).toBe(false);
    expect(values.has(taskRecordingChoiceKey(scope, 'task-b'))).toBe(false);
    expect(values.has(taskRecordingChoiceKey(scope, 'damaged-task'))).toBe(false);
    expect(values.get(taskRecordingChoiceKey('another', 'task-a'))).toBe(
      JSON.stringify(recordingChoice()),
    );
    expect(values.get(RECORDING_SPEED_STORAGE_KEY)).toBe('next');
  });
  it('rejects duplicate, malformed and wrong-group backup preferences before mutation', () => {
    seed();
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    for (const choices of [
      [recordingChoice(), recordingChoice()],
      [
        {
          ...recordingChoice(),
          selectedUrl: 'https://cwa.cwops.org/wp-content/uploads/QSO_203_18.mp3',
        },
      ],
      [{ ...recordingChoice(), assignedWpm: 20 }],
      [{ ...recordingChoice(), secret: 'excluded fixture' }],
      ['18'],
    ]) {
      const invalid = {
        ...backup,
        stores: { ...backup.stores, recordingChoices: choices },
      } as DeviceBackup;
      const before = new Map(values);
      expect(() => restoreDeviceBackup(invalid)).toThrow();
      expect(values).toEqual(before);
    }
  });
  it('rolls back a partially written preference restore and permits deliberate retry', () => {
    seed();
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    backup.stores.recordingChoices = [recordingChoice(), recordingChoice('task-b', 25)];
    const set = vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key === taskRecordingChoiceKey(scope, 'task-b')) throw new Error('Synthetic quota');
      values.set(key, value);
    });
    expect(() => restoreDeviceBackup(backup)).toThrow(DeviceMutationError);
    expect(values.has(taskRecordingChoiceKey(scope, 'task-a'))).toBe(false);
    expect(values.has(taskRecordingChoiceKey(scope, 'task-b'))).toBe(false);
    expect(isDeviceScopeMutating(scope)).toBe(false);
    set.mockRestore();
    restoreDeviceBackup(backup);
    expect(captureDeviceBackup(scope, 'Synthetic learner').stores.recordingChoices).toEqual(
      backup.stores.recordingChoices,
    );
  });
});

describe('private word source device inventory', () => {
  const words = { version: 1 as const, wordList: 'custom' as const, customText: 'E E <AR>' };
  it('exports only the selected private source and accepts old omitted stores', () => {
    seed();
    saveWordContent(scope, 'initial', words);
    saveWordContent('guest', 'initial', { ...words, customText: 'GUEST' });
    saveWordContent('another', 'initial', { ...words, customText: 'OTHER' });
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    expect(backup.stores.wordContent).toEqual(words);
    expect(summarizeDeviceBackup(backup)).toContainEqual({
      id: 'wordContent',
      label: 'Saved word source and list selection',
      count: 1,
      shared: false,
    });
    expect(JSON.stringify(backup)).not.toContain('GUEST');
    expect(JSON.stringify(backup)).not.toContain('OTHER');
    const old = structuredClone(backup);
    delete old.stores.wordContent;
    expect(validateDeviceBackup(JSON.stringify(old), scope).stores.wordContent).toBeUndefined();
    restoreDeviceBackup(old);
    expect(readWordContent(scope)).toEqual(words);
  });
  it('restores missing words once, retains a newer source with visible inspection, and clears only its scope', () => {
    seed();
    saveWordContent(scope, 'initial', words);
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    saveWordContent(scope, 'initial', { ...words, customText: 'T T' });
    saveWordContent('another', 'initial', words);
    expect(inspectDeviceRestore(backup).retainedWordContent).toBe(true);
    expect(restoreDeviceBackup(backup).retainedWordContent).toBe(true);
    expect(readWordContent(scope).customText).toBe('T T');
    clearWordContent(scope, getDeviceScopeToken(scope));
    restoreDeviceBackup(backup);
    expect(readWordContent(scope)).toEqual(words);
    const token = getDeviceScopeToken(scope);
    restoreDeviceBackup(backup);
    expect(getDeviceScopeToken(scope)).toBe(token);
    expect(() => saveWordContent(scope, 'initial', words)).toThrow('changed');
    values.set(wordContentKey(scope), '{');
    clearDeviceWork(scope);
    expect(values.has(wordContentKey(scope))).toBe(false);
    expect(readWordContent('another')).toEqual(words);
  });
  it('rejects malformed source before mutation and rolls back a later failure after source installation', () => {
    seed();
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    backup.stores.wordContent = words;
    const old = new Map(values);
    for (const customText of ['E\u0000T', 'E '.repeat(201)]) {
      const invalid = structuredClone(backup);
      invalid.stores.wordContent!.customText = customText;
      expect(() => restoreDeviceBackup(invalid)).toThrow();
      expect(values).toEqual(old);
    }
    backup.stores.scratchpads.push({ context: 'new-note', text: 'synthetic' });
    const write = storage.setItem;
    let installed = false;
    const spy = vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key === wordContentKey(scope)) installed = true;
      if (key.includes('new-note') && installed) throw new Error('Synthetic later storage failure');
      write(key, value);
    });
    expect(() => restoreDeviceBackup(backup)).toThrow(DeviceMutationError);
    expect(installed).toBe(true);
    expect(values.has(wordContentKey(scope))).toBe(false);
    expect(isDeviceScopeMutating(scope)).toBe(false);
    spy.mockRestore();
    restoreDeviceBackup(backup);
    expect(readWordContent(scope)).toEqual(words);
  });
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
      'eventTimeMode',
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
        item.shared.practicePreferences!.tone = 777.5;
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

describe('public live agenda preference in device inventory', () => {
  it('preserves old omission and validates only Local/UTC without account authority', () => {
    const old = captureDeviceBackup(scope, 'Synthetic learner');
    expect(old.shared).not.toHaveProperty('eventTimeMode');
    expect(validateDeviceBackup(JSON.stringify(old), scope)).toEqual(old);
    for (const mode of ['local', 'utc'] as const) {
      values.set(EVENT_TIME_MODE_KEY, mode);
      expect(captureDeviceBackup(scope, 'Synthetic learner').shared.eventTimeMode).toBe(mode);
    }
    for (const invalid of ['UTC', '', 'private-account', 1, null, ['utc'], {}]) {
      expect(() =>
        validateDeviceBackup(JSON.stringify({ ...old, shared: { eventTimeMode: invalid } }), scope),
      ).toThrow(/Local or UTC/);
    }
  });
  it('restores only through shared opt-in and leaves the public choice during private clear', async () => {
    values.set(EVENT_TIME_MODE_KEY, 'utc');
    const backup = captureDeviceBackup(scope, 'Synthetic learner');
    values.set(EVENT_TIME_MODE_KEY, 'local');
    rememberAccount({ id: scope, email: 'synthetic@example.test' }, account());
    restoreDeviceBackup(backup);
    expect(values.get(EVENT_TIME_MODE_KEY)).toBe('local');
    restoreDeviceBackup(backup, { restoreSharedPreferences: true });
    expect(values.get(EVENT_TIME_MODE_KEY)).toBe('utc');
    await clearDeviceWork(scope);
    expect(values.get(EVENT_TIME_MODE_KEY)).toBe('utc');
  });
});

it('defaults old backups to variable word pitch and preserves both choices through backup and restore', () => {
  seed('guest');
  const backup = captureDeviceBackup('guest', 'Guest');
  const { variableWordPitch: omittedPitch, ...oldPreferences } = backup.shared.practicePreferences!;
  const old = { ...backup, shared: { practicePreferences: oldPreferences } };
  const migrated = validateDeviceBackup(JSON.stringify(old), 'guest');
  expect(migrated.shared.practicePreferences?.variableWordPitch).toBe(true);
  for (const variableWordPitch of [true, false]) {
    const current = { ...backup.shared.practicePreferences!, variableWordPitch };
    values.set(PRACTICE_PREFERENCES_KEY, JSON.stringify(current));
    const captured = captureDeviceBackup('guest', 'Guest');
    const checked = validateDeviceBackup(JSON.stringify(captured), 'guest');
    expect(checked.shared.practicePreferences).toEqual(current);
    values.delete(PRACTICE_PREFERENCES_KEY);
    restoreDeviceBackup(checked, { expectedScope: 'guest', restoreSharedPreferences: true });
    expect(JSON.parse(values.get(PRACTICE_PREFERENCES_KEY)!)).toEqual(current);
  }
  for (const variableWordPitch of [null, 0, 1, 'false', [], {}]) {
    const malformed = {
      ...backup,
      shared: { practicePreferences: { ...oldPreferences, variableWordPitch } },
    };
    expect(() => validateDeviceBackup(JSON.stringify(malformed), 'guest')).toThrow(
      /variableWordPitch is invalid/,
    );
  }
});

it('keeps old shared v1 preferences compatible and explicitly restores independent Story settings', () => {
  seed('guest');
  const backup = captureDeviceBackup('guest', 'Guest');
  const {
    version: omittedVersion,
    qsoSettings: omittedQso,
    storySettings: omittedStory,
    ...oldPreferences
  } = backup.shared.practicePreferences!;
  const old = { ...backup, shared: { practicePreferences: oldPreferences } };
  expect(
    validateDeviceBackup(JSON.stringify(old), 'guest').shared.practicePreferences?.storySettings
      .storyId,
  ).toBe('story-trail');
  const current = {
    ...backup.shared.practicePreferences!,
    tool: 'stories' as const,
    storySettings: {
      ...omittedStory,
      storyId: 'story-light' as const,
      characterWpm: 28,
      effectiveWpm: 14,
      tone: 650,
    },
  };
  values.set(PRACTICE_PREFERENCES_KEY, JSON.stringify(current));
  const captured = captureDeviceBackup('guest', 'Guest');
  expect(captured.shared.practicePreferences).toEqual(current);
  restoreDeviceBackup(validateDeviceBackup(JSON.stringify(old), 'guest'), {
    expectedScope: 'guest',
  });
  expect(JSON.parse(values.get(PRACTICE_PREFERENCES_KEY)!)).toEqual(current);
  restoreDeviceBackup(validateDeviceBackup(JSON.stringify(old), 'guest'), {
    expectedScope: 'guest',
    restoreSharedPreferences: true,
  });
  expect(JSON.parse(values.get(PRACTICE_PREFERENCES_KEY)!)).toEqual(
    validateDeviceBackup(JSON.stringify(old), 'guest').shared.practicePreferences,
  );
  restoreDeviceBackup(captured, { expectedScope: 'guest', restoreSharedPreferences: true });
  expect(JSON.parse(values.get(PRACTICE_PREFERENCES_KEY)!)).toEqual(current);
  for (const change of [
    { version: 2 },
    { storyId: 'unknown' },
    { effectiveWpm: 29 },
    { privateScript: 'PRIVATE' },
    { tone: 649.5 },
  ]) {
    const malformed = {
      ...captured,
      shared: {
        practicePreferences: { ...current, storySettings: { ...current.storySettings, ...change } },
      },
    };
    expect(() =>
      restoreDeviceBackup(validateDeviceBackup(JSON.stringify(malformed), 'guest'), {
        expectedScope: 'guest',
        restoreSharedPreferences: true,
      }),
    ).toThrow();
    expect(JSON.parse(values.get(PRACTICE_PREFERENCES_KEY)!)).toEqual(current);
  }
});

it('keeps old device inventories and exact versioned QSO setups compatible without shared opt-in', () => {
  seed('guest');
  const backup = captureDeviceBackup('guest', 'Guest');
  const { version: _version, qsoSettings: _qso, ...legacy } = backup.shared.practicePreferences!;
  const old = {
    ...backup,
    shared: { practicePreferences: { ...legacy, characterWpm: 5, effectiveWpm: 3 } },
  };
  const migrated = validateDeviceBackup(JSON.stringify(old), 'guest');
  expect(
    validateDeviceBackup(
      JSON.stringify({
        ...old,
        shared: { practicePreferences: { ...old.shared.practicePreferences, version: 1 } },
      }),
      'guest',
    ).shared.practicePreferences,
  ).toEqual(migrated.shared.practicePreferences);
  expect(migrated.shared.practicePreferences?.qsoSettings).toMatchObject({
    characterWpm: 5,
    effectiveWpm: 3,
  });
  const precise = {
    ...backup.shared.practicePreferences!,
    characterWpm: 55,
    effectiveWpm: 55,
    wordGap: 0.3,
    qsoSettings: {
      ...backup.shared.practicePreferences!.qsoSettings,
      characterWpm: 60,
      effectiveWpm: 51,
      tone: 617,
    },
  };
  const exact = { ...backup, shared: { practicePreferences: precise } };
  expect(validateDeviceBackup(JSON.stringify(exact), 'guest').shared.practicePreferences).toEqual(
    precise,
  );
  const before = values.get(PRACTICE_PREFERENCES_KEY);
  restoreDeviceBackup(exact, { expectedScope: 'guest' });
  expect(values.get(PRACTICE_PREFERENCES_KEY)).toBe(before);
  restoreDeviceBackup(exact, { expectedScope: 'guest', restoreSharedPreferences: true });
  expect(JSON.parse(values.get(PRACTICE_PREFERENCES_KEY)!)).toEqual(precise);
  for (const change of [
    { version: 99 },
    { effectiveWpm: 61 },
    { tone: 617.5 },
    { script: 'PRIVATE' },
  ]) {
    expect(() =>
      validateDeviceBackup(
        JSON.stringify({
          ...exact,
          shared: {
            practicePreferences: { ...precise, qsoSettings: { ...precise.qsoSettings, ...change } },
          },
        }),
        'guest',
      ),
    ).toThrow();
  }
});


it('backs up, restores and clears scoped material reading preferences while preserving current device choices', () => {
  seed();
  const preference = { 'material:first': { size: 35, scroll: 456 } };
  values.set(materialReadingKey(scope), JSON.stringify(preference));
  values.set(materialReadingKey('another-owner'), JSON.stringify({ other: { size: 48, scroll: 0 } }));
  const backup = captureDeviceBackup(scope, 'Synthetic learner');
  expect(backup.stores.materialReading).toEqual(preference);
  expect(summarizeDeviceBackup(backup).find((item) => item.id === 'materialReading')?.count).toBe(1);
  values.delete(materialReadingKey(scope));
  restoreDeviceBackup(backup);
  expect(JSON.parse(values.get(materialReadingKey(scope))!)).toEqual(preference);
  values.set(materialReadingKey(scope), JSON.stringify({ 'material:first': { size: 18, scroll: 12 } }));
  restoreDeviceBackup(backup);
  expect(JSON.parse(values.get(materialReadingKey(scope))!)['material:first']).toEqual({ size: 18, scroll: 12 });
  clearDeviceWork(scope);
  expect(values.has(materialReadingKey(scope))).toBe(false);
  expect(values.has(materialReadingKey('another-owner'))).toBe(true);
});
