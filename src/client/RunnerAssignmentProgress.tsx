import type { RunnerAssignmentProgress as Progress } from '../shared/runner-progress';

const duration = (seconds: number) => {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

export default function RunnerAssignmentProgress({
  progress,
  extraReview = false,
}: {
  progress: Progress;
  extraReview?: boolean;
}) {
  return (
    <section className="runner-assignment-progress" aria-label="Runner assignment progress">
      <h3>Runner assignment progress</h3>
      <dl className="runner-assignment-totals">
        <div>
          <dt>Saved time</dt>
          <dd>{duration(progress.savedSeconds)}</dd>
        </div>
        <div>
          <dt>Current required time</dt>
          <dd>{duration(progress.currentSeconds)}</dd>
        </div>
        <div>
          <dt>Combined time</dt>
          <dd>{duration(progress.combinedSeconds)}</dd>
        </div>
        {progress.remainingSeconds !== undefined && (
          <div>
            <dt>Remaining time</dt>
            <dd>{duration(Math.ceil(progress.remainingSeconds))}</dd>
          </div>
        )}
      </dl>
      {progress.requiredSeconds !== undefined && (
        <p className="field-hint">
          Assigned time: {duration(progress.requiredSeconds)}. Separate required runs add up.
        </p>
      )}
      <p className="field-hint">
        {extraReview ? 'Extra review and class time do not reduce the required time. ' : ''}
        {progress.remainingSeconds === 0 ? <strong>Time requirement met. </strong> : ''}
        {progress.requiredSeconds === undefined ? 'No time requirement is set. ' : ''}
        Complete or reopen the exercise when you are ready. Completion creates no run, time or
        score.
      </p>
    </section>
  );
}
