import { materialReference } from '../shared/instructor-material';
import { practiceStory } from '../shared/listening-stories';
import { dateInTimezone, validatePracticeSession, type PracticeSession } from '../shared/training';
import { taskPracticeMetadata } from '../shared/practice-attribution';
import type { PracticeLaunch } from './practice-launch';
import type { PracticePreferences } from './practice-preferences';
import type { PracticeClock } from './practice-clock';
import { WORD_LISTS } from './word-content';
import { QSO_TEMPLATES } from './qso-content';
import { recordingSpeeds } from './recording-variants';
import { formatPracticeDuration } from './practice-duration';
import { getDeviceScopeToken, isDeviceScopeCurrent } from './device-scope';
import type { GeneratedListeningEvidence } from '../shared/generated-listening';
import { recordingCompletedPasses } from '../shared/practice-evidence';
import type { RecordingMarkSet } from '../shared/recording-marks';

export const STUDIO_AUTOSAVE_SECONDS = 1;
const duration = (seconds: number) => formatPracticeDuration(seconds / 60).padStart(5, '0');

export interface StudioSessionInput {
  identity: { id: string; createdAt: string };
  measured: ReturnType<PracticeClock['snapshot']>;
  preferences: PracticePreferences;
  generatedListening?: GeneratedListeningEvidence;
  scratchpad: string;
  timezone: string;
  launch?: PracticeLaunch;
  recordingMarks?: readonly RecordingMarkSet[];
}

/** Capture the old source and its measured time before a tool/assignment changes. */
export function studioSession(
  input: StudioSessionInput,
  minimumSeconds = STUDIO_AUTOSAVE_SECONDS,
): PracticeSession | undefined {
  const { identity, measured, preferences, scratchpad, timezone, launch } = input;
  if (!Number.isFinite(measured.seconds) || measured.seconds < minimumSeconds) return undefined;
  const activity = launch?.activity;
  const assigned = Boolean(activity);
  const { tool } = preferences;
  const generatedListening = assigned || tool === 'sending' ? undefined : input.generatedListening;
  const summaries = generatedListening?.summaries ?? [];
  const first = summaries[0];
  const playedList =
    first?.mode === 'words' &&
    !generatedListening?.overflow &&
    summaries.every((item) => item.mode === 'words' && item.listId === first.listId)
      ? first.listId
      : undefined;
  const playedScenario =
    first?.mode === 'qso' &&
    !generatedListening?.overflow &&
    summaries.every((item) => item.mode === 'qso' && item.scenarioId === first.scenarioId)
      ? first.scenarioId
      : undefined;
  const playedTitles = [
    ...new Set(
      summaries.map((item) =>
        item.mode === 'words'
          ? item.listId === 'custom'
            ? 'Custom word recognition'
            : WORD_LISTS[item.listId].title
          : item.mode === 'qso'
            ? QSO_TEMPLATES.find((scenario) => scenario.id === item.scenarioId)?.title
            : item.mode === 'story'
              ? practiceStory(item.storyId).title
              : 'Free Morse practice',
      ),
    ),
  ];
  const recordings = measured.recordings.map((item) => {
    const marks = input.recordingMarks?.find(
      (set) =>
        set.taskId === launch?.task?.id && set.url === item.url && set.speedWpm === item.speedWpm,
    );
    return {
      ...structuredClone(item),
      ...recordingSpeeds(item.url),
      ...(marks ? { marks: structuredClone(marks) } : {}),
    };
  });
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
      (launch?.material ? 'sending' : undefined) ??
      launch?.task?.kind ??
      (tool === 'sending' ? 'sending' : tool === 'words' ? 'head-copy' : 'listening'),
    lesson: launch?.material?.session ?? launch?.task?.lesson,
    ...(launch?.material ? { context: launch.materialContext ?? 'practice' } : {}),
    notes: [
      launch?.material?.title ?? launch?.task?.title,
      recordings.length
        ? recordings
            .map(
              (item) =>
                `${item.speedWpm ? `${item.speedWpm} WPM` : 'Recording'}: ${duration(item.seconds)} listened${item.passes ? `; ${recordingCompletedPasses(item)} completed ${recordingCompletedPasses(item) === 1 ? 'pass' : 'passes'}` : ''}`,
            )
            .join('; ')
        : undefined,
      assigned
        ? undefined
        : tool === 'sending'
          ? 'Sending scales'
          : playedTitles.length
            ? playedTitles.join('; ')
            : tool === 'words'
              ? 'Word listening'
              : tool === 'qso'
                ? 'QSO listening'
                : tool === 'stories'
                  ? 'Story listening'
                  : 'Free Morse practice',
    ]
      .filter(Boolean)
      .join(' · '),
    minutes: measured.seconds / 60,
    ...(activity?.type === 'audio'
      ? {
          ...(playedCharacterWpm !== undefined ? { characterWpm: playedCharacterWpm } : {}),
          ...(playedEffectiveWpm !== undefined ? { effectiveWpm: playedEffectiveWpm } : {}),
        }
      : {}),
    source: assigned || tool === 'sending' ? 'timer' : 'morse',
    metadata: {
      ...(launch?.material ? { instructorMaterial: materialReference(launch.material) } : {}),
      elapsedSeconds: measured.seconds,
      ...(scratchpad ? { scratchpad } : {}),
      recallSeconds: measured.recallSeconds,
      ...(recordings.length ? { recordings } : {}),
      ...(generatedListening
        ? {
            evidence: {
              version: 1,
              type: 'timed',
              measurement: { seconds: measured.seconds, recallSeconds: measured.recallSeconds },
              recordings,
              generatedListening,
              ...(measured.wordListeningSeconds !== undefined
                ? { wordListeningSeconds: measured.wordListeningSeconds }
                : {}),
            },
          }
        : {}),
      practiceTool: assigned ? activity?.type : tool,
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
      ...(!assigned && playedList ? { wordList: playedList } : {}),
      ...(!assigned && playedScenario ? { qsoScenario: playedScenario } : {}),
      ...taskPracticeMetadata(launch?.task?.id, launch?.purpose),
      ...(assigned && !launch?.task ? { studioNotesContext: launch?.id ?? 'assigned' } : {}),
    },
  });
}

/** Zero-time notes are deliberate; normal finishing must never create empty records. */
export function studioNotesSession(input: StudioSessionInput): PracticeSession | undefined {
  if (
    input.measured.seconds !== 0 ||
    input.measured.recallSeconds !== 0 ||
    input.measured.running ||
    input.measured.recordings.length > 0 ||
    !input.scratchpad.trim()
  )
    return undefined;
  // Selected/prepared content is not heard evidence for a notes-only record.
  return studioSession({ ...input, generatedListening: undefined }, 0);
}

/** A recovered result cannot complete a different exercise currently being viewed. */
export function studioCompletionSession(
  input: StudioSessionInput,
  candidate?: PracticeSession,
): PracticeSession | undefined {
  const entry = candidate ?? studioSession(input, 0);
  if (entry && entry.metadata?.plannedTaskId !== input.launch?.task?.id)
    throw new Error(
      'This recovered round belongs to another exercise. Save or discard it before completing this exercise.',
    );
  return entry;
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
const notesMemoryTokens = new Map<string, string>();
const notesKey = (scope: string, context: string) =>
  `cwa.studio.scratchpad.v1:${JSON.stringify([scope, context])}`;

function scopedNotesContext(name: string, scope: string): string | undefined {
  if (!name.startsWith('cwa.studio.scratchpad.v1:')) return;
  try {
    const tuple = JSON.parse(name.slice('cwa.studio.scratchpad.v1:'.length)) as unknown;
    if (
      Array.isArray(tuple) &&
      tuple.length === 2 &&
      tuple[0] === scope &&
      typeof tuple[1] === 'string'
    )
      return tuple[1];
  } catch {
    /* Unregistered keys cannot claim a scope. */
  }
}

/** Includes notes kept in memory when optional persistence failed. */
export function captureStudioNotes(scope: string): { context: string; text: string }[] {
  const notes = new Map<string, string>();
  for (let index = 0; index < localStorage.length; index++) {
    const name = localStorage.key(index);
    if (!name) continue;
    const context = scopedNotesContext(name, scope);
    if (context !== undefined) notes.set(context, localStorage.getItem(name) ?? '');
  }
  for (const [name, text] of notesMemory) {
    const context = scopedNotesContext(name, scope);
    if (context !== undefined && notesMemoryTokens.get(name) === getDeviceScopeToken(scope))
      notes.set(context, text);
  }
  return [...notes]
    .filter(([, text]) => text.length > 0)
    .map(([context, text]) => ({ context, text }))
    .sort((a, b) => a.context.localeCompare(b.context));
}
export function invalidateScratchpadMemory(scope: string): void {
  for (const name of notesMemory.keys())
    if (scopedNotesContext(name, scope) !== undefined) {
      notesMemory.delete(name);
      notesMemoryTokens.delete(name);
    }
}

/** Internal rollback preserves only current owner memory, including empty tombstones. */
export function captureScratchpadMemory(scope: string): { context: string; text: string }[] {
  const token = getDeviceScopeToken(scope);
  return [...notesMemory].flatMap(([name, text]) => {
    const context = scopedNotesContext(name, scope);
    return context !== undefined && notesMemoryTokens.get(name) === token
      ? [{ context, text }]
      : [];
  });
}

/** Internal rollback restores memory-only notes after the original storage is coherent. */
export function restoreScratchpadMemory(
  scope: string,
  notes: { context: string; text: string }[],
): void {
  invalidateScratchpadMemory(scope);
  for (const { context, text } of notes) {
    const name = notesKey(scope, context);
    notesMemory.set(name, text);
    notesMemoryTokens.set(name, getDeviceScopeToken(scope));
  }
}

/** Unsaved notes remain scoped to their tool, including blocks below one second. */
export function loadStudioNotes(scope: string, context: string, storage?: NotesStorage): string {
  const key = notesKey(scope, context);
  if (notesMemory.has(key) && notesMemoryTokens.get(key) !== getDeviceScopeToken(scope)) {
    notesMemory.delete(key);
    notesMemoryTokens.delete(key);
  }
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
  deviceToken = getDeviceScopeToken(scope),
): boolean {
  if (!isDeviceScopeCurrent(scope, deviceToken)) return false;
  const key = notesKey(scope, context);
  const notes = value.slice(0, 10000);
  notesMemory.set(key, notes);
  notesMemoryTokens.set(key, deviceToken);
  try {
    const target = storage ?? localStorage;
    if (notes) target.setItem(key, notes);
    else target.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Recording notes belong to the assignment; other scratchpads finish with the saved block. */
export function settleSavedStudioNotes(
  scope: string,
  entry: PracticeSession,
  storage?: NotesStorage,
  deviceToken = getDeviceScopeToken(scope),
): boolean {
  const metadata = entry.metadata;
  const taskId = metadata?.plannedTaskId;
  const tool = metadata?.practiceTool;
  const explicitContext = metadata?.studioNotesContext;
  const context =
    typeof taskId === 'string' && taskId
      ? taskId
      : typeof tool === 'string' && ['words', 'qso', 'stories', 'free', 'sending'].includes(tool)
        ? `public:${tool}`
        : typeof explicitContext === 'string' && explicitContext
          ? explicitContext
          : undefined;
  if (!context) return false;
  const notes =
    typeof taskId === 'string' &&
    taskId &&
    tool === 'audio' &&
    typeof metadata?.scratchpad === 'string'
      ? metadata.scratchpad
      : '';
  return saveStudioNotes(scope, context, notes, storage, deviceToken);
}
