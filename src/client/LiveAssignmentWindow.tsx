import { CW_EVENT_SCHEDULE, formatCwEventWindow } from '../shared/cw-events';
import { liveAssignmentStatus } from '../shared/live-assignment';
import type { PlannedTask } from '../shared/plan';
import type { Profile } from '../shared/training';
import { formatZonedDateTime, timezoneAbbreviation } from '../shared/timezone-display';
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
        <div>
          <p>{formatCwEventWindow(window, profile.timezone)}</p>
          {profile.timezone !== 'UTC' && <p>{formatCwEventWindow(window, 'UTC')}</p>}
        </div>
      )}
      {(status.state === 'unavailable' || status.state === 'needs-deadline') && (
        <p>
          Keep this objective open and ask your advisor how to proceed. Instructions, manual logging
          and completion remain available.
        </p>
      )}
      <a href="#events">View live practice schedule</a>
      <details>
        <summary>Deadline &amp; event details</summary>
        {deadline && (
          <p className="field-hint">
            Windows must start before {formatZonedDateTime(deadline.at, profile.timezone)} (
            {formatZonedDateTime(deadline.at, 'UTC')}).
            {deadline.source === 'class-date-start'
              ? ' Class time is not set: using the start of the class date conservatively. Set the actual class time in Course settings.'
              : deadline.source === 'practice-date-end'
                ? task.exercise.deadline === 'practice-date'
                  ? ' Selected practice-date deadline: using the end of that day.'
                  : ' No applicable dated class: using the end of the practice date.'
                : ` Associated class start, resolved in ${timezoneAbbreviation(deadline.timezone, deadline.at)}. A window may end after this deadline.`}
          </p>
        )}
        <a href={definition.rulesUrl} target="_blank" rel="noopener noreferrer">
          {event} official rules
        </a>
        <p className="field-hint">
          An event window does not verify participation or complete this exercise.
        </p>
      </details>
    </section>
  );
}
