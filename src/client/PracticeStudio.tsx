import React, { useEffect, useRef, useState } from 'react';
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
import './practice-studio.css';

const duration = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export default function PracticeStudio({
  onLog,
  savedVersion,
}: {
  onLog: (initial?: Partial<PracticeSession>) => void;
  savedVersion: number;
}) {
  const [preferences, setPreferences] = useState(loadPracticePreferences);
  const { mode, characterWpm, effectiveWpm, tone, volume, groupLength, wordLength } = preferences;
  const [text, setText] = useState(() => {
    const initial = loadPracticePreferences();
    return initial.mode === 'custom' ? '' : generatePractice(initial.mode, initial);
  });
  const [remembered, setRemembered] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(15);
  const [timerDone, setTimerDone] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const previousSaved = useRef(savedVersion);
  const player = useRef(new MorsePlayer());
  const startedAt = useRef(0);
  const accumulatedMs = useRef(0);
  useEffect(() => {
    setRemembered(savePracticePreferences(preferences));
  }, [preferences]);
  useEffect(() => {
    if (previousSaved.current !== savedVersion) {
      setRunning(false);
      setSeconds(0);
      accumulatedMs.current = 0;
      setTimerDone(false);
      setConfirmReset(false);
      previousSaved.current = savedVersion;
    }
  }, [savedVersion]);
  useEffect(() => () => player.current.stop(), []);
  const elapsedMs = () =>
    Math.min(
      timerMinutes * 60000,
      accumulatedMs.current + (running ? Math.max(0, performance.now() - startedAt.current) : 0),
    );
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const elapsed = elapsedMs();
      setSeconds(Math.floor(elapsed / 1000));
      if (elapsed >= timerMinutes * 60000) {
        accumulatedMs.current = timerMinutes * 60000;
        setRunning(false);
        setTimerDone(true);
        player.current.stop();
        setPlaying(false);
      }
    };
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [running, timerMinutes]);
  const stopPlayback = () => {
    player.current.stop();
    setPlaying(false);
  };
  const pauseTimer = () => {
    const elapsed = elapsedMs();
    accumulatedMs.current = elapsed;
    setSeconds(Math.floor(elapsed / 1000));
    setRunning(false);
    stopPlayback();
    return Math.floor(elapsed / 1000);
  };
  const startTimer = () => {
    if (timerDone) return;
    setConfirmReset(false);
    startedAt.current = performance.now();
    setRunning(true);
  };
  const resetTimer = () => {
    setRunning(false);
    setSeconds(0);
    accumulatedMs.current = 0;
    setTimerDone(false);
    setConfirmReset(false);
    stopPlayback();
  };
  const logTimedSession = () => {
    const elapsedSeconds = pauseTimer();
    if (elapsedSeconds < 1) return;
    onLog({
      kind: 'listening',
      minutes: elapsedSeconds / 60,
      characterWpm,
      effectiveWpm,
      source: 'morse',
      metadata: { elapsedSeconds, practiceMode: mode },
    });
  };
  const changePreferences = (changes: Partial<PracticePreferences>, regenerate = false) => {
    stopPlayback();
    setError('');
    const next = normalizePracticePreferences({ ...preferences, ...changes });
    setPreferences(next);
    if (regenerate && next.mode !== 'custom') setText(generatePractice(next.mode, next));
  };
  const play = async () => {
    if (playing) {
      stopPlayback();
      return;
    }
    setError('');
    setPlaying(true);
    try {
      await player.current.play(text, characterWpm, effectiveWpm, tone, volume / 100, () =>
        setPlaying(false),
      );
    } catch (err) {
      setError((err as Error).message);
      setPlaying(false);
    }
  };
  const generate = () => {
    stopPlayback();
    if (mode !== 'custom') setText(generatePractice(mode, preferences));
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="small-line" /> TUNE IN. TAKE YOUR TIME.
          </div>
          <h1>Your practice studio.</h1>
          <p>A clear tone, a little space, and your full attention. Free for everyone.</p>
        </div>
        <span className="chip">
          <span className="status-dot" /> No sign-in needed
        </span>
      </div>
      <div className="practice-layout">
        <section className="card studio-card">
          <div className="section-heading">
            <div>
              <h2>The listening room</h2>
              <p>Hear the sound. Let the letters follow.</p>
            </div>
            <Headphones size={23} />
          </div>
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
                              : (Number(e.target.value) as PracticePreferences['wordLength']),
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
              These are fictional, randomly generated practice examples. They may happen to match
              real callsigns; they are not a directory of operators.
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
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <div className="playback-toolbar">
            <button
              className="button dark play-button"
              onClick={play}
              disabled={!cleanMorseText(text)}
            >
              {playing ? (
                <Square size={16} fill="currentColor" />
              ) : (
                <Play size={16} fill="currentColor" />
              )}
              {playing ? 'Stop playback' : 'Play Morse'}
            </button>
            <button
              className="button outline"
              onClick={() => generate()}
              disabled={mode === 'custom'}
            >
              <Shuffle size={16} /> New set
            </button>
            <span className="playback-note">
              {characterWpm} / {effectiveWpm} WPM <span>·</span> {tone} Hz
            </span>
          </div>
          <p className="studio-playback-help">
            Playing Morse does not start the timer or save a practice record.
          </p>
          <div className="studio-divider" />
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
        </section>
        <div className="practice-aside">
          <section className="card timer-card">
            <div className="card-top">
              <span className="eyebrow">A MOMENT FOR MORSE</span>
              <Clock3 size={18} />
            </div>
            <h2>Time your practice.</h2>
            <p>Start the timer, practice, then review and save your elapsed time.</p>
            <div className="studio-timer-steps" aria-label="How to log timed practice">
              <span>1. Start timer</span>
              <span>2. Practice</span>
              <span>3. Save session</span>
            </div>
            <div className={`timer-readout ${running ? 'running' : ''}`} aria-live="off">
              {duration(Math.max(0, timerMinutes * 60 - seconds))}
            </div>
            <div className="timer-presets">
              {[5, 10, 15, 30].map((minutes) => (
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
              disabled={timerDone}
              onClick={() => (running ? pauseTimer() : startTimer())}
            >
              {running ? <Square size={14} /> : <Play size={14} />}
              {timerDone
                ? 'Timer complete'
                : running
                  ? 'Pause timer'
                  : seconds > 0
                    ? 'Resume timer'
                    : 'Start timer'}
            </button>
            <p className="timer-elapsed">
              <strong>{duration(seconds)}</strong> practiced ·{' '}
              {running
                ? 'timer running'
                : seconds > 0
                  ? 'paused, not yet saved'
                  : 'ready when you are'}
            </p>
            <button
              className="button outline full studio-save-session"
              disabled={seconds < 1}
              onClick={logTimedSession}
            >
              Review &amp; save {seconds > 0 ? duration(seconds) : 'session'}{' '}
              <ArrowRight size={14} />
            </button>
            <p className="studio-save-help">
              This opens a practice entry for you to review. Nothing is added to your log until you
              choose Save practice.
            </p>
            <div className="timer-secondary">
              <button
                className="text-button"
                disabled={running && seconds < 1}
                onClick={() => {
                  if (seconds > 0) {
                    pauseTimer();
                    setConfirmReset(true);
                  } else resetTimer();
                }}
              >
                <RotateCcw size={13} /> Reset timer
              </button>
            </div>
            {confirmReset && (
              <div className="studio-reset-confirm" role="group" aria-label="Confirm timer reset">
                <p>Discard {duration(seconds)} of unsaved timer time?</p>
                <div>
                  <button className="text-button" onClick={() => setConfirmReset(false)}>
                    Keep timer
                  </button>
                  <button className="text-button danger-text" onClick={resetTimer}>
                    Discard &amp; reset
                  </button>
                </div>
              </div>
            )}
            {timerDone && (
              <div className="timer-complete" role="status">
                <CheckCheck size={18} /> Session finished. Review and save your time, or reset to
                discard it.
              </div>
            )}
            <p className="studio-timer-scope">
              The timer includes pauses between audio sets. Save before leaving the studio; timer
              time is not kept between visits.
            </p>
            <div className="studio-manual-log">
              <h3>Already practiced?</h3>
              <p>Enter time from a recording, your key, or a session away from the studio.</p>
              <button
                className="text-button"
                onClick={() => {
                  if (running) pauseTimer();
                  onLog({ kind: 'listening', characterWpm, effectiveWpm, source: 'manual' });
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
