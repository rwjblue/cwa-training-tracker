import {
  starterAdvisorReportDefinition,
  type AdvisorReportDefinition,
} from '../src/shared/report-definition';
import {
  DEFAULT_PROFILE,
  validatePracticeSession,
  type PracticeSession,
} from '../src/shared/training';
import { RUNNER_REVISION } from '../src/shared/runner';
import {
  createCopyAttempt,
  defaultCopyRecipe,
  submitCopyAnswer,
} from '../src/shared/copy-practice';
import { copyAttemptSessionFields } from '../src/shared/copy-report';
import type { LcwoBackup } from '../src/shared/lcwo';

export const evidenceDefinition: AdvisorReportDefinition = {
  ...starterAdvisorReportDefinition(),
  title: 'Synthetic source evidence',
  fields: [
    ...starterAdvisorReportDefinition().fields,
    ...(
      [
        ['points', 'Runner points', 'runner:verifiedPoints', 'number'],
        ['score', 'Runner score', 'runner:score', 'number'],
        ['wpm', 'Runner starting WPM', 'runner:startingWpm', 'number'],
        ['files', 'Played short words', 'audio:shortWords:files', 'text'],
        ['groupError', 'Letters error percent', 'lcwo:letters:errorPercent', 'number'],
        ['groupLength', 'Letters group length', 'lcwo:letters:groupLength', 'number'],
        ['copyError', 'Native Copy errors', 'copy:letters:errorPercent', 'number'],
      ] as const
    ).map(([key, label, source, type]) => ({
      key,
      label,
      source,
      type,
      section: 'Practice',
      required: false,
    })),
  ],
};
export const evidenceProfile = {
  ...DEFAULT_PROFILE,
  timezone: 'UTC',
  reportDefinition: evidenceDefinition,
};
export function evidenceRunner(id = 'runner-evidence', points = 6, seconds = 300): PracticeSession {
  return validatePracticeSession({
    id: `runner:${id}`,
    date: '2026-10-02',
    kind: 'simulator',
    minutes: seconds / 60,
    notes: 'Private synthetic notes must not become report evidence',
    createdAt: new Date(Date.parse('2026-10-02T12:00:00Z') + seconds * 1000).toISOString(),
    metadata: {
      evidence: {
        version: 1,
        type: 'runner',
        run: {
          runId: id,
          revision: RUNNER_REVISION,
          status: 'stopped',
          elapsedSeconds: seconds,
          runStartedAt: '2026-10-02T12:00:00.000Z',
          runEndedAt: new Date(Date.parse('2026-10-02T12:00:00Z') + seconds * 1000).toISOString(),
          attribution: { version: 1, timezone: 'UTC' },
          settings: {
            mode: 'SingleCall',
            wpm: 20,
            durationSeconds: 900,
            activity: 1,
            conditions: { qrm: false, qrn: true, qsb: false, flutter: false, lids: false },
          },
          speedHistory: [
            { elapsedSeconds: 0, wpm: 20 },
            { elapsedSeconds: 10, wpm: 25 },
          ],
          speedChangeCount: 1,
          summary: {
            verifiedPoints: points,
            score: points * 2,
            qsoCount: points + 1,
            nrErrors: 1,
            nilErrors: 0,
          },
        },
      },
    },
  });
}
export function evidenceSessions(): PracticeSession[] {
  const base: PracticeSession = {
    id: 'audio-evidence',
    date: '2026-10-02',
    kind: 'listening',
    minutes: 1,
    createdAt: '2026-10-02T13:00:00.000Z',
    notes: 'Private synthetic audio notes',
    metadata: {
      practicePurpose: 'review',
      evidence: {
        version: 1,
        type: 'timed',
        measurement: { seconds: 60 },
        recordings: [
          {
            url: 'https://cwa.cwops.org/wp-content/uploads/WD201_10.mp3',
            speedWpm: 10,
            seconds: 30,
          },
          {
            url: 'https://cwa.cwops.org/wp-content/uploads/WD201_15.mp3',
            speedWpm: 15,
            seconds: 30,
          },
        ],
      },
      selectedRecording: 'https://cwa.cwops.org/wp-content/uploads/WD201_25.mp3',
    },
  };
  const initial = createCopyAttempt(
    { ...defaultCopyRecipe(), lengthMode: 'count', groupCount: 2 },
    { id: 'copy-evidence', seed: 'synthetic-report', now: '2026-10-02T14:00:00.000Z' },
  );
  const copy = submitCopyAnswer(initial, initial.targets[0], { now: '2026-10-02T14:01:00.000Z' });
  return [
    evidenceRunner(),
    validatePracticeSession(base),
    validatePracticeSession({
      ...base,
      ...copyAttemptSessionFields(copy),
      metadata: { copyAttempt: copy },
    }),
    validatePracticeSession({
      ...base,
      id: 'class-evidence',
      context: 'class',
      metadata: undefined,
    }),
    validatePracticeSession({
      ...base,
      id: 'outside-evidence',
      date: '2026-09-20',
      metadata: undefined,
    }),
  ];
}
export const evidenceLcwo: LcwoBackup = {
  version: 1,
  connected: false,
  identity: { username: 'Student7', sourceUserId: '7' },
  estimateSeconds: 60,
  runs: [1, 2, 3].map((id) => ({
    version: 1,
    source: 'lcwo-export',
    id: `groups:7:${id}`,
    kind: 'letters',
    sourceType: 'groups',
    sourceUserId: '7',
    sourceResultId: String(id),
    recordedAt: `2026-10-02T15:0${id}:00.000Z`,
    sourceTime: `2026-10-02 15:0${id}:00`,
    characterWpm: id === 2 ? 30 : 25,
    effectiveWpm: 15,
    accuracyPercent: id === 1 ? 100 : id === 2 ? 0 : 80,
  })),
};
