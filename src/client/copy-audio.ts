import {
  copyTiming,
  copyToneHz,
  currentCopySpeeds,
  type CopyAttempt,
} from '../shared/copy-practice';
import { buildMorseTrack } from './morse-track';

/** One native recording with a repeatable pitch for each group, word, or call. */
export function buildCopyTrack(attempt: CopyAttempt, targetIndex = attempt.trials.length) {
  const text = attempt.targets[targetIndex];
  if (!text) throw new Error('Choose a copy recording to play.');
  const recipe = attempt.recipe;
  const speeds = attempt.trials[targetIndex] ?? currentCopySpeeds(attempt);
  const naturalGap = copyTiming(speeds.characterWpm, speeds.effectiveWpm).wordGap;
  return buildMorseTrack(
    text.split(' ').map((word, wordIndex) => ({
      text: word,
      frequency: copyToneHz(attempt, targetIndex, wordIndex),
    })),
    {
      characterWpm: speeds.characterWpm,
      effectiveWpm: speeds.effectiveWpm,
      frequency: recipe.toneHz,
      volume: 0.7,
      extraWordGap: naturalGap * recipe.extraWordSpacing,
    },
  );
}
