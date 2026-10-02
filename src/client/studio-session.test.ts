import { describe, expect, it, vi } from 'vitest';
import type { PracticeSession } from '../shared/training';
import {
  loadStudioNotes,
  clearSavedStudioNotes,
  studioNotesSession,
  saveStudioNotes,
  studioSession,
  StudioSaveCoordinator,
  captureStudioNotes,
  captureScratchpadMemory,
  invalidateScratchpadMemory,
  type StudioSessionInput,
} from './studio-session';
import { DEFAULT_PRACTICE_PREFERENCES } from './practice-preferences';
import {
  GeneratedListeningCollector,
  type GeneratedListeningSummary,
} from '../shared/generated-listening';
import { practiceLaunchForTask } from './practice-launch';
import {
  completeDeviceScopeMutation,
  getDeviceScopeToken,
  invalidateDeviceScope,
} from './device-scope';

it('snapshots only current scoped scratchpad memory, including empty tombstones and excluding malformed persisted data', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => values.set(name, value),
    removeItem: (name: string) => values.delete(name),
  };
  vi.stubGlobal('localStorage', storage);
  try {
    const scope = 'rollback-memory-scope';
    const old = getDeviceScopeToken(scope);
    saveStudioNotes(scope, 'visible-memory', 'Learner notes');
    saveStudioNotes(scope, 'empty-memory', '');
    saveStudioNotes(`${scope}-other`, 'other-memory', 'Private other scope');
    values.set(
      `cwa.studio.scratchpad.v1:${JSON.stringify([scope, 'persisted-only'])}`,
      'X'.repeat(10001),
    );
    expect(captureScratchpadMemory(scope)).toEqual([
      { context: 'visible-memory', text: 'Learner notes' },
      { context: 'empty-memory', text: '' },
    ]);
    values.set(
      `cwa:device:scope:v1:${scope}`,
      JSON.stringify({ version: 1, token: 'another-owner', mutating: false }),
    );
    expect(getDeviceScopeToken(scope)).not.toBe(old);
    expect(captureScratchpadMemory(scope)).toEqual([]);
    expect(captureScratchpadMemory(`${scope}-other`)).toEqual([
      { context: 'other-memory', text: 'Private other scope' },
    ]);
  } finally {
    vi.unstubAllGlobals();
  }
});

function input(seconds = 30): StudioSessionInput {
  return {
    identity: { id: 'studio:first', createdAt: '2026-09-30T01:00:00.000Z' },
    measured: {
      seconds,
      recallSeconds: 0,
      running: false,
      recalling: false,
      recordings: [],
      recordingRevision: 0,
    },
    preferences: { ...DEFAULT_PRACTICE_PREFERENCES, wordList: 'common-30' },
    generatedListening: { version: 1, summaries: [playedWords()], overflow: false },
    scratchpad: 'Listen for the complete word.',
    timezone: 'America/New_York',
  };
}

it('saves raw word listening separately from recall with public optional purpose and captured date', () => {
  const next = input(600);
  next.measured.recallSeconds = 120;
  next.measured.wordListeningSeconds = 480;
  next.launch = { id: 'daily', tool: 'words', purpose: 'review' };
  const saved = studioSession(next)!;
  expect(saved.minutes).toBe(10);
  expect(saved.date).toBe('2026-09-29');
  expect(saved.metadata).toMatchObject({
    practicePurpose: 'review',
    evidence: { wordListeningSeconds: 480, measurement: { seconds: 600, recallSeconds: 120 } },
  });
  expect(saved.metadata?.plannedTaskId).toBeUndefined();
});

function playedWords(characterWpm = 20, effectiveWpm = 10): GeneratedListeningSummary {
  return {
    mode: 'words',
    listId: 'common-30',
    entryCount: 30,
    characterWpm,
    effectiveWpm,
    toneHz: 600,
    wordGapSeconds: 1,
    shuffle: false,
    repeat: true,
    spokenAnswers: false,
  };
}

it('saves actual played setups rather than final selections, retaining an immutable retry snapshot', async () => {
  const collector = new GeneratedListeningCollector();
  collector.record(playedWords());
  collector.record(playedWords(25, 15));
  const value = input();
  value.preferences = {
    ...value.preferences,
    characterWpm: 30,
    effectiveWpm: 20,
    wordList: 'custom',
  };
  value.generatedListening = collector.snapshot();
  const original = studioSession(value)!;
  expect(original.characterWpm).toBeUndefined();
  expect(original.effectiveWpm).toBeUndefined();
  expect(original.notes).toBe('30 common English words');
  expect(original.metadata?.wordList).toBe('common-30');
  expect(original.metadata?.practiceMode).toBeUndefined();
  const coordinator = new StudioSaveCoordinator();
  await expect(
    coordinator.flush(original, async () => {
      throw new Error('Lost response');
    }),
  ).rejects.toThrow('Lost response');
  collector.record(playedWords(30, 20));
  value.generatedListening = collector.snapshot();
  const retry = vi.fn(async (_entry: PracticeSession) => {});
  await coordinator.flush(studioSession(value), retry);
  expect(retry).toHaveBeenCalledWith(original);
  expect(retry.mock.calls[0][0].metadata?.evidence).toMatchObject({
    generatedListening: { summaries: [playedWords(), playedWords(25, 15)] },
  });
});

it('does not label manual or recall-only time with a selected generated list or speed', () => {
  const value = input();
  value.generatedListening = undefined;
  const entry = studioSession(value)!;
  expect(entry.characterWpm).toBeUndefined();
  expect(entry.effectiveWpm).toBeUndefined();
  expect(entry.metadata).not.toHaveProperty('wordList');
  expect(entry.notes).toBe('Word listening');
});

it('clears scoped notes memory and rejects a delayed old save without erasing restored notes', () => {
  const values = new Map<string, string>();
  const storage = {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => values.set(name, value),
    removeItem: (name: string) => values.delete(name),
  };
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  try {
    const scope = 'notes-lifecycle-owner';
    const old = getDeviceScopeToken(scope);
    saveStudioNotes(scope, 'public:words', 'Original notes', undefined, old);
    saveStudioNotes(`${scope}-other`, 'public:words', 'Other owner');
    expect(captureStudioNotes(scope)).toEqual([
      { context: 'public:words', text: 'Original notes' },
    ]);
    const token = invalidateDeviceScope(scope);
    invalidateScratchpadMemory(scope);
    storage.removeItem(`cwa.studio.scratchpad.v1:${JSON.stringify([scope, 'public:words'])}`);
    completeDeviceScopeMutation(scope, token);
    expect(loadStudioNotes(scope, 'public:words')).toBe('');
    saveStudioNotes(scope, 'public:words', 'Restored notes', undefined, token);
    const oldEntry = studioSession(input())!;
    expect(clearSavedStudioNotes(scope, oldEntry, undefined, old)).toBe(false);
    expect(saveStudioNotes(scope, 'public:words', 'Old cleanup', undefined, old)).toBe(false);
    expect(loadStudioNotes(scope, 'public:words')).toBe('Restored notes');
    expect(loadStudioNotes(`${scope}-other`, 'public:words')).toBe('Other owner');
  } finally {
    vi.unstubAllGlobals();
  }
});

it('drops another tab’s stale notes memory before a lifecycle notification is delivered', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => values.set(name, value),
    removeItem: (name: string) => values.delete(name),
  };
  vi.stubGlobal('localStorage', storage);
  try {
    const scope = 'other-tab-notes';
    saveStudioNotes(scope, 'public:words', 'Old memory');
    localStorage.setItem(
      `cwa:device:scope:v1:${scope}`,
      JSON.stringify({ version: 1, token: 'new-tab-token', mutating: false }),
    );
    localStorage.removeItem(`cwa.studio.scratchpad.v1:${JSON.stringify([scope, 'public:words'])}`);
    expect(loadStudioNotes(scope, 'public:words')).toBe('');
  } finally {
    vi.unstubAllGlobals();
  }
});

it('saves exact measured practice from one second without rounding or discarding short work', () => {
  for (const seconds of [0, 0.999, -1, NaN, Infinity])
    expect(studioSession(input(seconds))).toBeUndefined();
  expect(studioSession(input())).toMatchObject({
    id: 'studio:first',
    createdAt: '2026-09-30T01:00:00.000Z',
    date: '2026-09-29',
    minutes: 0.5,
    kind: 'head-copy',
    source: 'morse',
    characterWpm: 20,
    effectiveWpm: 10,
    metadata: {
      elapsedSeconds: 30,
      wordList: 'common-30',
      scratchpad: 'Listen for the complete word.',
    },
  });
  expect(studioSession(input(30.25))?.minutes).toBe(30.25 / 60);
  expect(studioSession(input(1))?.minutes).toBe(1 / 60);
  expect(studioSession(input(12.125))?.minutes).toBe(12.125 / 60);
});

it('captures assignment, actual recording sources and recall without inventing a shared speed', () => {
  const value = input(50);
  value.launch = {
    id: 'launch:audio',
    task: {
      id: 'task:audio',
      title: 'Listen to the exchange',
      kind: 'listening',
      lesson: 4,
      targetMinutes: 15,
      done: false,
      notes: '',
      createdAt: value.identity.createdAt,
    },
    activity: { type: 'audio', url: 'https://example.org/assigned.mp3', characterWpm: 15 },
  };
  value.measured.recallSeconds = 10;
  value.measured.recordings = [
    { url: 'https://example.org/slow.mp3', speedWpm: 10, seconds: 20 },
    { url: 'https://example.org/assigned.mp3', speedWpm: 15, seconds: 20 },
  ];
  const result = studioSession(value)!;
  expect(result).toMatchObject({
    source: 'timer',
    kind: 'listening',
    lesson: 4,
    metadata: {
      elapsedSeconds: 50,
      recallSeconds: 10,
      plannedTaskId: 'task:audio',
      assignedRecordingUrl: 'https://example.org/assigned.mp3',
      assignedSpeedWpm: 15,
      practiceTool: 'audio',
      recordings: value.measured.recordings,
    },
  });
  expect(result.characterWpm).toBeUndefined();
  expect(result.effectiveWpm).toBeUndefined();
  expect(result.metadata?.recordingUrl).toBeUndefined();
  expect(result.notes).toContain('10 WPM: 00:20 listened; 15 WPM: 00:20 listened');
  value.measured.recordings = [value.measured.recordings[0]];
  expect(studioSession(value)).toMatchObject({
    metadata: { recordingUrl: 'https://example.org/slow.mp3' },
  });
  expect(studioSession(value)?.characterWpm).toBeUndefined();
});

it('freezes per-file native passes in a failed retry while later current listening continues', async () => {
  const value = input(60);
  const assignedUrl = 'https://cwa.cwops.org/wp-content/uploads/ING7_15.mp3';
  const fasterUrl = 'https://cwa.cwops.org/wp-content/uploads/ING7_18.mp3';
  value.launch = {
    id: 'launch:observed-passes',
    activity: { type: 'audio', url: assignedUrl, characterWpm: 15 },
    task: {
      id: 'task:observed-passes',
      title: 'Listen to the assigned words',
      kind: 'listening',
      done: false,
      notes: '',
      createdAt: value.identity.createdAt,
      exercise: { type: 'audio', url: assignedUrl, minimumPasses: 4 },
    },
    purpose: 'assigned',
  };
  value.measured.recallSeconds = 10;
  value.measured.recordings = [
    {
      url: assignedUrl,
      speedWpm: 15,
      seconds: 20,
      passes: {
        version: 1,
        method: 'native-1x',
        durations: [{ durationSeconds: 10, completedPasses: 1 }],
      },
    },
    {
      url: fasterUrl,
      speedWpm: 18,
      seconds: 20,
      passes: {
        version: 1,
        method: 'native-1x',
        durations: [{ durationSeconds: 10, completedPasses: 2 }],
      },
    },
  ];
  const candidate = studioSession(value)!;
  expect(candidate.metadata?.recordings).toMatchObject(value.measured.recordings);
  expect(candidate.metadata?.evidence).toMatchObject({
    type: 'timed',
    recordings: value.measured.recordings,
  });
  expect(candidate.notes).toContain('15 WPM: 00:20 listened; 1 completed pass');
  expect(candidate.notes).toContain('18 WPM: 00:20 listened; 2 completed passes');
  expect(candidate.minutes).toBe(1);
  const coordinator = new StudioSaveCoordinator();
  await expect(
    coordinator.flush(candidate, async () => {
      throw new Error('Retry after network loss');
    }),
  ).rejects.toThrow('network loss');
  value.measured.seconds += 10;
  value.measured.recordings[0].seconds += 10;
  value.measured.recordings[0].passes!.durations[0].completedPasses++;
  const retry = vi.fn(async (_entry: PracticeSession) => {});
  await coordinator.flush(studioSession(value), retry);
  expect(retry.mock.calls[0][0]).toEqual(candidate);
  expect(retry.mock.calls[0][0].metadata?.evidence).toMatchObject({
    recordings: [
      { passes: { durations: [{ completedPasses: 1 }] } },
      { passes: { durations: [{ completedPasses: 2 }] } },
    ],
  });
  expect(studioSession(value)?.metadata?.evidence).toMatchObject({
    recordings: [
      { passes: { durations: [{ completedPasses: 2 }] } },
      { passes: { durations: [{ completedPasses: 2 }] } },
    ],
  });
});

it('keeps captured review purpose with the task before and after an explicit completion decision', () => {
  const value = input(40);
  const task = {
    id: 'task:extra-review',
    title: 'Sending practice',
    kind: 'sending' as const,
    done: false,
    notes: '',
    createdAt: value.identity.createdAt,
  };
  value.launch = { id: 'launch:review', ...practiceLaunchForTask(task, 'review') };
  expect(studioSession(value)).toMatchObject({
    minutes: 40 / 60,
    metadata: { plannedTaskId: task.id, practicePurpose: 'review' },
  });
  value.launch.task = { ...value.launch.task!, done: true };
  expect(studioSession(value)?.metadata?.practicePurpose).toBe('review');
  value.launch.task = { ...value.launch.task, done: false };
  expect(studioSession(value)?.metadata?.practicePurpose).toBe('review');
  value.launch = { id: 'launch:assigned', ...practiceLaunchForTask(task) };
  expect(studioSession(value)?.metadata?.practicePurpose).toBe('assigned');
  delete value.launch.purpose;
  expect(studioSession(value)?.metadata).not.toHaveProperty('practicePurpose');
  value.launch = undefined;
  expect(studioSession(value)?.metadata).not.toHaveProperty('practicePurpose');
});

it('logs known recording timing and retains a shared character speed across effective-speed changes', () => {
  const value = input(229.054);
  const assignedUrl = 'https://cwa.cwops.org/wp-content/uploads/ING7_15.mp3';
  const playedUrl = 'https://cwa.cwops.org/wp-content/uploads/ING7_18.mp3';
  value.launch = {
    id: 'launch:ing',
    activity: { type: 'audio', url: assignedUrl, characterWpm: 15 },
  };
  value.measured.recordings = [{ url: playedUrl, speedWpm: 18, seconds: 229.054 }];
  expect(studioSession(value)).toMatchObject({
    characterWpm: 25,
    effectiveWpm: 18,
    minutes: 229.054 / 60,
    notes: '18 WPM: 03:49 listened',
    metadata: {
      assignedSpeedWpm: 15,
      assignedCharacterWpm: 25,
      assignedEffectiveWpm: 15,
      recordings: [{ url: playedUrl, characterWpm: 25, effectiveWpm: 18, seconds: 229.054 }],
    },
  });
  value.measured.recordings.push({ url: assignedUrl, speedWpm: 15, seconds: 10 });
  value.measured.seconds += 10;
  const mixed = studioSession(value)!;
  expect(mixed.characterWpm).toBe(25);
  expect(mixed.effectiveWpm).toBeUndefined();
  expect(mixed.metadata?.recordings).toEqual([
    { url: playedUrl, speedWpm: 18, characterWpm: 25, effectiveWpm: 18, seconds: 229.054 },
    { url: assignedUrl, speedWpm: 15, characterWpm: 25, effectiveWpm: 15, seconds: 10 },
  ]);
  // An unrecognized source must not inherit timing from the known file.
  value.measured.recordings.push({ url: 'https://example.org/unknown.mp3', seconds: 5 });
  value.measured.seconds += 5;
  expect(studioSession(value)?.characterWpm).toBeUndefined();
});

it('saves public scales as measured sending practice without unrelated listening speeds', () => {
  const value = input(42);
  value.preferences.tool = 'sending';
  const entry = studioSession(value)!;
  expect(entry).toMatchObject({
    kind: 'sending',
    source: 'timer',
    minutes: 42 / 60,
    notes: 'Sending scales',
    metadata: { practiceTool: 'sending', elapsedSeconds: 42 },
  });
  expect(entry.characterWpm).toBeUndefined();
  expect(entry.effectiveWpm).toBeUndefined();
  expect(entry.metadata?.practiceMode).toBeUndefined();
  const storage = {
    getItem: () => value.scratchpad,
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };
  saveStudioNotes('guest', 'public:sending', value.scratchpad, storage);
  expect(clearSavedStudioNotes('guest', entry, storage)).toBe(true);
  expect(loadStudioNotes('guest', 'public:sending', storage)).toBe('');
});

describe('navigation save coordination', () => {
  it('retries the first captured purpose even after a new launch requests ordinary practice', async () => {
    const coordinator = new StudioSaveCoordinator();
    const value = input(30);
    value.launch = {
      id: 'launch:review',
      ...practiceLaunchForTask(
        {
          id: 'task:same-exercise',
          title: 'Sending practice',
          kind: 'sending',
          done: false,
          notes: '',
          createdAt: value.identity.createdAt,
        },
        'review',
      ),
    };
    const original = studioSession(value)!;
    const failedSave = vi.fn(async () => {
      throw new Error('Response lost');
    });
    await expect(coordinator.flush(original, failedSave)).rejects.toThrow('Response lost');
    value.launch = { ...value.launch, id: 'launch:assigned', purpose: 'assigned' };
    const retry = vi.fn(async (_entry: unknown) => {});
    await expect(coordinator.flush(studioSession(value), retry)).resolves.toBe('saved');
    expect(retry).toHaveBeenCalledWith(original);
    expect(retry.mock.calls[0]?.[0]).toMatchObject({
      metadata: { plannedTaskId: 'task:same-exercise', practicePurpose: 'review' },
    });
  });

  it('keeps one immutable request through concurrent navigation and an uncertain save retry', async () => {
    const coordinator = new StudioSaveCoordinator();
    const original = studioSession(input())!;
    let fail!: (reason: Error) => void;
    const save = vi.fn(
      (_entry: unknown) =>
        new Promise<void>((_resolve, reject) => {
          fail = reject;
        }),
    );
    const first = coordinator.flush(original, save);
    const second = coordinator.flush(studioSession(input(65)), save);
    expect(second).toBe(first);
    original.metadata!.scratchpad = 'Edited after the request started';
    original.minutes = 100;
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[0]).toMatchObject({ minutes: 0.5 });
    // A failed response may follow a successful server insert. The retry body must be identical.
    fail(new Error('Connection lost'));
    await expect(first).rejects.toThrow('Connection lost');
    const retry = vi.fn(async (_entry: unknown) => {});
    await expect(coordinator.flush(studioSession(input(99)), retry)).resolves.toBe('saved');
    expect(retry).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'studio:first',
        minutes: 0.5,
        metadata: expect.objectContaining({ scratchpad: 'Listen for the complete word.' }),
      }),
    );
    expect(retry.mock.calls[0]?.[0]).toEqual(save.mock.calls[0]?.[0]);
    const fresh = input(35);
    fresh.identity.id = 'studio:next';
    await coordinator.flush(studioSession(fresh), retry);
    expect(retry).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'studio:next', minutes: 35 / 60 }),
    );
  });

  it('does not persist subsecond time or carry it into the next measured block', async () => {
    const coordinator = new StudioSaveCoordinator();
    const save = vi.fn(async () => {});
    await expect(coordinator.flush(studioSession(input(0.999)), save)).resolves.toBe('short');
    expect(save).not.toHaveBeenCalled();
    await coordinator.flush(studioSession(input(30)), save);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

it('keeps short-session notes separated by account and tool, even when storage fails', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  expect(saveStudioNotes('notes-test-guest', 'words', 'Listen for CQ', storage)).toBe(true);
  expect(loadStudioNotes('notes-test-guest', 'words', storage)).toBe('Listen for CQ');
  expect(loadStudioNotes('notes-test-account', 'words', storage)).toBe('');
  expect(loadStudioNotes('notes-test-guest', 'qso', storage)).toBe('');
  expect(saveStudioNotes('notes-test-account', 'words', 'Different learner', storage)).toBe(true);
  const unavailable = {
    ...storage,
    setItem: () => {
      throw new Error('Storage denied');
    },
    removeItem: () => {
      throw new Error('Storage denied');
    },
  };
  expect(saveStudioNotes('notes-test-guest', 'words', '', unavailable)).toBe(false);
  // Stale persistent notes cannot replace the cleared in-memory value in this visit.
  expect(loadStudioNotes('notes-test-guest', 'words', unavailable)).toBe('');
  expect(saveStudioNotes('notes-test-guest', 'words', 'Unsaved on this device', unavailable)).toBe(
    false,
  );
  expect(loadStudioNotes('notes-test-guest', 'words', unavailable)).toBe('Unsaved on this device');
  expect(loadStudioNotes('notes-test-account', 'words', storage)).toBe('Different learner');
});

it('clears only the saved practice context after confirmation without relying on a mounted studio', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const scope = 'saved-note-owner';
  saveStudioNotes(scope, 'task:recording', 'Old recording notes', storage);
  saveStudioNotes(scope, 'public:words', 'Word notes', storage);
  saveStudioNotes(scope, 'public:qso', 'QSO notes', storage);
  saveStudioNotes('other-note-owner', 'task:recording', 'Private other notes', storage);
  const saved = studioSession(input())!;
  saved.metadata = { ...saved.metadata, plannedTaskId: 'task:recording' };
  expect(clearSavedStudioNotes(scope, saved, storage)).toBe(true);
  expect(loadStudioNotes(scope, 'task:recording', storage)).toBe('');
  expect(loadStudioNotes(scope, 'public:words', storage)).toBe('Word notes');
  expect(loadStudioNotes('other-note-owner', 'task:recording', storage)).toBe(
    'Private other notes',
  );
  expect(values.size).toBe(3);
  expect(clearSavedStudioNotes(scope, studioSession(input())!, storage)).toBe(true);
  expect(loadStudioNotes(scope, 'public:words', storage)).toBe('');
  expect(loadStudioNotes(scope, 'public:qso', storage)).toBe('QSO notes');
  expect(clearSavedStudioNotes(scope, { ...saved, metadata: undefined }, storage)).toBe(false);
  const taskless = input();
  taskless.launch = {
    id: 'launch:taskless-audio',
    activity: { type: 'audio', url: 'https://example.org/audio.mp3' },
  };
  saveStudioNotes(scope, taskless.launch.id, 'Taskless recording notes', storage);
  const tasklessSaved = studioSession(taskless)!;
  expect(tasklessSaved.metadata?.studioNotesContext).toBe(taskless.launch.id);
  expect(clearSavedStudioNotes(scope, tasklessSaved, storage)).toBe(true);
  expect(loadStudioNotes(scope, taskless.launch.id, storage)).toBe('');
});

it('snapshots difficult marks only for actual heard files and freezes them across save retries', async () => {
  const url = (wpm: number) => `https://cwa.cwops.org/wp-content/uploads/WD101_${wpm}.mp3`;
  const value = input(20);
  value.launch = {
    id: 'launch',
    ...practiceLaunchForTask({
      id: 'task',
      title: 'Synthetic audio',
      notes: '',
      kind: 'listening',
      done: false,
      source: 'manual',
      createdAt: '2026-09-30T12:00:00Z',
      link: url(10),
      exercise: { type: 'audio', url: url(10), characterWpm: 10 },
    }),
  };
  value.measured.recordings = [{ url: url(10), speedWpm: 10, seconds: 20 }];
  value.recordingMarks = [10, 18].map((wpm) => ({
    taskId: 'task',
    url: url(wpm),
    speedWpm: wpm,
    marks: [{ id: `mark-${wpm}`, positionSeconds: 3, label: 'Original synthetic label' }],
  }));
  const original = studioSession(value, 0)!;
  const coordinator = new StudioSaveCoordinator();
  await expect(
    coordinator.flush(original, async () => {
      throw new Error('Lost receipt');
    }),
  ).rejects.toThrow('Lost receipt');
  value.recordingMarks[0].marks[0].label = 'Later edit';
  const retry = vi.fn(async (_entry: PracticeSession) => {});
  await coordinator.flush(studioSession(value, 0), retry);
  expect(retry.mock.calls[0][0]).toEqual(original);
  const evidence = original.metadata?.evidence as { recordings: { url: string; marks: unknown }[] };
  expect(evidence.recordings).toHaveLength(1);
  expect(evidence.recordings[0].marks).toMatchObject({
    url: url(10),
    marks: [{ label: 'Original synthetic label' }],
  });
  value.recordingMarks = [{ ...value.recordingMarks[0], taskId: 'other' }];
  expect(
    (studioSession(value, 0)?.metadata?.evidence as typeof evidence).recordings[0],
  ).not.toHaveProperty('marks');
});

it('only captures deliberate nonempty notes at actual zero with no unplayed source evidence', () => {
  const value = input(0);
  value.scratchpad = '  A useful note\nwith original spacing.  ';
  const entry = studioNotesSession(value)!;
  expect(entry).toMatchObject({
    id: value.identity.id,
    minutes: 0,
    metadata: { elapsedSeconds: 0, recallSeconds: 0, scratchpad: value.scratchpad },
  });
  expect(entry.metadata?.evidence).toMatchObject({
    type: 'timed',
    measurement: { seconds: 0, recallSeconds: 0 },
    recordings: [],
  });
  expect(entry.metadata?.evidence).not.toHaveProperty('generatedListening');
  expect(entry.metadata?.wordList).toBeUndefined();
  expect(entry.characterWpm).toBeUndefined();
  expect(studioSession(value)).toBeUndefined();
  for (const scratchpad of ['', ' \n\t'])
    expect(studioNotesSession({ ...value, scratchpad })).toBeUndefined();
  for (const seconds of [-1, 0.001, 0.99, 1, 12, NaN, Infinity])
    expect(
      studioNotesSession({ ...value, measured: { ...value.measured, seconds } }),
    ).toBeUndefined();
  expect(
    studioNotesSession({ ...value, measured: { ...value.measured, running: true } }),
  ).toBeUndefined();
  expect(
    studioNotesSession({ ...value, measured: { ...value.measured, recallSeconds: 0.1 } }),
  ).toBeUndefined();
});

it('keeps assigned review provenance on zero notes without measured passes or completion', () => {
  const value = input(0);
  value.launch = {
    id: 'launch:zero-notes',
    purpose: 'review',
    task: {
      id: 'task:zero-notes',
      title: 'Synthetic assigned listening',
      kind: 'listening',
      done: false,
      notes: '',
      createdAt: value.identity.createdAt,
      exercise: {
        type: 'audio',
        url: 'https://example.test/zero.mp3',
        characterWpm: 10,
        minimumPasses: 3,
      },
    },
    activity: {
      type: 'audio',
      url: 'https://example.test/zero.mp3',
      characterWpm: 10,
      minimumPasses: 3,
    },
  };
  const entry = studioNotesSession(value)!;
  expect(entry).toMatchObject({
    minutes: 0,
    source: 'timer',
    metadata: {
      plannedTaskId: 'task:zero-notes',
      practicePurpose: 'review',
      assignedRecordingUrl: 'https://example.test/zero.mp3',
      scratchpad: value.scratchpad,
    },
  });
  expect(entry.metadata?.recordings).toBeUndefined();
  expect(entry.metadata?.recordingUrl).toBeUndefined();
  expect(entry).not.toHaveProperty('done');
});

it('freezes one notes-only identity across repeated clicks, failed acknowledgement and exact retry', async () => {
  const coordinator = new StudioSaveCoordinator();
  const original = studioNotesSession(input(0))!;
  let fail!: (reason: Error) => void;
  const save = vi.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
  );
  const first = coordinator.flush(original, save);
  expect(coordinator.flush(original, save)).toBe(first);
  await Promise.resolve();
  fail(new Error('Uncertain receipt'));
  await expect(first).rejects.toThrow('Uncertain receipt');
  const retry = vi.fn(async () => {});
  const changed = input(0);
  changed.identity.id = 'studio:different';
  changed.scratchpad = 'New notes';
  await expect(coordinator.flush(studioNotesSession(changed), retry)).resolves.toBe('saved');
  expect(retry).toHaveBeenCalledExactlyOnceWith(original);
  expect(save).toHaveBeenCalledOnce();
  await expect(coordinator.flush(undefined, retry)).resolves.toBe('short');
  expect(retry).toHaveBeenCalledOnce();
});

it.each([
  { type: 'timer' as const },
  { type: 'external' as const, url: 'https://example.test/synthetic-key' },
  {
    type: 'sending' as const,
    url: 'https://example.test/synthetic-scales',
    sections: ['warm-up' as const],
  },
])(
  'captures twelve measured assigned $type seconds without unrelated listening metadata',
  (activity) => {
    const value = input(12);
    value.launch = {
      id: 'launch:short-assigned',
      purpose: 'assigned',
      activity,
      task: {
        id: 'task:short-assigned',
        title: 'Synthetic timed assignment',
        kind: 'sending',
        targetMinutes: 1,
        done: false,
        notes: '',
        createdAt: value.identity.createdAt,
      },
    };
    const entry = studioSession(value)!;
    expect(entry).toMatchObject({
      minutes: 12 / 60,
      kind: 'sending',
      source: 'timer',
      metadata: {
        plannedTaskId: value.launch!.task!.id,
        practicePurpose: 'assigned',
        scratchpad: value.scratchpad,
        elapsedSeconds: 12,
      },
    });
    expect(entry.metadata?.evidence).not.toHaveProperty('generatedListening');
    expect(entry.metadata?.recordings).toBeUndefined();
    expect(entry.characterWpm).toBeUndefined();
    expect(value.launch!.task!.done).toBe(false);
  },
);

it('labels actual Story exposure and retains exact source evidence after an unplayed selection', () => {
  const value = input(1.234567);
  value.preferences = {
    ...value.preferences,
    tool: 'stories',
    storySettings: { ...value.preferences.storySettings, storyId: 'story-light' },
  };
  const played: GeneratedListeningSummary = {
    mode: 'story',
    storyId: 'story-trail',
    characterWpm: 28,
    effectiveWpm: 14,
    toneHz: 650,
    sentenceGapSeconds: 2,
  };
  value.generatedListening = { version: 1, summaries: [played], overflow: false };
  const saved = studioSession(value)!;
  expect(saved.notes).toBe('The trail marker (short)');
  expect(saved.minutes).toBe(1.234567 / 60);
  expect(saved.kind).toBe('listening');
  expect(saved.metadata?.evidence).toMatchObject({ generatedListening: { summaries: [played] } });
  expect(saved).not.toHaveProperty('qsoCount');
  expect(saved.metadata).not.toHaveProperty('qsoScenario');
  value.generatedListening = undefined;
  expect(studioSession(value)?.notes).toBe('Story listening');
});
