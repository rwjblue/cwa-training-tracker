import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  AudioLines,
  CheckCheck,
  Clock3,
  Headphones,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Shuffle,
  Square,
} from 'lucide-react';
import type { PracticeSession } from '../shared/training';
import { taskPracticeMetadata } from '../shared/practice-attribution';
import type { PlannedTask } from '../shared/plan';
import {
  buildMorseTrack,
  type MorseTrack,
  cleanMorseText,
  generatePractice,
  MorsePlayer,
  WORD_LENGTHS,
  type PracticeMode,
} from './audio';
import {
  loadPracticePreferences,
  savePracticePreferences,
  normalizePracticePreferences,
  type PracticePreferences,
} from './practice-preferences';
import ListeningTrainer, { type ListeningTrainerHandle } from './ListeningTrainer';
import ListeningSoundSettings from './ListeningSoundSettings';
import MorseTranscript from './MorseTranscript';
import MorseRunnerStudio, {
  DEFAULT_RUNNER_SETTINGS,
  type MorseRunnerStudioHandle,
} from './MorseRunnerStudio';
import CopyTrainer, { type CopyTrainerHandle } from './CopyTrainer';
import SendingScales from './SendingScales';
import { loadCopyDraft } from './copy-storage';
import type { PracticeLaunch } from './practice-launch';
import RecordingSpeedSelect from './RecordingSpeedSelect';
import { preferredRecording, recordingSpeeds } from './recording-variants';
import { usePracticeClock } from './usePracticeClock';
import { MediaSessionController } from './media-session';
import {
  loadStudioNotes,
  saveStudioNotes,
  studioSession,
  StudioSaveCoordinator,
} from './studio-session';
import './practice-studio.css';
import { getDeviceScopeToken, isDeviceScopeCurrent, subscribeDeviceScope } from './device-scope';

const duration = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export default function PracticeStudio({
  onLog,
  savedVersion,
  savedOwnerId,
  savedEntry,
  launch,
  active = true,
  onBack,
  onFinish,
  onToolChange,
  onUnsavedChange,
  accountId,
  timezone,
  onSaved,
  onAutoSave,
  onTaskCompletion,
  onBeforeLeaveChange,
  onBeforeInspectChange,
}: {
  onLog: (initial?: Partial<PracticeSession>) => void;
  savedVersion: number;
  savedOwnerId?: string;
  savedEntry?: PracticeSession;
  launch?: PracticeLaunch;
  active?: boolean;
  onBack?: () => void;
  onFinish?: () => void;
  onToolChange?: (tool: PracticeLaunch['tool']) => void;
  onUnsavedChange?: (unsaved: boolean) => void;
  accountId?: string;
  timezone?: string;
  onSaved?: (entry: PracticeSession) => void;
  onAutoSave: (entry: PracticeSession) => Promise<void>;
  onTaskCompletion?: (task: PlannedTask, done: boolean) => Promise<void>;
  onBeforeLeaveChange?: (handler: (() => Promise<boolean>) | undefined) => void;
  onBeforeInspectChange?: (handler: (() => Promise<void>) | undefined) => void;
}) {
  const notesScope = accountId ?? 'guest';
  const [deviceToken] = useState(() => getDeviceScopeToken(notesScope));
  const currentDevice = () => isDeviceScopeCurrent(notesScope, deviceToken);
  const visible = useRef(active);
  visible.current = active;
  const inspecting = useRef(!active);
  const activity = launch?.activity;
  const assigned = Boolean(activity);
  const extraReview = launch?.purpose === 'review';
  const [selectedRecording, setSelectedRecording] = useState(() =>
    activity?.type === 'audio'
      ? preferredRecording(activity.url, activity.characterWpm)
      : undefined,
  );
  const recordingUrl =
    activity?.type === 'audio' ? (selectedRecording?.url ?? activity.url) : undefined;
  const recordingWpm =
    activity?.type === 'audio' ? (selectedRecording?.speedWpm ?? activity.characterWpm) : undefined;
  const selectedRecordingSpeeds = recordingSpeeds(recordingUrl);
  const [publicRunner, setPublicRunner] = useState(launch?.tool === 'runner');
  const [runnerUnsaved, setRunnerUnsaved] = useState(false);
  const [publicCopy, setPublicCopy] = useState(
    () =>
      launch?.tool === 'copy' || (!launch?.tool && Boolean(loadCopyDraft(accountId ?? 'guest'))),
  );
  const [copyUnsaved, setCopyUnsaved] = useState(false);
  const isCopy = activity?.type === 'copy' || (!assigned && publicCopy);
  const isRunner = activity?.type === 'morse-runner' || (!assigned && publicRunner);
  const automaticSave = !assigned || activity?.type === 'audio';
  const recording = useRef<HTMLAudioElement>(null);
  const recordingSession = useRef(new MediaSessionController());
  const attachRecording = useCallback((element: HTMLAudioElement | null) => {
    if (recording.current && recording.current !== element) {
      recording.current.pause();
      recordingSession.current.release();
    }
    recording.current = element;
  }, []);
  const claimRecordingSession = (audio: HTMLAudioElement) => {
    const session = recordingSession.current;
    session.claim({
      title: `${launch?.task?.lesson ? `Session ${launch.task.lesson} · ` : ''}${selectedRecording?.title ?? launch?.task?.title ?? 'Assigned recording'}`,
      album: `CW Academy practice${recordingWpm ? ` · ${recordingWpm} WPM` : ''}`,
      onPlay: () => (canPractice() ? audio.play() : undefined),
      onPause: () => audio.pause(),
      onStop: () => {
        if (!canPractice()) return;
        audio.pause();
        audio.currentTime = 0;
        session.release();
      },
      onSeek: (position) => {
        if (!canPractice()) return;
        audio.currentTime = position;
      },
      getPosition: () => ({
        duration: audio.duration,
        position: audio.currentTime,
        playbackRate: audio.playbackRate,
      }),
    });
  };
  const [freeTrack, setFreeTrack] = useState<MorseTrack | null>(null);
  const [freeWord, setFreeWord] = useState(-1);
  const preparedFree = useRef('');
  const [preferences, setPreferences] = useState(() => ({
    ...loadPracticePreferences(),
    ...(launch?.tool && launch.tool !== 'copy' && launch.tool !== 'runner'
      ? { tool: launch.tool }
      : {}),
  }));
  const { tool, mode, characterWpm, effectiveWpm, tone, volume, groupLength, wordLength } =
    preferences;
  const isSending = activity?.type === 'sending' || (!assigned && tool === 'sending');
  const [text, setText] = useState(() => {
    const initial = loadPracticePreferences();
    return initial.mode === 'custom' ? '' : generatePractice(initial.mode, initial);
  });
  const [remembered, setRemembered] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');
  const timer = usePracticeClock();
  const seconds = Math.floor(timer.seconds);
  const running = timer.running;
  const [scratchpad, setScratchpad] = useState('');
  const notesContext =
    launch?.task?.id ?? (assigned ? (launch?.id ?? 'assigned') : `public:${tool}`);
  const [notesRemembered, setNotesRemembered] = useState(true);
  const sessionIdentity = useRef<{ id: string; createdAt: string } | undefined>(undefined);
  const saveCoordinator = useRef(new StudioSaveCoordinator());
  const navigationFlight = useRef<Promise<boolean> | undefined>(undefined);
  const navigationLocked = useRef(false);
  const [savingNavigation, setSavingNavigation] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const completionFlight = useRef<Promise<boolean> | undefined>(undefined);
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [completionError, setCompletionError] = useState('');
  const saveRetryIntent = useRef<'navigation' | 'completion'>('navigation');
  const beforeLeaveRef = useRef<() => Promise<boolean>>(async () => true);
  const beforeInspectRef = useRef<() => Promise<void>>(async () => {});
  const canPractice = () =>
    currentDevice() && visible.current && !inspecting.current && !navigationLocked.current;
  const identity = () =>
    (sessionIdentity.current ??= {
      id: `studio:${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
    });
  const changeScratchpad = (value: string) => {
    if (!currentDevice()) return;
    setScratchpad(value);
    setNotesRemembered(saveStudioNotes(notesScope, notesContext, value, undefined, deviceToken));
  };
  const [timerMinutes, setTimerMinutes] = useState<number | undefined>(launch?.task?.targetMinutes);
  const timerDone = timerMinutes !== undefined && seconds >= timerMinutes * 60;
  const [confirmReset, setConfirmReset] = useState(false);
  const previousSaved = useRef(savedVersion);
  const player = useRef(new MorsePlayer());
  const attachFreeAudio = useCallback((element: HTMLAudioElement | null) => {
    if (element) player.current.attach(element);
    else {
      player.current.dispose();
      preparedFree.current = '';
    }
  }, []);
  const trainer = useRef<ListeningTrainerHandle>(null);
  const copyTrainer = useRef<CopyTrainerHandle>(null);
  const runner = useRef<MorseRunnerStudioHandle>(null);
  useEffect(() => {
    if (currentDevice()) setRemembered(savePracticePreferences(preferences));
  }, [preferences]);
  useEffect(() => {
    if (previousSaved.current !== savedVersion) {
      previousSaved.current = savedVersion;
      // History edits and late receipts from a former block must not finish the
      // current owner. Zero-time manual entries have an owner but no timer ID.
      if (
        !isCopy &&
        !isRunner &&
        savedOwnerId &&
        savedOwnerId === launch?.id &&
        (!sessionIdentity.current || savedEntry?.id === sessionIdentity.current.id)
      ) {
        pauseTimer();
        timer.reset();
        changeScratchpad('');
        sessionIdentity.current = undefined;
        saveCoordinator.current.reset();
        setConfirmReset(false);
      }
    }
  }, [savedVersion, savedOwnerId, savedEntry, launch?.id, isCopy, isRunner]);
  useEffect(() => () => player.current.dispose(), []);
  useEffect(() => {
    onUnsavedChange?.(
      savingCompletion ||
        copyUnsaved ||
        runnerUnsaved ||
        running ||
        seconds > 0 ||
        scratchpad.length > 0,
    );
  }, [savingCompletion, copyUnsaved, runnerUnsaved, running, seconds, scratchpad, onUnsavedChange]);
  useEffect(() => {
    if (!launch) return;
    resetTimer();
    setSelectedRecording(
      activity?.type === 'audio'
        ? preferredRecording(activity.url, activity.characterWpm)
        : undefined,
    );
    setPublicRunner(launch.tool === 'runner');
    setRunnerUnsaved(false);
    setPublicCopy(
      launch.tool === 'copy' || (!launch.tool && Boolean(loadCopyDraft(accountId ?? 'guest'))),
    );
    setCopyUnsaved(false);
    setTimerMinutes(launch.task?.targetMinutes);
    setCompletionError('');
    const nextTool = launch.tool;
    if (nextTool && nextTool !== 'copy' && nextTool !== 'runner')
      setPreferences((current) => ({ ...current, tool: nextTool }));
  }, [launch?.id]);
  useEffect(() => {
    setScratchpad(loadStudioNotes(notesScope, notesContext));
  }, [notesScope, notesContext]);
  const stopPlayback = () => {
    timer.pauseMedia();
    player.current.pause();
    recording.current?.pause();
    trainer.current?.stop();
    setPlaying(false);
  };
  const pauseForInspection = async () => {
    // Close the playback gate before any awaited engine acknowledgement or
    // React view update. Retain every producer's existing in-memory owner.
    inspecting.current = true;
    timer.pause();
    stopPlayback();
    trainer.current?.pauseForInspection();
    copyTrainer.current?.pauseForInspection();
    await runner.current?.pauseForInspection();
  };
  beforeInspectRef.current = pauseForInspection;
  useEffect(() => {
    onBeforeInspectChange?.(() => beforeInspectRef.current());
    return () => onBeforeInspectChange?.(undefined);
  }, [onBeforeInspectChange]);
  useEffect(() => {
    if (active) inspecting.current = false;
    else if (!inspecting.current) void pauseForInspection();
  }, [active]);
  useEffect(
    () =>
      subscribeDeviceScope((state) => {
        if (state.scope === notesScope && !currentDevice()) {
          navigationLocked.current = true;
          void pauseForInspection();
        }
      }),
    [notesScope, deviceToken],
  );
  const pauseTimer = () => {
    const elapsed = timer.pause();
    stopPlayback();
    return Math.floor(elapsed.seconds);
  };
  const startTimer = () => {
    if (!canPractice() || isRunner || isCopy || running) return;
    identity();
    setConfirmReset(false);
    timer.startManual(activity?.type === 'audio');
  };
  const resetTimer = () => {
    stopPlayback();
    timer.reset();
    sessionIdentity.current = undefined;
    saveCoordinator.current.reset();
    setConfirmReset(false);
  };
  const captureSession = (minimumSeconds = 30) =>
    studioSession(
      {
        identity: identity(),
        measured: timer.snapshot(),
        preferences,
        scratchpad,
        timezone: timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        launch,
      },
      minimumSeconds,
    );
  const logTimedSession = () => {
    if (!canPractice()) return;
    pauseTimer();
    const entry = captureSession(1);
    if (entry) onLog(entry);
  };
  const beforeLeave = (): Promise<boolean> => {
    if (!currentDevice()) return Promise.resolve(false);
    if (completionFlight.current)
      return completionFlight.current.then((saved) => saved && beforeLeaveRef.current());
    if (navigationFlight.current) return navigationFlight.current;
    if (isCopy) return Promise.resolve(true);
    if (isRunner)
      return Promise.resolve(
        !runnerUnsaved ||
          window.confirm(
            'Finish or switch Morse Runner? Your unsaved run and results will be discarded.',
          ),
      );
    if (!automaticSave) {
      pauseTimer();
      const unsaved = timer.snapshot().seconds > 0 || scratchpad.length > 0;
      return Promise.resolve(
        !unsaved ||
          window.confirm(
            'Finish or switch this practice? Unsaved time and notes will be discarded.',
          ),
      );
    }
    navigationLocked.current = true;
    setSavingNavigation(true);
    pauseTimer();
    navigationFlight.current = (async () => {
      try {
        const outcome = await saveCoordinator.current.flush(captureSession(), onAutoSave);
        if (!currentDevice()) return false;
        if (outcome === 'saved') changeScratchpad('');
        resetTimer();
        setError('');
        setSaveFailed(false);
        navigationLocked.current = false;
        return true;
      } catch (error) {
        if (!currentDevice()) return false;
        saveRetryIntent.current = 'navigation';
        setError(
          `Your session is still here. ${error instanceof Error ? error.message : 'The session could not be saved.'} Try saving again before continuing.`,
        );
        setSaveFailed(true);
        return false;
      } finally {
        if (currentDevice()) setSavingNavigation(false);
        navigationFlight.current = undefined;
      }
    })();
    return navigationFlight.current;
  };
  const changeCompletion = (done: boolean) => {
    if (!currentDevice()) return;
    const task = launch?.task;
    if (!task || !onTaskCompletion || completionFlight.current || navigationFlight.current) return;
    setSavingCompletion(true);
    setCompletionError('');
    navigationLocked.current = true;
    completionFlight.current = (async () => {
      let saveBlocked = false;
      try {
        // Completion is a learner decision. Keep only time actually measured here;
        // copy and simulator results retain their own save flow and active drafts.
        if (done && !isCopy && !isRunner) {
          pauseTimer();
          try {
            const outcome = await saveCoordinator.current.flush(captureSession(1), onAutoSave);
            if (!currentDevice()) return false;
            if (outcome === 'saved') changeScratchpad('');
            resetTimer();
            setSaveFailed(false);
            setError('');
          } catch (error) {
            saveBlocked = true;
            saveRetryIntent.current = 'completion';
            setSaveFailed(true);
            throw error;
          }
        }
        if (!currentDevice()) return false;
        await onTaskCompletion(task, done);
        if (!currentDevice()) return false;
        return true;
      } catch (error) {
        if (!currentDevice()) return false;
        setCompletionError(
          `${done ? 'Could not confirm completion.' : 'Could not confirm reopening.'} ${error instanceof Error ? error.message : 'Please try again.'}`,
        );
        return false;
      } finally {
        navigationLocked.current = saveBlocked;
        if (currentDevice()) setSavingCompletion(false);
        completionFlight.current = undefined;
      }
    })();
  };
  beforeLeaveRef.current = beforeLeave;
  useEffect(() => {
    onBeforeLeaveChange?.(() => beforeLeaveRef.current());
    return () => onBeforeLeaveChange?.(undefined);
  }, [onBeforeLeaveChange]);
  const changePreferences = (changes: Partial<PracticePreferences>, regenerate = false) => {
    if (!canPractice()) return;
    if (!('hideTrainerText' in changes)) stopPlayback();
    setError('');
    const next = normalizePracticePreferences({ ...preferences, ...changes });
    setPreferences(next);
    if (regenerate && next.mode !== 'custom') setText(generatePractice(next.mode, next));
  };
  const prepareFree = () => {
    const key = JSON.stringify([text, characterWpm, effectiveWpm, tone, volume]);
    if (preparedFree.current === key) return;
    const next = buildMorseTrack([{ text }], {
      characterWpm,
      effectiveWpm,
      frequency: tone,
      volume: volume / 100,
    });
    player.current.prepare(next, {
      title: 'Free Morse practice',
      canPlay: canPractice,
      onProgress: (progress) => setFreeWord(progress.wordIndex),
      onState: (state) => setPlaying(state === 'playing'),
      onError: (message) => {
        setError(message);
        pauseTimer();
      },
    });
    preparedFree.current = key;
    setFreeTrack(next);
  };
  const seekFree = (index: number) => {
    if (!canPractice()) return;
    try {
      prepareFree();
      player.current.seekWord(index);
      void player.current.resume().catch((error: Error) => setError(error.message));
    } catch (error) {
      setError((error as Error).message);
    }
  };
  useEffect(() => {
    player.current.clear();
    preparedFree.current = '';
    setFreeTrack(null);
    setFreeWord(-1);
  }, [text, characterWpm, effectiveWpm, tone, volume, tool]);
  const play = async () => {
    if (!canPractice()) return;
    identity();
    if (playing) {
      stopPlayback();
      return;
    }
    setError('');
    try {
      if (activity?.type === 'audio') {
        if (!recordingUrl || !recording.current)
          throw new Error(
            activity.unresolved ??
              'This recording is unavailable. Open the official exercise for alternatives.',
          );
        await recording.current.play();
        return;
      }
      if (assigned) return;
      if (isSending) return;
      if (tool !== 'free') {
        await trainer.current?.play();
        return;
      }
      prepareFree();
      await player.current.resume();
    } catch (err) {
      setError((err as Error).message);
      setPlaying(false);
      pauseTimer();
    }
  };
  const startPractice = async () => {
    if (!canPractice()) return;
    if (activity?.type === 'audio' && !recordingUrl) {
      setError(activity.unresolved ?? 'This recording is unavailable.');
      return;
    }
    if (activity?.type === 'external' && !running && seconds === 0)
      window.open(activity.url, '_blank', 'noopener,noreferrer');
    if (((assigned && activity?.type !== 'audio') || isSending) && !running) startTimer();
    if (!playing) await play();
  };
  const generate = () => {
    if (!canPractice()) return;
    stopPlayback();
    if (mode !== 'custom') setText(generatePractice(mode, preferences));
  };
  const chooseTool = (nextTool: PracticeLaunch['tool']) => {
    const current = publicCopy ? 'copy' : publicRunner ? 'runner' : tool;
    if (nextTool === current || !canPractice()) return;
    // App owns the same pause/finish/replacement flight as assignment switches.
    // A deliberate tool change receives a fresh owner; view inspection does not.
    onToolChange?.(nextTool);
  };
  const onMedia = (event: React.SyntheticEvent) => {
    if (
      !canPractice() &&
      (event.type === 'playing' || event.type === 'seeked') &&
      event.target instanceof HTMLAudioElement
    ) {
      event.target.pause();
      timer.pauseMedia();
      return;
    }
    if (event.type === 'playing') identity();
    timer.onMedia(event);
  };
  const SessionPanel = isSending ? 'details' : 'section';
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="small-line" /> TUNE IN. TAKE YOUR TIME.
          </div>
          <h1>
            {assigned
              ? extraReview
                ? 'Your extra review.'
                : 'Your assigned practice.'
              : 'Your practice studio.'}
          </h1>
          <p>
            {assigned
              ? isRunner
                ? 'Your assigned simulator settings and engine results, together.'
                : 'Your course material and practice timer, together.'
              : 'Copy practice, sending scales, word listening, QSO conversations, and simulator practice. No account required to practice.'}
          </p>
        </div>
        <span className="chip">
          <span className="status-dot" /> {assigned ? 'From your plan' : 'No sign-in needed'}
        </span>
      </div>
      {onFinish && (
        <div className="trainer-round-actions">
          <button
            className="button outline"
            disabled={savingNavigation || savingCompletion}
            onClick={onFinish}
          >
            Finish practice <ArrowRight size={14} />
          </button>
          <p className="field-hint">
            Visiting another view pauses this block and keeps it here. Return when you’re ready;
            playback stays paused.
          </p>
        </div>
      )}
      {launch?.task && (
        <div className="studio-task-context">
          <div>
            <span className="eyebrow">
              {isCopy ? 'REQUESTED EXERCISE · ' : ''}
              {extraReview ? 'EXTRA REVIEW' : 'ASSIGNED PRACTICE'}
            </span>
            <strong>{launch.task.title}</strong>
            <span>
              {launch.task.targetMinutes !== undefined &&
                `${launch.task.targetMinutes} min suggested · `}
              {isCopy
                ? 'New rounds use this exercise and purpose. A recovered round keeps its original context, shown below.'
                : extraReview
                  ? 'Saved practice counts toward your daily total and stays linked to this exercise. It does not add to the assignment’s required practice.'
                  : 'Practice as long as you need. Saved time stays linked to this exercise and contributes to assignment progress.'}
            </span>
          </div>
          {launch.task.link && (
            <a
              className="text-button"
              href={launch.task.curriculum?.sourceUrl ?? launch.task.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {launch.task.curriculum ? 'Official instructions' : 'Open exercise'}{' '}
              <ArrowRight size={14} />
            </a>
          )}
          {launch.task.notes && (
            <details className="studio-task-notes">
              <summary>Exercise instructions</summary>
              <p>{launch.task.notes}</p>
            </details>
          )}
          {activity?.type === 'copy' &&
            (activity.repetitions || activity.targetAccuracy || activity.maximumAttempts) && (
              <p className="studio-task-notes">
                Course target:{' '}
                {[
                  activity.repetitions ? `${activity.repetitions} rounds` : undefined,
                  activity.targetAccuracy ? `${activity.targetAccuracy}% accuracy` : undefined,
                  activity.maximumAttempts
                    ? `up to ${activity.maximumAttempts} attempts`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                . Each saved round keeps its own result.
              </p>
            )}
          {onTaskCompletion && (
            <div className="studio-task-completion">
              {launch.task.done ? (
                <>
                  <span className="studio-completion-status" role="status">
                    <CheckCheck size={17} /> Exercise completed
                  </span>
                  <button
                    className="text-button"
                    disabled={savingCompletion || savingNavigation}
                    onClick={() => changeCompletion(false)}
                  >
                    {savingCompletion ? 'Reopening…' : 'Reopen exercise'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="button dark"
                    disabled={savingCompletion || savingNavigation}
                    onClick={() => changeCompletion(true)}
                  >
                    <CheckCheck size={17} />
                    {savingCompletion ? 'Completing…' : 'Complete exercise'}
                  </button>
                  <p>
                    Mark it complete when you’re ready, even if you don’t need another replay. Only
                    actual practice time is logged.
                  </p>
                </>
              )}
              {completionError && (
                <p className="alert error" role="alert">
                  {completionError}
                </p>
              )}
            </div>
          )}
          {onBack && (
            <button className="text-button" onClick={onBack}>
              Back to Today <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}
      {!assigned && onToolChange && (
        <div className="studio-tool-tabs" role="group" aria-label="Studio tools">
          <button
            className={publicCopy ? 'selected' : ''}
            aria-pressed={publicCopy}
            onClick={() => chooseTool('copy')}
          >
            Copy practice
          </button>
          {(
            [
              ['words', 'Word listening'],
              ['qso', 'QSO practice'],
              ['free', 'Free practice'],
              ['sending', 'Sending practice'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={!publicRunner && !publicCopy && tool === value ? 'selected' : ''}
              aria-pressed={!publicRunner && !publicCopy && tool === value}
              onClick={() => chooseTool(value)}
            >
              {label}
            </button>
          ))}
          <button
            className={publicRunner ? 'selected' : ''}
            aria-pressed={publicRunner}
            onClick={() => chooseTool('runner')}
          >
            Morse Runner
          </button>
        </div>
      )}
      {isCopy ? (
        <CopyTrainer
          ref={copyTrainer}
          active={active}
          key={`${accountId ?? 'guest'}:${launch?.id ?? 'public-copy'}`}
          accountId={accountId}
          timezone={timezone}
          task={launch?.task}
          purpose={launch?.purpose}
          recipe={activity?.type === 'copy' ? activity.recipe : undefined}
          alternatives={activity?.type === 'copy' ? activity.alternatives : undefined}
          requiresCharacterSelection={
            activity?.type === 'copy' ? activity.requiresCharacterSelection : undefined
          }
          onLog={onLog}
          onSaved={onSaved}
          savedEntry={savedEntry}
          onUnsavedChange={setCopyUnsaved}
        />
      ) : isRunner ? (
        <MorseRunnerStudio
          ref={runner}
          active={active}
          timezone={timezone}
          key={launch?.id ?? 'public-runner'}
          settings={activity?.type === 'morse-runner' ? activity.settings : DEFAULT_RUNNER_SETTINGS}
          externalUrl={activity?.type === 'morse-runner' ? activity.url : undefined}
          task={launch?.task}
          purpose={launch?.purpose}
          savedEntry={savedEntry}
          onLog={onLog}
          onUnsavedChange={setRunnerUnsaved}
        />
      ) : (
        <>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {saveFailed && (
            <button
              className="button outline"
              disabled={savingNavigation || savingCompletion}
              onClick={() => {
                if (saveRetryIntent.current === 'completion') changeCompletion(true);
                else void beforeLeave();
              }}
            >
              {savingNavigation || savingCompletion ? 'Saving session…' : 'Retry saving session'}
            </button>
          )}
          {savingNavigation && <p role="status">Saving your practice…</p>}
          <fieldset
            className="studio-session-controls"
            disabled={savingNavigation || savingCompletion || saveFailed}
            aria-busy={savingNavigation || savingCompletion}
          >
            <div
              className={`studio-quick-actions ${isSending ? 'is-sending' : ''}`}
              role={isSending ? 'group' : undefined}
              aria-label={isSending ? 'Sending practice controls' : undefined}
            >
              <button
                className="button dark"
                disabled={activity?.type === 'audio' && !recordingUrl}
                onClick={() => (running ? pauseTimer() : void startPractice())}
              >
                {running ? <Square size={14} /> : <Play size={14} />}
                {activity?.type === 'audio' && !recordingUrl
                  ? 'Recording unavailable'
                  : running
                    ? 'Pause practice'
                    : seconds > 0
                      ? 'Resume practice'
                      : 'Start practice'}
              </button>
              <span aria-label={isSending ? `${duration(seconds)} elapsed` : undefined}>
                <strong>{duration(seconds)}</strong>{' '}
                <span className={`field-hint ${isSending ? 'sending-timer-status' : ''}`}>
                  {running ? 'timing' : seconds > 0 ? 'unsaved' : 'elapsed'}
                </span>
              </span>
              <button
                className="button outline"
                disabled={seconds < 1}
                onClick={logTimedSession}
                aria-label={
                  isSending
                    ? `Review & save ${seconds > 0 ? duration(seconds) : 'session'}`
                    : undefined
                }
              >
                Review &amp; save <ArrowRight size={14} />
              </button>
            </div>
            <div
              className={`practice-layout ${assigned ? 'is-assigned' : ''} ${isSending ? 'is-sending' : ''}`}
            >
              <section
                className="card studio-card"
                onPlayingCapture={onMedia}
                onTimeUpdateCapture={onMedia}
                onPauseCapture={onMedia}
                onEndedCapture={onMedia}
                onSeekingCapture={onMedia}
                onSeekedCapture={onMedia}
                onWaitingCapture={onMedia}
                onEmptiedCapture={onMedia}
                onRateChangeCapture={onMedia}
                onErrorCapture={onMedia}
              >
                <div className="section-heading">
                  <div>
                    <h2>
                      {isSending
                        ? 'Your sending practice'
                        : assigned
                          ? 'Your assigned exercise'
                          : 'The listening room'}
                    </h2>
                    <p>
                      {isSending
                        ? 'Keep your key, practice text, and timer together.'
                        : assigned
                          ? 'Practice this material, then save your time.'
                          : 'Hear the sound. Let the letters follow.'}
                    </p>
                  </div>
                  {isSending ? <Radio size={23} /> : <Headphones size={23} />}
                </div>
                {activity?.type === 'audio' ? (
                  <div className="assigned-recording">
                    <p>
                      {recordingWpm
                        ? `${recordingWpm} WPM${recordingWpm !== activity.characterWpm && activity.characterWpm ? ` selected (${activity.characterWpm} assigned)` : ''} · `
                        : ''}
                      {selectedRecordingSpeeds
                        ? `${selectedRecordingSpeeds.characterWpm} character / ${selectedRecordingSpeeds.effectiveWpm} effective WPM · `
                        : ''}
                      {activity.minimumPasses
                        ? `${activity.minimumPasses}${activity.maximumPasses && activity.maximumPasses !== activity.minimumPasses ? `–${activity.maximumPasses}` : ''} listening passes assigned.`
                        : 'Listen at the recording’s original speed.'}
                    </p>
                    {recordingUrl ? (
                      <>
                        <audio
                          key={`${launch?.id}:${recordingUrl}`}
                          ref={attachRecording}
                          controls
                          preload="metadata"
                          src={recordingUrl}
                          aria-label="Assigned recording"
                          data-recording="true"
                          data-speed={recordingWpm}
                          controlsList="noplaybackrate"
                          onRateChange={(event) => {
                            if (event.currentTarget.playbackRate !== 1)
                              event.currentTarget.playbackRate = 1;
                            recordingSession.current.updatePosition();
                          }}
                          onPlay={(event) => {
                            if (canPractice()) setPlaying(true);
                            else event.currentTarget.pause();
                          }}
                          onPlaying={(event) => {
                            if (canPractice() && !event.currentTarget.paused)
                              claimRecordingSession(event.currentTarget);
                          }}
                          onTimeUpdate={() => recordingSession.current.updatePosition()}
                          onLoadedMetadata={() => recordingSession.current.updatePosition()}
                          onDurationChange={() => recordingSession.current.updatePosition()}
                          onSeeked={() => recordingSession.current.updatePosition()}
                          onPause={() => {
                            setPlaying(false);
                            recordingSession.current.setPlaybackState('paused');
                          }}
                          onEnded={() => {
                            setPlaying(false);
                            recordingSession.current.release();
                          }}
                          onError={() => {
                            setError(
                              'The recording could not load. Open the official exercise to check its availability.',
                            );
                            pauseTimer();
                            recordingSession.current.release();
                          }}
                        />
                        {activity.url && (
                          <RecordingSpeedSelect
                            assignedUrl={activity.url}
                            assignedWpm={activity.characterWpm}
                            selectedUrl={recordingUrl}
                            onChange={(variant) => {
                              pauseTimer();
                              setSelectedRecording(variant);
                              setError('');
                            }}
                          />
                        )}
                        <p className="field-hint">
                          The recording plays directly from CWops. You can pause, seek, and use your
                          device’s audio controls.
                        </p>
                      </>
                    ) : (
                      <p role="status">
                        {activity.unresolved ?? 'This recording is not currently available.'}
                      </p>
                    )}
                    {recordingUrl && (
                      <a
                        className="text-button"
                        href={recordingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open recording <ArrowRight size={14} />
                      </a>
                    )}
                  </div>
                ) : isSending ? (
                  <SendingScales
                    key={launch?.id ?? 'public-sending'}
                    sections={activity?.type === 'sending' ? activity.sections : undefined}
                  />
                ) : assigned ? (
                  <div className="assigned-offline">
                    <p>
                      {activity?.type === 'external'
                        ? 'Start practice opens the assigned tool in a new tab and starts your timer here.'
                        : 'Use your key, radio, or other practice material. The timer keeps your time linked to this exercise.'}
                    </p>
                  </div>
                ) : tool !== 'free' ? (
                  <ListeningTrainer
                    ref={trainer}
                    active={active}
                    key={tool}
                    preferences={preferences}
                    onChange={changePreferences}
                    soundSettings={
                      <ListeningSoundSettings
                        preferences={preferences}
                        onChange={changePreferences}
                        remembered={remembered}
                      />
                    }
                    onPlaying={setPlaying}
                    onError={(message) => {
                      pauseTimer();
                      setError(message);
                    }}
                  />
                ) : (
                  <>
                    <div className="practice-tabs" role="group" aria-label="Practice content">
                      {[
                        ['words', 'Words'],
                        ['groups', 'Letter groups'],
                        ['numbers', 'Numbers'],
                        ['callsigns', 'Callsigns'],
                        ['custom', 'Your text'],
                      ].map(([value, label]) => (
                        <button
                          className={mode === value ? 'selected' : ''}
                          key={value}
                          aria-pressed={mode === value}
                          onClick={() => changePreferences({ mode: value as PracticeMode }, true)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    {(mode === 'groups' || mode === 'numbers' || mode === 'words') && (
                      <div className="practice-generator-controls">
                        {mode === 'words' ? (
                          <label htmlFor="practice-word-length">
                            Word length
                            <select
                              id="practice-word-length"
                              value={wordLength}
                              onChange={(e) =>
                                changePreferences(
                                  {
                                    wordLength:
                                      e.target.value === 'mixed'
                                        ? 'mixed'
                                        : (Number(
                                            e.target.value,
                                          ) as PracticePreferences['wordLength']),
                                  },
                                  true,
                                )
                              }
                            >
                              <option value="mixed">Mixed lengths · 2–8 letters</option>
                              {WORD_LENGTHS.map((length) => (
                                <option key={length} value={length}>
                                  Exactly {length} letters
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <label htmlFor="practice-group-length">
                            {mode === 'numbers' ? 'Digits per group' : 'Letters per group'}
                            <select
                              id="practice-group-length"
                              value={groupLength}
                              onChange={(e) =>
                                changePreferences({ groupLength: Number(e.target.value) }, true)
                              }
                            >
                              {Array.from({ length: 10 }, (_, index) => index + 1).map((length) => (
                                <option key={length} value={length}>
                                  {length}{' '}
                                  {mode === 'numbers'
                                    ? length === 1
                                      ? 'digit'
                                      : 'digits'
                                    : length === 1
                                      ? 'letter'
                                      : 'letters'}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <p>
                          {mode === 'words'
                            ? 'Twelve real words from a varied everyday vocabulary. Changing the length creates a fresh set.'
                            : `Twelve random ${mode === 'numbers' ? 'number' : 'letter'} groups. Changing the group length creates a fresh set.`}
                        </p>
                      </div>
                    )}
                    {mode === 'callsigns' && (
                      <p className="practice-generator-note">
                        These are fictional, randomly generated practice examples. They may happen
                        to match real callsigns; they are not a directory of operators.
                      </p>
                    )}
                    <div className="transmission-panel">
                      <div className="transmission-label">
                        <span>
                          <i className={playing ? 'pulse-dot' : ''} />{' '}
                          {playing ? 'TRANSMITTING' : 'READY TO LISTEN'}
                        </span>
                        <button onClick={() => setHidden(!hidden)}>
                          {hidden ? 'Reveal text' : 'Hide text'}
                        </button>
                      </div>
                      <label className="sr-only" htmlFor="practice-text">
                        Practice text
                      </label>
                      {hidden ? (
                        <div className="hidden-transmission">
                          <AudioLines size={30} />
                          <span>Trust your ears.</span>
                          <button onClick={() => setHidden(false)}>Reveal when you’re ready</button>
                        </div>
                      ) : (
                        <textarea
                          id="practice-text"
                          value={text}
                          maxLength={1200}
                          onChange={(e) => {
                            stopPlayback();
                            setText(e.target.value);
                            setPreferences((current) => ({ ...current, mode: 'custom' }));
                          }}
                          spellCheck={false}
                          placeholder="Enter letters, numbers, or text to practice…"
                          aria-describedby="morse-text-help"
                        />
                      )}
                      <div className={`waveform ${playing ? 'is-playing' : ''}`} aria-hidden="true">
                        {Array.from({ length: 72 }, (_, i) => (
                          <i
                            key={i}
                            style={
                              {
                                '--height': `${[10, 18, 8, 31, 44, 22, 12, 36, 16, 28, 7, 20][i % 12]}px`,
                                '--delay': `${i * 0.035}s`,
                              } as React.CSSProperties
                            }
                          />
                        ))}
                      </div>
                    </div>
                    <p id="morse-text-help" className="field-hint">
                      Letters, numbers, and common punctuation. Unsupported characters are skipped.
                    </p>
                    <div className="native-morse-player" hidden={!freeTrack}>
                      <audio
                        ref={attachFreeAudio}
                        controls
                        preload="metadata"
                        aria-label="Practice audio"
                      />
                    </div>
                    {freeTrack && !hidden && (
                      <MorseTranscript track={freeTrack} activeWord={freeWord} onSeek={seekFree} />
                    )}
                  </>
                )}
                {!assigned && !isSending && (
                  <div className="playback-toolbar">
                    <button
                      className="button dark play-button"
                      onClick={play}
                      disabled={tool === 'free' && !cleanMorseText(text)}
                    >
                      {playing ? (
                        <Square size={16} fill="currentColor" />
                      ) : (
                        <Play size={16} fill="currentColor" />
                      )}
                      {playing ? 'Stop playback' : 'Play Morse'}
                    </button>
                    {tool === 'free' && (
                      <button
                        className="button outline"
                        onClick={() => generate()}
                        disabled={mode === 'custom'}
                      >
                        <Shuffle size={16} /> New set
                      </button>
                    )}
                    <span className="playback-note">
                      {characterWpm} / {effectiveWpm} WPM <span>·</span> {tone} Hz
                    </span>
                  </div>
                )}
                <p className="studio-playback-help">
                  {isSending
                    ? 'Use your key to send the displayed patterns. Start practice counts your time here; changing sections keeps the same session running.'
                    : assigned
                      ? activity?.type === 'audio'
                        ? 'Press Play in the audio controls to count listening time. Pauses and seeks do not add time. Use the recall timer for focused notes between listens.'
                        : 'Start practice times this exercise. Review and save your elapsed time when you finish.'
                      : 'Playing audio automatically counts listening time. Pauses and seeks do not add time; use the timer for practice away from the player.'}
                </p>
                <div className="studio-scratchpad">
                  <label className="field" htmlFor="practice-scratchpad">
                    Scratchpad
                    <textarea
                      id="practice-scratchpad"
                      rows={5}
                      maxLength={10000}
                      value={scratchpad}
                      onChange={(event) => changeScratchpad(event.target.value)}
                      placeholder={
                        isSending
                          ? 'Note difficult characters, spacing, or patterns to revisit…'
                          : 'Jot down what you hear, difficult words, or details to revisit…'
                      }
                      aria-describedby="scratchpad-help"
                    />
                  </label>
                  <p id="scratchpad-help" className="field-hint">
                    {notesRemembered
                      ? 'Included with saved practice. Notes from sessions under 30 seconds stay on this device for this tool.'
                      : 'Included with saved practice. Your browser cannot store notes; unsaved notes last until you reload.'}
                  </p>
                </div>
                {isSending && (
                  <p className="sending-save-help">
                    {automaticSave
                      ? `Inspect other views without saving. Finish practice or switch tools to save 30 seconds or more${accountId ? ' to your log' : ' on this device'}; Review & save includes shorter practice.`
                      : 'Inspect other views without saving. Review & save before finishing or switching to keep your time linked to this exercise.'}
                  </p>
                )}
                {!assigned && tool === 'free' && (
                  <ListeningSoundSettings
                    preferences={preferences}
                    onChange={changePreferences}
                    remembered={remembered}
                  />
                )}
              </section>
              <div className={`practice-aside ${isSending ? 'is-sending' : ''}`}>
                <SessionPanel className={`card timer-card ${isSending ? 'is-sending' : ''}`}>
                  {isSending && <summary>Session options and logging</summary>}
                  {!isSending && (
                    <>
                      <div className="card-top">
                        <span className="eyebrow">A MOMENT FOR MORSE</span>
                        <Clock3 size={18} />
                      </div>
                      <h2>Time your practice.</h2>
                      <p>
                        Audio playback counts automatically. Use the timer for{' '}
                        {activity?.type === 'audio' ? 'focused recall and notes' : 'other practice'}
                        , then review and save.
                      </p>
                      <div className="studio-timer-steps" aria-label="How to log timed practice">
                        <span>1. Play or start timer</span>
                        <span>2. Practice</span>
                        <span>3. Save session</span>
                      </div>
                      <div className={`timer-readout ${running ? 'running' : ''}`} aria-live="off">
                        {duration(seconds)}
                      </div>
                    </>
                  )}
                  <details className="studio-time-goal">
                    <summary>
                      {timerMinutes === undefined
                        ? 'Optional time goal'
                        : `${timerMinutes} min suggested goal`}
                    </summary>
                    <p className="field-hint">
                      A reminder you can change or skip. Completion is up to you.
                    </p>
                    <div className="timer-presets" role="group" aria-label="Optional time goal">
                      <button
                        className={timerMinutes === undefined ? 'selected' : ''}
                        aria-pressed={timerMinutes === undefined}
                        onClick={() => setTimerMinutes(undefined)}
                      >
                        No goal
                      </button>
                      {[
                        ...new Set([
                          5,
                          10,
                          15,
                          30,
                          ...(launch?.task?.targetMinutes !== undefined
                            ? [launch.task.targetMinutes]
                            : []),
                        ]),
                      ]
                        .sort((a, b) => a - b)
                        .map((minutes) => (
                          <button
                            key={minutes}
                            className={timerMinutes === minutes ? 'selected' : ''}
                            aria-pressed={timerMinutes === minutes}
                            onClick={() => setTimerMinutes(minutes)}
                          >
                            {minutes} min
                          </button>
                        ))}
                    </div>
                  </details>
                  {!isSending && (
                    <>
                      <button
                        className="button dark full"
                        onClick={() => (running ? pauseTimer() : startTimer())}
                      >
                        {running ? <Square size={14} /> : <Play size={14} />}
                        {running
                          ? 'Pause timer'
                          : activity?.type === 'audio'
                            ? 'Start recall timer'
                            : seconds > 0
                              ? 'Resume timer'
                              : 'Start timer'}
                      </button>
                      <p className="timer-elapsed">
                        <strong>{duration(seconds)}</strong> practiced ·{' '}
                        {running
                          ? timer.recalling
                            ? 'recall timer running'
                            : playing
                              ? 'listening'
                              : 'timer running'
                          : seconds > 0
                            ? 'paused, not yet saved'
                            : 'ready when you are'}
                      </p>
                      {timer.recallSeconds > 0 && (
                        <p className="field-hint">
                          Includes {duration(Math.floor(timer.recallSeconds))} of focused recall.
                        </p>
                      )}
                      <button
                        className="button outline full studio-save-session"
                        disabled={seconds < 1}
                        onClick={logTimedSession}
                      >
                        Review &amp; save {seconds > 0 ? duration(seconds) : 'session'}{' '}
                        <ArrowRight size={14} />
                      </button>
                      <p className="studio-save-help">
                        {automaticSave
                          ? `Inspect other views without saving. Finish practice or switch tools to save 30 seconds or more${accountId ? ' to your log' : ' on this device'}. Review & save includes shorter practice.`
                          : launch?.task && onTaskCompletion
                            ? 'Review your measured time before saving, or choose Complete exercise to save it and mark this exercise done.'
                            : 'This opens a practice entry for you to review. Nothing is added to your log until you choose Save practice.'}
                      </p>
                    </>
                  )}
                  <div className="timer-secondary">
                    <button
                      className="text-button"
                      disabled={running && seconds < 1}
                      onClick={() => {
                        if (seconds > 0 || scratchpad.length > 0) {
                          pauseTimer();
                          setConfirmReset(true);
                        } else resetTimer();
                      }}
                    >
                      <RotateCcw size={13} /> Reset session
                    </button>
                  </div>
                  {confirmReset && (
                    <div
                      className="studio-reset-confirm"
                      role="group"
                      aria-label="Confirm timer reset"
                    >
                      <p>
                        Discard {duration(seconds)} of unsaved time
                        {scratchpad ? ' and your scratchpad' : ''}?
                      </p>
                      <div>
                        <button className="text-button" onClick={() => setConfirmReset(false)}>
                          Keep timer
                        </button>
                        <button
                          className="text-button danger-text"
                          onClick={() => {
                            resetTimer();
                            changeScratchpad('');
                          }}
                        >
                          Discard &amp; reset
                        </button>
                      </div>
                    </div>
                  )}
                  {timerDone && !isSending && (
                    <div className="timer-complete" role="status">
                      <CheckCheck size={18} /> Suggested time reached. Keep practicing as long as
                      you need.
                    </div>
                  )}
                  <p className="studio-timer-scope">
                    {!isSending &&
                      'Listening time follows the audio, including when your screen locks. '}
                    {automaticSave
                      ? 'Practice under 30 seconds is not logged automatically. Review and save before reloading to keep unfinished time.'
                      : 'Review and save before finishing or switching to keep your practice time.'}
                  </p>
                  <div className="studio-manual-log">
                    <h3>Already practiced?</h3>
                    <p>Enter time from a recording, your key, or a session away from the studio.</p>
                    <button
                      className="text-button"
                      onClick={() => {
                        if (pauseTimer() > 0) {
                          logTimedSession();
                          return;
                        }
                        onLog({
                          kind: launch?.task?.kind ?? (isSending ? 'sending' : 'listening'),
                          lesson: launch?.task?.lesson,
                          notes: launch?.task?.title,
                          ...(!assigned && !isSending
                            ? { characterWpm, effectiveWpm }
                            : activity?.type === 'audio'
                              ? selectedRecordingSpeeds
                              : {}),
                          source: 'manual',
                          metadata: {
                            ...taskPracticeMetadata(launch?.task?.id, launch?.purpose),
                            ...(assigned
                              ? { studioNotesContext: notesContext }
                              : { practiceTool: tool }),
                            ...(scratchpad ? { scratchpad } : {}),
                          },
                        });
                      }}
                    >
                      <Plus size={14} /> Log practice manually
                    </button>
                  </div>
                </SessionPanel>
                {!isSending && (
                  <section className="practice-tip">
                    <span className="eyebrow">A NOTE FROM THE SHACK</span>
                    <h3>Listen for the music.</h3>
                    <p>
                      Try hearing each character as one complete sound, rather than counting dots
                      and dashes. Leave a little space. Let it sink in.
                    </p>
                    <div className="morse-word" aria-label="73 in Morse code">
                      − − · · · &nbsp; · · · − −
                    </div>
                  </section>
                )}
              </div>
            </div>
            {isSending && timerDone && (
              <div className="timer-complete" role="status">
                <CheckCheck size={18} /> Suggested time reached. Keep practicing as long as you
                need.
              </div>
            )}
          </fieldset>
        </>
      )}
    </>
  );
}
