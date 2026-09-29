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
import MorseTranscript from './MorseTranscript';
import MorseRunnerStudio, { DEFAULT_RUNNER_SETTINGS } from './MorseRunnerStudio';
import type { PracticeLaunch } from './practice-launch';
import RecordingSpeedSelect from './RecordingSpeedSelect';
import { preferredRecording } from './recording-variants';
import { usePracticeClock } from './usePracticeClock';
import { WORD_LISTS } from './word-content';
import { QSO_TEMPLATES } from './qso-content';
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
}: {
  onLog: (initial?: Partial<PracticeSession>) => void;
  savedVersion: number;
  savedEntry?: PracticeSession;
  launch?: PracticeLaunch;
  onBack?: () => void;
  onUnsavedChange?: (unsaved: boolean) => void;
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
  const isRunner = activity?.type === 'morse-runner' || (!assigned && publicRunner);
  const recording = useRef<HTMLAudioElement>(null);
  const attachRecording = useCallback((element: HTMLAudioElement | null) => {
    if (recording.current && recording.current !== element) recording.current.pause();
    recording.current = element;
  }, []);
  const [freeTrack, setFreeTrack] = useState<MorseTrack | null>(null);
  const [freeWord, setFreeWord] = useState(-1);
  const preparedFree = useRef('');
  const [preferences, setPreferences] = useState(() => ({
    ...loadPracticePreferences(),
    ...(launch?.tool ? { tool: launch.tool } : {}),
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
      setScratchpad('');
      setConfirmReset(false);
      previousSaved.current = savedVersion;
    }
  }, [savedVersion]);
  useEffect(() => () => player.current.dispose(), []);
  useEffect(() => {
    onUnsavedChange?.(runnerUnsaved || running || seconds > 0 || scratchpad.length > 0);
  }, [runnerUnsaved, running, seconds, scratchpad, onUnsavedChange]);
  useEffect(() => {
    if (!launch) return;
    resetTimer();
    setScratchpad('');
    setSelectedRecording(
      activity?.type === 'audio'
        ? preferredRecording(activity.url, activity.characterWpm)
        : undefined,
    );
    setPublicRunner(false);
    setRunnerUnsaved(false);
    setTimerMinutes(launch.task?.targetMinutes ?? 15);
    if (launch.tool) setPreferences((current) => ({ ...current, tool: launch.tool! }));
  }, [launch?.id]);
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
    if (isRunner || running) return;
    setConfirmReset(false);
    timer.startManual(activity?.type === 'audio');
  };
  const resetTimer = () => {
    stopPlayback();
    timer.reset();
    setConfirmReset(false);
  };
  const logTimedSession = () => {
    const elapsedSeconds = pauseTimer();
    const measured = timer.snapshot();
    const playedSpeeds = [
      ...new Set(
        measured.recordings
          .map((item) => item.speedWpm)
          .filter((speed): speed is number => speed !== undefined),
      ),
    ];
    if (elapsedSeconds < 1) return;
    onLog({
      kind: launch?.task?.kind ?? (tool === 'words' ? 'head-copy' : 'listening'),
      lesson: launch?.task?.lesson,
      notes: [
        launch?.task?.title,
        measured.recordings.length
          ? measured.recordings
              .map(
                (item) =>
                  `${item.speedWpm ? `${item.speedWpm} WPM` : 'Recording'}: ${duration(Math.floor(item.seconds))} listened`,
              )
              .join('; ')
          : undefined,
        assigned
          ? undefined
          : tool === 'words'
            ? preferences.wordList === 'custom'
              ? 'Custom word recognition'
              : WORD_LISTS[preferences.wordList].title
            : tool === 'qso'
              ? QSO_TEMPLATES.find((item) => item.id === preferences.qsoScenario)?.title
              : undefined,
      ]
        .filter(Boolean)
        .join(' · '),
      minutes: elapsedSeconds / 60,
      ...(!assigned
        ? { characterWpm, effectiveWpm }
        : activity?.type === 'audio' && playedSpeeds.length === 1
          ? { characterWpm: playedSpeeds[0] }
          : {}),
      source: assigned ? 'timer' : 'morse',
      metadata: {
        elapsedSeconds,
        ...(scratchpad ? { scratchpad } : {}),
        recallSeconds: measured.recallSeconds,
        ...(measured.recordings.length ? { recordings: measured.recordings } : {}),
        practiceTool: assigned ? activity?.type : tool,
        ...(!assigned ? { practiceMode: mode } : {}),
        ...(activity?.type === 'audio'
          ? {
              assignedRecordingUrl: activity.url,
              assignedCharacterWpm: activity.characterWpm,
              ...(measured.recordings.length === 1
                ? { recordingUrl: measured.recordings[0].url }
                : {}),
            }
          : {}),
        ...(!assigned && tool === 'words' ? { wordList: preferences.wordList } : {}),
        ...(!assigned && tool === 'qso' ? { qsoScenario: preferences.qsoScenario } : {}),
        ...(launch?.task ? { plannedTaskId: launch.task.id } : {}),
      },
    });
  };
  const changePreferences = (changes: Partial<PracticePreferences>, regenerate = false) => {
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
    stopPlayback();
    if (mode !== 'custom') setText(generatePractice(mode, preferences));
  };
  const chooseListeningTool = (nextTool: PracticePreferences['tool']) => {
    if (
      publicRunner &&
      runnerUnsaved &&
      !window.confirm('Leave Morse Runner? Your unsaved run and results will be discarded.')
    )
      return;
    setPublicRunner(false);
    setRunnerUnsaved(false);
    changePreferences({ tool: nextTool });
  };
  const chooseRunner = () => {
    if (publicRunner) return;
    if (running || seconds > 0 || scratchpad.length > 0) {
      pauseTimer();
      setError('Review and save, or discard, your current session before opening Morse Runner.');
      return;
    }
    stopPlayback();
    setError('');
    setPublicRunner(true);
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
              : 'Word recognition, QSO conversations, and simulator practice. No account required to practice.'}
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
          {onBack && (
            <button className="text-button" onClick={onBack}>
              Back to Today <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}
      {!assigned && (
        <div className="studio-tool-tabs" role="group" aria-label="Studio tools">
          {(
            [
              ['words', 'Word trainer'],
              ['qso', 'QSO practice'],
              ['free', 'Free practice'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={!publicRunner && tool === value ? 'selected' : ''}
              aria-pressed={!publicRunner && tool === value}
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
      {isRunner ? (
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
              onPlayingCapture={timer.onMedia}
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
                        }}
                        onPlay={() => setPlaying(true)}
                        onPause={() => setPlaying(false)}
                        onEnded={() => setPlaying(false)}
                        onError={() => {
                          setError(
                            'The recording could not load. Open the official exercise to check its availability.',
                          );
                          pauseTimer();
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
                    <a className="text-button" href={recordingUrl} target="_blank" rel="noreferrer">
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
                  {activity?.type === 'sending' && <p>Sections: {activity.sections.join(', ')}.</p>}
                </div>
              ) : tool !== 'free' ? (
                <ListeningTrainer
                  ref={trainer}
                  key={tool}
                  preferences={preferences}
                  onChange={changePreferences}
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
                      These are fictional, randomly generated practice examples. They may happen to
                      match real callsigns; they are not a directory of operators.
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
              {error && (
                <div className="alert error" role="alert">
                  {error}
                </div>
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
                    onChange={(event) => setScratchpad(event.target.value)}
                    placeholder="Jot down what you hear, difficult words, or details to revisit…"
                    aria-describedby="scratchpad-help"
                  />
                </label>
                <p id="scratchpad-help" className="field-hint">
                  Included when you review and save this session. Save before leaving or reloading;
                  unfinished notes stay only in this visit.
                </p>
              </div>
              {!assigned && (
                <details className="studio-sound-settings">
                  <summary>
                    Sound settings · {characterWpm}/{effectiveWpm} WPM · {tone} Hz
                  </summary>
                  <div className="studio-preferences-heading">
                    <h3>Your listening preferences</h3>
                    <p>
                      {remembered
                        ? 'Saved on this device, including when you sign out. Custom text is not saved.'
                        : 'Active for this visit. Your browser is not allowing these preferences to be remembered.'}
                    </p>
                  </div>
                  <div className="studio-controls">
                    <Range
                      label="Character speed"
                      value={characterWpm}
                      min={5}
                      max={50}
                      unit="WPM"
                      onChange={(v) => changePreferences({ characterWpm: v })}
                      hint="The speed of each individual character."
                    />
                    <Range
                      label="Effective speed"
                      value={effectiveWpm}
                      min={3}
                      max={characterWpm}
                      unit="WPM"
                      onChange={(v) => changePreferences({ effectiveWpm: v })}
                      hint="Farnsworth spacing gives you time to hear."
                    />
                    <Range
                      label="Sidetone"
                      value={tone}
                      min={300}
                      max={1000}
                      step={25}
                      unit="Hz"
                      onChange={(v) => changePreferences({ tone: v })}
                      hint="Find a comfortable pitch for your ears."
                    />
                    <Range
                      label="Volume"
                      value={volume}
                      min={0}
                      max={100}
                      unit="%"
                      onChange={(v) => changePreferences({ volume: v })}
                      hint={
                        volume === 0
                          ? 'Muted. Raise the volume when you’re ready to listen.'
                          : 'Start softly. Comfort comes first.'
                      }
                    />
                  </div>
                </details>
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
                  {activity?.type === 'audio' ? 'focused recall and notes' : 'other practice'}, then
                  review and save.
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
                  This opens a practice entry for you to review. Nothing is added to your log until
                  you choose Save practice.
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
                          setScratchpad('');
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
                  Listening time follows the audio, including when your screen locks. The target is
                  a guide, not a limit. Save before leaving; unfinished time is not kept between
                  visits.
                </p>
                <div className="studio-manual-log">
                  <h3>Already practiced?</h3>
                  <p>Enter time from a recording, your key, or a session away from the studio.</p>
                  <button
                    className="text-button"
                    onClick={() => {
                      if (running) pauseTimer();
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
        </>
      )}
    </>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (value: number) => void;
  hint: string;
}) {
  const id = React.useId();
  return (
    <div className="range-control">
      <div>
        <label htmlFor={id}>{label}</label>
        <span>
          {value} <small>{unit}</small>
        </span>
      </div>
      <input
        id={id}
        type="range"
        aria-valuetext={`${value} ${unit === '%' ? 'percent' : unit}`}
        aria-describedby={`${id}-hint`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p id={`${id}-hint`}>{hint}</p>
    </div>
  );
}
