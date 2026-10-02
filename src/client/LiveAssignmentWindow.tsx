import { CW_EVENT_SCHEDULE, formatCwEventWindow } from '../shared/cw-events';
import { liveAssignmentStatus } from '../shared/live-assignment';
import type { PlannedTask } from '../shared/plan';
import type { Profile } from '../shared/training';
import './live-assignment.css';

export default function LiveAssignmentWindow({
  task,
  profile,
  now,
}: {
  task: PlannedTask;
  profile: Profile;
  now: number;
}) {
  const status = liveAssignmentStatus(task, profile, now);
  if (!status || task.exercise?.type !== 'live-event') return null;
  const eventId = task.exercise.eventId;
  const definition = CW_EVENT_SCHEDULE.events.find((event) => event.id === eventId)!;
  const event = definition.id.toUpperCase();
  const window = status.current ?? status.next;
  const deadline = status.deadline;
  const format = (at: number, zone: string) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(at);
  return (
    <section className="live-assignment-window" aria-label={`${event} assignment opportunity`}>
      <p role="status">
        <strong>
          {status.state === 'active'
            ? `${event} active now`
            : status.state === 'upcoming'
              ? `Next eligible ${event} window`
              : status.state === 'unavailable'
                ? `No ${event} window remains before the deadline.`
                : `Set a class or practice-date deadline for ${event}.`}
        </strong>
      </p>
      {window && (
        <p>
          {formatCwEventWindow(window, profile.timezone)} · {profile.timezone}
          <br />
          {formatCwEventWindow(window, 'UTC')} · UTC
        </p>
      )}
      {deadline && (
        <p className="field-hint">
          Windows must start before {format(deadline.at, profile.timezone)} · {profile.timezone} (
          {format(deadline.at, 'UTC')} · UTC).
          {deadline.source === 'class-date-start'
            ? ' Class time is not set: using the start of the class date conservatively. Set the actual class time in Course settings.'
            : deadline.source === 'practice-date-end'
              ? task.exercise.deadline === 'practice-date'
                ? ' Selected practice-date deadline: using the end of that day.'
                : ' No applicable dated class: using the end of the practice date.'
              : ` Associated class start, resolved in ${deadline.timezone}. A window may end after this deadline.`}
        </p>
      )}
      {(status.state === 'unavailable' || status.state === 'needs-deadline') && (
        <p>
          Keep this objective open and ask your advisor how to proceed. Instructions, manual logging
          and completion remain available.
        </p>
      )}
      <a href={definition.rulesUrl} target="_blank" rel="noopener noreferrer">
        {event} official rules
      </a>
      <p className="field-hint">
        An event window does not verify participation or complete this exercise.
      </p>
    </section>
  );
}
