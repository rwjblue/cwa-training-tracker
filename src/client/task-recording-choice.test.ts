import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deviceScopeKey, getDeviceScopeToken } from './device-scope';
import { RECORDING_SPEED_STORAGE_KEY, recordingVariants } from './recording-variants';
import {
  clearTaskRecordingChoice,
  MAX_TASK_RECORDING_CHOICES,
  resolveTaskRecordingChoice,
  saveTaskRecordingChoice,
  taskRecordingChoiceKey,
  taskRecordingChoiceTaskId,
  validateTaskRecordingChoice,
  type TaskRecordingChoice,
} from './task-recording-choice';

const assignedUrl = 'https://cwa.cwops.org/wp-content/uploads/WD101_10.mp3';
const variants = recordingVariants(assignedUrl);
const stretch = variants.find((variant) => variant.speedWpm === 18)!;
const context = { taskId: 'curriculum:intermediate:wd-101-day-1', assignedUrl, assignedWpm: 10 };
const choice: TaskRecordingChoice = { ...context, version: 1, selectedUrl: stretch.url };
let values: Map<string, string>;
let storage: Storage;
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
    clear: () => values.clear(),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { localStorage: storage });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('scoped exact task recording choices', () => {
  it('retains exact stretch by stable task before default without inheriting across scopes or tasks', () => {
    values.set(RECORDING_SPEED_STORAGE_KEY, 'next');
    expect(saveTaskRecordingChoice('account-a', 'initial', choice)).toBe(true);
    expect(resolveTaskRecordingChoice('account-a', context)).toMatchObject({
      status: 'override',
      recording: { url: stretch.url, speedWpm: 18 },
    });
    for (const scope of ['guest', 'account-b'])
      expect(resolveTaskRecordingChoice(scope, context)).toMatchObject({
        status: 'default',
        recording: { speedWpm: 13 },
      });
    expect(
      resolveTaskRecordingChoice('account-a', { ...context, taskId: 'other-task' }),
    ).toMatchObject({ status: 'default', recording: { speedWpm: 13 } });
    values.set(RECORDING_SPEED_STORAGE_KEY, 'assigned');
    expect(resolveTaskRecordingChoice('account-a', context).recording?.url).toBe(stretch.url);
    expect(clearTaskRecordingChoice('account-a', 'initial', context.taskId)).toBe(true);
    expect(resolveTaskRecordingChoice('account-a', context)).toMatchObject({
      status: 'default',
      recording: { url: assignedUrl },
    });
  });
  it('keeps an explicit assigned-file override distinct from resetting to Next', () => {
    values.set(RECORDING_SPEED_STORAGE_KEY, 'next');
    expect(
      saveTaskRecordingChoice('guest', 'initial', { ...choice, selectedUrl: assignedUrl }),
    ).toBe(true);
    expect(resolveTaskRecordingChoice('guest', context)).toMatchObject({
      status: 'override',
      recording: { url: assignedUrl },
    });
    clearTaskRecordingChoice('guest', 'initial', context.taskId);
    expect(resolveTaskRecordingChoice('guest', context).recording?.speedWpm).toBe(13);
  });
  it('falls back visibly when assignment source or prescription changes, without guessing another group', () => {
    saveTaskRecordingChoice('guest', 'initial', choice);
    for (const changed of [
      { ...context, assignedWpm: 20 },
      { ...context, assignedWpm: undefined },
      {
        ...context,
        assignedUrl: 'https://cwa.cwops.org/wp-content/uploads/QSO_203_13.mp3',
        assignedWpm: 13,
      },
      { ...context, assignedUrl: 'https://example.test/removed.mp3' },
    ]) {
      const resolved = resolveTaskRecordingChoice('guest', changed);
      expect(resolved.status).toBe('invalid');
      expect(resolved.choice).toBeUndefined();
      expect(resolved.recording?.url).not.toBe(stretch.url);
    }
    expect(clearTaskRecordingChoice('guest', 'initial', context.taskId)).toBe(true);
  });
  it('never wraps highest Next to a slower file', () => {
    const highest = variants.at(-1)!;
    values.set(RECORDING_SPEED_STORAGE_KEY, 'next');
    expect(
      resolveTaskRecordingChoice('guest', {
        ...context,
        assignedUrl: highest.url,
        assignedWpm: highest.speedWpm,
      }).recording?.url,
    ).toBe(highest.url);
  });
  it.each([
    { ...choice, version: 2 },
    { ...choice, taskId: '' },
    { ...choice, assignedWpm: '10' },
    { ...choice, assignedWpm: 0 },
    { ...choice, assignedWpm: NaN },
    { ...choice, assignedWpm: Infinity },
    { ...choice, assignedWpm: 101 },
    { ...choice, assignedUrl: `${assignedUrl}?x=1` },
    { ...choice, selectedUrl: 'https://cwa.cwops.org/wp-content/uploads/QSO_203_18.mp3' },
    { ...choice, selectedUrl: `${stretch.url}?speed=25` },
    { ...choice, selectedUrl: 'https://example.test/removed.mp3' },
    { ...choice, assignedWpm: 20, selectedUrl: stretch.url },
    { ...choice, privateNotes: 'excluded' },
    null,
    [],
    '18',
  ])('rejects malformed, private, wrong-group and below-assigned data %#', (value) => {
    expect(() => validateTaskRecordingChoice(value)).toThrow();
    values.set(taskRecordingChoiceKey('guest', context.taskId), JSON.stringify(value));
    expect(resolveTaskRecordingChoice('guest', context)).toMatchObject({
      status: 'invalid',
      recording: { url: assignedUrl },
    });
  });
  it('rejects damaged serialization, oversized and mismatched task identities without touching another task', () => {
    saveTaskRecordingChoice('guest', 'initial', { ...choice, taskId: 'other-task' });
    for (const raw of [
      '{',
      'x'.repeat(6001),
      JSON.stringify({ ...choice, taskId: 'wrong-task' }),
    ]) {
      values.set(taskRecordingChoiceKey('guest', context.taskId), raw);
      expect(resolveTaskRecordingChoice('guest', context).status).toBe('invalid');
    }
    clearTaskRecordingChoice('guest', 'initial', context.taskId);
    expect(
      resolveTaskRecordingChoice('guest', { ...context, taskId: 'other-task' }).recording?.url,
    ).toBe(stretch.url);
  });
  it('normalizes only verified same-group historical replacements', () => {
    const old = 'https://cwops.org/wp-content/uploads/2022/07/qso207_13.mp3';
    const selected = 'https://cwops.org/wp-content/uploads/2022/07/qso207_18.mp3';
    const replacement = validateTaskRecordingChoice({
      ...choice,
      assignedUrl: old,
      assignedWpm: 13,
      selectedUrl: selected,
    });
    expect(replacement.assignedUrl).toContain('/2026/09/');
    expect(replacement.selectedUrl).toContain('/2026/09/');
    saveTaskRecordingChoice('guest', 'initial', replacement);
    expect(
      resolveTaskRecordingChoice('guest', { ...context, assignedUrl: old, assignedWpm: 13 }).status,
    ).toBe('override');
  });
  it('requires durable readback, permits retry and fences retired tokens for saves and reset', () => {
    const write = vi.spyOn(storage, 'setItem').mockImplementation(() => {});
    expect(saveTaskRecordingChoice('guest', 'initial', choice)).toBe(false);
    write.mockRestore();
    expect(saveTaskRecordingChoice('guest', 'initial', choice)).toBe(true);
    const remove = vi.spyOn(storage, 'removeItem').mockImplementation(() => {});
    expect(clearTaskRecordingChoice('guest', 'initial', context.taskId)).toBe(false);
    remove.mockRestore();
    values.set(
      deviceScopeKey('guest'),
      JSON.stringify({ version: 1, token: 'new-owner', mutating: false }),
    );
    expect(
      saveTaskRecordingChoice('guest', 'initial', { ...choice, selectedUrl: assignedUrl }),
    ).toBe(false);
    expect(clearTaskRecordingChoice('guest', 'initial', context.taskId)).toBe(false);
    expect(resolveTaskRecordingChoice('guest', context).recording?.url).toBe(stretch.url);
    expect(clearTaskRecordingChoice('guest', getDeviceScopeToken('guest'), context.taskId)).toBe(
      true,
    );
  });
  it('works safely when browser storage itself is unavailable', () => {
    vi.stubGlobal('window', {
      get localStorage() {
        throw new Error('Unavailable');
      },
    });
    expect(resolveTaskRecordingChoice('guest', context)).toMatchObject({
      status: 'invalid',
      recording: { url: assignedUrl },
    });
    expect(saveTaskRecordingChoice('guest', 'initial', choice)).toBe(false);
    expect(clearTaskRecordingChoice('guest', 'initial', context.taskId)).toBe(false);
  });
  it('bounds new task retention while allowing updates and exact-scope registration', () => {
    for (let index = 0; index < MAX_TASK_RECORDING_CHOICES; index++)
      values.set(
        taskRecordingChoiceKey('guest', `task-${index}`),
        JSON.stringify({ ...choice, taskId: `task-${index}` }),
      );
    expect(saveTaskRecordingChoice('guest', 'initial', choice)).toBe(false);
    expect(saveTaskRecordingChoice('guest', 'initial', { ...choice, taskId: 'task-0' })).toBe(true);
    expect(saveTaskRecordingChoice('account-a', 'initial', choice)).toBe(true);
    const key = taskRecordingChoiceKey('account-a', choice.taskId);
    expect(taskRecordingChoiceTaskId(key, 'account-a')).toBe(choice.taskId);
    expect(taskRecordingChoiceTaskId(key, 'account-a-extra')).toBeUndefined();
    expect(taskRecordingChoiceTaskId(key, 'guest')).toBeUndefined();
    expect(
      taskRecordingChoiceTaskId('cwa.recording.choice.v1:["guest","x","private"]', 'guest'),
    ).toBeUndefined();
  });
});
