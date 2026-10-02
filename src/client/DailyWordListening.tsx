import { useId } from 'react';
import type { dailyWordListening } from '../shared/daily-word-listening';
import { formatPracticeDuration } from './practice-duration';

export default function DailyWordListening({
  summary,
  timezone,
  retained,
  busy,
  onStart,
}: {
  summary: ReturnType<typeof dailyWordListening>;
  timezone: string;
  retained: boolean;
  busy: boolean;
  onStart: () => void;
}) {
  const heading = useId();
  const time = (seconds: number) => formatPracticeDuration(seconds / 60);
  return (
    <section className="practice-time-summary daily-word-listening" aria-labelledby={heading}>
      <h2 id={heading}>Optional daily word listening</h2>
      <p className="practice-time-date">
        {summary.date} · {timezone.replaceAll('_', ' ')}
      </p>
      <p>
        Try ten minutes of hearing whole words before revealing text. Use Common QSO words, 30
        common English words or your own list; choose a comfortable speed and extra word pause.
      </p>
      <dl className="practice-time-totals" aria-label="Word listening only">
        <div>
          <dt>Saved listening</dt>
          <dd>{time(summary.savedSeconds)}</dd>
        </div>
        <div>
          <dt>Current listening</dt>
          <dd>{time(summary.currentSeconds)}</dd>
        </div>
        <div>
          <dt>Remaining</dt>
          <dd>{time(summary.remainingSeconds)}</dd>
        </div>
      </dl>
      <p>Total listening: {time(summary.totalSeconds)} / 10:00.</p>
      <p role="status">
        {summary.reachedGoal
          ? 'Ten-minute listening goal reached. Keep listening if you like.'
          : 'An optional listening goal, independent of required homework.'}
      </p>
      <button className="button dark" disabled={busy} onClick={onStart}>
        {retained ? 'Continue word listening' : 'Practice words'}
      </button>
      <p>
        Repeat list deliberately loops beyond this goal. Pause for focused recall, then review and
        save. Recall counts toward total practice time, not this listening goal; required tasks are
        never completed by this activity.
      </p>
      <details>
        <summary>Resource and progress details</summary>
        <p>
          The original daily recording is private and unavailable here. These generated word lists
          are a permitted replacement. No original audio is copied or published.
        </p>
        <p>
          Only measured word audio on this local date counts. Saved results and current practice are
          counted once, including results awaiting upload. Class time and older unmeasured records
          are excluded. A block keeps its start day; unfinished elapsed time is not recovered after
          reload. Public practice needs no account.
        </p>
      </details>
    </section>
  );
}
