import { dateInTimezone, getPracticePurpose, type PracticeSession } from './training.ts';
import { sessionEvidence, recordingCompletedPasses } from './practice-evidence.ts';
import { generatedListeningDetails } from './generated-listening.ts';
import { officialRecordingCode, officialRecordingIdentity } from './recordings.ts';
import { savedCopyAttempt } from './copy-report.ts';
import { summarizeCopyAttempt } from './copy-practice.ts';
import { validateExternalPractice } from './external-practice.ts';
import {
  PERFORMANCE_RATINGS,
  supportsOnAirObservations,
  validatePracticeAssessment,
} from './practice-assessment.ts';
import { lcwoRunDetails, type LcwoBackup, type LcwoRun } from './lcwo.ts';
import { lcwoContributions, lcwoContributionDetails, isLcwoEstimate } from './lcwo-practice.ts';
import {
  EVIDENCE_REPORT_MAPPINGS,
  type EvidenceReportMapping,
  type ReportAudioCategory,
} from './report-mappings.ts';
import { validateAdvisorReportAnswers } from './report-definition.ts';
import type { ReportDocument, ReportReference } from './report-document.ts';
import type { ReportProvenance, ReportSourceSnapshot } from './report-provenance.ts';
import type { PlannedTask } from './plan.ts';
import {
  learnedWordCandidates,
  learnedWordAnswer,
  learnedWordsFromScratchpad,
  reportWordValues,
} from './report-learned-words.ts';

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const stamp = (value: unknown): string | undefined =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T/.test(value) &&
  Number.isFinite(Date.parse(value))
    ? value
    : undefined;
const display = (value: number) => String(value);
const referenceKey = (ref: ReportReference) => `${ref.kind}:${ref.id}`;
const sourceFact = (value: string) => {
  const visible = value.replace(
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
    (character) => `⟨U+${character.charCodeAt(0).toString(16).padStart(4, '0')}⟩`,
  );
  return visible.length <= 4000
    ? visible
    : `${visible.slice(0, 3900)}… [excerpt; inspect the saved result/private backup for complete text]`;
};

/** Never derive an occurrence from upload time or from arbitrary notes. */
export function reportPracticeOccurrence(entry: PracticeSession): string | undefined {
  const evidence = sessionEvidence(entry.metadata);
  if (evidence?.type === 'runner') return evidence.run.runStartedAt;
  if (entry.metadata?.manualTiming) return entry.metadata.manualTiming.startedAt;
  const copy = savedCopyAttempt(entry);
  if (copy) return copy.createdAt;
  const legacy = record(entry.metadata?.legacyAttempt);
  return stamp(record(legacy.runnerResult).runStartedAt) ?? stamp(legacy.startedAt);
}
export function reportPracticeDate(entry: PracticeSession, timezone: string): string {
  const actual = reportPracticeOccurrence(entry);
  return actual ? dateInTimezone(actual, timezone) : entry.date;
}
function reportPracticeCompletion(entry: PracticeSession): string | undefined {
  const evidence = sessionEvidence(entry.metadata);
  if (evidence?.type === 'runner') return evidence.run.runEndedAt;
  return (
    entry.metadata?.manualTiming?.completedAt ??
    savedCopyAttempt(entry)?.updatedAt ??
    stamp(record(entry.metadata?.legacyAttempt).endedAt)
  );
}
export function reportablePractice(
  document: Pick<ReportDocument, 'window'>,
  entries: readonly PracticeSession[],
  now = Date.now(),
): PracticeSession[] {
  const window = document.window;
  if (window.empty) return [];
  return [...new Map(entries.map((entry) => [entry.id, entry])).values()]
    .filter((entry) => {
      const date = reportPracticeDate(entry, window.timezone);
      const actual = reportPracticeOccurrence(entry);
      const completed = reportPracticeCompletion(entry);
      return (
        entry.context !== 'class' &&
        !isLcwoEstimate(entry) &&
        date >= window.fromDate &&
        date <= window.toDate &&
        date <= dateInTimezone(new Date(now), window.timezone) &&
        (!actual || Date.parse(actual) <= now) &&
        (!completed || Date.parse(completed) <= now)
      );
    })
    .sort(
      (a, b) =>
        reportPracticeDate(a, window.timezone).localeCompare(
          reportPracticeDate(b, window.timezone),
        ) ||
        Date.parse(reportPracticeOccurrence(a) ?? a.createdAt) -
          Date.parse(reportPracticeOccurrence(b) ?? b.createdAt) ||
        a.id.localeCompare(b.id),
    );
}

interface RunnerCandidate {
  entry: PracticeSession;
  source: 'native-runner' | 'external-runner' | 'historical';
  actualStart?: string;
  elapsedSeconds: number;
  startingWpm?: number;
  usedWpms?: number[];
  verifiedPoints?: number;
  score?: number;
  contacts?: number;
  mode: string;
  mixed: boolean;
}
function runnerCandidate(entry: PracticeSession): RunnerCandidate | undefined {
  const evidence = sessionEvidence(entry.metadata);
  if (evidence?.type === 'runner') {
    const run = evidence.run;
    if (!['completed', 'stopped'].includes(run.status) || !run.summary) return;
    const usedWpms = run.speedHistory
      ? [...new Set(run.speedHistory.map((item) => item.wpm))]
      : undefined;
    return {
      entry,
      source: 'native-runner',
      actualStart: run.runStartedAt,
      elapsedSeconds: run.elapsedSeconds,
      startingWpm: run.settings.wpm,
      usedWpms,
      verifiedPoints: run.summary.verifiedPoints,
      score: run.summary.score,
      contacts: run.summary.qsoCount,
      mode: run.settings.mode,
      mixed: Boolean(run.speedChangeCount) || Boolean(usedWpms && usedWpms.length > 1),
    };
  }
  let result = entry.metadata?.externalResult;
  let source: RunnerCandidate['source'] = 'external-runner';
  if (!result) {
    const original = record(record(entry.metadata?.legacyAttempt).runnerResult);
    if (!['completed', 'stopped'].includes(String(original.status))) return;
    try {
      result = validateExternalPractice({
        version: 1,
        source: 'user-entered',
        trainer: 'morse-runner',
        mode: original.mode,
        elapsedSeconds: original.elapsedSeconds,
        ...(original.wpm === undefined ? {} : { startingWpm: original.wpm }),
        ...(original.speeds === undefined ? {} : { usedWpms: original.speeds }),
        ...(original.verifiedPoints === undefined
          ? {}
          : { verifiedPoints: original.verifiedPoints }),
        ...(original.score === undefined ? {} : { score: original.score }),
        ...(original.qsoCount === undefined ? {} : { contacts: original.qsoCount }),
      });
      source = 'historical';
    } catch {
      return;
    }
  }
  if (result.trainer !== 'morse-runner') return;
  return {
    entry,
    source,
    actualStart: reportPracticeOccurrence(entry),
    elapsedSeconds: result.elapsedSeconds,
    startingWpm: result.startingWpm,
    usedWpms: result.usedWpms,
    verifiedPoints: result.verifiedPoints,
    score: result.score,
    contacts: result.contacts,
    mode: result.mode,
    mixed: (result.usedWpms?.length ?? 0) > 1,
  };
}
/** Highest single points; longer actual run, then newer actual start, then stable ID break ties. */
export function selectReportRunner(
  entries: readonly PracticeSession[],
): RunnerCandidate | undefined {
  return entries
    .flatMap((entry) => {
      const result = runnerCandidate(entry);
      return result &&
        result.elapsedSeconds > 0 &&
        result.elapsedSeconds <= 900 &&
        finite(result.startingWpm) &&
        result.startingWpm > 0 &&
        Number.isSafeInteger(result.verifiedPoints) &&
        result.verifiedPoints! >= 0
        ? [result]
        : [];
    })
    .sort(
      (a, b) =>
        b.verifiedPoints! - a.verifiedPoints! ||
        b.elapsedSeconds - a.elapsedSeconds ||
        (b.actualStart ? Date.parse(b.actualStart) : 0) -
          (a.actualStart ? Date.parse(a.actualStart) : 0) ||
        a.entry.id.localeCompare(b.entry.id),
    )[0];
}
const families: Record<string, ReportAudioCategory> = {
  WD: 'shortWords',
  PR: 'shortPhrases',
  QSO: 'shortQso',
  POTA: 'shortPota',
  DIS: 'prefix',
  IM: 'prefix',
  IN: 'prefix',
  IR: 'prefix',
  RE: 'prefix',
  UN: 'prefix',
  ED: 'suffix',
  ES: 'suffix',
  ING: 'suffix',
  LY: 'suffix',
};
function playedFiles(entry: PracticeSession) {
  const evidence = sessionEvidence(entry.metadata);
  const legacy = record(entry.metadata?.legacyAttempt);
  const native = evidence?.type === 'timed' ? evidence.recordings : [];
  // Structured archived results are evidence; arbitrary old audio note prose is not.
  const historical =
    !evidence && Array.isArray(legacy.audioResults)
      ? legacy.audioResults.flatMap((value) => {
          const item = record(value);
          const identity =
            typeof item.url === 'string' ? officialRecordingIdentity(item.url) : undefined;
          if (
            !identity ||
            !finite(item.activeSeconds) ||
            item.activeSeconds <= 0 ||
            !Number.isSafeInteger(item.completedPasses) ||
            Number(item.completedPasses) < 0 ||
            (item.speedWpm !== undefined && item.speedWpm !== identity.speedWpm)
          )
            return [];
          return [
            {
              url: item.url as string,
              seconds: item.activeSeconds,
              speedWpm: identity.speedWpm,
              completedPasses: Number(item.completedPasses),
            },
          ];
        })
      : [];
  return [...native, ...historical]
    .filter((item) => item.seconds > 0)
    .map((item) => {
      const code = officialRecordingCode(item.url);
      const match =
        code && /\b(WD|PR|QSO|POTA|DIS|IM|IN|IR|RE|UN|ED|ES|ING|LY)\s*(\d+)/i.exec(code);
      const category = match && families[match[1].toUpperCase()];
      return {
        ...item,
        historical: Boolean(historical.length),
        category: category || undefined,
        file: match ? `${match[1].toUpperCase()}${match[2]}` : code,
        speedWpm: item.speedWpm ?? officialRecordingIdentity(item.url)?.speedWpm,
      };
    });
}
function explicitRating(entry: PracticeSession) {
  const rating =
    entry.metadata?.assessment?.performanceRating ??
    record(entry.metadata?.legacyAttempt).performanceRating;
  return typeof rating === 'string' && Object.hasOwn(PERFORMANCE_RATINGS, rating)
    ? (rating as keyof typeof PERFORMANCE_RATINGS)
    : undefined;
}

function cwtObservations(entry: PracticeSession) {
  if (!supportsOnAirObservations(entry)) return undefined;
  if (entry.metadata?.assessment?.cwt) return entry.metadata.assessment.cwt;
  const original = record(record(entry.metadata?.legacyAttempt).cwtResult);
  const { qsoCount: _count, ...observations } = original;
  if (!Object.keys(observations).length) return undefined;
  try {
    return validatePracticeAssessment({ version: 1, source: 'self-reported', cwt: observations })
      .cwt;
  } catch {
    return undefined;
  }
}

type LcwoCandidate = {
  ref: ReportReference;
  kind: LcwoRun['kind'];
  completedAt: string;
  values: Partial<
    Record<
      | 'speedWpm'
      | 'maximumWpm'
      | 'groupLength'
      | 'maximumLength'
      | 'errorCount'
      | 'errorPercent'
      | 'score',
      number
    >
  >;
  run?: LcwoRun;
  entry?: PracticeSession;
};
function manualLcwo(entry: PracticeSession): LcwoCandidate | undefined {
  let result = entry.metadata?.externalResult;
  if (!result) {
    const old = record(record(entry.metadata?.legacyAttempt).lcwoResult);
    if (!Object.keys(old).length) return;
    try {
      result = validateExternalPractice({
        version: 1,
        source: 'user-entered',
        trainer: 'lcwo',
        kind: old.kind,
        ...Object.fromEntries(
          ['speedWpm', 'groupLength', 'maximumLength', 'errorCount', 'errorPercent', 'score']
            .filter((key) => old[key] !== undefined)
            .map((key) => [key, old[key]]),
        ),
      });
    } catch {
      return;
    }
  }
  if (result.trainer !== 'lcwo') return;
  const { version: _version, source: _source, trainer: _trainer, kind, ...values } = result;
  return {
    ref: { kind: 'practice', id: entry.id },
    entry,
    kind,
    values,
    completedAt:
      entry.metadata?.manualTiming?.completedAt ??
      stamp(record(entry.metadata?.legacyAttempt).endedAt) ??
      entry.createdAt,
  };
}
function importedLcwo(run: LcwoRun): LcwoCandidate {
  const adaptive = run.sourceType === 'words' || run.sourceType === 'callsigns';
  return {
    ref: { kind: 'lcwo', id: run.id },
    kind: run.kind,
    completedAt: run.recordedAt,
    run,
    values: adaptive
      ? {
          ...(run.maximumWpm === undefined ? {} : { maximumWpm: run.maximumWpm }),
          ...(run.score === undefined ? {} : { score: run.score }),
        }
      : {
          ...(run.effectiveWpm && run.effectiveWpm > 0 ? { speedWpm: run.effectiveWpm } : {}),
          ...(run.accuracyPercent === undefined ? {} : { errorPercent: 100 - run.accuracyPercent }),
        },
  };
}

/** Curated facts only; explicit Learned: declarations are opt-in, other scratchpad prose stays private. */
export function reportPracticeSnapshot(
  entry: PracticeSession,
  timezone: string,
  includeLearnedWords = false,
): Omit<ReportSourceSnapshot, 'reference'> {
  const actual = reportPracticeOccurrence(entry);
  const date = reportPracticeDate(entry, timezone);
  const facts = [
    actual
      ? `Actual start: ${actual}; report day ${date} in ${timezone}.`
      : `Declared practice day: ${date}; actual start not recorded. Upload time is not a practice timestamp.`,
    `Saved ${display(entry.minutes)} minutes; ${getPracticePurpose(entry) === 'review' ? 'extra review (reportable, no required-task credit)' : 'ordinary practice'}.`,
  ];
  const material = entry.metadata?.instructorMaterial;
  if (material) facts.push(`Instructor material: ${material.title}; exact version ${material.id}; session ${material.session}; ${material.course.level} course starts ${material.course.firstClassDate}; created ${material.createdAt}${material.supersedesId ? `; revises ${material.supersedesId}` : ''}${material.origin ? `; original ID ${material.origin.id}; archive ${material.origin.archiveId}` : ''}.`);
  if (includeLearnedWords) {
    const words = learnedWordsFromScratchpad(entry.metadata?.scratchpad);
    if (words.length)
      facts.push(
        `Explicit Learned: ${words.join(', ')} (learner declaration, not inferred from hearing).`,
      );
  }
  let source: ReportSourceSnapshot['source'] =
    entry.source === 'legacy' ? 'historical' : 'saved-practice';
  const runner = runnerCandidate(entry);
  if (runner) {
    source = runner.source;
    facts.push(
      `${runner.mode}; actual run ${display(runner.elapsedSeconds)} seconds; ${runner.source === 'native-runner' ? 'acknowledged native engine result' : runner.source === 'historical' ? 'retained structured original result' : 'user-entered external result'}.`,
      `Verified points ${runner.verifiedPoints ?? 'unknown'}; score ${runner.score ?? 'unknown'}; simulated contacts ${runner.contacts ?? 'unknown'}.`,
      `Starting speed ${runner.startingWpm ?? 'unknown'} WPM; actual used speeds ${runner.usedWpms?.join(', ') ?? 'unknown'}; ${runner.mixed ? 'mixed speed, not a constant WPM' : runner.usedWpms ? 'one recorded speed' : 'speed timeline not recorded'}.`,
    );
  }
  const native = sessionEvidence(entry.metadata);
  if (native?.type === 'runner') {
    facts.push(
      `Actual run end: ${native.run.runEndedAt ?? 'unknown'}.`,
      `Band conditions: ${Object.entries(native.run.settings.conditions)
        .map(([key, value]) => `${key} ${value ? 'on' : 'off'}`)
        .join(', ')}.`,
      ...(native.run.speedHistory
        ? [
            `Recorded timeline: ${native.run.speedHistory.map((item) => `${item.wpm} WPM at ${item.elapsedSeconds} engine seconds`).join('; ')}.`,
          ]
        : []),
      ...((native.run.speedChangeCount ?? 0) > (native.run.speedHistory?.length ?? 1) - 1
        ? [
            'Earlier speed changes were omitted from the bounded engine timeline; its retained segment is not a complete constant-speed claim.',
          ]
        : []),
    );
  }
  const files = playedFiles(entry);
  if (files.length) {
    source = files.some((file) => file.historical) ? 'historical' : 'native-audio';
    files.forEach((file) =>
      facts.push(
        `${file.file ?? 'Uncatalogued recording'}; ${file.speedWpm ?? 'unknown file'} WPM; ${('characterWpm' in file ? file.characterWpm : undefined) ?? 'unknown'} character / ${('effectiveWpm' in file ? file.effectiveWpm : undefined) ?? 'unknown'} effective WPM; ${display(file.seconds)} actual listened seconds; ${('completedPasses' in file ? file.completedPasses : recordingCompletedPasses(file)) ?? 'unknown'} completed passes; ${file.url}`,
      ),
    );
  }
  const evidence = sessionEvidence(entry.metadata);
  if (evidence?.type === 'timed' && evidence.generatedListening) {
    source = 'generated-listening';
    facts.push(
      ...generatedListeningDetails(evidence.generatedListening),
      'Configurations do not measure time per configuration or establish proficiency.',
    );
  }
  const copy = savedCopyAttempt(entry);
  if (copy) {
    source = 'native-copy';
    const summary = summarizeCopyAttempt(copy);
    const speeds = [
      ...new Set(copy.trials.map((trial) => `${trial.characterWpm}/${trial.effectiveWpm}`)),
    ];
    facts.push(
      `Native Copy ${copy.recipe.mode}; attempt ${copy.id}; ${copy.scoringVersion}; ${copy.status}. Separate from LCWO scores.`,
      `${summary.answered} submitted answers; ${summary.distance} edits; ${summary.errorPercent}% errors; ${summary.accuracy}% accuracy; ${summary.points} native points; ${summary.maxSpeed} highest correctly copied WPM.`,
      `Actual character/effective WPM: ${speeds.join(', ') || 'unknown (no submitted answers)'}.`,
    );
  }
  const lcwo = manualLcwo(entry);
  if (lcwo) {
    source = entry.metadata?.externalResult ? 'external-lcwo' : 'historical';
    facts.push(
      `LCWO ${lcwo.kind}; ${source === 'historical' ? 'retained structured original' : 'user-entered external'} result, separate from native Copy.`,
      ...Object.entries(lcwo.values).map(([key, value]) => `${key}: ${value}`),
    );
  }
  const assessment = entry.metadata?.assessment;
  const rating = explicitRating(entry);
  if (rating) {
    if (source === 'saved-practice') source = 'self-reported';
    facts.push(
      `Explicit performance: ${PERFORMANCE_RATINGS[rating]} (learner judgment, not difficulty or inferred accuracy).`,
    );
  }
  const cwt = cwtObservations(entry);
  if (cwt) {
    if (source === 'saved-practice') source = 'self-reported';
    facts.push(
      `Explicit CWT on-air count: ${entry.qsoCount ?? 'unknown'}.`,
      ...Object.entries(cwt)
        .filter(([, value]) => value?.trim())
        .map(([key, value]) => `${key}: ${value}`),
    );
  }
  return {
    source,
    date,
    ...(actual ? { occurredAt: actual } : {}),
    label: `${source} · ${entry.id}`.slice(0, 200),
    facts: (facts.length > 50
      ? [
          ...facts.slice(0, 49),
          'Embedded facts are an excerpt. Inspect the complete saved result/private backup for the remaining facts.',
        ]
      : facts
    ).map(sourceFact),
  };
}

interface SuggestedValue {
  value: string;
  refs: ReportReference[];
  warnings: string[];
}
export function buildReportEvidence(
  document: Pick<ReportDocument, 'definition' | 'window'>,
  entries: readonly PracticeSession[],
  lcwo: Pick<LcwoBackup, 'runs' | 'estimateSeconds'> | null | undefined,
  tasks: readonly PlannedTask[] = [],
  now = Date.now(),
  reports: readonly ReportDocument[] = [],
): { values: Record<string, string>; evidence: ReportReference[]; provenance: ReportProvenance } {
  const eligible = reportablePractice(document, entries, now);
  const window = document.window;
  const imports = [...new Map((lcwo?.runs ?? []).map((run) => [run.id, run])).values()]
    .filter((run) => {
      const date = dateInTimezone(run.recordedAt, window.timezone);
      return (
        !window.empty &&
        date >= window.fromDate &&
        date <= window.toDate &&
        Date.parse(run.recordedAt) <= now
      );
    })
    .sort(
      (a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt) || a.id.localeCompare(b.id),
    );
  const suggestions = new Map<EvidenceReportMapping, SuggestedValue>();
  const globalWarnings = new Set<string>();
  const put = (
    mapping: EvidenceReportMapping,
    value: string | number | undefined,
    refs: ReportReference[],
    warnings: string[] = [],
  ) => {
    const rendered = value === undefined ? '' : typeof value === 'number' ? display(value) : value;
    suggestions.set(mapping, {
      value: rendered.slice(0, 4000),
      refs,
      warnings: [
        ...warnings,
        ...(rendered.length > 4000
          ? [
              'The suggestion exceeds 4,000 characters and was shortened. Full source results remain in private history and backups.',
            ]
          : []),
      ],
    });
  };
  const ref = (entry: PracticeSession): ReportReference => ({ kind: 'practice', id: entry.id });
  const learnedFields = document.definition.fields.filter(
    (field) => field.source === 'learned:words',
  );
  const includeLearnedWords = learnedFields.length > 0;
  if (includeLearnedWords) {
    const candidates = learnedWordCandidates(eligible, reports, (entry) =>
      reportPracticeDate(entry, window.timezone),
    );
    const included = candidates.filter((candidate) => !candidate.reportedIn.length);
    const excluded = candidates.filter((candidate) => candidate.reportedIn.length);
    const answer = learnedWordAnswer(included.map((candidate) => candidate.word));
    const selected = reportWordValues(answer).length;
    // Derived explanatory prose must not consume the document's answer/source budget.
    // Share this allowance across every configured learned field, which repeats these warnings.
    const detailBudget = Math.floor(2000 / learnedFields.length);
    const exclusionWarnings: string[] = [];
    let detailBytes = 0;
    for (const candidate of excluded) {
      const warning = `Already confirmed: ${candidate.word.slice(0, 700)}${candidate.word.length > 700 ? '… [word excerpt]' : ''}; submission ${candidate.reportedIn[0].reportId} at ${candidate.reportedIn[0].submittedAt}.`;
      const bytes = new TextEncoder().encode(JSON.stringify(warning)).length + 1;
      if (detailBytes + bytes > detailBudget) break;
      exclusionWarnings.push(warning);
      detailBytes += bytes;
    }
    const omittedExclusions = excluded.length - exclusionWarnings.length;

    put(
      'learned:words',
      answer,
      [
        ...new Map(
          candidates.flatMap((candidate) =>
            candidate.sources.map(
              (source) => [source.id, { kind: 'practice' as const, id: source.id }] as const,
            ),
          ),
        ).values(),
      ],
      [
        'Only explicit Learned: lines in saved report-window scratchpads suggest words. Edit the answer to deliberately include or omit words; hearing, scores and general notes never declare learning.',
        `${included.length} eligible declarations; ${excluded.length} already represented in exact confirmed native submissions. Draft saves, printing, opening forms and imported reference-only text never retire words.`,
        ...exclusionWarnings,
        ...(omittedExclusions
          ? [
              `${omittedExclusions} further exclusions remain visible in the learned-word candidate inspector and complete private submission history.`,
            ]
          : []),
        ...(selected < included.length
          ? [
              `${included.length - selected} declarations do not fit the 4,000-character answer. Whole words were retained; inspect candidates and deliberately edit the answer.`,
            ]
          : []),
      ],
    );
  }
  const audio = new Map<ReportAudioCategory, { pairs: Set<string>; entries: PracticeSession[] }>();
  const ratings = new Map<string, PracticeSession>();
  const taskMap = new Map(tasks.map((task) => [task.id, task]));
  const generated: { lines: string[]; entries: PracticeSession[] } = { lines: [], entries: [] };
  for (const entry of eligible) {
    const categories = new Set<string>();
    for (const file of playedFiles(entry)) {
      if (!file.category || !file.file) {
        globalWarnings.add(
          'An actually played recording has no verified report family. Its URL and measured time remain inspectable; no family or speed is guessed.',
        );
        continue;
      }
      categories.add(file.category);
      const group = audio.get(file.category) ?? { pairs: new Set<string>(), entries: [] };
      group.pairs.add(`${file.file} ${file.speedWpm ?? '(file WPM unknown)'}`);
      if (!group.entries.some((old) => old.id === entry.id)) group.entries.push(entry);
      audio.set(file.category, group);
    }
    const taskId = entry.metadata?.plannedTaskId ?? entry.historicalPlannedTaskId;
    const task = typeof taskId === 'string' ? taskMap.get(taskId) : undefined;
    if (
      entry.kind === 'sending' &&
      (entry.metadata?.practiceTool === 'sending' || (task && /\bscales?\b/i.test(task.title)))
    )
      categories.add('scales');
    if (explicitRating(entry)) for (const category of categories) ratings.set(category, entry);
    const evidence = sessionEvidence(entry.metadata);
    if (evidence?.type === 'timed' && evidence.generatedListening) {
      generated.lines.push(...generatedListeningDetails(evidence.generatedListening));
      generated.entries.push(entry);
    }
  }
  for (const [category, group] of audio)
    put(`audio:${category}:files`, [...group.pairs].sort().join(', '), group.entries.map(ref));
  for (const [category, entry] of ratings) {
    const rating = explicitRating(entry)!;
    const mapping =
      category === 'scales'
        ? 'sending:scales:rating'
        : (`audio:${category}:rating` as EvidenceReportMapping);
    put(mapping, PERFORMANCE_RATINGS[rating], [ref(entry)]);
  }
  if (generated.entries.length)
    put(
      'generated:configurations',
      [...new Set(generated.lines)].join('\n'),
      generated.entries.map(ref),
      [
        'Played configurations describe actual applied settings, not per-configuration time, learned words or proficiency.',
      ],
    );
  const runner = selectReportRunner(eligible);
  if (runner) {
    const warnings = [
      ...(runner.mixed
        ? [
            'Mixed-speed run: starting WPM is not a constant speed; inspect the actual recorded speed changes.',
          ]
        : []),
      ...(!runner.usedWpms
        ? [
            'Actual used speeds were not recorded; starting WPM does not establish a constant run speed.',
          ]
        : []),
      ...(runner.elapsedSeconds < 900
        ? [
            `This single ${display(runner.elapsedSeconds)}-second result is reported without scaling points to 15 minutes.`,
          ]
        : []),
      ...(runner.source !== 'native-runner'
        ? [
            'This result is external/historical evidence, not a newly acknowledged Companion engine result.',
          ]
        : []),
      ...(!runner.actualStart
        ? [
            'Actual run start is unknown. The declared practice day is retained; upload time was not substituted.',
          ]
        : []),
    ];
    if (document.definition.fields.some((field) => field.source.startsWith('runner:')))
      warnings.forEach((warning) => globalWarnings.add(warning));
    for (const metric of [
      'verifiedPoints',
      'score',
      'startingWpm',
      'elapsedSeconds',
      'contacts',
    ] as const)
      put(
        `runner:${metric}`,
        runner[metric],
        [ref(runner.entry)],
        [
          ...warnings,
          ...(runner[metric] === undefined
            ? [`${metric} is unknown in this selected whole run; no older result fills it.`]
            : []),
        ],
      );
    put('runner:usedWpms', runner.usedWpms?.join(', '), [ref(runner.entry)], warnings);
  }
  const lcwoCandidates = [
    ...eligible.flatMap((entry) => {
      const candidate = manualLcwo(entry);
      return candidate ? [candidate] : [];
    }),
    ...imports.map(importedLcwo),
  ].sort(
    (a, b) =>
      Date.parse(a.completedAt) - Date.parse(b.completedAt) ||
      referenceKey(a.ref).localeCompare(referenceKey(b.ref)),
  );
  const latest = new Map(lcwoCandidates.map((candidate) => [candidate.kind, candidate]));
  for (const [kind, candidate] of latest) {
    const values = { ...candidate.values };
    const sources = [candidate.ref];
    const warnings: string[] = [];
    if (
      candidate.run &&
      candidate.run.sourceType === 'groups' &&
      candidate.run.effectiveWpm &&
      candidate.run.characterWpm
    ) {
      const matching = imports.filter(
        (run) =>
          run.kind === kind &&
          run.sourceType === 'groups' &&
          run.effectiveWpm === candidate.run!.effectiveWpm &&
          run.characterWpm === candidate.run!.characterWpm &&
          run.accuracyPercent !== undefined,
      );
      if (matching.length) {
        values.errorPercent =
          matching.reduce((sum, run) => sum + 100 - run.accuracyPercent!, 0) / matching.length;
        sources.push(...matching.map((run): ReportReference => ({ kind: 'lcwo', id: run.id })));
        warnings.push(
          `Errors average ${matching.length} authenticated group results at the latest result's matching character/effective WPM; this is not an error count or a native Copy score.`,
        );
      }
    }
    if (candidate.run && ['words', 'callsigns'].includes(candidate.run.sourceType))
      warnings.push(
        'The authenticated export records maximum achieved WPM and score. Actual adaptive training speed, word length and errors are unknown and are not filled from older manual results.',
      );
    if (
      candidate.entry &&
      !candidate.entry.metadata?.manualTiming &&
      !stamp(record(candidate.entry.metadata?.legacyAttempt).endedAt)
    )
      warnings.push(
        'Actual completion time is unknown. Latest recorded whole result uses saved-record recency; its declared practice day remains separate.',
      );
    if (document.definition.fields.some((field) => field.source.startsWith(`lcwo:${kind}:`)))
      warnings.forEach((warning) => globalWarnings.add(warning));
    for (const mapping of EVIDENCE_REPORT_MAPPINGS.filter((item) =>
      item.id.startsWith(`lcwo:${kind}:`),
    )) {
      const metric = mapping.id.split(':')[2] as keyof typeof values;
      put(
        mapping.id,
        values[metric],
        [...new Map(sources.map((source) => [referenceKey(source), source])).values()],
        [
          ...warnings,
          ...(values[metric] === undefined
            ? [
                `${metric} is unknown in this latest whole result; no older result or course default fills it.`,
              ]
            : []),
        ],
      );
    }
  }
  const latestCopies = new Map<
    string,
    { entry: PracticeSession; attempt: NonNullable<ReturnType<typeof savedCopyAttempt>> }
  >();
  for (const entry of eligible) {
    const attempt = savedCopyAttempt(entry);
    if (!attempt) continue;
    const kind = attempt.recipe.mode === 'groups' ? attempt.recipe.groupKind : attempt.recipe.mode;
    if (kind === 'mixed') {
      globalWarnings.add(
        'Mixed-character native Copy has no compatible letters/figures/custom mapping. It remains a separate native result.',
      );
      continue;
    }
    latestCopies.set(kind, { entry, attempt });
  }
  for (const [kind, { entry, attempt }] of latestCopies) {
    const summary = summarizeCopyAttempt(attempt);
    const first = attempt.trials[0];
    const uniform =
      first &&
      attempt.trials.every(
        (trial) =>
          trial.characterWpm === first.characterWpm && trial.effectiveWpm === first.effectiveWpm,
      );
    const values = {
      ...(attempt.trials.length
        ? {
            maximumWpm: summary.maxSpeed,
            errorCount: summary.distance,
            errorPercent: summary.errorPercent,
            accuracy: summary.accuracy,
            points: summary.points,
          }
        : {}),
      ...(uniform ? { characterWpm: first.characterWpm, effectiveWpm: first.effectiveWpm } : {}),
    };
    for (const mapping of EVIDENCE_REPORT_MAPPINGS.filter((item) =>
      item.id.startsWith(`copy:${kind}:`),
    )) {
      const metric = mapping.id.split(':')[2] as keyof typeof values;
      put(
        mapping.id,
        values[metric],
        [ref(entry)],
        [
          'Native Copy scoring is separate from LCWO. This explicit mapping never fills LCWO fields.',
          ...(!uniform
            ? [
                'Actual Copy speeds are mixed or no answers were submitted; no constant speed is suggested.',
              ]
            : []),
          ...(values[metric] === undefined ? [`${metric} is unknown for this whole attempt.`] : []),
        ],
      );
    }
  }
  if (
    latestCopies.size &&
    !document.definition.fields.some((field) => field.source.startsWith('copy:'))
  )
    globalWarnings.add(
      'Native Copy results are available in this window, but no compatible Native Copy report field is configured. They never fill LCWO answers.',
    );
  const cwt = eligible.filter((entry) => cwtObservations(entry));
  for (const metric of [
    'heardCallsigns',
    'heardExchanges',
    'workedCallsigns',
    'workedNames',
    'comments',
  ] as const) {
    const sources = cwt.filter((entry) => cwtObservations(entry)![metric]?.trim());
    if (sources.length)
      put(
        `cwt:${metric}`,
        sources.map((entry) => cwtObservations(entry)![metric]).join('\n'),
        sources.map(ref),
      );
  }
  const counts = cwt.filter((entry) => entry.qsoCount !== undefined);
  if (counts.length)
    put(
      'cwt:qsoCount',
      counts.reduce((sum, entry) => sum + entry.qsoCount!, 0),
      counts.map(ref),
      ['Explicit actual on-air counts are self-reported; simulated contacts are excluded.'],
    );
  const evidence = [
    ...new Map(
      [...eligible.map(ref), ...[...suggestions.values()].flatMap((item) => item.refs)].map(
        (item) => [referenceKey(item), item],
      ),
    ).values(),
  ];
  const indices = new Map(evidence.map((item, index) => [referenceKey(item), index]));
  const fields = document.definition.fields
    .filter((field) => EVIDENCE_REPORT_MAPPINGS.some((mapping) => mapping.id === field.source))
    .map((field) => {
      const suggested = suggestions.get(field.source as EvidenceReportMapping) ?? {
        value: '',
        refs: [],
        warnings: [
          'No compatible saved source measurement exists in this inclusive report window.',
        ],
      };
      let value = suggested.value;
      const warnings = [...suggested.warnings];
      if (field.type === 'rating' && value) {
        value =
          field.options?.find(
            (option) => option.toLowerCase().replace(/\s+/g, ' ').trim() === value.toLowerCase(),
          ) ?? '';
        if (!value)
          warnings.push(
            'The explicit rating has no exact compatible configured choice. Select a learner answer; no rating is inferred.',
          );
      }
      if (
        value &&
        validateAdvisorReportAnswers(
          { ...document.definition, fields: [field] },
          { [field.key]: value },
          false,
        ).length
      ) {
        value = '';
        warnings.push(
          'This source measurement is incompatible with the configured answer rules. The source remains inspectable; adjust the mapping/rules or answer explicitly.',
        );
      }
      return {
        key: field.key,
        mapping: field.source,
        value,
        references: suggested.refs.map((item) => indices.get(referenceKey(item))!),
        warnings,
      };
    });
  if (
    fields.some(
      (field) => field.mapping !== 'learned:words' && !field.value && field.warnings.length,
    )
  )
    globalWarnings.add(
      'Some mapped measurements are unknown or incompatible and remain blank. Review each field’s suggestion evidence before answering; older results, private notes and selected-but-unplayed settings never fill missing measurements.',
    );
  const contributions = new Map(
    lcwoContributions(lcwo, entries, window.timezone, now).map((item) => [item.run.id, item]),
  );
  const entryMap = new Map(eligible.map((entry) => [entry.id, entry]));
  const runMap = new Map(imports.map((run) => [run.id, run]));
  const sources: ReportSourceSnapshot[] = [];
  let sourceBytes = 0;
  let omittedSourceDetails = 0;
  for (const [reference, item] of evidence.entries()) {
    const entry = item.kind === 'practice' ? entryMap.get(item.id) : undefined;
    const run = item.kind === 'lcwo' ? runMap.get(item.id) : undefined;
    const snapshot: ReportSourceSnapshot | undefined = entry
      ? { reference, ...reportPracticeSnapshot(entry, window.timezone, includeLearnedWords) }
      : run
        ? {
            reference,
            source: 'lcwo-export',
            date: dateInTimezone(run.recordedAt, window.timezone),
            occurredAt: run.recordedAt,
            label: `Authenticated LCWO ${run.kind} · ${run.id}`.slice(0, 200),
            facts: [
              ...lcwoRunDetails(run),
              ...(contributions.get(run.id)
                ? [lcwoContributionDetails(contributions.get(run.id)!, lcwo?.estimateSeconds ?? 0)]
                : []),
            ],
          }
        : undefined;
    if (!snapshot) continue;
    const bytes = new TextEncoder().encode(JSON.stringify(snapshot)).length;
    if (sources.length >= 256 || sourceBytes + bytes > 40_000) {
      omittedSourceDetails++;
      continue;
    }
    sourceBytes += bytes;
    sources.push(snapshot);
  }
  if (omittedSourceDetails)
    globalWarnings.add(
      `${omittedSourceDetails} source detail snapshots exceed the bounded 40,000-byte detail budget. All source IDs remain retained; inspect the saved results and private backup for their complete facts.`,
    );
  return {
    values: Object.fromEntries(fields.map((field) => [field.key, field.value])),
    evidence,
    provenance: {
      version: 1,
      fields,
      sources,
      warnings: [...globalWarnings],
      omittedSourceDetails,
    },
  };
}
