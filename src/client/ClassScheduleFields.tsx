import { useId, useState } from 'react';
import { courseMeetings, type Profile } from '../shared/training';
import { timedClassMeetings, type ClassSchedule, type ClassTime } from '../shared/class-schedule';
import TimeZoneSelect from './TimeZoneSelect';
import './class-schedule.css';

const emptyTime: ClassTime = { startTime: '', endTime: '', endsNextDay: false };
export function meetingTimeLabel(startsAt: string, endsAt: string, zone: string): string {
  const format = new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
  return `${format.format(new Date(startsAt))} – ${format.format(new Date(endsAt))}`;
}

export default function ClassScheduleFields({
  profile,
  savedSchedule,
  onChange,
}: {
  profile: Profile;
  savedSchedule: Profile['classSchedule'];
  onChange: (schedule: ClassSchedule | null) => void;
}) {
  const zoneId = useId();
  const [editingSession, setEditingSession] = useState<number>();
  const schedule = profile.classSchedule;
  const current: ClassSchedule = schedule ?? {
    version: 1,
    timezone: profile.timezone,
    exceptions: [],
  };
  const update = (patch: Partial<ClassSchedule>) => onChange({ ...current, ...patch });
  const meetings = courseMeetings(profile);
  const selected = current.exceptions.find((item) => item.session === editingSession);
  const editException = (patch: Partial<(typeof current.exceptions)[number]>) =>
    update({
      exceptions: current.exceptions.map((item) =>
        item.session === editingSession ? { ...item, ...patch } : item,
      ),
    });
  let preview: ReturnType<typeof timedClassMeetings> = [];
  let previewError = '';
  try {
    if (
      (!current.ordinary || (current.ordinary.startTime && current.ordinary.endTime)) &&
      current.exceptions.every((item) => item.startTime && item.endTime)
    )
      preview = timedClassMeetings(profile);
  } catch (error) {
    previewError = (error as Error).message;
  }
  const timeFields = (
    timing: ClassTime,
    change: (patch: Partial<ClassTime>) => void,
    prefix: string,
  ) => (
    <>
      <div className="form-grid">
        <label className="field">
          {prefix}start time
          <input
            type="time"
            required
            value={timing.startTime}
            onChange={(event) => change({ startTime: event.target.value })}
          />
        </label>
        <label className="field">
          {prefix}end time
          <input
            type="time"
            required
            value={timing.endTime}
            onChange={(event) => change({ endTime: event.target.value })}
          />
        </label>
      </div>
      <label className="class-schedule-check">
        <input
          type="checkbox"
          checked={timing.endsNextDay}
          onChange={(event) => change({ endsNextDay: event.target.checked })}
        />
        Ends the next day
      </label>
    </>
  );
  return (
    <fieldset className="class-schedule-fields">
      <legend>Your private class meetings</legend>
      <p>
        Meeting changes keep session identities and homework dates intact. Confirm the times with
        your advisor. Save these details with your preferences below.
      </p>
      <TimeZoneSelect
        id={zoneId}
        label="Meeting timezone"
        value={current.timezone}
        hint="Meeting wall times stay in this timezone when you change your practice/display timezone. Today shows them in your practice timezone."
        onChange={(timezone) => update({ timezone })}
      />
      <label className="class-schedule-check">
        <input
          type="checkbox"
          checked={Boolean(current.ordinary)}
          disabled={!profile.firstClassDate}
          onChange={(event) =>
            update({ ordinary: event.target.checked ? { ...emptyTime } : undefined })
          }
        />
        Set ordinary class times
      </label>
      {!profile.firstClassDate && (
        <p className="field-hint">
          Choose your first class date above to add ordinary times or exceptions.
        </p>
      )}
      {current.ordinary &&
        timeFields(
          current.ordinary,
          (patch) => update({ ordinary: { ...current.ordinary!, ...patch } }),
          'Class ',
        )}
      <label className="field">
        Private join class link <span className="label-hint">optional</span>
        <input
          type="url"
          maxLength={4000}
          value={current.joinUrl ?? ''}
          onChange={(event) => update({ joinUrl: event.target.value })}
          placeholder="https://meeting.example.test/join?pwd=…"
        />
        <span className="field-hint">
          HTTP/S only, without username/password userinfo. Meeting access query parameters are
          retained privately. This link is included in your private backup.
        </span>
      </label>
      <p className="field-hint">
        Skipped times during a clock change are rejected. During a repeated hour, the earlier
        occurrence is used. Classes last 1 minute to 24 hours. Use an exception to adjust a changed
        meeting.
      </p>
      <div className="class-schedule-exceptions">
        <h3>Individual class exceptions</h3>
        {current.exceptions.length > 0 && (
          <ul>
            {current.exceptions.map((item) => (
              <li key={item.session}>
                <span>
                  Session {item.session} · {item.date} · {item.startTime}–{item.endTime}
                  {item.endsNextDay ? ' next day' : ''} · {item.timezone ?? current.timezone}
                </span>
                <div className="class-schedule-actions">
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setEditingSession(item.session)}
                  >
                    Edit session {item.session}
                  </button>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      update({
                        exceptions: current.exceptions.filter(
                          (candidate) => candidate.session !== item.session,
                        ),
                      });
                      if (editingSession === item.session) setEditingSession(undefined);
                    }}
                  >
                    Remove session {item.session} exception
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="button outline small"
          disabled={!meetings.length || current.exceptions.length >= 16}
          onClick={() => {
            const meeting = meetings.find(
              (item) => !current.exceptions.some((exception) => exception.session === item.lesson),
            );
            if (!meeting) return;
            update({
              exceptions: [
                ...current.exceptions,
                { session: meeting.lesson, date: meeting.date, ...(current.ordinary ?? emptyTime) },
              ],
            });
            setEditingSession(meeting.lesson);
          }}
        >
          Add class exception
        </button>
        {selected && (
          <fieldset className="class-exception-editor">
            <legend>Edit session {selected.session}</legend>
            <label className="field">
              Class session
              <select
                value={selected.session}
                onChange={(event) => {
                  const session = Number(event.target.value);
                  editException({ session });
                  setEditingSession(session);
                }}
              >
                {meetings
                  .filter(
                    (item) =>
                      item.lesson === selected.session ||
                      !current.exceptions.some((exception) => exception.session === item.lesson),
                  )
                  .map((item) => (
                    <option key={item.lesson} value={item.lesson}>
                      Session {item.lesson} · curriculum {item.date}
                    </option>
                  ))}
              </select>
            </label>
            <label className="field">
              Exception date
              <input
                type="date"
                required
                value={selected.date}
                onChange={(event) => editException({ date: event.target.value })}
              />
            </label>
            {timeFields(selected, editException, 'Exception ')}
            <TimeZoneSelect
              id={`${zoneId}-exception`}
              label="Exception timezone"
              value={selected.timezone ?? current.timezone}
              hint="This timezone applies only to this class exception."
              onChange={(timezone) => editException({ timezone })}
            />
            <button
              type="button"
              className="text-button"
              onClick={() => setEditingSession(undefined)}
            >
              Done editing exception
            </button>
          </fieldset>
        )}
      </div>
      {previewError && (
        <p className="alert error" role="alert">
          {previewError}
        </p>
      )}
      {preview.length > 0 && (
        <details className="class-schedule-preview">
          <summary>Preview {preview.length} timed class meetings</summary>
          <ol>
            {preview.map((item) => (
              <li key={item.session}>
                <strong>
                  Session {item.session}
                  {item.exception ? ' · exception' : ''}
                </strong>
                <span>{meetingTimeLabel(item.startsAt, item.endsAt, profile.timezone)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
      <div className="class-schedule-actions">
        <button
          type="button"
          className="text-button"
          onClick={() => {
            onChange(savedSchedule ?? null);
            setEditingSession(undefined);
          }}
        >
          Cancel meeting edits
        </button>
        <button
          type="button"
          className="text-button"
          disabled={!schedule}
          onClick={() => {
            onChange(null);
            setEditingSession(undefined);
          }}
        >
          Remove meeting times and link
        </button>
      </div>
    </fieldset>
  );
}
