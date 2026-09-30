import {
  scoreCopyText,
  summarizeCopyAttempt,
  type CopyAttempt,
  type CopyMode,
} from '../shared/copy-practice';
import { savedCopyAttempt } from '../shared/copy-report';
import type { PracticeSession } from '../shared/training';
import './copy-trainer.css';

export const COPY_LABELS: Record<CopyMode, string> = {
  groups: 'Code groups',
  words: 'Word copy',
  callsigns: 'Callsign copy',
  plaintext: 'Plain text',
};
export const copyDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function missedCopyCharacters(attempt: CopyAttempt) {
  return [
    ...new Set(
      attempt.trials.flatMap((trial, index) =>
        scoreCopyText(attempt.targets[index], trial.answer)
          .alignment.filter((item) => item.kind !== 'equal')
          .map((item) => item.expected)
          .filter((c) => /^[A-Z0-9?/.,=]$/.test(c)),
      ),
    ),
  ].join('');
}

export default function CopyResult({
  attempt,
  onReplay,
}: {
  attempt: CopyAttempt;
  onReplay?: (index: number) => void;
}) {
  const result = summarizeCopyAttempt(attempt);
  const continuous = attempt.recipe.mode === 'groups' || attempt.recipe.mode === 'plaintext';
  const score =
    continuous && attempt.trials[0]
      ? scoreCopyText(
          attempt.targets[0],
          attempt.trials[0].answer,
          attempt.recipe.mode === 'plaintext',
        )
      : undefined;
  return (
    <div className="copy-result">
      <div className="copy-result-stats">
        <div>
          <strong>{result.answered ? `${result.accuracy}%` : '—'}</strong>
          <span>{continuous ? 'copy accuracy' : 'answered correctly'}</span>
        </div>
        {continuous ? (
          <div>
            <strong>{result.distance}</strong>
            <span>character edits</span>
          </div>
        ) : (
          <>
            <div>
              <strong>
                {result.correct}/{result.total}
              </strong>
              <span>correct in this round</span>
            </div>
            <div>
              <strong>{result.points}</strong>
              <span>speed × length points</span>
            </div>
            <div>
              <strong>{result.maxSpeed || '—'}</strong>
              <span>highest correct effective WPM</span>
            </div>
          </>
        )}
        <div>
          <strong>{copyDuration(result.seconds)}</strong>
          <span>practice time</span>
        </div>
      </div>
      <p className="copy-time-breakdown">
        {copyDuration(attempt.audioSeconds)} audio · {copyDuration(attempt.answerSeconds)} answering
        · {copyDuration(attempt.reviewSeconds)} focused review · {result.replays} replays
      </p>
      {attempt.status === 'abandoned' && (
        <p className="copy-help">
          Partial round: {result.answered} of {result.total} answers submitted. Accuracy covers
          submitted answers.
        </p>
      )}
      {!result.answered && (
        <p className="copy-help">
          No answers were submitted, so this round has no accuracy result.
        </p>
      )}
      {attempt.revealCount > 0 && (
        <p className="copy-help">Answers were revealed. This is practice with assistance.</p>
      )}
      {attempt.interruptionCount > 0 && (
        <p className="copy-help">
          Restored after {attempt.interruptionCount} interruption
          {attempt.interruptionCount === 1 ? '' : 's'}.
        </p>
      )}
      {score ? (
        <>
          <p className="copy-help">
            {score.distance} edits / {score.denominator} transmitted{' '}
            {attempt.recipe.mode === 'plaintext'
              ? 'characters, including spaces'
              : 'characters, excluding spaces'}{' '}
            gives {score.errorPercent}% errors (capped at 100%). Case and repeated spaces are
            ignored; missing group boundaries and extra input count.
          </p>
          <div className="copy-answer-comparison">
            <div>
              <strong>Sent</strong>
              <pre>{attempt.targets[0]}</pre>
            </div>
            <div>
              <strong>Your copy</strong>
              <pre>{attempt.trials[0].answer || '(No answer)'}</pre>
            </div>
          </div>
          <details open={score.distance > 0}>
            <summary>Character feedback</summary>
            <p className="copy-help">
              Substitutions show sent → copied. Missing characters use −, extra characters use +. A
              dot marks a space.
            </p>
            <div className="copy-alignment" aria-label="Character comparison">
              {score.alignment.map((item, index) => {
                const shown = (text: string) => (text === ' ' ? '·' : text);
                return (
                  <span key={index} className={`copy-char ${item.kind}`}>
                    {item.kind === 'equal'
                      ? shown(item.expected)
                      : item.kind === 'substitution'
                        ? `${shown(item.expected)}→${shown(item.received)}`
                        : item.kind === 'deletion'
                          ? `−${shown(item.expected)}`
                          : `+${shown(item.received)}`}
                  </span>
                );
              })}
            </div>
          </details>
          {onReplay && (
            <button className="button outline" type="button" onClick={() => onReplay(0)}>
              Replay recording for review
            </button>
          )}
        </>
      ) : (
        attempt.trials.length > 0 && (
          <div className="copy-table-scroll" role="region" aria-label="Round answers" tabIndex={0}>
            <p className="copy-scroll-hint">
              Swipe or scroll horizontally to see all result columns.
            </p>
            <table className="copy-trial-table">
              <thead>
                <tr>
                  <th scope="col">Sent</th>
                  <th scope="col">Your answer</th>
                  <th scope="col" aria-label="WPM (character/effective)">
                    WPM (char/eff)
                  </th>
                  <th scope="col">Result</th>
                  {onReplay && <th scope="col">Review</th>}
                </tr>
              </thead>
              <tbody>
                {attempt.trials.map((trial, index) => (
                  <tr key={index}>
                    <th scope="row">{attempt.targets[index]}</th>
                    <td>{trial.answer || '(Skipped)'}</td>
                    <td>
                      {trial.characterWpm}/{trial.effectiveWpm}
                    </td>
                    <td>
                      {trial.correct ? 'Correct' : 'Incorrect'}
                      {trial.replayCount > 0 ? ` · replayed ${trial.replayCount}×` : ''}
                    </td>
                    {onReplay && (
                      <td>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => onReplay(index)}
                          aria-label={`Replay ${attempt.targets[index]} at ${trial.effectiveWpm} effective WPM`}
                        >
                          Replay
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      <p className="copy-help">
        {attempt.recipe.characterWpm}/{attempt.recipe.effectiveWpm} starting WPM ·{' '}
        {attempt.recipe.toneHz} Hz ·{' '}
        {continuous
          ? 'Native edit-distance scoring'
          : `${attempt.recipe.adaptive ? 'Adaptive' : 'Fixed'} speed; correct answers earn speed × length points${attempt.recipe.adaptive ? ' after the speed increment' : ''}`}
        .
      </p>
      <details className="copy-result-settings">
        <summary>Round settings</summary>
        {attempt.recipe.mode === 'groups' && (
          <p>
            {attempt.recipe.groupKind} characters
            {attempt.recipe.groupKind === 'custom'
              ? `: ${attempt.recipe.customCharacters}`
              : ''} · {attempt.recipe.groupLength === 'random' ? '2–7' : attempt.recipe.groupLength}{' '}
            characters per group ·{' '}
            {attempt.recipe.lengthMode === 'count'
              ? `${attempt.recipe.groupCount} groups`
              : `${copyDuration(attempt.recipe.durationSeconds)} target duration`}
          </p>
        )}
        {attempt.recipe.mode === 'words' && (
          <p>
            {attempt.recipe.wordCollection} collection · maximum {attempt.recipe.maxWordLength}{' '}
            characters ·{' '}
            {attempt.recipe.autoSkipSeconds
              ? `skip after ${attempt.recipe.autoSkipSeconds}s`
              : 'no automatic skip'}
          </p>
        )}
        {attempt.recipe.mode === 'callsigns' && (
          <p>
            {attempt.recipe.callFilter} calls ·{' '}
            {attempt.recipe.stopOnError ? 'pause after errors' : 'continue after errors'} ·{' '}
            {attempt.recipe.blind ? 'feedback hidden during round' : 'immediate feedback'}
          </p>
        )}
        <p>
          {attempt.recipe.extraWordSpacing} extra word gaps · {attempt.recipe.startDelaySeconds}s
          countdown{!continuous ? ` · ${attempt.recipe.maxSpeed} WPM limit` : ''}
        </p>
        <p>
          Started {new Date(attempt.createdAt).toLocaleString()} · {attempt.scoringVersion}
        </p>
      </details>
    </div>
  );
}

export function CopyAttemptDetails({ entry }: { entry: PracticeSession }) {
  const attempt = savedCopyAttempt(entry);
  if (!attempt) return null;
  return (
    <details className="session-copy-result">
      <summary>{COPY_LABELS[attempt.recipe.mode]} result</summary>
      <CopyResult attempt={attempt} />
    </details>
  );
}
