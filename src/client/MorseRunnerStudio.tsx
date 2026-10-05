import { usePracticeTimeProjection } from './usePracticeTimeProjection';
import type { CurrentPracticeTime } from '../shared/practice-time';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ArrowRight, CheckCheck, ExternalLink, RotateCcw, Square } from 'lucide-react';
import type { PlannedTask } from '../shared/plan';
import {
  runnerAssignmentProgress,
  runnerProgressWithCurrent,
  type CurrentRunnerProgress,
} from '../shared/runner-progress';
import RunnerAssignmentProgress from './RunnerAssignmentProgress';
import {
  dateInTimezone,
  getPracticePurpose,
  type PracticePurpose,
  type PracticeSession,
} from '../shared/training';
import {
  createRunnerRun,
  reduceRunnerEvent,
  runnerConfigureCommand,
  runnerStopCommand,
  RUNNER_FRAME_URL,
  type RunnerRunState,
  type RunnerSettings,
} from '../shared/runner';
import {
  captureRunnerPracticeAttribution,
  finishedRunnerSession,
  type RunnerPracticeAttribution,
} from './runner-session';
import { RunnerStopFlight } from './runner-stop-flight';
import { getConfirmedAccountGeneration } from './account-outbox';
import { getDeviceScopeToken, isDeviceScopeCurrent } from './device-scope';
import { freezePracticeSaveOrigin, type PracticeSaveOrigin } from './practice-autosave';
import { clearRunnerResult, retainFinishedRunnerResult, readRunnerReview } from './runner-results';
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
export interface MorseRunnerStudioHandle {
  pauseForInspection(): Promise<void>;
  finishForNavigation(): Promise<boolean>;
  discard(): Promise<boolean>;
  reviewForCompletion(): Promise<PracticeSession | undefined>;
}

interface Props {
  settings: RunnerSettings;
  accountId?: string;
  timezone?: string;
  task?: PlannedTask;
  purpose?: PracticePurpose;
  context?: PracticeSession['context'];
  externalUrl?: string;
  savedEntry?: PracticeSession;
  active?: boolean;
  entries?: readonly PracticeSession[];
  tasks?: readonly PlannedTask[];
  today?: string;
  onProgressChange?: (current: CurrentRunnerProgress | undefined) => void;
  onResultReadyChange?: (resultId: string | undefined) => void;
  onCurrentPracticeChange?: (current: CurrentPracticeTime | undefined) => void;
  onLog: (initial?: Partial<PracticeSession>) => void;
  onUnsavedChange: (unsaved: boolean) => void;
}

const MorseRunnerStudio = forwardRef<MorseRunnerStudioHandle, Props>(function MorseRunnerStudio(
  {
    settings,
    accountId,
    timezone,
    task,
    purpose,
    context,
    externalUrl = fallbackUrl,
    savedEntry,
    active = true,
    entries = [],
    tasks = [],
    today,
    onProgressChange,
    onResultReadyChange,
    onCurrentPracticeChange,
    onLog,
    onUnsavedChange,
  },
  ref,
) {
  const [run, setRun] = useState(() => createRunnerRun(crypto.randomUUID(), settings));
  const capturedAttribution = useRef<RunnerPracticeAttribution | undefined>(undefined);
  capturedAttribution.current ??= captureRunnerPracticeAttribution(task, purpose, context);
  const scope = accountId ?? 'guest';
  const [deviceToken] = useState(() => getDeviceScopeToken(scope));
  const start = useRef<{ runId: string; timezone: string; origin: PracticeSaveOrigin } | undefined>(
    undefined,
  );
  const finished = useRef<PracticeSession | undefined>(undefined);
  const timezoneRef = useRef(timezone ?? 'UTC');
  timezoneRef.current = timezone ?? 'UTC';
  const [resultRetained, setResultRetained] = useState(false);
  const [retentionError, setRetentionError] = useState('');
  const current = useRef(run);
  const frame = useRef<HTMLIFrameElement>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stopFlight = useRef(new RunnerStopFlight());
  const inspected = useRef(!active);
  const activeRef = useRef(active);
  activeRef.current = active;
  const resize = useRef<ResizeObserver | null>(null);
  const [frameHeight, setFrameHeight] = useState(900);
  const [stopping, setStopping] = useState(false);
  const [inspectionStopped, setInspectionStopped] = useState(false);
  const [savedRunId, setSavedRunId] = useState<string>();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const callbacks = useRef({ onLog, onUnsavedChange, onProgressChange, onResultReadyChange });
  callbacks.current = { onLog, onUnsavedChange, onProgressChange, onResultReadyChange };
  const saved = savedRunId === run.runId;
  const ended = terminal(run);
  const hasTime = run.elapsedSeconds >= 1;
  const unsaved = !saved && (run.status === 'running' || hasTime);

  let projection: CurrentRunnerProgress | undefined;
  const attribution = capturedAttribution.current;
  if (attribution.task && run.runStartedAt && run.elapsedSeconds > 0 && !saved) {
    try {
      const retained = ended
        ? readRunnerReview(scope, `runner:${run.runId}`, deviceToken)
        : undefined;
      projection = {
        id: `runner:${run.runId}`,
        taskId: attribution.task.id,
        date: dateInTimezone(run.runStartedAt, start.current?.timezone ?? timezoneRef.current),
        seconds: run.elapsedSeconds,
        purpose: retained
          ? getPracticePurpose(retained.entry)
          : (attribution.purpose ?? 'assigned'),
        classTime: (retained ? retained.entry.context : attribution.context) === 'class',
      };
    } catch {
      // Unknown retained classification must not imply required assignment credit.
    }
  }
  let currentTime: CurrentPracticeTime | undefined;
  if (run.runStartedAt && !saved && isDeviceScopeCurrent(scope, deviceToken)) {
    let currentContext = finished.current?.context ?? attribution.context;
    if (ended) {
      try {
        currentContext =
          readRunnerReview(scope, `runner:${run.runId}`, deviceToken)?.entry.context ??
          currentContext;
      } catch {
        /* Retention failure keeps the acknowledged in-memory result and its original context. */
      }
    }
    currentTime = {
      id: `runner:${run.runId}`,
      date: dateInTimezone(run.runStartedAt, start.current?.timezone ?? timezoneRef.current),
      seconds: run.elapsedSeconds,
      classTime: currentContext === 'class',
    };
  }
  usePracticeTimeProjection(currentTime, run.status !== 'running', onCurrentPracticeChange);
  const progressDate = today ?? dateInTimezone(new Date(), timezoneRef.current);
  const savedProgress = useMemo(
    () => runnerAssignmentProgress(tasks, entries, progressDate),
    [tasks, entries, progressDate],
  );
  const progressTask = tasks.find((item) => item.id === task?.id);
  const progress =
    progressTask && savedProgress.has(progressTask.id)
      ? runnerProgressWithCurrent(
          progressTask,
          savedProgress.get(progressTask.id)!.savedSeconds,
          progressDate,
          projection,
          entries.some((entry) => entry.id === projection?.id),
        )
      : undefined;
  useEffect(() => {
    // Today is inspected after Stop acknowledgement. Do not publish a second live
    // engine owner or rerender the app for every native running observation.
    if (run.status !== 'running') callbacks.current.onProgressChange?.(projection);
  }, [run, saved, projection?.purpose, projection?.classTime]);

  const retainResult = (next: RunnerRunState): boolean => {
    if (!isDeviceScopeCurrent(scope, deviceToken)) return false;
    if (next.elapsedSeconds < 1) return true;
    try {
      const captured = start.current;
      if (!captured || captured.runId !== next.runId)
        throw new Error(
          'The run start attribution is unavailable. Keep this result before starting over.',
        );
      finished.current ??= finishedRunnerSession(
        next,
        capturedAttribution.current!,
        captured.timezone,
      );
      freezePracticeSaveOrigin(scope, finished.current.id, captured.origin.generation, deviceToken);
      const retained = retainFinishedRunnerResult(
        scope,
        finished.current,
        captured.origin,
        deviceToken,
      );
      finished.current = retained.entry;
      setResultRetained(true);
      setRetentionError('');
      return true;
    } catch (error) {
      setResultRetained(false);
      setRetentionError((error as Error).message);
      return false;
    }
  };

  const update = (next: RunnerRunState) => {
    if (!isDeviceScopeCurrent(scope, deviceToken)) return;
    if (next.status === 'running' && current.current.status !== 'running') {
      start.current = {
        runId: next.runId,
        timezone: timezoneRef.current,
        origin: {
          id: `runner:${next.runId}`,
          accountId: scope,
          ...(scope === 'guest' || getConfirmedAccountGeneration(scope) === undefined
            ? {}
            : { generation: getConfirmedAccountGeneration(scope) }),
        },
      };
    }
    current.current = next;
    setRun(next);
    if (terminal(next)) {
      clearTimeout(timeout.current);
      stopFlight.current.settle(next.runId);
      setStopping(false);
      if (!saved) retainResult(next);
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
    if (terminal(latest)) return Promise.resolve();
    if (latest.status === 'loading') {
      fail(latest.runId);
      return Promise.resolve();
    }
    return stopFlight.current.wait(
      latest.runId,
      () => {
        setStopping(true);
        frame.current?.contentWindow?.postMessage(runnerStopCommand(latest), location.origin);
      },
      () => fail(latest.runId),
    );
  };
  const pauseForInspection = () => {
    inspected.current = true;
    if (current.current.status !== 'running') return Promise.resolve();
    setInspectionStopped(true);
    return stop();
  };
  const finishForNavigation = async () => {
    await pauseForInspection();
    if (!isDeviceScopeCurrent(scope, deviceToken)) return false;
    return saved || current.current.elapsedSeconds < 1 || retainResult(current.current);
  };
  const discard = async () => {
    await pauseForInspection();
    if (!isDeviceScopeCurrent(scope, deviceToken)) return false;
    try {
      clearRunnerResult(scope, `runner:${current.current.runId}`, deviceToken);
      finished.current = undefined;
      setResultRetained(false);
      callbacks.current.onUnsavedChange(false);
      callbacks.current.onResultReadyChange?.(undefined);
      return true;
    } catch (error) {
      setRetentionError((error as Error).message);
      return false;
    }
  };
  const reviewForCompletion = async () => {
    await stop();
    if (!isDeviceScopeCurrent(scope, deviceToken)) return undefined;
    if (savedEntry?.id === `runner:${current.current.runId}`) return savedEntry;
    if (current.current.elapsedSeconds < 1) return undefined;
    retainResult(current.current);
    if (!finished.current)
      throw new Error(
        'The acknowledged Runner result is unavailable. Retry before completing this exercise.',
      );
    return finished.current;
  };
  useImperativeHandle(ref, () => ({
    pauseForInspection,
    finishForNavigation,
    discard,
    reviewForCompletion,
  }));
  useLayoutEffect(() => {
    if (active) inspected.current = false;
    else void pauseForInspection();
  }, [active]);

  useEffect(() => {
    // Acknowledged terminal state, including a volatile result if storage fails.
    callbacks.current.onResultReadyChange?.(
      ended && hasTime && !saved ? `runner:${run.runId}` : undefined,
    );
    return () => callbacks.current.onResultReadyChange?.(undefined);
  }, [run.runId, ended, hasTime, saved]);
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
      if (
        next.status === 'running' &&
        (document.hidden || inspected.current || !activeRef.current)
      ) {
        if (inspected.current || !activeRef.current) setInspectionStopped(true);
        void stop();
      }
    };
    const visibility = () => {
      if (document.hidden && current.current.status === 'running') void stop();
    };
    window.addEventListener('message', receive);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('message', receive);
      document.removeEventListener('visibilitychange', visibility);
      clearTimeout(timeout.current);
      stopFlight.current.dispose();
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
    if (inspected.current || !activeRef.current || !isDeviceScopeCurrent(scope, deviceToken))
      return;
    if (unsaved && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    try {
      if (current.current.elapsedSeconds >= 1 || finished.current)
        clearRunnerResult(scope, `runner:${current.current.runId}`, deviceToken);
    } catch (error) {
      setRetentionError((error as Error).message);
      return;
    }
    frame.current?.contentWindow?.postMessage(runnerStopCommand(current.current), location.origin);
    resize.current?.disconnect();
    setConfirmDiscard(false);
    setStopping(false);
    setInspectionStopped(false);
    setSavedRunId(undefined);
    finished.current = undefined;
    start.current = undefined;
    setResultRetained(false);
    setRetentionError('');
    const nextSettings = {
      ...current.current.settings,
      wpm: current.current.speedHistory?.at(-1)?.wpm ?? current.current.settings.wpm,
    };
    capturedAttribution.current = captureRunnerPracticeAttribution(task, purpose, context);
    update(createRunnerRun(crypto.randomUUID(), nextSettings));
  };
  const review = () => {
    if (inspected.current || !activeRef.current) return;
    const latest = current.current;
    if (!terminal(latest) || latest.elapsedSeconds < 1 || savedRunId === latest.runId) return;
    retainResult(latest);
    if (finished.current) callbacks.current.onLog(finished.current);
  };
  const messages: Record<RunnerRunState['status'], string> = {
    loading: 'Loading the simulator and your settings…',
    ready:
      'Ready. Enter your station call and click Run inside the simulator. Setup time does not count.',
    running: 'Run in progress. Visiting another view or switching apps stops this run as partial.',
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
      {context === 'class' && (
        <p className="field-hint">
          This run is class time, kept separate from required practice and daily goals.
        </p>
      )}
      {ended && hasTime && !saved && (
        <p className="field-hint" role="status">
          {resultRetained
            ? 'Finished result retained on this device for review. Reopen it from your logbook; it has not been uploaded or logged yet.'
            : 'Finished result is only on this open page until device retention or a reviewed save succeeds.'}
        </p>
      )}
      {retentionError && (
        <div className="alert error" role="alert">
          <p>{retentionError}</p>
          {ended && hasTime && (
            <button className="button outline" onClick={() => retainResult(current.current)}>
              Retry retaining result
            </button>
          )}
        </div>
      )}
      {inspectionStopped && (
        <p className="field-hint">
          Visiting another view stopped this run. Its confirmed partial result stays here until you
          review it. A retained finished result can also be reopened from your logbook.
        </p>
      )}
      <div className="runner-session-controls">
        <div className="runner-engine-time">
          <strong aria-label={`${time(run.elapsedSeconds)} engine time`}>
            {time(run.elapsedSeconds)}
          </strong>
          <span>
            engine time · {saved ? 'saved' : hasTime ? 'not yet saved' : 'ready to practice'}
          </span>
        </div>
        {run.status !== 'loading' && run.status !== 'ready' && (
          <>
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
          </>
        )}
      </div>
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
      {progress && (
        <RunnerAssignmentProgress progress={progress} extraReview={purpose === 'review'} />
      )}
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
          You can visit another view and return to these results. Finish or switch retains the
          acknowledged result for review in your logbook. Practice here uses synthetic calls and
          creates no real radio contacts.
        </p>
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (run.status === 'running') void stop();
          }}
        >
          Open standalone runner <ExternalLink size={13} />
        </a>
        <span>Standalone practice does not send time or scores back to this tracker.</span>
      </div>
    </section>
  );
});

export default MorseRunnerStudio;
