import { useId } from 'react';
import type {
  dailyPracticeGoals,
  DailyPracticeTime,
  CurrentPracticeTime,
} from '../shared/practice-time';
import { formatPracticeDuration } from './practice-duration';
import './practice-time-summary.css';

export default function PracticeTimeSummary({
  summary,
  goals,
  timezone,
  guest,
  current,
}: {
  summary: DailyPracticeTime;
  goals: ReturnType<typeof dailyPracticeGoals>;
  timezone: string;
  guest?: boolean;
  current?: CurrentPracticeTime;
}) {
  const heading = useId();
  const time = (seconds: number) => formatPracticeDuration(seconds / 60);
  return (
    <section className="practice-time-summary" aria-labelledby={heading}>
      <h2 id={heading}>Today’s practice time</h2>
      <p className="practice-time-date">
        {summary.date} · {timezone.replaceAll('_', ' ')}
      </p>
      <dl className="practice-time-totals" aria-label="Independent practice">
        <div>
          <dt>Saved</dt>
          <dd>{time(summary.practice.savedSeconds)}</dd>
        </div>
        <div>
          <dt>Current</dt>
          <dd>{time(summary.practice.currentSeconds)}</dd>
        </div>
        <div>
          <dt>Total</dt>
          <dd>{time(summary.practice.totalSeconds)}</dd>
        </div>
      </dl>
      <p>Recall included: {time(summary.practice.recallSeconds)}. Class time stays separate.</p>
      <dl className="practice-time-class" aria-label="Class time">
        <div>
          <dt>Class saved</dt>
          <dd>{time(summary.classTime.savedSeconds)}</dd>
        </div>
        <div>
          <dt>Class current</dt>
          <dd>{time(summary.classTime.currentSeconds)}</dd>
        </div>
        <div>
          <dt>Class total</dt>
          <dd>{time(summary.classTime.totalSeconds)}</dd>
        </div>
      </dl>
      {guest ? (
        <p>On this device. Public practice needs no account.</p>
      ) : (
        <>
          <p className="practice-time-goal">
            <strong>Required goal: {goals.requiredMinutes} min</strong>
            {goals.restDay ? ' · Rest day' : ' · Exercises dated today'}
          </p>
          <p>
            {goals.restDay
              ? 'No required exercises today. Practice is optional.'
              : `${Math.max(0, Number((goals.requiredMinutes - summary.practice.totalSeconds / 60).toFixed(1)))} min remaining toward the required goal.`}
          </p>
          <p>Optional personal target: {goals.personalMinutes} min every day.</p>
        </>
      )}
      {current && current.date !== summary.date && current.seconds > 0 && (
        <p>
          <strong>
            Retained block: {time(current.seconds)} on {current.date}.
          </strong>{' '}
          It belongs to its start day and is outside today’s totals.
        </p>
      )}
      <details className="practice-time-hint">
        <summary>How time is counted</summary>
        <p>
          Saved includes results kept on this device for upload. Current is measured unfinished
          practice or a result awaiting review. A block keeps its start day across midnight.
          Visiting another view pauses it; elapsed time is not recovered after a reload. Existing
          Copy drafts and finished results keep their established recovery.
        </p>
      </details>
    </section>
  );
}
