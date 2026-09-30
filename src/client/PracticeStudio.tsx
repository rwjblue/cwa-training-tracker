import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  AudioLines,
  CheckCheck,
  Clock3,
  Headphones,
  Play,
  Plus,
  RotateCcw,
  Shuffle,
  Square,
} from 'lucide-react';
import type { PracticeSession } from '../shared/training';
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
import MorseRunnerStudio, { DEFAULT_RUNNER_SETTINGS } from './MorseRunnerStudio';
import CopyTrainer from './CopyTrainer';
import { loadCopyDraft } from './copy-storage';
import type { PracticeLaunch } from './practice-launch';
import RecordingSpeedSelect from './RecordingSpeedSelect';
import { preferredRecording } from './recording-variants';
import { usePracticeClock } from './usePracticeClock';
import { MediaSessionController } from './media-session';
import {
  loadStudioNotes,
  saveStudioNotes,
  studioSession,
  StudioSaveCoordinator,
} from './studio-session';
import './practice-studio.css';

const duration = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export default function PracticeStudio({
  onLog,
  savedVersion,
  savedEntry,
  launch,
  onBack,
  onUnsavedChange,
  accountId,
  timezone,
  onSaved,
  onAutoSave,
  onBeforeLeaveChange,
}: {
  onLog: (initial?: Partial<PracticeSession>) => void;
  savedVersion: number;
  savedEntry?: PracticeSession;
  launch?: PracticeLaunch;
  onBack?: () => void;
  onUnsavedChange?: (unsaved: boolean) => void;
  accountId?: string;
  timezone?: string;
  onSaved?: (entry: PracticeSession) => void;
  onAutoSave: (entry: PracticeSession) => Promise<void>;
  onBeforeLeaveChange?: (handler: (() => Promise<boolean>) | undefined) => void;
}) {
  const activity = launch?.activity;
  const assigned = Boolean(activity);
  const [selectedRecording, setSelectedRecording] = useState(() =>
    activity?.type === 'audio'
      ? preferredRecording(activity.url, activity.characterWpm)
      : undefined,
  );
  const recordingUrl =
    activity?.type === 'audio' ? (selectedRecording?.url ?? activity.url) : undefined;
  const recordingWpm =
    activity?.type === 'audio' ? (selectedRecording?.speedWpm ?? activity.characterWpm) : undefined;
  const [publicRunner, setPublicRunner] = useState(false);
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
      onPlay: () => audio.play(),
      onPause: () => audio.pause(),
      onStop: () => {
        audio.pause();
        audio.currentTime = 0;
        session.release();
      },
      onSeek: (position) => {
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
    ...(launch?.tool && launch.tool !== 'copy' ? { tool: launch.tool } : {}),
  }));
  const { tool, mode, characterWpm, effectiveWpm, tone, volume, groupLength, wordLength } =
    preferences;
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
  const notesScope = accountId ?? 'guest';
  const notesContext =
    launch?.task?.id ?? (assigned ? (launch?.id ?? 'assigned') : `public:${tool}`);
  const [notesRemembered, setNotesRemembered] = useState(true);
  const sessionIdentity = useRef<{ id: string; createdAt: string } | undefined>(undefined);
  const saveCoordinator = useRef(new StudioSaveCoordinator());
  const navigationFlight = useRef<Promise<boolean> | undefined>(undefined);
  const navigationLocked = useRef(false);
  const [savingNavigation, setSavingNavigation] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const beforeLeaveRef = useRef<() => Promise<boolean>>(async () => true);
  const identity = () =>
    (sessionIdentity.current ??= {
      id: `studio:${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
    });
  const changeScratchpad = (value: string) => {
    setScratchpad(value);
    setNotesRemembered(saveStudioNotes(notesScope, notesContext, value));
  };
  const [timerMinutes, setTimerMinutes] = useState(launch?.task?.targetMinutes ?? 15);
  const timerDone = seconds >= timerMinutes * 60;
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
  useEffect(() => {
    setRemembered(savePracticePreferences(preferences));
  }, [preferences]);
  useEffect(() => {
    if (previousSaved.current !== savedVersion) {
      timer.reset();
      changeScratchpad('');
      sessionIdentity.current = undefined;
      saveCoordinator.current.reset();
      setConfirmReset(false);
      previousSaved.current = savedVersion;
    }
  }, [savedVersion]);
  useEffect(() => () => player.current.dispose(), []);
  useEffect(() => {
    onUnsavedChange?.(
      copyUnsaved || runnerUnsaved || running || seconds > 0 || scratchpad.length > 0,
    );
  }, [copyUnsaved, runnerUnsaved, running, seconds, scratchpad, onUnsavedChange]);
  useEffect(() => {
    if (!launch) return;
    resetTimer();
    setSelectedRecording(
      activity?.type === 'audio'
        ? preferredRecording(activity.url, activity.characterWpm)
        : undefined,
    );
    setPublicRunner(false);
    setRunnerUnsaved(false);
    setPublicCopy(
      launch.tool === 'copy' || (!launch.tool && Boolean(loadCopyDraft(accountId ?? 'guest'))),
    );
    setCopyUnsaved(false);
    setTimerMinutes(launch.task?.targetMinutes ?? 15);
    const nextTool = launch.tool;
    if (nextTool && nextTool !== 'copy')
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
  const pauseTimer = () => {
    const elapsed = timer.pause();
    stopPlayback();
    return Math.floor(elapsed.seconds);
  };
  const startTimer = () => {
    if (isRunner || isCopy || running || navigationLocked.current) return;
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
    if (navigationLocked.current) return;
    pauseTimer();
    const entry = captureSession(1);
    if (entry) onLog(entry);
  };
  const beforeLeave = (): Promise<boolean> => {
    if (navigationFlight.current) return navigationFlight.current;
    if (isCopy) return Promise.resolve(true);
    if (isRunner)
      return Promise.resolve(
        !runnerUnsaved ||
          window.confirm('Leave Morse Runner? Your unsaved run and results will be discarded.'),
      );
    if (!automaticSave) {
      const unsaved = timer.snapshot().seconds > 0 || running || scratchpad.length > 0;
      return Promise.resolve(
        !unsaved ||
          window.confirm('Leave this practice? Unsaved time and notes will be discarded.'),
      );
    }
    navigationLocked.current = true;
    setSavingNavigation(true);
    pauseTimer();
    navigationFlight.current = (async () => {
      try {
        const outcome = await saveCoordinator.current.flush(captureSession(), onAutoSave);
        if (outcome === 'saved') changeScratchpad('');
        resetTimer();
        setError('');
        setSaveFailed(false);
        navigationLocked.current = false;
        return true;
      } catch (error) {
        setError(
          `Your session is still here. ${error instanceof Error ? error.message : 'The session could not be saved.'} Try saving again before continuing.`,
        );
        setSaveFailed(true);
        return false;
      } finally {
        setSavingNavigation(false);
        navigationFlight.current = undefined;
      }
    })();
    return navigationFlight.current;
  };
  beforeLeaveRef.current = beforeLeave;
  useEffect(() => {
    onBeforeLeaveChange?.(() => beforeLeaveRef.current());
    return () => onBeforeLeaveChange?.(undefined);
  }, [onBeforeLeaveChange]);
  const changePreferences = (changes: Partial<PracticePreferences>, regenerate = false) => {
    if (navigationLocked.current) return;
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
    if (navigationLocked.current) return;
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
    if (navigationLocked.current) return;
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
    if (navigationLocked.current) return;
    if (activity?.type === 'audio' && !recordingUrl) {
      setError(activity.unresolved ?? 'This recording is unavailable.');
      return;
    }
    if (
      (activity?.type === 'external' || activity?.type === 'sending') &&
      !running &&
      seconds === 0
    )
      window.open(activity.url, '_blank', 'noopener,noreferrer');
    if (assigned && activity?.type !== 'audio' && !running) startTimer();
    if (!playing) await play();
  };
  const generate = () => {
    if (navigationLocked.current) return;
    stopPlayback();
    if (mode !== 'custom') setText(generatePractice(mode, preferences));
  };
  const chooseListeningTool = async (nextTool: PracticePreferences['tool']) => {
    if (!publicRunner && !publicCopy && tool === nextTool) return;
    if (!(await beforeLeave())) return;
    setPublicRunner(false);
    setRunnerUnsaved(false);
    setPublicCopy(false);
    changePreferences({ tool: nextTool });
  };
  const chooseRunner = async () => {
    if (publicRunner || !(await beforeLeave())) return;
    setError('');
    setPublicRunner(true);
    setPublicCopy(false);
  };
  const chooseCopy = async () => {
    if (publicCopy || !(await beforeLeave())) return;
    setError('');
    setPublicRunner(false);
    setRunnerUnsaved(false);
    setPublicCopy(true);
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="small-line" /> TUNE IN. TAKE YOUR TIME.
          </div>
          <h1>{assigned ? 'Your assigned practice.' : 'Your practice studio.'}</h1>
          <p>
            {assigned
              ? isRunner
                ? 'Your assigned simulator settings and engine results, together.'
                : 'Your course material and practice timer, together.'
              : 'Copy practice, word listening, QSO conversations, and simulator practice. No account required to practice.'}
          </p>
        </div>
        <span className="chip">
          <span className="status-dot" /> {assigned ? 'From your plan' : 'No sign-in needed'}
        </span>
      </div>
      {launch?.task && (
        <div className="studio-task-context">
          <div>
            <span className="eyebrow">ASSIGNED PRACTICE</span>
            <strong>{launch.task.title}</strong>
            <span>
              {launch.task.targetMinutes} min target · Saved time stays linked to this exercise.
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
          {onBack && (
            <button className="text-button" onClick={onBack}>
              Back to Today <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}
      {!assigned && (
        <div className="studio-tool-tabs" role="group" aria-label="Studio tools">
          <button
            className={publicCopy ? 'selected' : ''}
            aria-pressed={publicCopy}
            onClick={chooseCopy}
          >
            Copy practice
          </button>
          {(
            [
              ['words', 'Word listening'],
              ['qso', 'QSO practice'],
              ['free', 'Free practice'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={!publicRunner && !publicCopy && tool === value ? 'selected' : ''}
              aria-pressed={!publicRunner && !publicCopy && tool === value}
              onClick={() => chooseListeningTool(value)}
            >
              {label}
            </button>
          ))}
          <button
            className={publicRunner ? 'selected' : ''}
            aria-pressed={publicRunner}
            onClick={chooseRunner}
          >
            Morse Runner
          </button>
        </div>
      )}
      {isCopy ? (
        <CopyTrainer
          key={`${accountId ?? 'guest'}:${launch?.id ?? 'public-copy'}`}
          accountId={accountId}
          timezone={timezone}
          task={launch?.task}
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
          key={launch?.id ?? 'public-runner'}
          settings={activity?.type === 'morse-runner' ? activity.settings : DEFAULT_RUNNER_SETTINGS}
          externalUrl={activity?.type === 'morse-runner' ? activity.url : undefined}
          task={launch?.task}
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
              disabled={savingNavigation}
              onClick={() => void beforeLeave()}
            >
              {savingNavigation ? 'Saving session…' : 'Retry saving session'}
            </button>
          )}
          {savingNavigation && <p role="status">Saving your practice…</p>}
          <fieldset
            className="studio-session-controls"
            disabled={savingNavigation || saveFailed}
            aria-busy={savingNavigation}
          >
            <div className="studio-quick-actions">
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
              <span>
                <strong>{duration(seconds)}</strong> / {duration(timerMinutes * 60)}{' '}
                <span className="field-hint">
                  {running ? 'timing' : seconds > 0 ? 'unsaved' : 'elapsed'}
                </span>
              </span>
              <button className="button outline" disabled={seconds < 1} onClick={logTimedSession}>
                Review &amp; save <ArrowRight size={14} />
              </button>
            </div>
            <div className={`practice-layout ${assigned ? 'is-assigned' : ''}`}>
              <section
                className="card studio-card"
                onPlayingCapture={(event) => {
                  if (navigationLocked.current && event.target instanceof HTMLAudioElement) {
                    event.target.pause();
                    return;
                  }
                  identity();
                  timer.onMedia(event);
                }}
                onTimeUpdateCapture={timer.onMedia}
                onPauseCapture={timer.onMedia}
                onEndedCapture={timer.onMedia}
                onSeekingCapture={timer.onMedia}
                onSeekedCapture={timer.onMedia}
                onWaitingCapture={timer.onMedia}
                onEmptiedCapture={timer.onMedia}
                onRateChangeCapture={timer.onMedia}
                onErrorCapture={timer.onMedia}
              >
                <div className="section-heading">
                  <div>
                    <h2>{assigned ? 'Your assigned exercise' : 'The listening room'}</h2>
                    <p>
                      {assigned
                        ? 'Practice this material, then save your time.'
                        : 'Hear the sound. Let the letters follow.'}
                    </p>
                  </div>
                  <Headphones size={23} />
                </div>
                {activity?.type === 'audio' ? (
                  <div className="assigned-recording">
                    <p>
                      {recordingWpm
                        ? `${recordingWpm} WPM${recordingWpm !== activity.characterWpm && activity.characterWpm ? ` selected (${activity.characterWpm} assigned)` : ''} · `
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
                          onPlay={() => setPlaying(true)}
                          onPlaying={(event) => claimRecordingSession(event.currentTarget)}
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
                ) : assigned ? (
                  <div className="assigned-offline">
                    <p>
                      {activity?.type === 'sending'
                        ? 'Use your key and the assigned sending sections. Start practice opens the exercise and times your session.'
                        : activity?.type === 'external'
                          ? 'Start practice opens the assigned tool in a new tab and starts your timer here.'
                          : 'Use your key, radio, or other practice material. The timer keeps your time linked to this exercise.'}
                    </p>
                    {activity?.type === 'sending' && (
                      <p>Sections: {activity.sections.join(', ')}.</p>
                    )}
                  </div>
                ) : tool !== 'free' ? (
                  <ListeningTrainer
                    ref={trainer}
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
                {!assigned && (
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
                  {assigned
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
                      placeholder="Jot down what you hear, difficult words, or details to revisit…"
                      aria-describedby="scratchpad-help"
                    />
                  </label>
                  <p id="scratchpad-help" className="field-hint">
                    {notesRemembered
                      ? 'Included with saved practice. Notes from sessions under 30 seconds stay on this device for this tool.'
                      : 'Included with saved practice. Your browser cannot store notes; unsaved notes last until you reload.'}
                  </p>
                </div>
                {!assigned && tool === 'free' && (
                  <ListeningSoundSettings
                    preferences={preferences}
                    onChange={changePreferences}
                    remembered={remembered}
                  />
                )}
              </section>
              <div className="practice-aside">
                <section className="card timer-card">
                  <div className="card-top">
                    <span className="eyebrow">A MOMENT FOR MORSE</span>
                    <Clock3 size={18} />
                  </div>
                  <h2>Time your practice.</h2>
                  <p>
                    Audio playback counts automatically. Use the timer for{' '}
                    {activity?.type === 'audio' ? 'focused recall and notes' : 'other practice'},
                    then review and save.
                  </p>
                  <div className="studio-timer-steps" aria-label="How to log timed practice">
                    <span>1. Play or start timer</span>
                    <span>2. Practice</span>
                    <span>3. Save session</span>
                  </div>
                  <div className={`timer-readout ${running ? 'running' : ''}`} aria-live="off">
                    {duration(Math.max(0, timerMinutes * 60 - seconds))}
                  </div>
                  <div className="timer-presets">
                    {[
                      ...new Set([
                        5,
                        10,
                        15,
                        30,
                        ...(launch?.task ? [launch.task.targetMinutes] : []),
                      ]),
                    ]
                      .sort((a, b) => a - b)
                      .map((minutes) => (
                        <button
                          key={minutes}
                          className={timerMinutes === minutes ? 'selected' : ''}
                          disabled={running || seconds > 0}
                          aria-pressed={timerMinutes === minutes}
                          onClick={() => {
                            setTimerMinutes(minutes);
                            resetTimer();
                          }}
                        >
                          {minutes} min
                        </button>
                      ))}
                  </div>
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
                      ? `Review a session whenever you like. Switching tools or leaving the studio automatically saves 30 seconds or more of practice${accountId ? ' to your log' : ' on this device'}.`
                      : 'This opens a practice entry for you to review. Nothing is added to your log until you choose Save practice.'}
                  </p>
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
                  {timerDone && (
                    <div className="timer-complete" role="status">
                      <CheckCheck size={18} /> Target reached. Keep practicing as long as you need,
                      then review and save.
                    </div>
                  )}
                  <p className="studio-timer-scope">
                    Listening time follows the audio, including when your screen locks. The target
                    is a guide, not a limit.{' '}
                    {automaticSave
                      ? 'Practice under 30 seconds is not logged automatically. Review and save before reloading to keep unfinished time.'
                      : 'Review and save before leaving to keep your practice time.'}
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
                          kind: launch?.task?.kind ?? 'listening',
                          lesson: launch?.task?.lesson,
                          notes: launch?.task?.title,
                          ...(!assigned
                            ? { characterWpm, effectiveWpm }
                            : activity?.type === 'audio' && recordingWpm
                              ? { characterWpm: recordingWpm }
                              : {}),
                          source: 'manual',
                          metadata: {
                            ...(launch?.task ? { plannedTaskId: launch.task.id } : {}),
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
                </section>
                <section className="practice-tip">
                  <span className="eyebrow">A NOTE FROM THE SHACK</span>
                  <h3>Listen for the music.</h3>
                  <p>
                    Try hearing each character as one complete sound, rather than counting dots and
                    dashes. Leave a little space. Let it sink in.
                  </p>
                  <div className="morse-word" aria-label="73 in Morse code">
                    − − · · · &nbsp; · · · − −
                  </div>
                </section>
              </div>
            </div>
          </fieldset>
        </>
      )}
    </>
  );
}
