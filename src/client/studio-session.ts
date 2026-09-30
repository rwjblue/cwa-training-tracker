import { dateInTimezone, validatePracticeSession, type PracticeSession } from '../shared/training';
import type { PracticeLaunch } from './practice-launch';
import type { PracticePreferences } from './practice-preferences';
import type { PracticeClock } from './practice-clock';
import { WORD_LISTS } from './word-content';
import { QSO_TEMPLATES } from './qso-content';
import { recordingSpeeds } from './recording-variants';
import { formatPracticeDuration } from './practice-duration';

export const STUDIO_AUTOSAVE_SECONDS = 30;
const duration = (seconds: number) => formatPracticeDuration(seconds / 60).padStart(5, '0');

export interface StudioSessionInput {
  identity: { id: string; createdAt: string };
  measured: ReturnType<PracticeClock['snapshot']>;
  preferences: PracticePreferences;
  scratchpad: string;
  timezone: string;
  launch?: PracticeLaunch;
}

/** Capture the old source and its measured time before a tool/assignment changes. */
export function studioSession(
  input: StudioSessionInput,
  minimumSeconds = STUDIO_AUTOSAVE_SECONDS,
): PracticeSession | undefined {
  const { identity, measured, preferences, scratchpad, timezone, launch } = input;
  if (measured.seconds < minimumSeconds) return undefined;
  const activity = launch?.activity;
  const assigned = Boolean(activity);
  const { tool, mode, characterWpm, effectiveWpm } = preferences;
  const recordings = measured.recordings.map((item) => ({
    ...item,
    ...recordingSpeeds(item.url),
  }));
  const sharedSpeed = (key: 'characterWpm' | 'effectiveWpm') => {
    const speeds = new Set(recordings.map((item) => item[key]));
    return speeds.size === 1 ? [...speeds][0] : undefined;
  };
  const playedCharacterWpm = sharedSpeed('characterWpm');
  const playedEffectiveWpm = sharedSpeed('effectiveWpm');
  const assignedSpeeds = activity?.type === 'audio' ? recordingSpeeds(activity.url) : undefined;
  return validatePracticeSession({
    ...identity,
    date: dateInTimezone(identity.createdAt, timezone),
    kind:
      launch?.task?.kind ??
      (tool === 'sending' ? 'sending' : tool === 'words' ? 'head-copy' : 'listening'),
    lesson: launch?.task?.lesson,
    notes: [
      launch?.task?.title,
      recordings.length
        ? recordings
            .map(
              (item) =>
                `${item.speedWpm ? `${item.speedWpm} WPM` : 'Recording'}: ${duration(item.seconds)} listened`,
            )
            .join('; ')
        : undefined,
      assigned
        ? undefined
        : tool === 'words'
          ? preferences.wordList === 'custom'
            ? 'Custom word recognition'
            : WORD_LISTS[preferences.wordList].title
          : tool === 'sending'
            ? 'Sending scales'
            : tool === 'qso'
              ? QSO_TEMPLATES.find((item) => item.id === preferences.qsoScenario)?.title
              : undefined,
    ]
      .filter(Boolean)
      .join(' · '),
    minutes: measured.seconds / 60,
    ...(!assigned && tool !== 'sending'
      ? { characterWpm, effectiveWpm }
      : activity?.type === 'audio'
        ? {
            ...(playedCharacterWpm !== undefined ? { characterWpm: playedCharacterWpm } : {}),
            ...(playedEffectiveWpm !== undefined ? { effectiveWpm: playedEffectiveWpm } : {}),
          }
        : {}),
    source: assigned || tool === 'sending' ? 'timer' : 'morse',
    metadata: {
      elapsedSeconds: measured.seconds,
      ...(scratchpad ? { scratchpad } : {}),
      recallSeconds: measured.recallSeconds,
      ...(recordings.length ? { recordings } : {}),
      practiceTool: assigned ? activity?.type : tool,
      ...(!assigned && tool !== 'sending' ? { practiceMode: mode } : {}),
      ...(activity?.type === 'audio'
        ? {
            assignedRecordingUrl: activity.url,
            assignedSpeedWpm: activity.characterWpm,
            ...(assignedSpeeds
              ? {
                  assignedCharacterWpm: assignedSpeeds.characterWpm,
                  assignedEffectiveWpm: assignedSpeeds.effectiveWpm,
                }
              : {}),
            ...(measured.recordings.length === 1
              ? { recordingUrl: measured.recordings[0].url }
              : {}),
          }
        : {}),
      ...(!assigned && tool === 'words' ? { wordList: preferences.wordList } : {}),
      ...(!assigned && tool === 'qso' ? { qsoScenario: preferences.qsoScenario } : {}),
      ...(launch?.task ? { plannedTaskId: launch.task.id } : {}),
      ...(assigned && !launch?.task ? { studioNotesContext: launch?.id ?? 'assigned' } : {}),
    },
  });
}

/** One immutable body and one in-flight request cover repeated navigation and retry. */
export class StudioSaveCoordinator {
  private pending?: PracticeSession;
  private inFlight?: Promise<'saved' | 'short'>;

  flush(
    candidate: PracticeSession | undefined,
    save: (entry: PracticeSession) => Promise<void>,
  ): Promise<'saved' | 'short'> {
    if (this.inFlight) return this.inFlight;
    if (!this.pending && candidate) this.pending = structuredClone(candidate);
    const entry = this.pending;
    if (!entry) return Promise.resolve('short');
    this.inFlight = Promise.resolve()
      .then(() => save(entry))
      .then(() => {
        this.pending = undefined;
        return 'saved' as const;
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }

  reset() {
    if (!this.inFlight) this.pending = undefined;
  }
}

type NotesStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const notesMemory = new Map<string, string>();
const notesKey = (scope: string, context: string) =>
  `cwa.studio.scratchpad.v1:${JSON.stringify([scope, context])}`;

/** Short sessions do not become log entries; their notes remain scoped to their tool. */
export function loadStudioNotes(scope: string, context: string, storage?: NotesStorage): string {
  const key = notesKey(scope, context);
  if (notesMemory.has(key)) return notesMemory.get(key)!;
  try {
    const value = (storage ?? localStorage).getItem(key);
    if (value !== null && value.length <= 10000) return value;
  } catch {
    /* The in-memory copy still survives app navigation. */
  }
  return notesMemory.get(key) ?? '';
}

export function saveStudioNotes(
  scope: string,
  context: string,
  value: string,
  storage?: NotesStorage,
): boolean {
  const key = notesKey(scope, context);
  const notes = value.slice(0, 10000);
  notesMemory.set(key, notes);
  try {
    const target = storage ?? localStorage;
    if (notes) target.setItem(key, notes);
    else target.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Clear the original scratchpad after confirmation, even if its studio has unmounted. */
export function clearSavedStudioNotes(
  scope: string,
  entry: PracticeSession,
  storage?: NotesStorage,
): boolean {
  const metadata = entry.metadata;
  const taskId = metadata?.plannedTaskId;
  const tool = metadata?.practiceTool;
  const explicitContext = metadata?.studioNotesContext;
  const context =
    typeof taskId === 'string' && taskId
      ? taskId
      : typeof tool === 'string' && ['words', 'qso', 'free', 'sending'].includes(tool)
        ? `public:${tool}`
        : typeof explicitContext === 'string' && explicitContext
          ? explicitContext
          : undefined;
  if (!context) return false;
  return saveStudioNotes(scope, context, '', storage);
}
