import { describe, expect, it, vi } from 'vitest';
import {
  loadStudioNotes,
  clearSavedStudioNotes,
  saveStudioNotes,
  studioSession,
  StudioSaveCoordinator,
  captureStudioNotes,
  invalidateScratchpadMemory,
  type StudioSessionInput,
} from './studio-session';
import { DEFAULT_PRACTICE_PREFERENCES } from './practice-preferences';
import {
  completeDeviceScopeMutation,
  getDeviceScopeToken,
  invalidateDeviceScope,
} from './device-scope';

function input(seconds = 30): StudioSessionInput {
  return {
    identity: { id: 'studio:first', createdAt: '2026-09-30T01:00:00.000Z' },
    measured: { seconds, recallSeconds: 0, running: false, recalling: false, recordings: [] },
    preferences: { ...DEFAULT_PRACTICE_PREFERENCES, wordList: 'common-30' },
    scratchpad: 'Listen for the complete word.',
    timezone: 'America/New_York',
  };
}

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

it('auto-saves exact measured practice from 30 seconds, without rounding a short session up', () => {
  expect(studioSession(input(29.999))).toBeUndefined();
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
  // Explicit review can still save a shorter session.
  expect(studioSession(input(1), 1)?.minutes).toBe(1 / 60);
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

  it('does not call persistence for short practice or retain its discarded time', async () => {
    const coordinator = new StudioSaveCoordinator();
    const save = vi.fn(async () => {});
    await expect(coordinator.flush(studioSession(input(29.999)), save)).resolves.toBe('short');
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
