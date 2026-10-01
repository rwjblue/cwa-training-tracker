import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  BookOpen,
  CalendarDays,
  Check,
  Clipboard,
  ExternalLink,
  FileText,
  Pencil,
  Play,
  Plus,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import {
  addDays,
  courseMeetings,
  dateInTimezone,
  PRACTICE_KINDS,
  summarizePractice,
  type PracticeSession,
  type PracticePurpose,
  type Profile,
} from '../shared/training';
import {
  practiceForTask,
  taskDueDate,
  validatePlannedTask,
  weeklyReport,
  type PlannedTask,
} from '../shared/plan';
import type { AccountChange, AccountTaskChanges } from '../shared/account-sync';
import './plan.css';
import { curriculumForLevel } from '../shared/curriculum';

interface Props {
  inspection?: { id: string; view: 'week' | 'report' };
  returnToPractice?: { label: string; onReturn: () => void };
  startNewTask?: boolean;
  profile: Profile;
  entries: PracticeSession[];
  tasks: PlannedTask[];
  loading: boolean;
  error: string;
  onRetry: () => void;
  onChange: (change: AccountChange, baseRevision?: number) => Promise<unknown>;
  revision: number;
  pendingIds?: string[];
  onLog: (initial?: Partial<PracticeSession>) => void;
  onPracticeTask?: (task: PlannedTask, purpose: PracticePurpose) => void;
  onSetupCourse?: () => void;
}

const dayLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

export default function Plan({
  profile,
  entries,
  tasks,
  loading,
  error,
  onRetry,
  onChange,
  revision,
  pendingIds = [],
  onLog,
  onPracticeTask,
  onSetupCourse,
  startNewTask,
  inspection,
  returnToPractice,
}: Props) {
  const [mutationError, setMutationError] = useState('');
  const [view, setView] = useState<'next' | 'week' | 'all'>('next');
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<{
    initial: Partial<PlannedTask>;
    baseRevision: number;
  } | null>(
    startNewTask
      ? {
          initial: { dueDate: dateInTimezone(new Date(), profile.timezone) },
          baseRevision: revision,
        }
      : null,
  );
  const previousNewTask = useRef(startNewTask);
  useEffect(() => {
    if (startNewTask && !previousNewTask.current)
      setEditing({
        initial: { dueDate: dateInTimezone(new Date(), profile.timezone) },
        baseRevision: revision,
      });
    previousNewTask.current = startNewTask;
  }, [startNewTask, profile.timezone, revision]);
  const [deleting, setDeleting] = useState<PlannedTask | null>(null);
  const [busy, setBusy] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  useEffect(() => {
    if (!inspection) return;
    setView('week');
    if (inspection.view === 'report') setReportOpen(true);
  }, [inspection]);
  const today = dateInTimezone(new Date(), profile.timezone);
  const meetings = courseMeetings(profile);
  const next = meetings.find((meeting) => meeting.date >= today);
  const summary = summarizePractice(entries, today, profile.dailyGoalMinutes);
  const weekStart = summary.days[0].date;
  const weekEnd = summary.days[6].date;
  const nextLesson =
    next?.lesson ??
    tasks.filter((task) => !task.done && task.lesson).sort((a, b) => a.lesson! - b.lesson!)[0]
      ?.lesson ??
    1;

  function openEditor(initial: Partial<PlannedTask>) {
    setMutationError('');
    setEditing({ initial: structuredClone(initial), baseRevision: revision });
  }

  async function updateTask(
    task: PlannedTask,
    changes: Partial<Pick<PlannedTask, 'done' | 'dismissedFromToday'>>,
  ) {
    setBusy(task.id);
    setMutationError('');
    try {
      await onChange({ type: 'task-status', ids: [task.id], ...changes }, revision);
    } catch (error) {
      setMutationError((error as Error).message);
    } finally {
      setBusy('');
    }
  }

  const visible = tasks
    .filter((task) => {
      if (task.done && !showDone) return false;
      if (view === 'all') return true;
      const due = taskDueDate(task, meetings);
      if (view === 'week') return Boolean(due && due >= weekStart && due <= weekEnd);
      return due ? due <= (next?.date ?? today) : !task.lesson || task.lesson === nextLesson;
    })
    .sort(
      (a, b) =>
        (taskDueDate(a, meetings) ?? '9999').localeCompare(taskDueDate(b, meetings) ?? '9999') ||
        (a.lesson ?? 99) - (b.lesson ?? 99) ||
        (a.curriculum?.id === b.curriculum?.id && a.curriculum && b.curriculum
          ? a.curriculum.exerciseId.localeCompare(b.curriculum.exerciseId, undefined, {
              numeric: true,
            })
          : 0) ||
        a.title.localeCompare(b.title),
    );
  const completed = tasks.filter((task) => task.done).length;
  const course = curriculumForLevel(profile.level);
  const curriculum = tasks.some((task) => task.curriculum?.id === course?.id) ? course : undefined;

  return (
    <section className="card plan-card" aria-labelledby="plan-title">
      <div className="plan-heading">
        <div>
          <span className="eyebrow">YOUR PERSONAL COURSE PLAN</span>
          <h2 id="plan-title">
            {curriculum
              ? `Your ${curriculum.title.replace('CW Academy ', '')} course plan.`
              : 'Know what to practice next.'}
          </h2>
          <p>
            {curriculum
              ? 'Your daily assignments follow your class dates. Add personal exercises when you need them.'
              : 'Set your course dates for built-in assignments, or add your advisor’s exercises.'}
          </p>
          {curriculum && (
            <a
              className="plan-curriculum-source"
              href={curriculum.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Official {curriculum.title.replace('CW Academy ', '')} syllabus v{curriculum.version}{' '}
              <ExternalLink size={13} />
            </a>
          )}
        </div>
        <div className="plan-heading-actions">
          <button className="button outline small" onClick={() => setReportOpen(true)}>
            <FileText size={15} /> Practice report
          </button>
          <button
            className="button outline small"
            onClick={() => openEditor({ lesson: nextLesson })}
          >
            <Plus size={15} /> Add exercise
          </button>
          {onSetupCourse && (
            <button className="button outline small" onClick={onSetupCourse}>
              <CalendarDays size={15} /> Course settings
            </button>
          )}
        </div>
      </div>
      <div className="plan-status">
        <span>
          <CalendarDays size={16} />
          {next
            ? `Next class: session ${next.lesson}, ${dayLabel(next.date)}`
            : meetings.length
              ? 'Your course calendar has finished. Keep practicing at your own pace.'
              : 'Set your first class date in your account to connect exercises to your calendar.'}
        </span>
        <span>
          {completed} of {tasks.length} exercises complete
        </span>
      </div>
      <div className="plan-toolbar">
        <div className="practice-tabs" role="group" aria-label="Choose planned exercises">
          {(
            [
              ['next', 'Next up'],
              ['week', 'This week'],
              ['all', 'Whole course'],
            ] as const
          ).map(([id, title]) => (
            <button className={view === id ? 'selected' : ''} key={id} onClick={() => setView(id)}>
              {title}
            </button>
          ))}
        </div>
        <label className="plan-show-done">
          <input
            type="checkbox"
            checked={showDone}
            onChange={(event) => setShowDone(event.target.checked)}
          />{' '}
          Show completed
        </label>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}{' '}
          <button className="text-button" onClick={onRetry}>
            Reload plan
          </button>
        </div>
      )}
      {mutationError && (
        <div className="alert error" role="alert">
          {mutationError}
        </div>
      )}
      {loading ? (
        <p className="plan-empty">Loading your personal plan…</p>
      ) : visible.length ? (
        <ul className="plan-list">
          {visible.map((task) => {
            const due = taskDueDate(task, meetings);
            const overdue = due && due < today && !task.done;
            return (
              <li key={task.id} className={`plan-task ${task.done ? 'is-done' : ''}`}>
                <input
                  className="plan-check"
                  type="checkbox"
                  checked={task.done}
                  disabled={busy === task.id}
                  aria-label={`Mark ${task.title} ${task.done ? 'incomplete' : 'complete'}`}
                  onChange={() => void updateTask(task, { done: !task.done })}
                />
                <div className="plan-task-body">
                  <div className="plan-task-title">
                    <h3>{task.title}</h3>
                    {overdue && <span className="plan-overdue">Earlier work</span>}
                    {task.dismissedFromToday && (
                      <span className="plan-dismissed">Dismissed from Today</span>
                    )}
                    {pendingIds.includes(task.id) && (
                      <span className="plan-dismissed" role="status">
                        Waiting to sync
                      </span>
                    )}
                  </div>
                  <p className="plan-task-meta">
                    {task.lesson ? `Session ${task.lesson} · ` : ''}
                    {task.curriculum ? `Day ${task.curriculum.day} · ` : ''}
                    {PRACTICE_KINDS.find((kind) => kind.id === task.kind)?.label}
                    {task.targetMinutes !== undefined
                      ? ` · ${Number(task.targetMinutes.toFixed(1))} min suggested`
                      : ''}
                    {due ? ` · ${dayLabel(due)}` : ''}
                  </p>
                  {task.notes && (
                    <details className="plan-notes">
                      <summary>Instructions and notes</summary>
                      <p>{task.notes}</p>
                    </details>
                  )}
                  <div className="plan-task-links">
                    {onPracticeTask && !task.done && (
                      <button
                        className="plan-task-practice"
                        onClick={() => onPracticeTask(task, 'assigned')}
                      >
                        <Play size={12} />{' '}
                        {task.exercise?.type === 'audio' ? 'Listen & practice' : 'Practice'}
                      </button>
                    )}
                    {onPracticeTask && (
                      <button onClick={() => onPracticeTask(task, 'review')}>
                        <Play size={12} /> Extra review
                      </button>
                    )}
                    {task.link && (
                      <a href={task.link} target="_blank" rel="noreferrer">
                        Open exercise <ExternalLink size={12} />
                      </a>
                    )}
                    <button onClick={() => onLog(practiceForTask(task, today))}>
                      <Plus size={12} /> Log practice
                    </button>
                    {task.dismissedFromToday && (
                      <button
                        disabled={busy === task.id}
                        onClick={() => void updateTask(task, { dismissedFromToday: false })}
                      >
                        {busy === task.id ? 'Restoring…' : 'Restore to Today'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="plan-task-actions">
                  <button
                    className="icon-button"
                    aria-label={`Edit ${task.title}`}
                    onClick={() => openEditor(task)}
                  >
                    <Pencil size={15} />
                  </button>
                  {!task.curriculum && (
                    <button
                      className="icon-button danger-text"
                      aria-label={`Delete ${task.title}`}
                      onClick={() => {
                        setMutationError('');
                        setDeleting(task);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="plan-empty">
          <BookOpen size={27} />
          <h3>{tasks.length ? 'You have room for your next step.' : 'Set up your course.'}</h3>
          <p>
            {tasks.length
              ? 'No exercises match this view. Look at the whole course or add another exercise.'
              : course
                ? `Save your class dates to load ${course.title.replace('CW Academy ', '')} assignments automatically. No need to enter each exercise.`
                : 'Choose a course and save your class dates, or add your own practice exercises.'}
          </p>
          {!tasks.length && onSetupCourse && (
            <button className="button dark small" onClick={onSetupCourse}>
              Set course dates <CalendarDays size={14} />
            </button>
          )}
          <button
            className="button outline small"
            onClick={() => openEditor({ lesson: nextLesson })}
          >
            Add an exercise <Plus size={14} />
          </button>
        </div>
      )}
      <p className="plan-footnote">
        Completing an exercise and recording practice time are separate. Log only the time you
        practiced; a checked box adds no minutes.
      </p>
      {editing && (
        <TaskEditor
          initial={editing.initial}
          baseRevision={editing.baseRevision}
          onChange={onChange}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}
      {deleting && (
        <PlanDialog
          title="Delete this exercise?"
          onClose={() => setDeleting(null)}
          dismissDisabled={busy === deleting.id}
        >
          <p>
            “{deleting.title}” will be removed from your plan. Its saved practice entries will stay
            in your log.
          </p>
          {mutationError && (
            <div className="alert error" role="alert">
              {mutationError}
            </div>
          )}
          <div className="plan-form-actions">
            <button
              className="button outline"
              disabled={busy === deleting.id}
              onClick={() => setDeleting(null)}
            >
              Keep exercise
            </button>
            <button
              className="button danger"
              disabled={busy === deleting.id}
              onClick={async () => {
                setBusy(deleting.id);
                setMutationError('');
                try {
                  await onChange({ type: 'task-delete', id: deleting.id }, revision);
                  setDeleting(null);
                } catch (error) {
                  setMutationError((error as Error).message);
                } finally {
                  setBusy('');
                }
              }}
            >
              {busy === deleting.id ? 'Saving…' : 'Delete exercise'}
            </button>
          </div>
        </PlanDialog>
      )}
      {reportOpen && (
        <Report
          entries={entries}
          profile={profile}
          fromDate={weekStart}
          toDate={weekEnd}
          onClose={() => setReportOpen(false)}
          returnToPractice={
            returnToPractice
              ? {
                  label: returnToPractice.label,
                  onReturn: () => {
                    setReportOpen(false);
                    returnToPractice.onReturn();
                  },
                }
              : undefined
          }
        />
      )}
    </section>
  );
}

function PlanDialog({
  title,
  onClose,
  children,
  className = '',
  dismissDisabled = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  dismissDisabled?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      className={`plan-dialog ${className}`}
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!dismissDisabled) onClose();
      }}
      aria-label={title}
    >
      <div className="plan-dialog-heading">
        <h2>{title}</h2>
        <button
          className="icon-button plan-no-print"
          type="button"
          aria-label="Close dialog"
          disabled={dismissDisabled}
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function TaskEditor({
  initial,
  baseRevision,
  onChange,
  onClose,
  onSaved,
}: {
  initial: Partial<PlannedTask>;
  baseRevision: number;
  onChange: Props['onChange'];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [task, setTask] = useState<PlannedTask>({
    id: crypto.randomUUID(),
    title: '',
    kind: 'listening',
    done: false,
    notes: '',
    createdAt: new Date().toISOString(),
    source: 'manual',
    ...initial,
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const valid = validatePlannedTask(task);
      if (initial.id) {
        const fields = [
          'title',
          'kind',
          'lesson',
          'dueDate',
          'link',
          'targetMinutes',
          'targetMinutesExplicit',
          'notes',
        ] as const;
        const changes = Object.fromEntries(
          fields
            .filter((field) => valid[field] !== initial[field])
            .map((field) => [field, valid[field] ?? null]),
        ) as AccountTaskChanges;
        if (Object.keys(changes).length)
          await onChange({ type: 'task-edit', id: initial.id, changes }, baseRevision);
      } else {
        await onChange({ type: 'task-create', task: valid }, baseRevision);
      }
      onSaved();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <PlanDialog
      title={initial.id ? 'Edit your exercise' : 'Add a practice exercise'}
      onClose={onClose}
      dismissDisabled={saving}
    >
      <form className="plan-form" onSubmit={save}>
        <p className="plan-form-hint">
          Changes are saved on this device first and synced to your account when available.
        </p>
        <label>
          Exercise title
          <input
            required
            autoFocus
            maxLength={200}
            value={task.title}
            placeholder="For example: listen to this week's short story"
            onChange={(event) => setTask({ ...task, title: event.target.value })}
          />
        </label>
        <div className="plan-form-grid">
          <label>
            Activity
            <select
              value={task.kind}
              disabled={Boolean(task.curriculum)}
              onChange={(event) =>
                setTask({ ...task, kind: event.target.value as PlannedTask['kind'] })
              }
            >
              {PRACTICE_KINDS.map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Suggested minutes (optional)
            <input
              type="number"
              min={1}
              max={1440}
              step="any"
              value={task.targetMinutes ?? ''}
              placeholder="No time target"
              onChange={(event) =>
                setTask({
                  ...task,
                  targetMinutes: event.target.value === '' ? undefined : Number(event.target.value),
                  ...(task.curriculum ? { targetMinutesExplicit: true } : {}),
                })
              }
            />
          </label>
        </div>
        <div className="plan-form-grid">
          <label>
            Class session
            <select
              value={task.lesson ?? ''}
              disabled={Boolean(task.curriculum)}
              onChange={(event) =>
                setTask({
                  ...task,
                  lesson: event.target.value ? Number(event.target.value) : undefined,
                })
              }
            >
              <option value="">Independent practice</option>
              {Array.from({ length: 16 }, (_, index) => (
                <option key={index} value={index + 1}>
                  Session {index + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Practice date (optional)
            <input
              type="date"
              value={task.dueDate ?? ''}
              disabled={Boolean(task.curriculum)}
              onChange={(event) => setTask({ ...task, dueDate: event.target.value || undefined })}
            />
          </label>
        </div>
        <p className="plan-form-hint">
          {task.curriculum
            ? 'This assignment follows your course dates. Change those in Course settings to move its schedule without losing your progress.'
            : 'A practice date overrides the class date. Leave it blank to follow your course schedule.'}
        </p>
        <label>
          Exercise link (optional)
          <input
            type="url"
            maxLength={2048}
            value={task.link ?? ''}
            disabled={Boolean(task.curriculum)}
            placeholder="https://"
            onChange={(event) => setTask({ ...task, link: event.target.value || undefined })}
          />
        </label>
        <label>
          Instructions or notes (optional)
          <textarea
            rows={5}
            maxLength={10000}
            value={task.notes}
            placeholder="Your advisor's instructions, a reminder, or what to focus on."
            onChange={(event) => setTask({ ...task, notes: event.target.value })}
          />
        </label>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="plan-form-actions">
          <button className="button outline" type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button className="button dark" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save exercise'}
          </button>
        </div>
      </form>
    </PlanDialog>
  );
}

function Report({
  entries,
  profile,
  fromDate,
  toDate,
  onClose,
  returnToPractice,
}: {
  entries: PracticeSession[];
  profile: Profile;
  fromDate: string;
  toDate: string;
  onClose: () => void;
  returnToPractice?: { label: string; onReturn: () => void };
}) {
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  let report = '';
  try {
    report = weeklyReport(entries, profile, from, to);
  } catch {
    report = 'Choose a valid date range.';
  }
  return (
    <PlanDialog title="Your practice report" onClose={onClose} className="plan-report">
      <p className="plan-no-print">
        A plain-language summary for your own review or to share with your advisor. Review your
        notes before sharing.
      </p>
      <div className="plan-form-grid plan-form plan-no-print">
        <label>
          From
          <input
            type="date"
            value={from}
            max={to}
            onChange={(event) => {
              setFrom(event.target.value);
              setCopied(false);
            }}
          />
        </label>
        <label>
          Through
          <input
            type="date"
            value={to}
            min={from}
            onChange={(event) => {
              setTo(event.target.value);
              setCopied(false);
            }}
          />
        </label>
      </div>
      <pre className="plan-report-text" tabIndex={0}>
        {report}
      </pre>
      {copyError && (
        <p className="plan-no-print" role="status">
          {copyError}
        </p>
      )}
      <div className="plan-form-actions plan-no-print">
        {returnToPractice && (
          <button
            className="button outline"
            title={returnToPractice.label}
            onClick={returnToPractice.onReturn}
          >
            Return to practice
          </button>
        )}
        <button
          className="button outline"
          onClick={() => {
            setFrom(addDays(fromDate, -7));
            setTo(addDays(toDate, -7));
            setCopied(false);
          }}
        >
          Previous week
        </button>
        <button className="button outline" onClick={() => window.print()}>
          <Printer size={15} /> Print
        </button>
        <button
          className="button dark"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(report);
              setCopied(true);
              setCopyError('');
            } catch {
              setCopyError(
                'Select the report text above and copy it with your device’s copy command.',
              );
            }
          }}
        >
          {copied ? <Check size={15} /> : <Clipboard size={15} />}
          {copied ? 'Copied' : 'Copy report'}
        </button>
      </div>
    </PlanDialog>
  );
}
