/** Explicit learner-selected measurements. Field keys never imply a source. */
export const REPORT_AUDIO_CATEGORIES = [
  'shortWords',
  'shortPhrases',
  'shortQso',
  'shortPota',
  'prefix',
  'suffix',
] as const;
export type ReportAudioCategory = (typeof REPORT_AUDIO_CATEGORIES)[number];
export const REPORT_LCWO_KINDS = [
  'letters',
  'figures',
  'custom',
  'words',
  'callsign',
  'koch',
] as const;
export type ReportLcwoKind = (typeof REPORT_LCWO_KINDS)[number];
export const REPORT_COPY_KINDS = [
  'letters',
  'figures',
  'custom',
  'words',
  'callsigns',
  'plaintext',
] as const;
export type ReportCopyKind = (typeof REPORT_COPY_KINDS)[number];
export const REPORT_RUNNER_METRICS = [
  'verifiedPoints',
  'score',
  'startingWpm',
  'usedWpms',
  'elapsedSeconds',
  'contacts',
] as const;
export const REPORT_LCWO_METRICS = [
  'speedWpm',
  'maximumWpm',
  'groupLength',
  'maximumLength',
  'errorCount',
  'errorPercent',
  'score',
] as const;
export const REPORT_COPY_METRICS = [
  'effectiveWpm',
  'characterWpm',
  'maximumWpm',
  'errorCount',
  'errorPercent',
  'accuracy',
  'points',
] as const;
export const REPORT_CWT_METRICS = [
  'heardCallsigns',
  'heardExchanges',
  'workedCallsigns',
  'workedNames',
  'comments',
  'qsoCount',
] as const;
export type EvidenceReportMapping =
  | `audio:${ReportAudioCategory}:${'files' | 'rating'}`
  | 'sending:scales:rating'
  | 'generated:configurations'
  | `runner:${(typeof REPORT_RUNNER_METRICS)[number]}`
  | `lcwo:${ReportLcwoKind}:${(typeof REPORT_LCWO_METRICS)[number]}`
  | `copy:${ReportCopyKind}:${(typeof REPORT_COPY_METRICS)[number]}`
  | `cwt:${(typeof REPORT_CWT_METRICS)[number]}`;
export interface ReportMapping {
  id: string;
  label: string;
  group: string;
  types: readonly ('text' | 'textarea' | 'number' | 'rating' | 'date')[];
}
const labels: Record<string, string> = {
  shortWords: 'Short words',
  shortPhrases: 'Short phrases',
  shortQso: 'Short QSO',
  shortPota: 'Short POTA',
  prefix: 'Prefixes',
  suffix: 'Suffixes',
  letters: 'Letter groups',
  figures: 'Figure groups',
  custom: 'Custom groups',
  words: 'Words',
  callsign: 'Callsigns',
  callsigns: 'Callsigns',
  koch: 'Koch lessons',
  plaintext: 'Plain text',
  verifiedPoints: 'Highest eligible single verified points',
  score: 'Score',
  startingWpm: 'Starting WPM (not constant speed)',
  usedWpms: 'Actual used WPM',
  elapsedSeconds: 'Actual run seconds',
  contacts: 'Simulated contacts',
  speedWpm: 'Actual trainer/effective WPM',
  maximumWpm: 'Maximum achieved WPM',
  groupLength: 'Recorded group length',
  maximumLength: 'Recorded maximum word length',
  errorCount: 'Number of errors',
  errorPercent: 'Errors (%)',
  effectiveWpm: 'Actual effective WPM',
  characterWpm: 'Actual character WPM',
  accuracy: 'Native accuracy (%)',
  points: 'Native points',
  heardCallsigns: 'Callsigns heard',
  heardExchanges: 'Names and exchanges heard',
  workedCallsigns: 'Callsigns worked',
  workedNames: 'First names worked',
  comments: 'Explicit CWT report comments',
  qsoCount: 'Explicit actual on-air QSO count',
};
export const EVIDENCE_REPORT_MAPPINGS: (ReportMapping & { id: EvidenceReportMapping })[] = [
  ...REPORT_AUDIO_CATEGORIES.flatMap((category) => [
    {
      id: `audio:${category}:files` as const,
      label: `${labels[category]} — actually played files / WPM`,
      group: 'Official recordings',
      types: ['text', 'textarea'] as const,
    },
    {
      id: `audio:${category}:rating` as const,
      label: `${labels[category]} — explicit performance rating`,
      group: 'Official recordings',
      types: ['rating'] as const,
    },
  ]),
  {
    id: 'sending:scales:rating',
    label: 'Sending scales — explicit performance rating',
    group: 'Sending',
    types: ['rating'],
  },
  {
    id: 'generated:configurations',
    label: 'Generated listening — actual played configurations',
    group: 'Generated listening',
    types: ['text', 'textarea'],
  },
  ...REPORT_RUNNER_METRICS.map((metric) => ({
    id: `runner:${metric}` as const,
    label: `Runner — ${labels[metric]}`,
    group: 'Runner',
    types: metric === 'usedWpms' ? (['text', 'textarea'] as const) : (['number'] as const),
  })),
  ...REPORT_LCWO_KINDS.flatMap((kind) =>
    REPORT_LCWO_METRICS.filter((metric) =>
      kind === 'koch'
        ? ['speedWpm', 'errorPercent'].includes(metric)
        : ['words', 'callsign'].includes(kind)
          ? [
              'speedWpm',
              'maximumWpm',
              'errorCount',
              'score',
              ...(kind === 'words' ? ['maximumLength'] : []),
            ].includes(metric)
          : ['speedWpm', 'groupLength', 'errorPercent'].includes(metric),
    ).map((metric) => ({
      id: `lcwo:${kind}:${metric}` as const,
      label: `LCWO ${labels[kind]} — ${labels[metric]}`,
      group: 'External LCWO (whole latest result)',
      types: ['number'] as const,
    })),
  ),
  ...REPORT_COPY_KINDS.flatMap((kind) =>
    REPORT_COPY_METRICS.filter((metric) =>
      ['words', 'callsigns'].includes(kind)
        ? ['maximumWpm', 'points', 'accuracy'].includes(metric)
        : ['effectiveWpm', 'characterWpm', 'errorCount', 'errorPercent', 'accuracy'].includes(
            metric,
          ),
    ).map((metric) => ({
      id: `copy:${kind}:${metric}` as const,
      label: `Native Copy ${labels[kind]} — ${labels[metric]}`,
      group: 'Native Copy (separate scoring)',
      types: ['number'] as const,
    })),
  ),
  ...REPORT_CWT_METRICS.map((metric) => ({
    id: `cwt:${metric}` as const,
    label: `CWT — ${labels[metric]}`,
    group: 'Explicit CWT observations',
    types: metric === 'qsoCount' ? (['number'] as const) : (['text', 'textarea'] as const),
  })),
];
