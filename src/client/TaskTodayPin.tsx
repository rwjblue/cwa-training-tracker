import type { PlannedTask } from '../shared/plan';
import './task-today-pin.css';

/** Shared action for earlier work; the containing view owns saves and feedback. */
export default function TaskTodayPin({
  task,
  dueDate,
  today,
  busy,
  onPin,
}: {
  task: PlannedTask;
  dueDate?: string;
  today: string;
  busy: string;
  onPin: (date: string | null) => void;
}) {
  if (task.done || !dueDate || dueDate >= today) return null;
  const pinned = task.pinnedForDate === today;
  return (
    <button
      className="task-today-pin"
      disabled={Boolean(busy)}
      onClick={() => onPin(pinned ? null : today)}
    >
      {busy === task.id ? 'Saving…' : pinned ? 'Remove from today' : 'Add to today'}
    </button>
  );
}
