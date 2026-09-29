import { cleanMorseText } from './audio';

/** Public vocabulary selections from the original listening tools, not course documents. */
export const WORD_LISTS = {
  'common-qso': {
    title: 'Common QSO words',
    words:
      'VVV VERT OM HR XYL QTH RR AGE FB LID QSL TKS RIG QSB CQ CL KN NAME PKT QSO TEST DE BT 73 QRM BK AGN DIPOLE SK HW? QRP TNX YRS YL QRX QRL ES WX QRT K QRS 88 PWR RUNS CALL VY WIRE YAGI NR RPT OP AR PSE EL LOOP ABT QSY TU HI BEAM RST WATT AS TEMP CPY QRZ ANT QRN CW DX'.split(
        ' ',
      ),
  },
  'common-30': {
    title: '30 common English words',
    words:
      'THE OF AND TO A IN IS FOR THAT WAS ON WITH HE IT AS AT HIS BY BE FROM ARE THIS I BUT HAVE AN HAS NOT THEY OR'.split(
        ' ',
      ),
  },
} as const;
export type WordList = keyof typeof WORD_LISTS | 'custom';

export function wordPracticeRound(
  list: WordList,
  customText: string,
  shuffle: boolean,
  random = Math.random,
): string[] {
  const words =
    list === 'custom'
      ? customText.trim().toUpperCase().split(/\s+/).filter(Boolean)
      : [...WORD_LISTS[list].words];
  if (!words.length || words.length > 200) throw new Error('Enter between 1 and 200 words.');
  if (words.some((word) => word.length > 40 || cleanMorseText(word) !== word))
    throw new Error(
      'Use letters, numbers, punctuation, or prosigns such as <AR>; up to 40 characters per word.',
    );
  const first = list === 'common-qso' ? 1 : 0;
  if (shuffle)
    for (let index = words.length - 1; index > first; index--) {
      const next = first + Math.floor(random() * (index - first + 1));
      [words[index], words[next]] = [words[next], words[index]];
    }
  return words;
}
