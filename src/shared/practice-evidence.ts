import { isRunnerSettings, isRunnerSummary, type RunnerRunState } from './runner.ts';
import { recordingSpeeds, recordingVariants } from './recordings.ts';
import {
  generatedListeningDetails,
  validateGeneratedListeningEvidence,
  type GeneratedListeningEvidence,
} from './generated-listening.ts';

/** Versioned client measurements, not independent proof of proficiency or on-air activity. */
export interface TimeCorrection {
  seconds?: number;
  recallSeconds?: number;
  reason: string;
}
export interface RecordingEvidence {
  url: string;
  speedWpm?: number;
  characterWpm?: number;
  effectiveWpm?: number;
  seconds: number;
}
export type PracticeEvidence =
  | {
      version: 1;
      type: 'timed';
      measurement: { seconds: number; recallSeconds?: number };
      recordings: RecordingEvidence[];
      generatedListening?: GeneratedListeningEvidence;
      correction?: TimeCorrection;
    }
  | {
      version: 1;
      type: 'runner';
      run: Omit<RunnerRunState, 'lastSequence'> & { revision: string };
    };

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}
function keys(row: Record<string, unknown>, allowed: string[], label: string) {
  if (Object.keys(row).some((key) => !allowed.includes(key)))
    throw new Error(`${label} contains an unsupported field.`);
}
function finite(value: unknown, label: string, max = 86400, min = 0, integer = false): number {
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
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error(`${label} must contain text of at most ${max} characters.`);
  return value;
}
function timestamp(value: unknown, label: string): string {
  const result = text(value, label, 40);
  if (
    !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result) ||
    !Number.isFinite(Date.parse(result)) ||
    new Date(`${result.slice(0, 10)}T12:00:00Z`).toISOString().slice(0, 10) !== result.slice(0, 10)
  )
    throw new Error(`${label} must be a valid timestamp with a timezone.`);
  return new Date(result).toISOString();
}

export function validateRecordingEvidence(value: unknown): RecordingEvidence {
  const row = object(value, 'Recording evidence');
  keys(row, ['url', 'speedWpm', 'characterWpm', 'effectiveWpm', 'seconds'], 'Recording evidence');
  const url = text(row.url, 'Recording URL', 2000);
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password)
      throw new Error();
  } catch {
    throw new Error('Recording URL must be an HTTP or HTTPS link without credentials.');
  }
  const native = recordingSpeeds(url);
  const variant = recordingVariants(url).find(
    (item) =>
      item.characterWpm === native?.characterWpm && item.effectiveWpm === native?.effectiveWpm,
  );
  for (const key of ['characterWpm', 'effectiveWpm'] as const) {
    if (row[key] !== undefined && finite(row[key], `Recording ${key}`, 200, 1) !== native?.[key])
      throw new Error(
        `Recording ${key} must match the exact catalog source; omit it for an unknown recording.`,
      );
  }
  if (native && row.speedWpm !== undefined && row.speedWpm !== variant?.speedWpm)
    throw new Error('Recording file WPM must match the exact catalog source.');
  return {
    url,
    seconds: finite(row.seconds, 'Recording listened seconds'),
    ...(row.speedWpm !== undefined
      ? { speedWpm: finite(row.speedWpm, 'Recording file WPM', 200, 1) }
      : {}),
    ...native,
  };
}

function runner(value: unknown): Extract<PracticeEvidence, { type: 'runner' }>['run'] {
  const row = object(value, 'Runner result');
  keys(
    row,
    [
      'runId',
      'settings',
      'status',
      'elapsedSeconds',
      'speedHistory',
      'speedChangeCount',
      'summary',
      'errorCode',
      'runStartedAt',
      'runEndedAt',
      'revision',
    ],
    'Runner result',
  );
  const runId = text(row.runId, 'Runner run ID', 100);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(runId)) throw new Error('Invalid Runner run ID.');
  if (!isRunnerSettings(row.settings)) throw new Error('Invalid Runner settings.');
  if (!['completed', 'stopped', 'error'].includes(String(row.status)))
    throw new Error('Finish or stop the Runner run before saving.');
  const elapsedSeconds = finite(
    row.elapsedSeconds,
    'Runner engine seconds',
    row.settings.durationSeconds,
  );
  if (row.status === 'completed' && elapsedSeconds !== row.settings.durationSeconds)
    throw new Error('A completed Runner run must reach its configured duration.');
  const result: Extract<PracticeEvidence, { type: 'runner' }>['run'] = {
    runId,
    settings: structuredClone(row.settings),
    status: row.status as 'completed' | 'stopped' | 'error',
    elapsedSeconds,
    revision: text(row.revision, 'Runner engine revision', 100),
  };
  if (!/^[a-f0-9]{40}$/.test(result.revision))
    throw new Error('Runner engine revision must be a commit SHA.');
  if (row.summary !== undefined) {
    if (!isRunnerSummary(row.summary))
      throw new Error('Invalid Runner points, contacts, score or errors.');
    const { verifiedPoints, score } = row.summary;
    // The bundled engine multiplies distinct confirmed calls by confirmed prefixes.
    // Check internal arithmetic; this still does not independently verify a run.
    if (
      (verifiedPoints === 0 && score !== 0) ||
      (verifiedPoints > 0 &&
        (score < verifiedPoints || score > verifiedPoints ** 2 || score % verifiedPoints !== 0))
    )
      throw new Error('Runner score is inconsistent with verified points.');
    result.summary = { ...row.summary };
  }
  if (row.errorCode !== undefined) {
    if (
      row.status !== 'error' ||
      !['configuration', 'audio', 'engine', 'interrupted'].includes(String(row.errorCode))
    )
      throw new Error('Invalid Runner error code.');
    result.errorCode = row.errorCode as RunnerRunState['errorCode'];
  }
  if (row.speedHistory !== undefined) {
    if (
      !Array.isArray(row.speedHistory) ||
      !row.speedHistory.length ||
      row.speedHistory.length > 256
    )
      throw new Error('Runner speed history must contain 1–256 measurements.');
    result.speedHistory = row.speedHistory.map((value) => {
      const item = object(value, 'Runner speed measurement');
      keys(item, ['elapsedSeconds', 'wpm'], 'Runner speed measurement');
      return {
        elapsedSeconds: finite(item.elapsedSeconds, 'Runner speed time', elapsedSeconds),
        wpm: finite(item.wpm, 'Runner speed', 60, 10, true),
      };
    });
    if (
      result.speedHistory[0].elapsedSeconds !== 0 ||
      result.speedHistory[0].wpm !== result.settings.wpm ||
      result.speedHistory.some(
        (item, index, all) => index > 0 && item.elapsedSeconds < all[index - 1].elapsedSeconds,
      )
    )
      throw new Error(
        'Runner speed history must start at the configured speed and stay in time order.',
      );
  }
  if (row.speedChangeCount !== undefined) {
    result.speedChangeCount = finite(
      row.speedChangeCount,
      'Runner speed change count',
      1_000_000,
      0,
      true,
    );
    if (result.speedChangeCount < (result.speedHistory?.length ?? 1) - 1)
      throw new Error('Runner speed change count cannot omit recorded changes.');
  }
  if (row.runStartedAt !== undefined)
    result.runStartedAt = timestamp(row.runStartedAt, 'Runner start');
  if (row.runEndedAt !== undefined) result.runEndedAt = timestamp(row.runEndedAt, 'Runner end');
  if (result.runEndedAt && !result.runStartedAt)
    throw new Error('Runner end requires a start timestamp.');
  if (
    result.runStartedAt &&
    result.runEndedAt &&
    (Date.parse(result.runEndedAt) < Date.parse(result.runStartedAt) ||
      Date.parse(result.runEndedAt) - Date.parse(result.runStartedAt) + 2000 <
        elapsedSeconds * 1000)
  )
    throw new Error('Runner ends before it starts or its engine time exceeds elapsed wall time.');
  return result;
}

export function evidenceTime(evidence: Extract<PracticeEvidence, { type: 'timed' }>) {
  return {
    seconds: evidence.correction?.seconds ?? evidence.measurement.seconds,
    recallSeconds: evidence.correction?.recallSeconds ?? evidence.measurement.recallSeconds ?? 0,
  };
}

export function validatePracticeEvidence(value: unknown): PracticeEvidence {
  const row = object(value, 'Practice evidence');
  if (row.version !== 1) throw new Error('Unsupported practice evidence version.');
  if (row.type === 'runner') {
    keys(row, ['version', 'type', 'run'], 'Runner evidence');
    return { version: 1, type: 'runner', run: runner(row.run) };
  }
  if (row.type !== 'timed') throw new Error('Unsupported practice evidence source.');
  keys(
    row,
    ['version', 'type', 'measurement', 'recordings', 'generatedListening', 'correction'],
    'Timed evidence',
  );
  const measurement = object(row.measurement, 'Time measurement');
  keys(measurement, ['seconds', 'recallSeconds'], 'Time measurement');
  const result: Extract<PracticeEvidence, { type: 'timed' }> = {
    version: 1,
    type: 'timed',
    measurement: {
      seconds: finite(measurement.seconds, 'Measured practice seconds'),
      ...(measurement.recallSeconds !== undefined
        ? { recallSeconds: finite(measurement.recallSeconds, 'Measured recall seconds') }
        : {}),
    },
    recordings: [],
  };
  if ((result.measurement.recallSeconds ?? 0) > result.measurement.seconds)
    throw new Error('Recall time cannot exceed total practice time.');
  if (!Array.isArray(row.recordings) || row.recordings.length > 100)
    throw new Error('Provide up to 100 recording measurements.');
  result.recordings = row.recordings.map(validateRecordingEvidence);
  if (row.generatedListening !== undefined)
    result.generatedListening = validateGeneratedListeningEvidence(row.generatedListening);
  if (new Set(result.recordings.map((item) => item.url)).size !== result.recordings.length)
    throw new Error('Recording measurements must have distinct URLs.');
  if (
    result.recordings.reduce((sum, item) => sum + item.seconds, 0) >
    result.measurement.seconds - (result.measurement.recallSeconds ?? 0) + 0.001
  )
    throw new Error('Recording and recall time cannot exceed measured practice time.');
  if (row.correction !== undefined) {
    const correction = object(row.correction, 'Time correction');
    keys(correction, ['seconds', 'recallSeconds', 'reason'], 'Time correction');
    if (correction.seconds === undefined && correction.recallSeconds === undefined)
      throw new Error('A time correction must declare corrected total or recall seconds.');
    result.correction = {
      reason: text(correction.reason, 'Correction reason', 1000).trim(),
      ...(correction.seconds !== undefined
        ? { seconds: finite(correction.seconds, 'Corrected practice seconds') }
        : {}),
      ...(correction.recallSeconds !== undefined
        ? { recallSeconds: finite(correction.recallSeconds, 'Corrected recall seconds') }
        : {}),
    };
    const corrected = evidenceTime(result);
    if (corrected.recallSeconds > corrected.seconds)
      throw new Error('Corrected recall time cannot exceed corrected total practice time.');
    if (
      corrected.seconds + 0.001 <
      result.recordings.reduce((sum, item) => sum + item.seconds, 0) + corrected.recallSeconds
    )
      throw new Error(
        'Corrected total must include the measured recording time and corrected recall.',
      );
  }
  return result;
}

/** Normalize the Companion's existing native metadata without upgrading imported archives to native facts. */
export function sessionEvidence(
  metadata: Record<string, unknown> | undefined,
): PracticeEvidence | undefined {
  if (!metadata) return undefined;
  if (
    metadata.copyAttempt !== undefined ||
    metadata.legacyAttempt !== undefined ||
    metadata.legacyLcwoRun !== undefined
  ) {
    if (metadata.evidence !== undefined || metadata.runner !== undefined)
      throw new Error(
        'A session cannot combine native evidence with a copy attempt or legacy archive.',
      );
    return undefined;
  }
  const evidence =
    metadata.evidence !== undefined
      ? validatePracticeEvidence(metadata.evidence)
      : metadata.runner !== undefined
        ? validatePracticeEvidence({ version: 1, type: 'runner', run: metadata.runner })
        : metadata.elapsedSeconds !== undefined
          ? validatePracticeEvidence({
              version: 1,
              type: 'timed',
              measurement: {
                seconds: metadata.elapsedSeconds,
                ...(metadata.recallSeconds !== undefined
                  ? { recallSeconds: metadata.recallSeconds }
                  : {}),
              },
              recordings: metadata.recordings ?? [],
            })
          : undefined;
  if (!evidence && (metadata.recallSeconds !== undefined || metadata.recordings !== undefined))
    throw new Error('Recording and recall measurements require measured total seconds.');
  if (evidence) {
    if (
      evidence.type === 'runner' &&
      (metadata.recallSeconds !== undefined || metadata.recordings !== undefined)
    )
      throw new Error('Runner engine time cannot include recording or recall measurements.');
    const rawSeconds =
      evidence.type === 'runner' ? evidence.run.elapsedSeconds : evidence.measurement.seconds;
    if (metadata.elapsedSeconds !== undefined && metadata.elapsedSeconds !== rawSeconds)
      throw new Error('Measured total seconds disagree with the source evidence.');
    if (
      evidence.type === 'runner' &&
      metadata.runner !== undefined &&
      JSON.stringify(runner(metadata.runner)) !== JSON.stringify(evidence.run)
    )
      throw new Error('Runner result disagrees with its source evidence.');
    if (evidence.type === 'timed') {
      if (
        metadata.recallSeconds !== undefined &&
        metadata.recallSeconds !== evidence.measurement.recallSeconds
      )
        throw new Error('Measured recall seconds disagree with the source evidence.');
      if (metadata.recordings !== undefined) {
        if (
          !Array.isArray(metadata.recordings) ||
          JSON.stringify(metadata.recordings.map(validateRecordingEvidence)) !==
            JSON.stringify(evidence.recordings)
        )
          throw new Error('Recording measurements disagree with the source evidence.');
      }
    }
  }
  return evidence;
}

/** Readable, shared provenance for history and reports. No fetch of restricted source audio. */
export function practiceEvidenceDetails(evidence: PracticeEvidence): string[] {
  if (evidence.type === 'runner') {
    const run = evidence.run;
    return [
      `Runner ${run.runId}: ${run.elapsedSeconds.toFixed(2)} engine seconds; ${run.settings.wpm} WPM starting speed; ${run.status}.`,
      ...(run.summary
        ? [
            `${run.summary.qsoCount} contacts; ${run.summary.verifiedPoints} verified points; score ${run.summary.score}. Client engine result.`,
          ]
        : ['Runner score unavailable.']),
      ...(run.speedHistory?.length
        ? [
            `Recorded speeds: ${run.speedHistory
              .slice(0, 12)
              .map((item) => `${item.wpm} WPM at ${item.elapsedSeconds.toFixed(2)}s`)
              .join(
                '; ',
              )}${run.speedHistory.length > 12 ? `; ${run.speedHistory.length - 12} more in the backup` : ''}.`,
          ]
        : []),
      ...(run.runStartedAt
        ? [`Run started ${run.runStartedAt}${run.runEndedAt ? `; ended ${run.runEndedAt}` : ''}.`]
        : []),
    ];
  }
  return [
    `Measured ${evidence.measurement.seconds.toFixed(2)} seconds${evidence.measurement.recallSeconds !== undefined ? `, including ${evidence.measurement.recallSeconds.toFixed(2)} recall seconds` : ''}.`,
    ...evidence.recordings.map(
      (item) =>
        `${item.seconds.toFixed(2)} seconds listened${item.speedWpm !== undefined ? ` at ${item.speedWpm} file WPM` : ''}: ${item.url}`,
    ),
    ...(evidence.generatedListening ? generatedListeningDetails(evidence.generatedListening) : []),
    ...(evidence.correction
      ? [
          `Learner correction: ${evidenceTime(evidence).seconds.toFixed(2)} total seconds, ${evidenceTime(evidence).recallSeconds.toFixed(2)} recall seconds. ${evidence.correction.reason}`,
        ]
      : []),
  ];
}

/** Historical accounting stays readable without becoming current measured evidence. */
export function practiceSessionEvidenceDetails(
  metadata: Record<string, unknown> | undefined,
  evidenceMode?: 'historical',
  savedMinutes?: number,
): string[] {
  const evidence = sessionEvidence(metadata);
  if (evidenceMode === 'historical')
    return [
      `Historical accounting: ${((savedMinutes ?? 0) * 60).toFixed(2)} saved seconds. Raw timed provenance is retained without promotion to current native evidence.`,
      ...(evidence
        ? practiceEvidenceDetails(evidence).map((detail) => `Historical raw source: ${detail}`)
        : []),
    ];
  if (evidence) return practiceEvidenceDetails(evidence);
  const historical = metadata?.historicalTiming;
  if (!historical || typeof historical !== 'object' || Array.isArray(historical)) return [];
  const row = historical as Record<string, unknown>;
  const timing = row.timing;
  if (
    typeof row.savedSeconds !== 'number' ||
    !Number.isFinite(row.savedSeconds) ||
    !timing ||
    typeof timing !== 'object' ||
    Array.isArray(timing)
  )
    return [];
  const raw = timing as Record<string, unknown>;
  return [
    `Historical accounting: ${row.savedSeconds.toFixed(2)} saved seconds. The earlier Companion stored a different total without a correction reason; these raw fields are not validated current native evidence.`,
    ...(typeof raw.elapsedSeconds === 'number'
      ? [
          `Original timer: ${raw.elapsedSeconds.toFixed(2)} seconds${typeof raw.recallSeconds === 'number' ? `, including ${raw.recallSeconds.toFixed(2)} recall seconds` : ''}.`,
        ]
      : []),
    ...(Array.isArray(raw.recordings)
      ? raw.recordings
          .filter(
            (item) =>
              item &&
              typeof item === 'object' &&
              typeof item.url === 'string' &&
              typeof item.seconds === 'number',
          )
          .map((item) => `Original recording: ${item.seconds.toFixed(2)} seconds: ${item.url}`)
      : []),
  ];
}
