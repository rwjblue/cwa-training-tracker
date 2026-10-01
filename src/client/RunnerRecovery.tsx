import { useState } from 'react';
import type { PracticeSession } from '../shared/training';
import { PracticeEvidenceDetails } from './PracticeEvidenceDetails';
import { clearRunnerResult, type RunnerFinishedResult } from './runner-results';
import { getDeviceScopeToken } from './device-scope';

export default function RunnerRecovery({
  scope,
  results,
  error,
  onReview,
}: {
  scope: string;
  results: RunnerFinishedResult[];
  error: string;
  onReview: (entry: PracticeSession) => void;
}) {
  const [deviceToken] = useState(() => getDeviceScopeToken(scope));
  const [discard, setDiscard] = useState<string>();
  const [failure, setFailure] = useState('');
  if (!results.length && !error) return null;
  return (
    <section className="card runner-recovery" aria-labelledby="runner-recovery-heading">
      <h2 id="runner-recovery-heading">Finished Runner results to review</h2>
      <p>
        These acknowledged results are retained on this device. They are separate from logged
        practice and do not resume the simulator. Review a result to save it; nothing uploads before
        submission.
      </p>
      {(error || failure) && (
        <p className="alert error" role="alert">
          {error || failure}
        </p>
      )}
      {results.map(({ entry, reviewed }) => (
        <article key={entry.id}>
          <h3>
            {entry.date} · {reviewed ? 'Submitted review retained for retry' : 'Awaiting review'}
          </h3>
          <p>{entry.notes}</p>
          <PracticeEvidenceDetails entry={entry} />
          <button className="button outline" onClick={() => onReview(entry)}>
            {reviewed ? 'Reopen submitted Runner review' : 'Review finished Runner result'}
          </button>{' '}
          <button className="button outline" onClick={() => setDiscard(entry.id)}>
            Discard retained Runner result
          </button>
          {discard === entry.id && (
            <div role="group" aria-label="Confirm discarding Runner result">
              <p>
                Discard this device review result? An already submitted upload may still complete;
                this does not delete logged history.
              </p>
              <button className="button outline" onClick={() => setDiscard(undefined)}>
                Keep result
              </button>{' '}
              <button
                className="button outline danger-text"
                onClick={() => {
                  try {
                    clearRunnerResult(scope, entry.id, deviceToken);
                    setDiscard(undefined);
                    setFailure('');
                  } catch (error) {
                    setFailure((error as Error).message);
                  }
                }}
              >
                Confirm discard result
              </button>
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
