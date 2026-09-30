import type { SendingSection } from '../shared/plan';

export const BOB_CARTER_SCALES_PDF_URL =
  'https://cwops.org/wp-content/uploads/2022/03/Everyday-Send-Code-WR7Q-ver.-7.pdf';

export interface SendingScaleGroup {
  text: string;
  annotation?: string;
}

export interface SendingScaleRow {
  id: string;
  kind: 'groups' | 'phrases';
  groups: readonly SendingScaleGroup[];
}

export interface SendingScaleDefinition {
  id: SendingSection;
  title: string;
  guidance: string;
  rows: readonly SendingScaleRow[];
}

const groups = (text: string): SendingScaleGroup[] => text.split(' ').map((text) => ({ text }));
const repeatedCharacters = (characters: string): SendingScaleGroup[] =>
  [...characters].map((character) => ({ text: character.repeat(5) }));
const repeatedSymbol = (text: string, annotation?: string): SendingScaleGroup => ({
  text: Array.from({ length: 5 }, () => text).join(' '),
  ...(annotation ? { annotation } : {}),
});

const pangram = 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG';
const mixedNumbers = '7 0 3 6 4 5 1 2 8 9';
const phrase = (id: string): SendingScaleRow => ({
  id,
  kind: 'phrases',
  groups: [{ text: pangram }, { text: mixedNumbers }],
});

/**
 * Native practice patterns corresponding to the public scales' three sections.
 * Character runs, alphabet/number order, and prosign notation are mechanical
 * sending targets. Guidance is original; this reader uses the conventional
 * pangram rather than reproducing the source's sentence or instruction prose.
 * Source checked against Bob Carter WR7Q's public v7 PDF on 2026-09-30.
 */
export const SENDING_SCALES: readonly SendingScaleDefinition[] = [
  {
    id: 'warm-up',
    title: 'Warm-up',
    guidance:
      'Begin here to settle into an even rhythm. Send each group or word cleanly; after a mistake, repeat that group or word before moving on.',
    rows: [
      { id: 'simple-rhythm', kind: 'groups', groups: repeatedCharacters('ETIMSOH05') },
      { id: 'mixed-rhythm', kind: 'groups', groups: repeatedCharacters('ANUDVB46') },
      {
        id: 'alphabet-and-symbols',
        kind: 'groups',
        groups: groups('ABCDEF GHIJK LMNOP QRSTU VWXYZ 12345 67890 / , . ? <SK> <AR> <BT>'),
      },
      phrase('warm-up-phrase'),
    ],
  },
  {
    id: 'exercise',
    title: 'Exercise',
    guidance:
      'Work on individual letters and numbers in groups of five. After a mistake, repeat that group before moving on.',
    rows: [
      { id: 'letters-a-j', kind: 'groups', groups: repeatedCharacters('ABCDEFGHIJ') },
      { id: 'letters-k-r', kind: 'groups', groups: repeatedCharacters('KLMNOPQR') },
      { id: 'letters-s-z', kind: 'groups', groups: repeatedCharacters('STUVWXYZ') },
      { id: 'figures', kind: 'groups', groups: repeatedCharacters('1234567890') },
    ],
  },
  {
    id: 'drill',
    title: 'Drill',
    guidance:
      'Work on smooth transitions through words, numbers, punctuation, and prosigns. After a mistake, repeat that group or word before moving on.',
    rows: [
      phrase('drill-phrase-first'),
      phrase('drill-phrase-second'),
      {
        id: 'bent-wire',
        kind: 'phrases',
        groups: Array.from({ length: 3 }, () => ({ text: 'BENS BEST BENT WIRE/5' })),
      },
      {
        id: 'punctuation-and-prosigns',
        kind: 'groups',
        groups: [
          repeatedSymbol('/', 'Slash · DN joined'),
          repeatedSymbol(',', 'Comma'),
          repeatedSymbol('.', 'Period'),
          repeatedSymbol('?', 'Question mark'),
          repeatedSymbol('<SK>', 'End of contact'),
          repeatedSymbol('<AR>', 'End of message'),
          repeatedSymbol('<BT>', 'Separator'),
        ],
      },
    ],
  },
];

/** Keep the source's reading order while showing only the assigned sections. */
export function sendingScalesForSections(
  sections?: readonly SendingSection[],
): readonly SendingScaleDefinition[] {
  return sections ? SENDING_SCALES.filter((scale) => sections.includes(scale.id)) : SENDING_SCALES;
}
