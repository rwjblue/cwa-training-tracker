const MINIMUM_TONE_HZ = 500;
const MAXIMUM_TONE_HZ = 900;

/** An integer listening pitch, including both ends of the common practice range. */
export function randomToneHz(random = Math.random): number {
  return MINIMUM_TONE_HZ + Math.floor(random() * (MAXIMUM_TONE_HZ - MINIMUM_TONE_HZ + 1));
}

/** Sample the second sender from the allowed pitches without retrying random draws. */
export function randomTonePair(
  random = Math.random,
  minimumDifferenceHz = 35,
): readonly [number, number] {
  if (
    !Number.isInteger(minimumDifferenceHz) ||
    minimumDifferenceHz < 1 ||
    minimumDifferenceHz > (MAXIMUM_TONE_HZ - MINIMUM_TONE_HZ) / 2
  )
    throw new Error('Choose a minimum pitch difference from 1 to 200 Hz.');

  const first = randomToneHz(random);
  const lowerCount = Math.max(0, first - minimumDifferenceHz - MINIMUM_TONE_HZ + 1);
  const upperStart = first + minimumDifferenceHz;
  const upperCount = Math.max(0, MAXIMUM_TONE_HZ - upperStart + 1);
  const selected = Math.floor(random() * (lowerCount + upperCount));
  const second =
    selected < lowerCount ? MINIMUM_TONE_HZ + selected : upperStart + selected - lowerCount;
  return Object.freeze([first, second]);
}
