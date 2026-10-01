import ListeningPassProgress from './ListeningPassProgress';
import { useId, useState } from 'react';
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
import { curriculumForLevel, sessionSyllabusUrl } from '../shared/curriculum';

export interface TodayPlanProps {
  profile: Profile;
  entries: PracticeSession[];
  tasks: PlannedTask[];
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  onDismiss: (tasks: PlannedTask[]) => Promise<void>;
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
  profile,
  entries,
  tasks,
  loading = false,
  error,
  onRetry,
  onDismiss,
  onLog,
  onManagePlan,
  onImport,
  onPractice,
  onPracticeTask,
  onAddTask,
  onSetupCourse,
}: TodayPlanProps) {
  const titleId = useId();
  const [dismissing, setDismissing] = useState(false);
  const [dismissedCount, setDismissedCount] = useState(0);
  const [saveError, setSaveError] = useState('');
  const today = dateInTimezone(new Date(), profile.timezone);
  const plan = dailyPlanSummary(tasks, courseMeetings(profile), entries, today);
  const course = curriculumForLevel(profile.level);
  const curriculum = tasks.some((task) => task.curriculum?.id === course?.id) ? course : undefined;
  const needsCourseDates = !profile.firstClassDate;
  const syllabusUrl = plan.nextMeeting
    ? sessionSyllabusUrl(profile.level, plan.nextMeeting.lesson)
    : undefined;
  async function dismissEarlier() {
    if (dismissing || !plan.earlier.length) return;
    const earlier = plan.earlier.map(({ task }) => task);
    setDismissing(true);
    setSaveError('');
    try {
      await onDismiss(earlier);
      setDismissedCount(earlier.length);
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Could not dismiss earlier work. Try again.',
      );
    } finally {
      setDismissing(false);
    }
  }
  const renderTasks = (items: DailyPlannedTask[]) => (
    <ul className="today-plan-list">
      {items.map((item) => (
        <TodayTask
          key={item.task.id}
          item={item}
          today={today}
          onLog={() => onLog(practiceForTask(item.task, today))}
          onPractice={onPracticeTask ? (purpose) => onPracticeTask(item.task, purpose) : undefined}
        />
      ))}
    </ul>
  );
  const hasCurrent = plan.pendingCount > 0;
  return (
    <section className="card today-plan" aria-labelledby={titleId} aria-busy={loading}>
      <header className="today-plan-heading">
        <div>
          <span className="eyebrow">YOUR NEXT SMALL STEPS</span>
          <h2 id={titleId}>What should I do today?</h2>
          <p>
            {dayLabel(today)} <span>· {profile.timezone.replaceAll('_', ' ')}</span>
          </p>
        </div>
        <button className="today-plan-manage" onClick={onManagePlan}>
          Your full plan <ArrowRight size={14} />
        </button>
      </header>
      {!loading && curriculum && (
        <p className="today-plan-curriculum">
          {curriculum.title.replace('CW Academy ', '')} · syllabus v{curriculum.version}
          <a href={syllabusUrl ?? curriculum.sourceUrl} target="_blank" rel="noreferrer">
            {syllabusUrl ? `Session ${plan.nextMeeting!.lesson} syllabus` : 'Official syllabus'}{' '}
            <ExternalLink size={12} />
          </a>
        </p>
      )}
      {!loading && plan.nextMeeting && (
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
                <span>Ready to practice now? Open the listening room.</span>
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
                    Open practice studio <ArrowRight size={13} />
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
              <p className="today-plan-group-hint">
                These exercises follow your next class date. Choose a little to work on today.
              </p>
              {renderTasks(plan.preparation)}
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
                  disabled={dismissing}
                  onClick={() => void dismissEarlier()}
                >
                  {dismissing ? 'Dismissing…' : 'Dismiss earlier work'}
                </button>
                <span>Keeps these exercises unfinished in your full plan.</span>
              </div>
              {renderTasks(plan.earlier)}
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
          {tasks.length
            ? 'Open an exercise to practice and mark it complete when you are ready. Completion and recorded practice time stay separate.'
            : 'Choose your level and class dates once. Your daily plan stays private; you can add your own exercises at any time.'}
        </footer>
      )}
    </section>
  );
}

function TodayTask({
  item,
  today,
  onLog,
  onPractice,
}: {
  item: DailyPlannedTask;
  today: string;
  onLog: () => void;
  onPractice?: (purpose: PracticePurpose) => void;
}) {
  const { task, dueDate, status } = item;
  const overdue = dueDate && dueDate < today;
  return (
    <li className={`today-plan-task ${task.done ? 'is-done' : ''}`}>
      <div className="today-plan-task-content">
        <div className="today-plan-task-title">
          <h4>{task.title}</h4>
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
        {task.exercise?.type === 'audio' && (
          <ListeningPassProgress
            savedPasses={item.completedPasses}
            importedPasses={item.importedCompletedPasses}
            minimumPasses={task.exercise.minimumPasses}
          />
        )}
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
        <div className="today-plan-task-actions">
          {onPractice && !task.done && (
            <button className="today-plan-practice" onClick={() => onPractice('assigned')}>
              <Play size={12} />{' '}
              {task.exercise?.type === 'audio' ? 'Listen & practice' : 'Practice'}
            </button>
          )}
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
          <button onClick={onLog}>
            <Plus size={12} />
            Log practice
          </button>
        </div>
      </div>
    </li>
  );
}
