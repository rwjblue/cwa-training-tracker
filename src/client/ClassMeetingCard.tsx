import { useEffect, useMemo, useState } from 'react';
import { classMeetingStatus, timedClassMeetings } from '../shared/class-schedule';
import {
  courseMeetings,
  dateInTimezone,
  type PracticeSession,
  type Profile,
} from '../shared/training';
import { meetingTimeLabel } from './ClassScheduleFields';
import './class-schedule.css';

/** Calendar display only: this clock never measures or credits practice. */
export default function ClassMeetingCard({
  profile,
  now,
  onLog,
  accountId,
}: {
  profile: Profile;
  now?: number;
  accountId?: string;
  onLog?: (initial: Partial<PracticeSession>) => void;
}) {
  const [observed, setTime] = useState(() => Date.now());
  const time = now ?? observed;
  const meetings = useMemo(() => timedClassMeetings(profile), [profile]);
  const status = useMemo(() => classMeetingStatus(profile, new Date(time)), [profile, time]);
  useEffect(() => {
    if (now !== undefined) return;
    const refresh = () => setTime(Date.now());
    const boundary = meetings
      .flatMap((item) => [Date.parse(item.startsAt), Date.parse(item.endsAt)])
      .filter((value) => value > time)
      .sort((a, b) => a - b)[0];
    const timer = window.setTimeout(
      refresh,
      Math.min(60_000, Math.max(1, (boundary ?? time + 60_000) - time)),
    );
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [meetings, time, now]);
  useEffect(() => {
    if (now === undefined) setTime(Date.now());
  }, [profile, now]);
  if (!accountId || !profile.classSchedule) return null;
  const meeting = status.active ?? status.finished ?? status.next;
  const dateOnly = !meetings.length
    ? courseMeetings(profile).find(
        (item) => item.date >= dateInTimezone(new Date(time), profile.timezone),
      )
    : undefined;
  return (
    <section className="class-meeting-card" aria-label="Your private class schedule">
      <span className="eyebrow">
        {status.active
          ? 'CLASS IN PROGRESS'
          : status.finished
            ? 'CLASS FINISHED'
            : 'UPCOMING CLASS'}
      </span>
      <h3>
        {status.active
          ? `Time for class · Session ${meeting!.session}`
          : status.finished
            ? `Session ${meeting!.session} has finished`
            : meeting
              ? `Next class · Session ${meeting.session}`
              : dateOnly
                ? `Next class · Session ${dateOnly.lesson}`
                : 'No upcoming class meetings'}
      </h3>
      {meeting ? (
        <p>
          {meetingTimeLabel(meeting.startsAt, meeting.endsAt, profile.timezone)}
          <br />
          Displayed in {profile.timezone}. Meeting timezone: {meeting.timezone}.
          {meeting.exception ? ' Individual class exception.' : ''}
        </p>
      ) : dateOnly ? (
        <p>{dateOnly.date} · Class times are not set.</p>
      ) : null}
      <p>
        Class time is kept separate from independent practice goals and required exercise progress.
      </p>
      <div className="class-schedule-actions">
        {profile.classSchedule.joinUrl && (meeting || dateOnly) && (
          <a
            className="button dark small"
            href={profile.classSchedule.joinUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Join class
          </a>
        )}
        {onLog && (status.active || status.finished) && (
          <button
            type="button"
            className="button outline small"
            onClick={() =>
              onLog({
                context: 'class',
                lesson: meeting!.session,
                date: dateInTimezone(new Date(time), profile.timezone),
              })
            }
          >
            Log class time
          </button>
        )}
      </div>
      {status.finished && status.next && (
        <p className="field-hint">
          Next: session {status.next.session} ·{' '}
          {meetingTimeLabel(status.next.startsAt, status.next.endsAt, profile.timezone)}
        </p>
      )}
    </section>
  );
}
