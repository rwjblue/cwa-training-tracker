import { PRACTICE_STORIES, practiceStory, type StoryId } from './listening-stories.ts';

/** Descriptive configurations actually played; never private text, scripts or per-source time. */
interface GeneratedListeningSpeeds {
  readonly characterWpm: number;
  readonly effectiveWpm: number;
}

export type GeneratedListeningSummary = GeneratedListeningSpeeds &
  (
    | {
        readonly mode: 'words';
        readonly listId: 'common-qso' | 'common-30' | 'custom';
        readonly customLabel?: string;
        readonly entryCount: number;
        readonly toneHz: number;
        readonly wordGapSeconds: number;
        readonly shuffle: boolean;
        readonly repeat: boolean;
        readonly spokenAnswers: boolean;
      }
    | {
        readonly mode: 'qso';
        readonly scenarioId: 'short-contact' | 'ragchew' | 'pota' | 'repeat';
        readonly stations: readonly [string, string];
        readonly tonesHz: readonly [number, number];
        readonly transmissionGapSeconds: number;
      }
    | {
        readonly mode: 'story';
        readonly storyId: StoryId;
        readonly toneHz: number;
        readonly sentenceGapSeconds: number;
      }
    | {
        readonly mode: 'free';
        readonly contentMode: 'words' | 'groups' | 'numbers' | 'callsigns' | 'custom';
        readonly entryCount: number;
        readonly toneHz: number;
        readonly wordLength?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 'mixed';
        readonly groupLength?: number;
        readonly customLabel?: string;
      }
  );

export interface GeneratedListeningEvidence {
  readonly version: 1;
  readonly summaries: readonly GeneratedListeningSummary[];
  readonly overflow: boolean;
}

export const MAX_GENERATED_LISTENING_SUMMARIES = 15;

const WORD_TITLES = {
  'common-qso': 'Common QSO words',
  'common-30': '30 common English words',
} as const;
const QSO_TITLES = {
  'short-contact': 'A first contact',
  ragchew: 'Rigs, antennas, and weather',
  pota: 'A POTA contact',
  repeat: 'Asking for a repeat',
} as const;
const FREE_TITLES = {
  words: 'Free word listening',
  groups: 'Free letter-group listening',
  numbers: 'Free number listening',
  callsigns: 'Free callsign listening',
} as const;

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function keys(row: Record<string, unknown>, allowed: string[], label: string) {
  if (Object.keys(row).some((key) => !allowed.includes(key)))
    throw new Error(`${label} contains an unsupported field.`);
}
function finite(value: unknown, label: string, min: number, max: number, integer = false) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    throw new Error(
      `${label} must be ${integer ? 'a whole number' : 'a finite number'} between ${min} and ${max}.`,
    );
  return value;
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be true or false.`);
  return value;
}
function choice<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T))
    throw new Error(`${label} is not a supported selection.`);
  return value as T;
}
function customLabel(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 80 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error('Custom listening label must contain a single line of at most 80 characters.');
  return value.trim();
}
function pair<T>(value: unknown, label: string, validate: (item: unknown) => T): [T, T] {
  if (!Array.isArray(value) || value.length !== 2)
    throw new Error(`${label} must contain exactly two values.`);
  return [validate(value[0]), validate(value[1])];
}
function callsign(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^(?=.{3,20}$)(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]+(?:\/[A-Z0-9]+)*$/.test(value)
  )
    throw new Error('Generated QSO station must be an uppercase callsign of 3–20 characters.');
  return value;
}

/** Strict allowlist for portable source facts; no preference-style coercion or clamping. */
export function validateGeneratedListeningSummary(value: unknown): GeneratedListeningSummary {
  const row = object(value, 'Generated listening summary');
  const speeds = {
    characterWpm: finite(row.characterWpm, 'Generated character speed', 5, 60),
    effectiveWpm: finite(row.effectiveWpm, 'Generated effective speed', 3, 60),
  };
  if (speeds.effectiveWpm > speeds.characterWpm)
    throw new Error('Generated effective speed cannot exceed character speed.');
  const common = ['mode', 'characterWpm', 'effectiveWpm'];
  if (row.mode === 'words') {
    const listId = choice(row.listId, ['common-qso', 'common-30', 'custom'], 'Generated word list');
    keys(
      row,
      [
        ...common,
        'listId',
        'entryCount',
        'toneHz',
        'wordGapSeconds',
        'shuffle',
        'repeat',
        'spokenAnswers',
        ...(listId === 'custom' ? ['customLabel'] : []),
      ],
      'Generated word summary',
    );
    const entryCount = finite(row.entryCount, 'Generated word count', 1, 200, true);
    if (listId !== 'custom' && entryCount !== (listId === 'common-qso' ? 70 : 30))
      throw new Error('Generated word count must match the published listening list.');
    return {
      mode: 'words',
      listId,
      ...(listId === 'custom' ? { customLabel: customLabel(row.customLabel) } : {}),
      entryCount,
      ...speeds,
      toneHz: finite(row.toneHz, 'Generated tone', 300, 1000),
      wordGapSeconds: finite(row.wordGapSeconds, 'Extra word pause', 0, 5),
      shuffle: boolean(row.shuffle, 'Word shuffle'),
      repeat: boolean(row.repeat, 'Word repeat'),
      spokenAnswers: boolean(row.spokenAnswers, 'Spoken answers'),
    };
  }
  if (row.mode === 'qso') {
    keys(
      row,
      [...common, 'scenarioId', 'stations', 'tonesHz', 'transmissionGapSeconds'],
      'Generated QSO summary',
    );
    const stations = pair(row.stations, 'Generated QSO stations', callsign);
    if (stations[0] === stations[1]) throw new Error('Generated QSO stations must be distinct.');
    return {
      mode: 'qso',
      scenarioId: choice(
        row.scenarioId,
        ['short-contact', 'ragchew', 'pota', 'repeat'],
        'Generated QSO scenario',
      ),
      stations,
      tonesHz: pair(row.tonesHz, 'Generated QSO tones', (item) =>
        finite(item, 'Generated QSO tone', 300, 1000),
      ),
      ...speeds,
      transmissionGapSeconds: finite(row.transmissionGapSeconds, 'QSO transmission pause', 0, 5),
    };
  }
  if (row.mode === 'story') {
    keys(row, [...common, 'storyId', 'toneHz', 'sentenceGapSeconds'], 'Generated story summary');
    return {
      mode: 'story',
      storyId: choice(
        row.storyId,
        PRACTICE_STORIES.map((story) => story.id),
        'Generated story',
      ),
      ...speeds,
      toneHz: finite(row.toneHz, 'Narrator tone', 300, 1000),
      sentenceGapSeconds: finite(row.sentenceGapSeconds, 'Sentence pause', 0, 5),
    };
  }
  if (row.mode === 'free') {
    const contentMode = choice(
      row.contentMode,
      ['words', 'groups', 'numbers', 'callsigns', 'custom'],
      'Free listening mode',
    );
    keys(
      row,
      [
        ...common,
        'contentMode',
        'entryCount',
        'toneHz',
        ...(contentMode === 'words' ? ['wordLength'] : []),
        ...(contentMode === 'groups' || contentMode === 'numbers' ? ['groupLength'] : []),
        ...(contentMode === 'custom' ? ['customLabel'] : []),
      ],
      'Free listening summary',
    );
    const wordLength =
      contentMode === 'words'
        ? row.wordLength === 'mixed'
          ? 'mixed'
          : (finite(row.wordLength, 'Free word length', 2, 8, true) as 2 | 3 | 4 | 5 | 6 | 7 | 8)
        : undefined;
    return {
      mode: 'free',
      contentMode,
      entryCount: finite(
        row.entryCount,
        'Free listening item count',
        1,
        contentMode === 'custom' ? 1200 : 50,
        true,
      ),
      ...speeds,
      toneHz: finite(row.toneHz, 'Generated tone', 300, 1000),
      ...(wordLength !== undefined ? { wordLength } : {}),
      ...(contentMode === 'groups' || contentMode === 'numbers'
        ? { groupLength: finite(row.groupLength, 'Free group length', 1, 10, true) }
        : {}),
      ...(contentMode === 'custom' ? { customLabel: customLabel(row.customLabel) } : {}),
    };
  }
  throw new Error('Unsupported generated listening mode.');
}

export function validateGeneratedListeningEvidence(value: unknown): GeneratedListeningEvidence {
  const row = object(value, 'Generated listening evidence');
  keys(row, ['version', 'summaries', 'overflow'], 'Generated listening evidence');
  if (row.version !== 1) throw new Error('Unsupported generated listening evidence version.');
  if (
    !Array.isArray(row.summaries) ||
    !row.summaries.length ||
    row.summaries.length > MAX_GENERATED_LISTENING_SUMMARIES
  )
    throw new Error(
      `Provide 1–${MAX_GENERATED_LISTENING_SUMMARIES} played generated configurations; omit empty evidence.`,
    );
  const summaries = row.summaries.map(validateGeneratedListeningSummary);
  if (new Set(summaries.map((summary) => JSON.stringify(summary))).size !== summaries.length)
    throw new Error('Played generated configurations must be distinct.');
  const overflow = boolean(row.overflow, 'Generated listening overflow');
  if (overflow && summaries.length !== MAX_GENERATED_LISTENING_SUMMARIES)
    throw new Error('Generated listening overflow requires the full retained configuration limit.');
  return { version: 1, summaries, overflow };
}

function freezeSummary(summary: GeneratedListeningSummary): GeneratedListeningSummary {
  if (summary.mode === 'qso') {
    Object.freeze(summary.stations);
    Object.freeze(summary.tonesHz);
  }
  return Object.freeze(summary);
}

/** The owner calls record only after accepted playback applies the captured track configuration. */
export class GeneratedListeningCollector {
  private summaries: GeneratedListeningSummary[] = [];
  private overflow = false;

  record(value: GeneratedListeningSummary): void {
    const summary = validateGeneratedListeningSummary(value);
    const key = JSON.stringify(summary);
    if (this.summaries.some((item) => JSON.stringify(item) === key)) return;
    if (this.summaries.length < MAX_GENERATED_LISTENING_SUMMARIES)
      this.summaries.push(freezeSummary(summary));
    else this.overflow = true;
  }

  snapshot(): GeneratedListeningEvidence | undefined {
    if (!this.summaries.length) return undefined;
    return Object.freeze({
      version: 1,
      summaries: Object.freeze(
        this.summaries.map((summary) => freezeSummary(structuredClone(summary))),
      ),
      overflow: this.overflow,
    });
  }

  reset(): void {
    this.summaries = [];
    this.overflow = false;
  }
}

/** Only a complete set with one actual speed pair can supply single session speeds. */
export function generatedListeningSpeeds(
  evidence: GeneratedListeningEvidence,
): Partial<GeneratedListeningSpeeds> {
  const first = evidence.summaries[0];
  if (
    !first ||
    evidence.overflow ||
    !evidence.summaries.every(
      (summary) =>
        summary.characterWpm === first.characterWpm && summary.effectiveWpm === first.effectiveWpm,
    )
  )
    return {};
  return { characterWpm: first.characterWpm, effectiveWpm: first.effectiveWpm };
}

/** Custom lists with the same label/count/settings intentionally share a descriptive identity. */
export function generatedListeningDetails(evidence: GeneratedListeningEvidence): string[] {
  return [
    ...evidence.summaries.map((summary) => {
      const speed = `${summary.characterWpm} character / ${summary.effectiveWpm} effective WPM`;
      if (summary.mode === 'words')
        return `Played ${summary.listId === 'custom' ? summary.customLabel : WORD_TITLES[summary.listId]}: ${summary.entryCount} entries; ${speed}; ${summary.toneHz} Hz; ${summary.wordGapSeconds}s extra word pause; ${summary.shuffle ? 'shuffled' : 'list order'}; ${summary.spokenAnswers ? 'three repeats + spoken answer' : 'Morse only'}; repeat ${summary.repeat ? 'on' : 'off'}.`;
      if (summary.mode === 'qso')
        return `Played ${QSO_TITLES[summary.scenarioId]}: ${summary.stations.join(' / ')}; ${speed}; station tones ${summary.tonesHz.join(' / ')} Hz; ${summary.transmissionGapSeconds}s transmission pause.`;
      if (summary.mode === 'story')
        return `Played ${practiceStory(summary.storyId).title}: supplemental public story; ${speed}; narrator ${summary.toneHz} Hz; ${summary.sentenceGapSeconds}s sentence pause.`;
      const length =
        summary.contentMode === 'words'
          ? `; ${summary.wordLength === 'mixed' ? 'mixed 2–8-letter words' : `${summary.wordLength}-letter words`}`
          : summary.groupLength !== undefined
            ? `; ${summary.groupLength} ${summary.contentMode === 'numbers' ? 'digits' : 'letters'} per group`
            : '';
      return `Played ${summary.contentMode === 'custom' ? summary.customLabel : FREE_TITLES[summary.contentMode]}: ${summary.entryCount} items${length}; ${speed}; ${summary.toneHz} Hz.`;
    }),
    ...(evidence.overflow
      ? [
          `Additional generated configurations were played; only the first ${MAX_GENERATED_LISTENING_SUMMARIES} distinct configurations are retained.`,
        ]
      : []),
  ];
}
