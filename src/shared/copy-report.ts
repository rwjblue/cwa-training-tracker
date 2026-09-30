import {
  copyToneHz,
  normalizeCopyText,
  summarizeCopyAttempt,
  validateCopyAttempt,
  type CopyAttempt,
} from './copy-practice.ts';
import type { PracticeSession } from './training';

const displayNumber = (value: number) => Number(value.toFixed(2)).toString();

/** Only complete or deliberately ended native evidence belongs in saved history. */
export function savedCopyAttempt(
  entry: Pick<PracticeSession, 'metadata'>,
): CopyAttempt | undefined {
  if (entry.metadata?.copyAttempt === undefined) return undefined;
  try {
    const attempt = validateCopyAttempt(entry.metadata.copyAttempt);
    return attempt.status === 'active' ? undefined : attempt;
  } catch {
    return undefined;
  }
}

/** Keep list/report summaries tied to actual measured trials, never the last UI selection. */
export function copyAttemptSessionFields(attempt: CopyAttempt) {
  const summary = summarizeCopyAttempt(attempt);
  const first = attempt.trials[0];
  const uniform =
    first &&
    attempt.trials.every(
      (trial) =>
        trial.characterWpm === first.characterWpm && trial.effectiveWpm === first.effectiveWpm,
    );
  return {
    id: `copy:${attempt.id}`,
    source: 'morse' as const,
    sourceId: attempt.id,
    createdAt: attempt.createdAt,
    minutes: summary.seconds / 60,
    ...(uniform ? { characterWpm: first.characterWpm, effectiveWpm: first.effectiveWpm } : {}),
    ...(attempt.trials.length ? { accuracy: summary.accuracy } : {}),
    metadata: {
      practiceTool: 'copy',
      elapsedSeconds: summary.seconds,
      copyAttempt: attempt,
    },
  };
}

/** Each line describes one whole attempt. Scores from separate runs are never combined. */
export function copyAttemptReportDetails(attempt: CopyAttempt): string[] {
  const summary = summarizeCopyAttempt(attempt);
  const labels: Record<string, string> = {
    groups: 'Code groups',
    words: 'Word copy',
    callsigns: 'Callsign copy',
    plaintext: 'Plain text copy',
  };
  const label = labels[attempt.recipe.mode] ?? 'Copy practice';
  const lines = [
    `${label} · ${attempt.status === 'completed' ? 'completed' : 'partial'} · attempt ${attempt.id}`,
  ];
  if (attempt.recipe.mode === 'groups') {
    const recipe = attempt.recipe;
    lines.push(
      `${recipe.groupKind} · group length ${recipe.groupLength}${recipe.groupKind === 'custom' ? ` · characters ${recipe.customCharacters}` : ''} · ${recipe.lengthMode === 'count' ? `${recipe.groupCount} groups` : `${recipe.durationSeconds}s target`} · ${recipe.extraWordSpacing} extra word gaps`,
    );
  } else if (attempt.recipe.mode === 'words') {
    lines.push(
      `${attempt.recipe.wordCollection} · maximum ${attempt.recipe.maxWordLength} letters · ${attempt.recipe.adaptive ? 'adaptive' : 'fixed'} speed`,
    );
  } else if (attempt.recipe.mode === 'callsigns') {
    lines.push(
      `${attempt.recipe.callFilter} calls · ${attempt.recipe.adaptive ? 'adaptive' : 'fixed'} speed`,
    );
  }
  if (attempt.recipe.toneMode === 'random') {
    if (attempt.recipe.mode === 'groups') {
      const tones = normalizeCopyText(attempt.targets[0])
        .split(' ')
        .map((_, index) => copyToneHz(attempt, 0, index));
      lines.push(
        `Tone: random 500–900 Hz per group · recording group tones (Hz): ${tones.join(', ')}`,
      );
    } else if (attempt.recipe.mode === 'plaintext') {
      lines.push(`Tone: random 500–900 Hz per recording · ${copyToneHz(attempt)} Hz`);
    } else {
      const tones = attempt.trials.map((_, index) => copyToneHz(attempt, index));
      lines.push(
        `Tone: random 500–900 Hz per ${attempt.recipe.mode === 'words' ? 'word' : 'call'}${tones.length ? ` · submitted trial tones (Hz): ${tones.join(', ')}` : ''}`,
      );
    }
  } else lines.push(`Tone: fixed ${attempt.recipe.toneHz} Hz`);
  if (attempt.trials.length) {
    const speeds = [
      ...new Set(attempt.trials.map((trial) => `${trial.characterWpm}/${trial.effectiveWpm}`)),
    ];
    lines.push(`Actual character/effective WPM: ${speeds.join(', ')}`);
    if (attempt.recipe.mode === 'groups' || attempt.recipe.mode === 'plaintext') {
      lines.push(
        `Native copy: ${summary.distance} edits · ${displayNumber(summary.errorPercent)}% errors · ${displayNumber(summary.accuracy)}% accuracy`,
      );
    } else {
      lines.push(
        `${summary.correct}/${summary.answered} submitted answers correct · ${summary.answered}/${summary.total} trials answered · ${summary.points} points · ${summary.maxSpeed > 0 ? `${summary.maxSpeed} WPM highest correctly copied` : 'no correctly copied speed'}`,
      );
      lines.push(`${summary.firstPassCorrect} correct without replay · ${summary.replays} replays`);
    }
  } else lines.push('No answers submitted; no accuracy or copied-speed result.');
  lines.push(
    `Measured time: ${displayNumber(attempt.audioSeconds)}s audio + ${displayNumber(attempt.answerSeconds)}s answering + ${displayNumber(attempt.reviewSeconds)}s review`,
  );
  if (attempt.revealCount) lines.push(`Answers revealed ${attempt.revealCount} time(s).`);
  if (attempt.interruptionCount) lines.push(`Interrupted ${attempt.interruptionCount} time(s).`);
  lines.push(
    `Started ${attempt.createdAt} · ended ${attempt.updatedAt} · ${attempt.scoringVersion}`,
  );
  return lines;
}
