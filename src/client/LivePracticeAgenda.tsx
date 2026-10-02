import { useEffect, useRef, useState } from 'react';
import {
  CW_EVENT_SCHEDULE,
  cwEventAgenda,
  cwEventCountdown,
  formatCwEventWindow,
  type CwEventOccurrence,
} from '../shared/cw-events';
import { publicCwCalendarUrl } from '../shared/cw-calendar';
import {
  EVENT_TIME_MODE_KEY,
  loadEventTimeMode,
  saveEventTimeMode,
  type EventTimeMode,
} from './event-preferences';
import './live-practice-agenda.css';

export default function LivePracticeAgenda({ onReturn }: { onReturn?: () => void }) {
  const [now, setNow] = useState(Date.now);
  const [mode, setMode] = useState(loadEventTimeMode);
  const [preferenceFailed, setPreferenceFailed] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const feedInput = useRef<HTMLInputElement>(null);
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const timezone = mode === 'utc' ? 'UTC' : localZone;
  const agenda = cwEventAgenda(now);
  const feed = publicCwCalendarUrl(window.location.origin);
  useEffect(() => {
    let tick: number;
    const refresh = () => {
      const time = Date.now();
      setNow(time);
      const { current, next } = cwEventAgenda(time);
      const boundary = Math.min(next.start, ...current.map((event) => event.end));
      window.clearTimeout(tick);
      // Align to event boundaries even if mounted between whole seconds. Wall
      // time, not accumulated ticks: suspended tabs immediately catch up.
      tick = window.setTimeout(refresh, Math.max(1, Math.min(1000, boundary - time)));
    };
    refresh();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    const storage = (event: StorageEvent) => {
      if (event.key === EVENT_TIME_MODE_KEY || event.key === null) {
        setMode(loadEventTimeMode());
        setPreferenceFailed(false);
      }
    };
    window.addEventListener('storage', storage);
    return () => {
      window.clearTimeout(tick);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('storage', storage);
    };
  }, []);
  const chooseMode = (next: EventTimeMode) => {
    setMode(next);
    setPreferenceFailed(!saveEventTimeMode(next));
  };
  const copyFeed = async () => {
    try {
      await navigator.clipboard.writeText(feed);
      setCopyStatus('Calendar URL copied.');
    } catch {
      setCopyStatus('Clipboard unavailable. Select and copy the calendar URL below.');
      feedInput.current?.focus();
      feedInput.current?.select();
    }
  };
  const occurrence = (event: CwEventOccurrence) => (
    <>
      <h3>
        {event.event.id.toUpperCase()} · {event.event.name}
      </h3>
      <p className="live-event-window">
        <time dateTime={new Date(event.start).toISOString()}>
          {formatCwEventWindow(event, timezone)}
        </time>
      </p>
      <a href={event.event.rulesUrl} target="_blank" rel="noreferrer">
        {event.event.id.toUpperCase()} official rules
      </a>
    </>
  );
  return (
    <section className="live-practice-agenda" aria-labelledby="live-practice-title">
      <header className="page-heading">
        <div>
          <span className="eyebrow">PUBLIC ON-AIR SCHEDULE</span>
          <h1 id="live-practice-title">Live practice</h1>
          <p>SST, MST and CWT organizer windows. No account needed.</p>
        </div>
        {onReturn && (
          <button className="button outline small" onClick={onReturn}>
            Return to current practice
          </button>
        )}
      </header>
      <div className="card live-agenda-controls">
        <label className="field">
          Display times{' '}
          <select
            value={mode}
            onChange={(event) => chooseMode(event.target.value as EventTimeMode)}
          >
            <option value="local">Local</option>
            <option value="utc">UTC</option>
          </select>
        </label>
        <p>
          Times shown in <strong>{timezone}</strong>. Organizer recurrence stays in UTC.
        </p>
        {preferenceFailed && (
          <p role="status">
            This choice is active, but could not be kept on this device.{' '}
            <button className="text-button" onClick={() => chooseMode(mode)}>
              Retry saving choice
            </button>
          </p>
        )}
      </div>
      <p className="live-event-status" role="status">
        {agenda.current.length
          ? `${agenda.current.map((event) => event.event.id.toUpperCase()).join(', ')} in progress.`
          : `No event in progress. Next: ${agenda.next.event.id.toUpperCase()}.`}
      </p>
      <div className="live-event-featured">
        {agenda.current.map((event) => (
          <article
            key={event.id}
            className="card live-event-card"
            aria-label={`${event.event.id.toUpperCase()} in progress`}
          >
            <span className="eyebrow">ON AIR NOW</span>
            {occurrence(event)}
            <p className="live-event-countdown" aria-live="off">
              Ends in {cwEventCountdown(event.end - now)}
            </p>
          </article>
        ))}
        <article className="card live-event-card" aria-label="Next live event">
          <span className="eyebrow">NEXT EVENT</span>
          {occurrence(agenda.next)}
          <p className="live-event-countdown" aria-live="off">
            Starts in {cwEventCountdown(agenda.next.start - now)}
          </p>
        </article>
      </div>
      <section className="card live-calendar" aria-labelledby="live-calendar-title">
        <h2 id="live-calendar-title">Subscribe to the public calendar</h2>
        <p>
          Only these organizer windows and public links. Add a subscription to receive schedule
          updates; an imported file is a snapshot.
        </p>
        <div className="live-calendar-actions">
          <a className="button dark" href={feed.replace(/^https?:/, 'webcal:')}>
            Subscribe to calendar
          </a>
          <a className="button outline" href={feed} download="cw-live-practice.ics">
            Download calendar
          </a>
          <button className="button outline" onClick={() => void copyFeed()}>
            Copy calendar URL
          </button>
        </div>
        <label className="field">
          Public calendar URL
          <input
            ref={feedInput}
            readOnly
            value={feed}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
        <p role="status">{copyStatus}</p>
        <p>
          Calendar apps choose their own refresh interval. This feed requests six-hour refreshes;
          published changes may appear later.
        </p>
      </section>
      <section className="card live-upcoming" aria-labelledby="live-upcoming-title">
        <h2 id="live-upcoming-title">Upcoming windows</h2>
        <ol>
          {agenda.upcoming.slice(1).map((event) => (
            <li key={event.id}>{occurrence(event)}</li>
          ))}
        </ol>
      </section>
      <p className="live-agenda-note">
        Schedule verified {CW_EVENT_SCHEDULE.verifiedOn} against the linked organizers. Viewing this
        agenda or using a simulator does not establish on-air participation or complete an
        assignment.
      </p>
    </section>
  );
}
