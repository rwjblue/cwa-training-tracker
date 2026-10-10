import type { CSSProperties } from 'react';
import {
  copyToneHz,
  scoreCopyAttemptText,
  scoreCopyText,
  summarizeCopyAttempt,
  type CopyAttempt,
  type CopyMode,
  type CopyAlignment,
} from '../shared/copy-practice';
import { savedCopyAttempt } from '../shared/copy-report';
import type { PracticeSession } from '../shared/training';
import { copyComparisonRows, describeCopyEdit } from './copy-comparison';
import './copy-result.css';

export const COPY_LABELS: Record<CopyMode, string> = {
  groups: 'Code groups',
  words: 'Word copy',
  callsigns: 'Callsign copy',
  plaintext: 'Sentence copy',
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
  const randomTone = attempt.recipe.toneMode === 'random';
  const itemTones =
    randomTone && !continuous ? attempt.trials.map((_, index) => copyToneHz(attempt, index)) : [];
  const groupTones =
    randomTone && attempt.recipe.mode === 'groups'
      ? (attempt.targets[0]?.match(/\S+/g) ?? []).map((_, index) => copyToneHz(attempt, 0, index))
      : [];
  const score = scoreCopyAttemptText(attempt);
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
            <span>
              {score?.groupDistance !== undefined ? 'scored character edits' : 'character edits'}
            </span>
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
        <p className="copy-result-notice">
          Partial round: {result.answered} of {result.total} answers submitted. Accuracy covers
          submitted answers.
        </p>
      )}
      {!result.answered && (
        <p className="copy-result-notice">
          No answers were submitted, so this round has no accuracy result.
        </p>
      )}
      {attempt.revealCount > 0 && (
        <p className="copy-result-notice">
          Answers were revealed. This is practice with assistance.
        </p>
      )}
      {attempt.interruptionCount > 0 && (
        <p className="copy-result-notice">
          Restored after {attempt.interruptionCount} interruption
          {attempt.interruptionCount === 1 ? '' : 's'}.
        </p>
      )}
      {score ? (
        <>
          <CharacterComparison
            alignment={score.alignment}
            unit={attempt.recipe.mode === 'groups' ? 'Group' : 'Word'}
          />
          <details className="copy-scoring-details">
            <summary>Scoring details</summary>
            {score.groupDistance !== undefined ? (
              <>
                <p>
                  Group comparison: {score.groupDistance} edits. Whole-text comparison:{' '}
                  {score.wholeTextDistance} edits. The lower count, {score.distance}, divided by{' '}
                  {score.denominator} transmitted characters (excluding spaces), gives{' '}
                  {score.errorPercent}% errors (capped at 100%).
                </p>
                <p>
                  Case and repeated spaces are ignored. Missing and extra groups count. The visual
                  comparison shows the whole-text alignment; its edit count can differ from the
                  score when the group comparison is better.
                </p>
              </>
            ) : (
              <>
                <p>
                  {score.distance} edits / {score.denominator} transmitted{' '}
                  {attempt.recipe.mode === 'plaintext'
                    ? 'characters, including spaces'
                    : 'characters, excluding spaces'}{' '}
                  gives {score.errorPercent}% errors (capped at 100%). Case and repeated spaces are
                  ignored; missing boundaries and extra input count.
                </p>
                <p>The comparison uses the same full-text alignment as the score.</p>
              </>
            )}
            <p>Repeated characters can have more than one equally valid alignment.</p>
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
      <p className="copy-result-notice">
        {attempt.recipe.characterWpm}/{attempt.recipe.effectiveWpm} starting WPM ·{' '}
        {randomTone
          ? attempt.recipe.mode === 'groups'
            ? 'Random tone (500–900 Hz per group)'
            : continuous
              ? `${copyToneHz(attempt)} Hz (random)`
              : 'Random tone (500–900 Hz per item)'
          : `${copyToneHz(attempt)} Hz`}
        {!continuous && ` · ${attempt.recipe.adaptive ? 'Adaptive' : 'Fixed'} speed`}
      </p>
      <details className="copy-result-settings">
        <summary>Round settings</summary>
        {randomTone && <p>Random pitches stay the same when replayed.</p>}
        {groupTones.length > 0 && (
          <p>
            Group pitch sequence (Hz):{' '}
            {groupTones.map((tone, index) => `${index + 1}: ${tone}`).join(' · ')}
          </p>
        )}
        {itemTones.length > 0 && (
          <p>
            Submitted item tones (Hz):{' '}
            {itemTones.map((tone, index) => `${index + 1}: ${tone}`).join(' · ')}
          </p>
        )}
        {!continuous && (
          <p>
            Correct answers earn speed × length points
            {attempt.recipe.adaptive ? ' after the speed increment' : ''}.
          </p>
        )}
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

function CharacterComparison({
  alignment,
  unit,
}: {
  alignment: CopyAlignment[];
  unit: 'Group' | 'Word';
}) {
  const rows = copyComparisonRows(alignment);
  // Keep the sent column narrow so the copy starts beside it. Extra received
  // characters can use the remaining width without moving that starting point.
  const columnCells = Math.min(
    24,
    Math.max(4, ...rows.map((row) => row.cells.filter((cell) => cell.expected).length)),
  );
  const shown = (text: string) => (text === ' ' ? '·' : text);
  return (
    <div className="copy-comparison">
      <div className="copy-comparison-heading">
        <h3>{unit === 'Group' ? 'Group comparison' : 'Word comparison'}</h3>
        <p>One {unit.toLowerCase()} per row.</p>
      </div>
      <p className="copy-comparison-legend">
        <span>
          <span className="copy-key-change">Underlined</span> changed
        </span>
        <span>
          <b>−</b> missing
        </span>
        <span>
          <b>+</b> extra
        </span>
        <span>
          <b>·</b> space
        </span>
      </p>
      <div
        className="copy-comparison-table"
        style={{ '--copy-column-cells': columnCells } as CSSProperties}
      >
        <div className="copy-comparison-columns" aria-hidden="true">
          <span>#</span>
          <strong>Sent</strong>
          <strong>Your copy</strong>
        </div>
        <ol className="copy-comparison-list" aria-label="Character comparison">
          {rows.map((row) => (
            <li key={row.number}>
              <div
                className="copy-comparison-row"
                role="group"
                aria-label={`${unit} ${row.number}`}
              >
                <span className="copy-row-number" aria-hidden="true">
                  {row.number}
                </span>
                <span className="sr-only">
                  {row.edits === 0
                    ? 'Correct'
                    : !row.copied.trim()
                      ? 'Not copied'
                      : `${row.edits} ${row.edits === 1 ? 'edit' : 'edits'}`}
                </span>
                <p className="sr-only">Sent: {row.sent}</p>
                <p className="sr-only">Your copy: {row.copied || '(Not copied)'}</p>
                {row.edits > 0 && (
                  <p className="sr-only">
                    {row.alignment.map(describeCopyEdit).filter(Boolean).join(' ')}
                  </p>
                )}
                <div className="copy-comparison-string copy-string-sent" aria-hidden="true">
                  {row.cells.map((item, index) => (
                    <span className={`copy-comparison-character ${item.kind}`} key={index}>
                      {shown(item.expected) || '\u00a0'}
                    </span>
                  ))}
                </div>
                <div className="copy-comparison-string copy-string-received" aria-hidden="true">
                  {row.cells.map((item, index) => (
                    <span
                      className={`copy-comparison-character ${item.kind}`}
                      key={index}
                      title={describeCopyEdit(item) || undefined}
                    >
                      {item.kind === 'deletion'
                        ? '−'
                        : `${item.kind === 'insertion' ? '+' : ''}${shown(item.received)}`}
                    </span>
                  ))}
                </div>
                {row.boundaryNotes.map((note) => (
                  <p className="copy-boundary-note" key={note}>
                    {unit === 'Word' ? note.replaceAll('group', 'word') : note}
                  </p>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
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
