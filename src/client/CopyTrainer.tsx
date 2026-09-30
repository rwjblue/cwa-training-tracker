import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  COPY_MODES,
  createCopyAttempt,
  currentCopySpeeds,
  defaultCopyRecipe,
  submitCopyAnswer,
  validateCopyRecipe,
  type CopyRecipe,
} from '../shared/copy-practice';
import { copyAttemptSessionFields } from '../shared/copy-report';
import { dateInTimezone, validatePracticeSession, type PracticeSession } from '../shared/training';
import type { PlannedTask } from '../shared/plan';
import { api } from './api';
import { MorsePlayer } from './audio';
import { buildCopyTrack } from './copy-audio';
import { CopyClock } from './copy-clock';
import {
  claimCopyLease,
  clearCopyDraft,
  copySetupRecipe,
  loadCopyDraft,
  loadCopyPreferences,
  ownsCopyLease,
  releaseCopyLease,
  saveCopyDraft,
  saveCopyPreferences,
  type CopyDraft,
} from './copy-storage';
import CopySettings from './CopySettings';
import CopyResult, { COPY_LABELS, copyDuration, missedCopyCharacters } from './CopyResult';
import './copy-trainer.css';

interface Props {
  accountId?: string;
  timezone?: string;
  recipe?: CopyRecipe;
  alternatives?: CopyRecipe[];
  task?: PlannedTask;
  requiresCharacterSelection?: boolean;
  onLog: (initial?: Partial<PracticeSession>) => void;
  onSaved?: (entry: PracticeSession) => void;
  onUnsavedChange?: (unsaved: boolean) => void;
}

export default function CopyTrainer(props: Props) {
  return <CopyTrainerSession key={props.accountId ?? 'guest'} {...props} />;
}

function CopyTrainerSession({
  accountId,
  timezone = 'UTC',
  recipe: assignedRecipe,
  alternatives,
  task,
  requiresCharacterSelection,
  onLog,
  onSaved,
  onUnsavedChange,
}: Props) {
  const scope = accountId ?? 'guest';
  const [initial] = useState(() => loadCopyDraft(scope));
  const [draft, setDraft] = useState<CopyDraft | undefined>(() =>
    initial
      ? {
          ...initial,
          attempt: {
            ...initial.attempt,
            interruptionCount: initial.attempt.interruptionCount + (initial.pending ? 0 : 1),
          },
        }
      : undefined,
  );
  const draftRef = useRef(draft);
  const [recipe, setRecipe] = useState(
    initial?.attempt.recipe ??
      copySetupRecipe(
        assignedRecipe ?? loadCopyPreferences(scope, 'groups') ?? defaultCopyRecipe(),
      ),
  );
  const [confirmedCharacters, setConfirmedCharacters] = useState(false);
  const [error, setError] = useState('');
  const [storageWarning, setStorageWarning] = useState(false);
  const [playing, setPlaying] = useState(false);
  const playingRef = useRef(false);
  const [blocked, setBlocked] = useState(false);
  const blockedRef = useRef(false);
  const [saved, setSaved] = useState(false);
  const savedRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const mounted = useRef(true);
  const nextTask = useRef(task);
  const [revealed, setRevealed] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [tick, setTick] = useState(0);
  const clock = useRef(new CopyClock(initial?.attempt));
  const player = useRef(new MorsePlayer());
  const prepared = useRef('');
  const delay = useRef(0);
  const reviewAudio = useRef(false);
  const leaseOwner = useRef(crypto.randomUUID());
  const answerInput = useRef<HTMLTextAreaElement>(null);
  const answerHintId = useId();
  const focusAnswer = () => {
    answerInput.current?.focus({ preventScroll: true });
    answerInput.current?.scrollIntoView({ block: 'nearest' });
  };
  const submitRef = useRef<() => void>(() => {});
  const autoDeadline = useRef(initial?.autoSkipAt);

  const hasControl = () => !blockedRef.current && ownsCopyLease(scope, leaseOwner.current);
  const loseControl = () => {
    blockedRef.current = true;
    player.current.pause();
    clock.current.pause(performance.now());
    setBlocked(true);
  };

  const write = (next: CopyDraft | undefined) => {
    if (!hasControl()) return;
    draftRef.current = next;
    setDraft(next);
    if (next && !savedRef.current && ownsCopyLease(scope, leaseOwner.current)) {
      if (!saveCopyDraft(scope, next)) setStorageWarning(true);
    }
  };
  const snapshot = (): CopyDraft | undefined => {
    const current = draftRef.current;
    if (!current || current.pending || savedRef.current) return current;
    const times = clock.current.snapshot(performance.now());
    return {
      ...current,
      position:
        reviewAudio.current || !prepared.current ? current.position : player.current.position,
      autoSkipAt: autoDeadline.current,
      attempt: {
        ...current.attempt,
        audioSeconds: times.audioSeconds,
        answerSeconds: times.answerSeconds,
        reviewSeconds: times.reviewSeconds,
        updatedAt: new Date().toISOString(),
      },
    };
  };
  const pause = () => {
    player.current.pause();
    clock.current.pause(performance.now());
    const next = snapshot();
    if (next) write(next);
    setTick((n) => n + 1);
  };

  useEffect(() => {
    mounted.current = true;
    const owned = claimCopyLease(scope, leaseOwner.current);
    blockedRef.current = !owned;
    setBlocked(!owned);
    const heartbeat = window.setInterval(() => {
      if (blockedRef.current) return;
      if (!ownsCopyLease(scope, leaseOwner.current)) {
        loseControl();
        return;
      }
      claimCopyLease(scope, leaseOwner.current);
      const next = snapshot();
      if (next && !savedRef.current) write(next);
      setTick((n) => n + 1);
      if (
        autoDeadline.current !== undefined &&
        clock.current.snapshot(performance.now()).thinking === 'answer' &&
        clock.current.snapshot(performance.now()).answerSeconds >= autoDeadline.current
      ) {
        autoDeadline.current = undefined;
        submitRef.current();
      }
    }, 500);
    const hide = () => {
      if (document.hidden) pause();
    };
    const leave = () => {
      pause();
      releaseCopyLease(scope, leaseOwner.current);
    };
    const returnToPage = (event: PageTransitionEvent) => {
      if (blockedRef.current) return;
      if (!claimCopyLease(scope, leaseOwner.current)) {
        loseControl();
        return;
      }
      if (event.persisted && !savedRef.current) {
        // Another tab may have continued this round while this page was cached.
        const latest = loadCopyDraft(scope);
        player.current.clear();
        prepared.current = '';
        autoDeadline.current = latest?.autoSkipAt;
        clock.current = new CopyClock(latest?.attempt);
        write(latest);
        if (latest) setRecipe(latest.attempt.recipe);
      }
    };
    const storage = () => {
      if (!ownsCopyLease(scope, leaseOwner.current)) {
        loseControl();
      }
    };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', returnToPage);
    window.addEventListener('storage', storage);
    return () => {
      mounted.current = false;
      window.clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pageshow', returnToPage);
      window.removeEventListener('storage', storage);
      player.current.pause();
      clock.current.pause(performance.now());
      const next = snapshot();
      if (next && !savedRef.current && hasControl()) saveCopyDraft(scope, next);
      player.current.dispose();
      releaseCopyLease(scope, leaseOwner.current);
    };
  }, [scope]);
  useEffect(() => {
    onUnsavedChange?.(Boolean(draft && !saved));
    return () => onUnsavedChange?.(false);
  }, [Boolean(draft), saved, onUnsavedChange]);

  const playTarget = (current: CopyDraft, replay = false, reviewIndex?: number) => {
    if (!hasControl() || current.pending || savedRef.current) return;
    setError('');
    autoDeadline.current = undefined;
    try {
      const index = reviewIndex ?? current.attempt.trials.length;
      const r = current.attempt.recipe;
      const key = `${current.attempt.id}:${index}:${reviewIndex === undefined ? 'trial' : 'review'}`;
      // Sample the previous track before changing its position, delay, or review role.
      player.current.pause();
      clock.current.pause(performance.now());
      const measured = snapshot();
      if (measured) write(measured);
      reviewAudio.current = reviewIndex !== undefined;
      if (prepared.current !== key) {
        const track = buildCopyTrack(current.attempt, index);
        delay.current = reviewIndex === undefined ? r.startDelaySeconds : 0;
        const offset = delay.current;
        player.current.prepare(
          {
            ...track,
            duration: track.duration + offset,
            tones: track.tones.map((tone) => ({ ...tone, at: tone.at + offset })),
            words: track.words.map((word) => ({
              ...word,
              start: word.start + offset,
              end: word.end + offset,
            })),
            items: track.items.map((item) => ({
              ...item,
              start: item.start + offset,
              end: item.end + offset,
            })),
          },
          {
            title: `${COPY_LABELS[r.mode]} practice`,
            onState: (state) => {
              if (state === 'playing' && !hasControl()) {
                player.current.pause();
                return;
              }
              if (state !== 'playing' && playingRef.current)
                clock.current.sampleAudio(
                  Math.max(0, player.current.position - delay.current),
                  performance.now(),
                );
              if (state === 'playing' && !playingRef.current)
                clock.current.startAudio(
                  Math.max(0, player.current.position - delay.current),
                  performance.now(),
                );
              if (state !== 'playing') clock.current.pauseAudio();
              playingRef.current = state === 'playing';
              setPlaying(state === 'playing');
              if (state === 'playing' && (!hasControl() || document.hidden)) player.current.pause();
            },
            onProgress: (progress) => {
              if (playingRef.current)
                clock.current.sampleAudio(
                  Math.max(0, progress.position - delay.current),
                  performance.now(),
                );
            },
            onFinish: () => {
              clock.current.pauseAudio();
              const next = snapshot();
              if (
                !next ||
                reviewAudio.current ||
                next.pending ||
                savedRef.current ||
                !hasControl() ||
                document.hidden ||
                prepared.current !== key
              )
                return;
              clock.current.startThinking('answer', performance.now());
              if (next.attempt.recipe.autoSkipSeconds > 0)
                autoDeadline.current =
                  clock.current.snapshot(performance.now()).answerSeconds +
                  next.attempt.recipe.autoSkipSeconds;
              write({
                ...next,
                heard: true,
                position: player.current.position,
                autoSkipAt: autoDeadline.current,
              });
              answerInput.current?.focus();
            },
            onError: (message) => {
              clock.current.pause(performance.now());
              setError(message);
            },
          },
        );
        prepared.current = key;
        if (reviewIndex === undefined && !replay && current.position > 0)
          player.current.seek(current.position);
      }
      if (replay || reviewIndex !== undefined) {
        player.current.seek(0);
        if (reviewIndex === undefined)
          write({
            ...snapshot()!,
            replayCount: current.replayCount + 1,
            heard: false,
            position: 0,
          });
      }
      void player.current.resume().catch((reason: Error) => setError(reason.message));
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  const start = (selected = recipe) => {
    if (!hasControl()) return;
    try {
      const valid = validateCopyRecipe(copySetupRecipe(selected));
      saveCopyPreferences(scope, valid);
      const attempt = createCopyAttempt(valid, {
        id: crypto.randomUUID(),
        seed: crypto.randomUUID(),
      });
      const next: CopyDraft = {
        attempt,
        answer: '',
        position: 0,
        replayCount: 0,
        trialAnswerStartedAt: 0,
        heard: false,
        notes: '',
        task: nextTask.current,
      };
      clock.current = new CopyClock();
      prepared.current = '';
      savedRef.current = false;
      // Unlock the existing input within the click gesture, before preparing audio.
      // This also lets mobile browsers open the keyboard immediately.
      flushSync(() => {
        setSaved(false);
        setRevealed(false);
        setFeedback('');
        setError('');
        write(next);
      });
      focusAnswer();
      playTarget(next);
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  const submit = () => {
    const current = draftRef.current;
    if (
      !current ||
      current.attempt.status !== 'active' ||
      !current.heard ||
      !hasControl() ||
      playingRef.current ||
      current.pending ||
      savedRef.current
    )
      return;
    pause();
    autoDeadline.current = undefined;
    const measured = snapshot()!;
    try {
      const attempt = submitCopyAnswer(measured.attempt, measured.answer, {
        replayCount: measured.replayCount,
        responseSeconds: Math.max(
          0,
          measured.attempt.answerSeconds - measured.trialAnswerStartedAt,
        ),
      });
      const last = attempt.trials.at(-1)!;
      const next: CopyDraft = {
        ...measured,
        attempt,
        answer: '',
        position: 0,
        replayCount: 0,
        heard: false,
        autoSkipAt: undefined,
        trialAnswerStartedAt: attempt.answerSeconds,
      };
      write(next);
      setRevealed(false);
      prepared.current = '';
      player.current.clear();
      setFeedback(
        attempt.recipe.blind
          ? 'Answer recorded.'
          : `${last.correct ? 'Correct' : 'Incorrect'}: ${attempt.targets[attempt.trials.length - 1]}.`,
      );
      if (attempt.status === 'active' && !(attempt.recipe.stopOnError && !last.correct))
        playTarget(next);
    } catch (reason) {
      setError((reason as Error).message);
    }
  };
  submitRef.current = submit;

  const endEarly = () => {
    if (!hasControl() || draftRef.current?.pending || savedRef.current) return;
    if (
      !window.confirm(
        'End this round? Submitted answers and measured time will be kept. The current unsubmitted answer will not be scored.',
      )
    )
      return;
    pause();
    autoDeadline.current = undefined;
    const current = snapshot();
    if (current) write({ ...current, attempt: { ...current.attempt, status: 'abandoned' } });
    prepared.current = '';
    player.current.clear();
  };
  const newRound = (nextRecipe = recipe, detachAssignment = false) => {
    if (!hasControl() || savingRef.current) return;
    if (
      draft &&
      !saved &&
      !window.confirm(
        'Start a new round? Save or download this result first if you want to keep it. The recovery copy of this round will be replaced.',
      )
    )
      return;
    pause();
    player.current.clear();
    prepared.current = '';
    autoDeadline.current = undefined;
    nextTask.current = detachAssignment ? undefined : task;
    if (draft) clearCopyDraft(scope, draft.attempt.id);
    savedRef.current = false;
    setSaved(false);
    write(undefined);
    clock.current = new CopyClock();
    setRecipe(copySetupRecipe(nextRecipe));
    setFeedback('');
    setRevealed(false);
    setError('');
  };
  const save = async () => {
    if (savingRef.current || savedRef.current || !hasControl()) return;
    pause();
    const current = snapshot();
    if (!current || current.attempt.status === 'active') return;
    setError('');
    try {
      const fields = copyAttemptSessionFields(current.attempt);
      const pending =
        current.pending ??
        validatePracticeSession({
          ...fields,
          date: dateInTimezone(current.attempt.createdAt, timezone),
          kind: current.task?.kind ?? 'icr',
          lesson: current.task?.lesson,
          notes: [current.task?.title, current.notes].filter(Boolean).join('\n'),
          metadata: {
            ...fields.metadata,
            ...(current.task ? { plannedTaskId: current.task.id } : {}),
          },
        });
      write({ ...current, pending });
      prepared.current = '';
      player.current.clear();
      if (!accountId) {
        onLog(pending);
        return;
      }
      savingRef.current = true;
      setSaving(true);
      const result = await api<{ entry: PracticeSession }>('/entries', pending);
      if (!mounted.current) return;
      savedRef.current = true;
      setSaved(true);
      clearCopyDraft(scope, current.attempt.id);
      onSaved?.(result.entry);
    } catch (reason) {
      setError(
        `Your result is still on this device. Save again to retry. ${(reason as Error).message}`,
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const download = () => {
    pause();
    const current = snapshot();
    if (!current) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              format: 'cwa-copy-result',
              ...current.attempt,
              notes: current.notes,
              ...(current.task
                ? {
                    assignment: {
                      id: current.task.id,
                      title: current.task.title,
                      lesson: current.task.lesson,
                    },
                  }
                : {}),
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `cw-copy-${current.attempt.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const takeOver = () => {
    player.current.pause();
    player.current.clear();
    claimCopyLease(scope, leaseOwner.current, true);
    blockedRef.current = false;
    const recovered = loadCopyDraft(scope);
    if (recovered) {
      if (!recovered.pending) recovered.attempt.interruptionCount++;
      clock.current = new CopyClock(recovered.attempt);
      autoDeadline.current = recovered.autoSkipAt;
      write(recovered);
      setRecipe(recovered.attempt.recipe);
    } else {
      write(undefined);
      clock.current = new CopyClock();
      autoDeadline.current = undefined;
    }
    savedRef.current = false;
    setSaved(false);
    prepared.current = '';
    setBlocked(false);
  };
  const attempt = draft?.attempt;
  const active = attempt?.status === 'active';
  const currentRecipe = attempt?.recipe ?? recipe;
  const assignmentRecipes = assignedRecipe
    ? [assignedRecipe, ...(alternatives ?? [])].map(copySetupRecipe)
    : [];
  const assignmentIndex = assignmentRecipes.findIndex((option) =>
    (Object.keys(option) as (keyof CopyRecipe)[]).every(
      (key) => option[key] === currentRecipe[key],
    ),
  );
  const assignmentOption = assignmentIndex < 0 ? 'custom' : String(assignmentIndex);
  const discrete = currentRecipe.mode === 'words' || currentRecipe.mode === 'callsigns';
  const measured = clock.current.snapshot(performance.now());
  const speeds = attempt ? currentCopySpeeds(attempt) : recipe;
  const needsCharacters = requiresCharacterSelection && !confirmedCharacters;
  void tick;

  return (
    <section className="copy-trainer" aria-label="Copy practice">
      <header className="copy-heading">
        <h2>Copy practice</h2>
        <span className="copy-time" aria-label="Measured practice time">
          {copyDuration(measured.audioSeconds + measured.answerSeconds + measured.reviewSeconds)}
          <small>practice time</small>
        </span>
      </header>
      <p className="copy-intro">
        Listen, type, then check your copy.{' '}
        {accountId
          ? 'Save results to your private history.'
          : 'Practice and download results without an account.'}
      </p>
      {blocked && (
        <div className="notice" role="alert">
          Copy practice is open in another tab.{' '}
          <button className="text-button" onClick={takeOver}>
            Continue in this tab
          </button>
        </div>
      )}
      {storageWarning && (
        <p className="notice" role="status">
          Your browser cannot store recovery data. Keep this tab open and download your result
          before leaving.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <audio
        aria-label="Copy practice audio"
        hidden
        ref={(element) => {
          if (element) player.current.attach(element);
        }}
      />
      {attempt && initial?.attempt.id === attempt.id && !saved && (
        <p className="copy-help">
          Recovered on this device. Playback stays paused until you continue.
        </p>
      )}
      {draft && draft.task?.id !== task?.id && (
        <p className="notice">
          This round{' '}
          {draft.task ? `belongs to ${draft.task.title}` : 'was started as open practice'}. Finish
          it or start a new round for the current assignment.
        </p>
      )}
      {!attempt || active ? (
        <div className="copy-workspace">
          {!assignedRecipe && (
            <div className="copy-mode-tabs" role="group" aria-label="Copy mode">
              {COPY_MODES.map((mode) => (
                <button
                  key={mode}
                  className={currentRecipe.mode === mode ? 'selected' : ''}
                  aria-pressed={currentRecipe.mode === mode}
                  disabled={active || blocked}
                  onClick={() => {
                    setError('');
                    setRecipe(loadCopyPreferences(scope, mode) ?? defaultCopyRecipe(mode));
                  }}
                >
                  {COPY_LABELS[mode]}
                </button>
              ))}
            </div>
          )}
          {alternatives && alternatives.length > 0 && (
            <label className="field copy-assignment-option">
              Assignment option
              <select
                value={assignmentOption}
                disabled={active || blocked}
                onChange={(e) => {
                  setRecipe(assignmentRecipes[Number(e.target.value)]);
                }}
              >
                {assignmentRecipes.map((option, index) => (
                  <option key={index} value={String(index)}>
                    {COPY_LABELS[option.mode]} ·{' '}
                    {option.mode === 'words' ? option.wordCollection : option.groupKind} ·{' '}
                    {option.characterWpm}/{option.effectiveWpm} WPM
                  </option>
                ))}
                {assignmentOption === 'custom' && <option value="custom">Adjusted settings</option>}
              </select>
            </label>
          )}
          <CopySettings recipe={currentRecipe} disabled={active || blocked} onChange={setRecipe} />
          {requiresCharacterSelection && (
            <label className="checkbox-label copy-character-confirmation">
              <input
                type="checkbox"
                checked={confirmedCharacters}
                disabled={active || blocked}
                onChange={(e) => setConfirmedCharacters(e.target.checked)}
              />{' '}
              I have selected the characters I want to strengthen for this assignment.
            </label>
          )}
          <div className="copy-entry-panel">
            <div className="copy-round-status">
              <strong>
                {discrete
                  ? `${currentRecipe.mode === 'words' ? 'Word' : 'Call'} ${(attempt?.trials.length ?? 0) + 1} of ${attempt?.targets.length ?? 25}`
                  : 'Copy the complete recording'}
              </strong>
              <span>
                {speeds.characterWpm}/{speeds.effectiveWpm} WPM ·{' '}
                {currentRecipe.toneMode === 'random'
                  ? '500–900 Hz random'
                  : `${currentRecipe.toneHz} Hz`}
              </span>
            </div>
            <div className="copy-playback-controls">
              <button
                className="button dark"
                disabled={blocked || (!active && needsCharacters)}
                onClick={() => {
                  if (!draft) start();
                  else if (playing) pause();
                  else {
                    focusAnswer();
                    playTarget(draft, draft.heard);
                  }
                }}
              >
                {!active
                  ? `Start ${COPY_LABELS[currentRecipe.mode].toLowerCase()}`
                  : playing
                    ? 'Pause audio'
                    : draft?.heard
                      ? 'Play again'
                      : draft && draft.position > 0
                        ? 'Resume audio'
                        : 'Play audio'}
              </button>
              <button
                className="button outline"
                disabled={!active || blocked || (!draft?.heard && !draft?.position)}
                onClick={() => {
                  if (!draft) return;
                  focusAnswer();
                  playTarget(draft, true);
                }}
              >
                Replay from start
              </button>
              <span className="copy-playback-status" role="status">
                {!active
                  ? 'Ready when you are'
                  : playing
                    ? player.current.position < delay.current
                      ? 'Get ready…'
                      : 'Playing'
                    : measured.thinking === 'answer'
                      ? 'Answering'
                      : 'Paused'}
                {active && (
                  <>
                    {' '}
                    · {copyDuration(player.current.position)} /{' '}
                    {copyDuration(player.current.track?.duration ?? 0)}
                  </>
                )}
              </span>
            </div>
            {discrete && (
              <p className="copy-trial-feedback" role="status">
                {feedback || '\u00a0'}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <label className="field copy-answer-field">
                Your copy
                <textarea
                  ref={answerInput}
                  rows={discrete ? 2 : 5}
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={2000}
                  value={draft?.answer ?? ''}
                  readOnly={!active}
                  disabled={blocked}
                  aria-describedby={answerHintId}
                  placeholder="Start when you're ready, then type what you hear."
                  onChange={(e) => {
                    const current = snapshot();
                    if (!hasControl() || current?.attempt.status !== 'active') return;
                    if (!playingRef.current && current.heard)
                      clock.current.startThinking('answer', performance.now());
                    clock.current.touch(performance.now());
                    write({ ...current, answer: e.target.value });
                  }}
                  onKeyDown={(e) => {
                    if (active && discrete && e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
              </label>
              <p className="field-hint" id={answerHintId}>
                {discrete
                  ? 'Press Enter to check and continue. A blank answer counts as skipped.'
                  : 'Type while listening. Finish playback before checking your copy.'}
              </p>
              <div className="copy-inline-actions copy-answer-actions">
                <button
                  type="submit"
                  className="button dark"
                  disabled={!active || !draft?.heard || playing || blocked}
                >
                  {discrete ? 'Check & next' : 'Check copy'}
                </button>
                {draft?.heard && !playing && (
                  <button
                    type="button"
                    className="button outline"
                    disabled={blocked}
                    onClick={() => {
                      if (!hasControl()) return;
                      if (measured.thinking) pause();
                      else {
                        clock.current.startThinking('answer', performance.now());
                        setTick((n) => n + 1);
                      }
                    }}
                  >
                    {measured.thinking ? 'Pause answering' : 'Resume answering'}
                  </button>
                )}
                <button
                  type="button"
                  className="text-button"
                  disabled={!active || blocked}
                  onClick={() => {
                    const current = snapshot();
                    if (!hasControl() || !current) return;
                    setRevealed(true);
                    write({
                      ...current,
                      attempt: { ...current.attempt, revealCount: current.attempt.revealCount + 1 },
                    });
                  }}
                >
                  Reveal answer
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={!active || blocked}
                  onClick={endEarly}
                >
                  Finish early
                </button>
              </div>
            </form>
            {revealed && attempt && (
              <p className="copy-revealed">
                {attempt.targets[attempt.trials.length]}{' '}
                <small>Marked as revealed in your result.</small>
              </p>
            )}
            <p className="copy-timing-hint">
              Practice time excludes setup, countdown, pauses, and time away. Answer time pauses
              after 30 seconds without input.
            </p>
          </div>
        </div>
      ) : (
        <>
          <CopyResult
            attempt={attempt}
            onReplay={
              draft.pending || saved || blocked
                ? undefined
                : (index) => playTarget(draft, false, index)
            }
          />
          {playing && (
            <button className="button outline" onClick={pause}>
              Pause review audio
            </button>
          )}
          {!saved && !draft.pending && (
            <>
              <button
                className="text-button"
                disabled={blocked}
                onClick={() => {
                  if (!hasControl()) return;
                  if (measured.thinking === 'review') pause();
                  else {
                    player.current.pause();
                    clock.current.startThinking('review', performance.now());
                    setTick((n) => n + 1);
                  }
                }}
              >
                {measured.thinking === 'review' ? 'Pause review timer' : 'Start review timer'}
              </button>
              <p className="field-hint">
                Review timing is optional. It pauses after 30 seconds without interaction.
              </p>
              <label className="field">
                Notes for this round
                <textarea
                  rows={2}
                  maxLength={10000}
                  value={draft.notes}
                  disabled={blocked}
                  onChange={(e) => {
                    if (!hasControl()) return;
                    clock.current.touch(performance.now());
                    write({ ...snapshot()!, notes: e.target.value });
                  }}
                />
              </label>
            </>
          )}
          <div className="copy-inline-actions">
            <button
              className="button dark"
              disabled={saved || saving || blocked}
              onClick={() => void save()}
            >
              {saved
                ? 'Saved to history'
                : saving
                  ? 'Saving…'
                  : accountId
                    ? draft.pending
                      ? 'Retry save'
                      : 'Save result'
                    : 'Sign in to save result'}
            </button>
            <button className="button outline" onClick={download}>
              Download result
            </button>
            <button
              className="button outline"
              disabled={saving || blocked}
              onClick={() => newRound(assignedRecipe ?? recipe)}
            >
              New round
            </button>
            {missedCopyCharacters(attempt) && (
              <button
                className="text-button"
                disabled={saving || blocked}
                onClick={() =>
                  newRound(
                    {
                      ...defaultCopyRecipe('groups'),
                      characterWpm: attempt.recipe.characterWpm,
                      effectiveWpm: attempt.recipe.effectiveWpm,
                      groupKind: 'custom',
                      customCharacters: missedCopyCharacters(attempt),
                    },
                    true,
                  )
                }
              >
                Practice missed characters
              </button>
            )}
          </div>
          {saved && (
            <p role="status">Saved. This round is included in your history and weekly report.</p>
          )}
          {draft.pending && !saved && (
            <p className="field-hint">
              This result is ready to save. Its contents stay fixed so retries cannot create
              duplicate practice.
            </p>
          )}
        </>
      )}
      <footer className="copy-credit">
        Inspired by{' '}
        <a href="https://lcwo.net/" target="_blank" rel="noopener noreferrer">
          LCWO — Learn CW Online
        </a>
        , created by Fabian Kurz. Independently implemented, using our own code and practice
        collections.
      </footer>
    </section>
  );
}
