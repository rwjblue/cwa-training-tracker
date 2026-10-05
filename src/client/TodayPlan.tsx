import RunnerAssignmentProgress from './RunnerAssignmentProgress';
import LiveAssignmentWindow from './LiveAssignmentWindow';
import ClassMeetingCard from './ClassMeetingCard';
import {
  runnerAssignmentProgress,
  type CurrentRunnerProgress,
  type RunnerAssignmentProgress as RunnerProgress,
} from '../shared/runner-progress';
import ListeningPassProgress from './ListeningPassProgress';
import TaskRecordingChoiceHint from './TaskRecordingChoiceHint';
import { useId, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ExternalLink,
  Headphones,
  Play,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import {
  courseMeetings,
  dateInTimezone,
  PRACTICE_KINDS,
  type PracticeSession,
  type PracticePurpose,
  type Profile,
} from '../shared/training';
import {
  dailyPlanSummary,
  practiceForTask,
  type DailyPlannedTask,
  type PlannedTask,
} from '../shared/plan';
import './today-plan.css';
import TaskTodayPin from './TaskTodayPin';
import { curriculumForLevel, sessionSyllabusUrl } from '../shared/curriculum';

export interface TodayPlanProps {
  nextAction?: React.ReactNode;
  preparation?: React.ReactNode;
  liveNow?: number;
  currentRunner?: CurrentRunnerProgress;
  today?: string;
  accountId?: string;
  profile: Profile;
  entries: PracticeSession[];
  tasks: PlannedTask[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onDismiss: (tasks: PlannedTask[]) => Promise<void>;
  onPin: (task: PlannedTask, date: string | null) => Promise<unknown>;
  pendingIds?: string[];
  onLog: (initial?: Partial<PracticeSession>) => void;
  onManagePlan: () => void;
  onImport: () => void;
  onPractice?: () => void;
  onPracticeTask?: (task: PlannedTask, purpose: PracticePurpose) => void;
  onAddTask?: () => void;
  onSetupCourse?: () => void;
}

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
const minuteLabel = (minutes: number) => Number(minutes.toFixed(1));

/** The parent owns private data, so course edits and journal saves stay in sync. */
export default function TodayPlan({
  nextAction,
  preparation,
  liveNow = Date.now(),
  accountId,
  currentRunner,
  profile,
  today: learnerDate,
  entries,
  tasks,
  loading = false,
  error,
  onRetry,
  onDismiss,
  onPin,
  pendingIds = [],
  onLog,
  onManagePlan,
  onImport,
  onPractice,
  onPracticeTask,
  onAddTask,
  onSetupCourse,
}: TodayPlanProps) {
  const titleId = useId();
  const [dismissing, setDismissing] = useState<string[]>([]);
  const [dismissedCount, setDismissedCount] = useState(0);
  const [saveError, setSaveError] = useState('');
  const [pinning, setPinning] = useState('');
  const [pinNotice, setPinNotice] = useState('');
  const title = useRef<HTMLHeadingElement>(null);
  const today = learnerDate ?? dateInTimezone(new Date(), profile.timezone);
  const runnerProgress = useMemo(
    () => runnerAssignmentProgress(tasks, entries, today, currentRunner),
    [tasks, entries, today, currentRunner],
  );
  const plan = dailyPlanSummary(tasks, courseMeetings(profile), entries, today);
  const course = curriculumForLevel(profile.level);
  const curriculum = tasks.some((task) => task.curriculum?.id === course?.id) ? course : undefined;
  const needsCourseDates = !profile.firstClassDate;
  const syllabusUrl = plan.nextMeeting
    ? sessionSyllabusUrl(profile.level, plan.nextMeeting.lesson)
    : undefined;
  async function dismissTasks(selected: PlannedTask[]) {
    if (dismissing.length || pinning || !selected.length) return;
    setDismissing(selected.map((task) => task.id));
    setSaveError('');
    try {
      await onDismiss(selected);
      setDismissedCount((count) => count + selected.length);
      // Dismissed rows disappear after saving. Keep keyboard focus in the plan.
      title.current?.focus();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Could not dismiss earlier work. Try again.',
      );
    } finally {
      setDismissing([]);
    }
  }
  async function pinTask(task: PlannedTask, date: string | null) {
    if (pinning || dismissing.length) return;
    setPinning(task.id);
    setPinNotice('');
    setSaveError('');
    try {
      await onPin(task, date);
      setPinNotice(
        date
          ? `Pinned for ${date}. Original assignment unchanged.`
          : 'Removed from today. Original assignment unchanged.',
      );
      // The row moves groups after a save. Keep keyboard focus in the plan.
      title.current?.focus();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save the pin. Try again.');
    } finally {
      setPinning('');
    }
  }
  const renderTasks = (items: DailyPlannedTask[], dismissible = false) => (
    <ul className="today-plan-list">
      {items.map((item) => (
        <TodayTask
          profile={profile}
          liveNow={liveNow}
          scope={accountId}
          key={item.task.id}
          item={item}
          runnerProgress={runnerProgress.get(item.task.id)}
          today={today}
          pinBusy={pinning || dismissing[0] || ''}
          onPin={(date) => void pinTask(item.task, date)}
          onDismiss={dismissible ? () => void dismissTasks([item.task]) : undefined}
          dismissBusy={dismissing.includes(item.task.id)}
          dismissDisabled={dismissing.length > 0 || Boolean(pinning)}
          pending={pendingIds.includes(item.task.id)}
          onLog={() => onLog(practiceForTask(item.task, today))}
          onPractice={onPracticeTask ? (purpose) => onPracticeTask(item.task, purpose) : undefined}
        />
      ))}
    </ul>
  );
  const hasCurrent = plan.pendingCount > 0 || plan.pinned.length > 0;
  return (
    <section className="card today-plan" aria-labelledby={titleId} aria-busy={loading}>
      <header className="today-plan-heading">
        <div>
          <span className="eyebrow">YOUR NEXT SMALL STEPS</span>
          <h2 id={titleId} ref={title} tabIndex={-1}>
            What should I do today?
          </h2>
          <p>
            {dayLabel(today)} <span>· {profile.timezone.replaceAll('_', ' ')}</span>
          </p>
        </div>
        <button className="today-plan-manage" onClick={onManagePlan}>
          Your full plan <ArrowRight size={14} />
        </button>
      </header>
      <ClassMeetingCard now={liveNow} accountId={accountId} profile={profile} onLog={onLog} />
      {preparation}
      {nextAction}
      {!loading && !profile.classSchedule && plan.nextMeeting && (
        <div className="today-plan-next-class">
          <CalendarDays size={15} />
          <span>
            {plan.nextMeeting.date === today
              ? 'Class today'
              : `Next class ${dayLabel(plan.nextMeeting.date)}`}{' '}
            <strong>Session {plan.nextMeeting.lesson}</strong>
          </span>
          {plan.currentCount > 0 && (
            <span className="today-plan-count">
              {plan.completedCount}/{plan.currentCount} done
            </span>
          )}
        </div>
      )}
      {pinNotice && (
        <p className="today-plan-dismissed" role="status">
          {pinNotice}
        </p>
      )}
      {(error || saveError) && (
        <div className="today-plan-error" role="alert">
          {saveError || error}
          {error && onRetry && (
            <button className="text-button" onClick={onRetry}>
              Try again
            </button>
          )}
        </div>
      )}
      {dismissedCount > 0 && (
        <p className="today-plan-dismissed" role="status">
          {dismissedCount} earlier {dismissedCount === 1 ? 'exercise is' : 'exercises are'} hidden
          from Today and still unfinished. Restore them in{' '}
          <button onClick={onManagePlan}>your full plan</button>.
        </p>
      )}
      {loading ? (
        <p className="today-plan-message" role="status">
          Finding your planned exercises…
        </p>
      ) : error ? null : tasks.length === 0 ? (
        <div className="today-plan-empty">
          <span className="today-plan-empty-icon">
            <BookOpen size={21} />
          </span>
          <div>
            <h3>{needsCourseDates ? 'Set up your course.' : 'Make your daily practice plan.'}</h3>
            <p>
              Your course assignments appear automatically when you save your course dates. Follow
              the linked official instructions and add your advisor’s exercises.
            </p>
            <div className="today-plan-empty-actions">
              {onSetupCourse && (
                <button className="button dark small" onClick={onSetupCourse}>
                  <CalendarDays size={14} />
                  {needsCourseDates ? 'Set course dates' : 'Course settings'}
                </button>
              )}
              <button className="text-button" onClick={onAddTask ?? onManagePlan}>
                <Plus size={13} /> Add an exercise
              </button>
              <button className="text-button" onClick={onImport}>
                <Upload size={13} />
                Restore backup
              </button>
            </div>
            {onPractice && (
              <button className="today-plan-studio" onClick={onPractice}>
                <Headphones size={15} />
                <span>Ready for extra practice? Explore the practice tools.</span>
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {!hasCurrent && (
            <div className="today-plan-clear">
              <span className="today-plan-empty-icon">
                {plan.completedCount ? <Check size={20} /> : <CalendarDays size={20} />}
              </span>
              <div>
                <h3>
                  {plan.completedCount
                    ? 'Today’s plan is complete.'
                    : 'No exercises scheduled for today.'}
                </h3>
                <p>
                  {plan.nextPracticeDate
                    ? `Your next dated practice is ${dayLabel(plan.nextPracticeDate)}. You can review earlier work or keep practicing.`
                    : plan.hasUndatedLessons
                      ? 'Add your course dates to put session exercises on the calendar, or give an exercise its own practice date.'
                      : 'You can review earlier work, choose an undated exercise, or make room for some extra practice.'}
                </p>
                {onPractice && (
                  <button className="text-button" onClick={onPractice}>
                    Open practice tools <ArrowRight size={13} />
                  </button>
                )}
              </div>
            </div>
          )}
          {plan.assignedToday.length > 0 && (
            <div className="today-plan-group">
              <h3 className="today-plan-group-title">
                Assigned for today <span>{plan.assignedToday.length}</span>
              </h3>
              {renderTasks(plan.assignedToday)}
            </div>
          )}
          {plan.preparation.length > 0 && (
            <div className="today-plan-group">
              <h3 className="today-plan-group-title">
                Prepare for session {plan.nextMeeting?.lesson}
                <span>{plan.preparation.length}</span>
              </h3>
              <p className="today-plan-group-hint">Practice for your upcoming class.</p>
              {renderTasks(plan.preparation)}
            </div>
          )}
          {plan.pinned.length > 0 && (
            <div className="today-plan-group" role="region" aria-label="Added to today">
              <h3 className="today-plan-group-title">
                Added to today <span>{plan.pinned.length}</span>
              </h3>
              <p className="today-plan-group-hint">
                Chosen for today · original assignment dates stay the same.
              </p>
              {renderTasks(plan.pinned)}
            </div>
          )}
          {plan.liveUpcoming.length > 0 && (
            <div className="today-plan-group">
              <h3 className="today-plan-group-title">
                Upcoming live practice <span>{plan.liveUpcoming.length}</span>
              </h3>
              <p className="today-plan-group-hint">
                Choose a window before class. These exercises are for a future day.
              </p>
              {renderTasks(plan.liveUpcoming)}
            </div>
          )}
          {plan.completed.length > 0 && (
            <details className="today-plan-disclosure">
              <summary>
                <Check size={14} />
                Completed in this plan<span>{plan.completed.length}</span>
                <ChevronDown size={14} />
              </summary>
              {renderTasks(plan.completed)}
            </details>
          )}
          {plan.earlier.length > 0 && (
            <details className="today-plan-disclosure">
              <summary>
                <CalendarDays size={14} />
                Earlier unfinished work<span>{plan.earlier.length}</span>
                <ChevronDown size={14} />
              </summary>
              <p className="today-plan-group-hint">
                Available when you want to revisit it. Today’s assignments stay first.
              </p>
              <div className="today-plan-dismiss-actions">
                <button
                  className="text-button"
                  disabled={dismissing.length > 0 || Boolean(pinning)}
                  onClick={() => void dismissTasks(plan.earlier.map(({ task }) => task))}
                >
                  {dismissing.length ? 'Dismissing…' : 'Dismiss earlier work'}
                </button>
                <span>Keeps these exercises unfinished in your full plan.</span>
              </div>
              {renderTasks(plan.earlier, true)}
            </details>
          )}
          {plan.unscheduled.length > 0 && (
            <details className="today-plan-disclosure">
              <summary>
                <BookOpen size={14} />
                Exercises without a date<span>{plan.unscheduled.length}</span>
                <ChevronDown size={14} />
              </summary>
              {plan.hasUndatedLessons && (
                <p className="today-plan-group-hint">
                  Set your course schedule or add dates in your full plan.
                </p>
              )}
              {renderTasks(plan.unscheduled)}
            </details>
          )}
          {plan.upcoming.length > 0 && (
            <div className="today-plan-upcoming">
              <span>Coming up {dayLabel(plan.nextPracticeDate!)}</span>
              <button onClick={onManagePlan}>
                {plan.upcoming.length} {plan.upcoming.length === 1 ? 'exercise' : 'exercises'}{' '}
                <ArrowRight size={12} />
              </button>
            </div>
          )}
        </>
      )}
      {!loading && !error && (
        <footer className="today-plan-footnote">
          {curriculum && (
            <p className="today-plan-curriculum">
              <a href={syllabusUrl ?? curriculum.sourceUrl} target="_blank" rel="noreferrer">
                {syllabusUrl ? `Session ${plan.nextMeeting!.lesson} syllabus` : 'Official syllabus'}{' '}
                <ExternalLink size={12} />
              </a>
              <span>
                {curriculum.title.replace('CW Academy ', '')} · syllabus v{curriculum.version}
              </span>
            </p>
          )}
          <details className="today-plan-help">
            <summary>How this plan works</summary>
            <p>
              {tasks.length
                ? 'Open an exercise to practice and mark it complete when you are ready. Completion and recorded practice time stay separate.'
                : 'Choose your level and class dates once. Your daily plan stays private; you can add your own exercises at any time.'}
            </p>
            {plan.nextMeeting && (
              <p>
                Record practice under the session shown on the exercise you practiced. Preparation
                belongs to that upcoming session; reviewing earlier work stays with its earlier
                session. For general practice, you can leave the session blank.
              </p>
            )}
            {plan.pinned.length > 0 && (
              <p>
                Pins last for {today} in {profile.timezone}. Completion and dismissal stay
                unchanged. Changing timezone keeps the pin date fixed.
              </p>
            )}
          </details>
        </footer>
      )}
    </section>
  );
}

function TodayTask({
  profile,
  liveNow,
  scope,
  item,
  runnerProgress,
  today,
  onLog,
  onPractice,
  onPin,
  pinBusy,
  onDismiss,
  dismissBusy,
  dismissDisabled,
  pending,
}: {
  profile: Profile;
  liveNow: number;
  scope?: string;
  item: DailyPlannedTask;
  runnerProgress?: RunnerProgress;
  today: string;
  onLog: () => void;
  onPin: (date: string | null) => void;
  pinBusy: string;
  onDismiss?: () => void;
  dismissBusy: boolean;
  dismissDisabled: boolean;
  pending: boolean;
  onPractice?: (purpose: PracticePurpose) => void;
}) {
  const { task, dueDate, status } = item;
  const overdue = dueDate && dueDate < today;
  return (
    <li className={`today-plan-task ${task.done ? 'is-done' : ''}`}>
      <div className="today-plan-task-content">
        <div className="today-plan-task-title">
          <h4>{task.title}</h4>
          {overdue && !task.done && task.pinnedForDate === today && (
            <span className="today-plan-started">Pinned for today</span>
          )}
          {pending && <span role="status">Waiting to sync</span>}
          {status === 'started' && <span className="today-plan-started">Started</span>}
        </div>
        <p className="today-plan-task-meta">
          {PRACTICE_KINDS.find((kind) => kind.id === task.kind)?.label}
          {task.targetMinutes !== undefined
            ? ` · ${minuteLabel(task.targetMinutes)} min suggested`
            : ''}
          {task.lesson ? ` · Session ${task.lesson}` : ''}
          {task.curriculum ? ` · Day ${task.curriculum.day}` : ''}
          {overdue ? ` · ${dayLabel(dueDate)}` : ''}
        </p>
        {item.loggedMinutes > 0 && (
          <p className="today-plan-logged">
            {minuteLabel(item.loggedMinutes)} min practiced
            {item.todayMinutes > 0 ? ` · ${minuteLabel(item.todayMinutes)} today` : ''}
          </p>
        )}
        <div className="today-plan-task-actions">
          {onPractice && !task.done && (
            <button className="today-plan-practice" onClick={() => onPractice('assigned')}>
              <Play size={12} />{' '}
              {task.exercise?.type === 'audio'
                ? 'Listen & practice'
                : task.exercise?.type === 'live-event'
                  ? 'Prepare live practice'
                  : 'Practice'}
            </button>
          )}
          <button className="today-plan-log" onClick={onLog}>
            <Plus size={12} />
            Log practice
          </button>
          {onPractice && (
            <button
              className={task.done ? 'today-plan-practice' : 'today-plan-review'}
              onClick={() => onPractice('review')}
            >
              <Play size={12} /> Extra review
            </button>
          )}
          {task.link && (
            <a href={task.link} target="_blank" rel="noreferrer">
              Open exercise <ExternalLink size={12} />
            </a>
          )}
          <TaskTodayPin task={task} dueDate={dueDate} today={today} busy={pinBusy} onPin={onPin} />
          {onDismiss && (
            <button
              aria-label={`Dismiss ${task.title}`}
              disabled={dismissDisabled}
              onClick={onDismiss}
            >
              <X size={12} /> {dismissBusy ? 'Dismissing…' : 'Dismiss'}
            </button>
          )}
        </div>
        {task.exercise?.type === 'audio' && (
          <ListeningPassProgress
            savedPasses={item.completedPasses}
            importedPasses={item.importedCompletedPasses}
            minimumPasses={task.exercise.minimumPasses}
          />
        )}
        {runnerProgress && <RunnerAssignmentProgress progress={runnerProgress} />}
        <TaskRecordingChoiceHint scope={scope} task={task} />
        <LiveAssignmentWindow task={task} profile={profile} now={liveNow} />
        {task.notes && (
          <details className="today-plan-instructions">
            <summary>Instructions</summary>
            <p>{task.notes}</p>
          </details>
        )}
        {task.exercise?.type === 'audio' && task.exercise.unresolved && (
          <p className="today-plan-resource-note">
            Recording unavailable · see official instructions
          </p>
        )}
      </div>
    </li>
  );
}
