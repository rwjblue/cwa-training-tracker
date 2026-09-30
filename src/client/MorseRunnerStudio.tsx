import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCheck, ExternalLink, RotateCcw, Square } from 'lucide-react';
import type { PlannedTask } from '../shared/plan';
import { dateInTimezone, type PracticeSession } from '../shared/training';
import {
  createRunnerRun,
  reduceRunnerEvent,
  runnerConfigureCommand,
  runnerResultNote,
  runnerStopCommand,
  RUNNER_FRAME_URL,
  RUNNER_REVISION,
  type RunnerRunState,
  type RunnerSettings,
} from '../shared/runner';
import './morse-runner.css';

export const DEFAULT_RUNNER_SETTINGS: RunnerSettings = {
  mode: 'SingleCall',
  wpm: 20,
  durationSeconds: 300,
  activity: 2,
  conditions: { qrm: false, qrn: false, qsb: false, flutter: false, lids: false },
};
const fallbackUrl = 'https://fritzsche.github.io/WebMorseRunner/';
const terminal = (run: RunnerRunState) => ['completed', 'stopped', 'error'].includes(run.status);
const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** Engine messages alone determine practiced time. The studio wall clock is never used here. */
export default function MorseRunnerStudio({
  settings,
  timezone,
  task,
  externalUrl = fallbackUrl,
  savedEntry,
  onLog,
  onUnsavedChange,
}: {
  settings: RunnerSettings;
  timezone?: string;
  task?: PlannedTask;
  externalUrl?: string;
  savedEntry?: PracticeSession;
  onLog: (initial?: Partial<PracticeSession>) => void;
  onUnsavedChange: (unsaved: boolean) => void;
}) {
  const [run, setRun] = useState(() => createRunnerRun(crypto.randomUUID(), settings));
  const resultIdentity = useRef<{ runId: string; createdAt: string; date: string } | undefined>(
    undefined,
  );
  const current = useRef(run);
  const frame = useRef<HTMLIFrameElement>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resize = useRef<ResizeObserver | null>(null);
  const [frameHeight, setFrameHeight] = useState(900);
  const [stopping, setStopping] = useState(false);
  const [savedRunId, setSavedRunId] = useState<string>();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const callbacks = useRef({ onLog, onUnsavedChange });
  callbacks.current = { onLog, onUnsavedChange };
  const saved = savedRunId === run.runId;
  const ended = terminal(run);
  const hasTime = run.elapsedSeconds >= 1;
  const unsaved = !saved && (run.status === 'running' || hasTime);

  const update = (next: RunnerRunState) => {
    current.current = next;
    setRun(next);
    if (terminal(next)) {
      clearTimeout(timeout.current);
      setStopping(false);
    }
  };
  const fail = (runId: string) => {
    const latest = current.current;
    if (latest.runId !== runId || terminal(latest)) return;
    const endedAt = new Date().toISOString();
    // Retain only the last acknowledged engine time; waiting for a response earns no time.
    update({
      ...latest,
      status: 'error',
      errorCode: 'interrupted',
      ...(latest.status === 'running' &&
      (!latest.runStartedAt || Date.parse(endedAt) >= Date.parse(latest.runStartedAt))
        ? { runEndedAt: endedAt }
        : {}),
    });
  };
  const stop = () => {
    const latest = current.current;
    if (terminal(latest)) return;
    if (latest.status === 'loading') {
      fail(latest.runId);
      return;
    }
    setStopping(true);
    frame.current?.contentWindow?.postMessage(runnerStopCommand(latest), location.origin);
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => fail(latest.runId), 2000);
  };

  useEffect(() => {
    callbacks.current.onUnsavedChange(unsaved);
  }, [unsaved]);
  useEffect(() => {
    const savedRunner = savedEntry?.metadata?.runner;
    if (
      savedRunner &&
      typeof savedRunner === 'object' &&
      !Array.isArray(savedRunner) &&
      (savedRunner as Record<string, unknown>).runId === current.current.runId
    ) {
      setSavedRunId(current.current.runId);
    }
  }, [savedEntry]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      const previous = current.current;
      const next = reduceRunnerEvent(previous, event.data, new Date().toISOString());
      if (next === previous) return;
      if (previous.status === 'loading' && next.status === 'ready') clearTimeout(timeout.current);
      update(next);
      if (next.status === 'running' && document.hidden) stop();
    };
    const visibility = () => {
      if (document.hidden && current.current.status === 'running') stop();
    };
    window.addEventListener('message', receive);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('message', receive);
      document.removeEventListener('visibilitychange', visibility);
      clearTimeout(timeout.current);
      resize.current?.disconnect();
      frame.current?.contentWindow?.postMessage(
        runnerStopCommand(current.current),
        location.origin,
      );
      callbacks.current.onUnsavedChange(false);
    };
  }, []);
  useEffect(() => {
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => fail(run.runId), 20000);
    return () => clearTimeout(timeout.current);
  }, [run.runId]);

  const configure = () => {
    const element = frame.current;
    if (!element) return;
    if (current.current.status !== 'loading') {
      // A reload or in-frame navigation replaces the configured, single-run bridge.
      if (!terminal(current.current)) fail(current.current.runId);
      return;
    }
    element.contentWindow?.postMessage(runnerConfigureCommand(current.current), location.origin);
    resize.current?.disconnect();
    const body = element.contentDocument?.body;
    if (body && typeof ResizeObserver !== 'undefined') {
      const fit = () =>
        setFrameHeight(
          Math.max(650, Math.min(2000, Math.ceil(body.getBoundingClientRect().height) + 24)),
        );
      fit();
      resize.current = new ResizeObserver(fit);
      resize.current.observe(body);
    }
  };
  const restart = () => {
    if (unsaved && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    frame.current?.contentWindow?.postMessage(runnerStopCommand(current.current), location.origin);
    resize.current?.disconnect();
    setConfirmDiscard(false);
    setStopping(false);
    setSavedRunId(undefined);
    const nextSettings = {
      ...current.current.settings,
      wpm: current.current.speedHistory?.at(-1)?.wpm ?? current.current.settings.wpm,
    };
    update(createRunnerRun(crypto.randomUUID(), nextSettings));
  };
  const review = () => {
    const latest = current.current;
    if (!terminal(latest) || latest.elapsedSeconds < 1 || savedRunId === latest.runId) return;
    const { lastSequence: _sequence, ...result } = latest;
    if (resultIdentity.current?.runId !== latest.runId) {
      const createdAt = latest.runEndedAt ?? latest.runStartedAt ?? new Date().toISOString();
      resultIdentity.current = {
        runId: latest.runId,
        createdAt,
        date: dateInTimezone(new Date(createdAt), timezone),
      };
    }
    callbacks.current.onLog({
      id: `runner:${latest.runId}`,
      createdAt: resultIdentity.current.createdAt,
      date: resultIdentity.current.date,
      kind: 'simulator',
      minutes: latest.elapsedSeconds / 60,
      characterWpm: latest.settings.wpm,
      lesson: task?.lesson,
      qsoCount: latest.summary?.qsoCount,
      notes: [task?.title, runnerResultNote(latest)].filter(Boolean).join('\n'),
      source: 'timer',
      metadata: {
        practiceTool: 'morse-runner',
        elapsedSeconds: latest.elapsedSeconds,
        runner: { ...result, revision: RUNNER_REVISION },
        ...(task ? { plannedTaskId: task.id } : {}),
      },
    });
  };
  const messages: Record<RunnerRunState['status'], string> = {
    loading: 'Loading the simulator and your settings…',
    ready:
      'Ready. Enter your station call and click Run inside the simulator. Setup time does not count.',
    running: 'Run in progress. Keep this page visible; switching apps ends this run as partial.',
    completed: 'Run complete. Review and save your results below.',
    stopped: 'Run stopped. Your confirmed practice time and results are ready to save.',
    error:
      'The simulator could not continue. You can save any confirmed time, then start a new run.',
  };
  const actualWpm = run.speedHistory?.at(-1)?.wpm ?? run.settings.wpm;
  return (
    <section className="card runner-studio" aria-labelledby="runner-heading">
      <div className="runner-heading">
        <div>
          <span className="eyebrow">CALL. COPY. CONFIRM.</span>
          <h2 id="runner-heading">Morse Runner</h2>
          <p>
            {task
              ? 'Your assignment settings are loaded below. You can adjust them before Run.'
              : 'A simulated contact, one exchange at a time. Adjust the settings before Run.'}
          </p>
        </div>
        <span className="chip">
          {run.settings.mode === 'WPX' ? 'WPX Contest' : 'Single Call'} · {actualWpm} WPM ·{' '}
          {run.settings.durationSeconds / 60} min
        </span>
      </div>
      <p className="runner-status" role="status">
        {saved
          ? 'Run saved to your practice log. Start a new run when you’re ready.'
          : stopping
            ? 'Stopping and collecting results…'
            : messages[run.status]}
      </p>
      <div className="runner-session-controls">
        <div className="runner-engine-time">
          <strong aria-label={`${time(run.elapsedSeconds)} engine time`}>
            {time(run.elapsedSeconds)}
          </strong>
          <span>
            engine time · {saved ? 'saved' : hasTime ? 'not yet saved' : 'ready to practice'}
          </span>
        </div>
        <button
          className="button outline"
          onClick={stop}
          disabled={run.status !== 'running' || stopping}
        >
          <Square size={14} /> {stopping ? 'Stopping…' : 'Stop run'}
        </button>
        <button className="button dark" onClick={review} disabled={!ended || !hasTime || saved}>
          {saved ? <CheckCheck size={16} /> : <ArrowRight size={16} />}
          {saved ? 'Run saved' : 'Review & save run'}
        </button>
      </div>
      <details className="runner-help">
        <summary>How to practice</summary>
        <p>
          In Single Call, stations call you automatically. Copy their call, press Enter, copy the
          exchange, and press Enter to log it. In WPX Contest, use F1 CQ to begin. The simulator’s
          on-screen F-key buttons also work on touch screens.
        </p>
        <p>
          Each run has its own timer and score. Stopping preserves a partial run. Saving adds only
          engine-confirmed seconds; a finished run does not mark your entire assignment complete.
        </p>
      </details>
      {run.status !== 'error' && (
        <iframe
          key={run.runId}
          ref={frame}
          src={RUNNER_FRAME_URL}
          title="Web Morse Runner practice simulator"
          className="runner-frame"
          style={{ height: frameHeight }}
          allow="autoplay"
          sandbox="allow-scripts allow-same-origin allow-downloads"
          onLoad={configure}
        />
      )}
      {ended && (
        <div className="runner-results">
          <h3>
            {saved
              ? 'Saved results'
              : run.status === 'completed'
                ? 'Run results'
                : 'Partial run results'}
          </h3>
          {run.summary ? (
            <dl>
              <div>
                <dt>QSOs</dt>
                <dd>{run.summary.qsoCount}</dd>
              </div>
              <div>
                <dt>Verified points</dt>
                <dd>{run.summary.verifiedPoints}</dd>
              </div>
              <div>
                <dt>Verified score</dt>
                <dd>{run.summary.score}</dd>
              </div>
              <div>
                <dt>NR / NIL errors</dt>
                <dd>
                  {run.summary.nrErrors} / {run.summary.nilErrors}
                </dd>
              </div>
            </dl>
          ) : (
            <p>
              The engine did not return a score. Only its last confirmed practice time can be saved.
            </p>
          )}
          <p>
            {hasTime
              ? `${time(run.elapsedSeconds)} of engine time. Review the entry to add notes before saving.`
              : 'No practice time was recorded. Start a new run when you’re ready.'}
          </p>
          <button className="button outline" onClick={restart}>
            <RotateCcw size={15} /> Start new run
          </button>
          {confirmDiscard && (
            <div
              className="runner-discard"
              role="group"
              aria-label="Discard unsaved runner results"
            >
              <p>
                Starting a new run discards these unsaved results. Save them first, or discard this
                run.
              </p>
              <button className="button outline" onClick={() => setConfirmDiscard(false)}>
                Keep results
              </button>
              <button className="button outline danger-text" onClick={restart}>
                Discard & start new run
              </button>
            </div>
          )}
        </div>
      )}
      <div className="runner-footer">
        <p>
          Leave this studio only after saving. Practice here uses synthetic calls and creates no
          real radio contacts.
        </p>
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (run.status === 'running') stop();
          }}
        >
          Open standalone runner <ExternalLink size={13} />
        </a>
        <span>Standalone practice does not send time or scores back to this tracker.</span>
      </div>
    </section>
  );
}
