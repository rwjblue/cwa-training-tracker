import {
  MAX_RECORDING_PASS_DURATIONS,
  recordingPassTolerance,
  type RecordingPassEvidence,
} from '../shared/practice-evidence';

export interface RecordingSource {
  url: string;
  speedWpm?: number;
  durationSeconds?: number;
  /** An in-memory element/source identity, never part of saved evidence. */
  sourceId?: string;
}

export type RecordingPassProblem = 'duration-unavailable' | 'duration-limit' | 'rate-unsupported';

export interface RecordingProgress {
  url: string;
  durationSeconds?: number;
  coveredSeconds: number;
  status?: RecordingPassProblem;
}

export interface RecordingOutcome {
  id: number;
  url: string;
  completed: boolean;
  reason?: RecordingPassProblem | 'incomplete';
}

type Range = [number, number];
type Owner = {
  sourceId: string;
  url: string;
  durationSeconds?: number;
  ranges: Range[];
  resumeGaps: Range[];
  finalized: boolean;
  unsupportedRate: boolean;
};

const duration = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 86400
    ? value
    : undefined;
const identity = (source: RecordingSource) => source.sourceId ?? source.url;

/** Coverage shares the clock's accepted movement; it never measures elapsed time. */
export class RecordingCoverage {
  private owner?: Owner;
  private facts = new Map<string, RecordingPassEvidence>();
  private outcome?: RecordingOutcome;
  private nextOutcome = 0;
  private revision = 0;

  private matches(source: RecordingSource) {
    return this.owner?.sourceId === identity(source) && this.owner.url === source.url;
  }

  observe(source: RecordingSource, begin = false) {
    const observed = duration(source.durationSeconds);
    const sameDuration =
      observed === this.owner?.durationSeconds ||
      (observed !== undefined &&
        this.owner?.durationSeconds !== undefined &&
        Math.abs(observed - this.owner.durationSeconds) <=
          Math.min(0.001, this.owner.durationSeconds * 0.000001));
    if (!this.matches(source) || !sameDuration || (begin && this.owner?.finalized)) {
      if (this.owner?.ranges.length) this.bucket(this.owner, true);
      this.owner = {
        sourceId: identity(source),
        url: source.url,
        durationSeconds: observed,
        ranges: [],
        resumeGaps: [],
        finalized: false,
        unsupportedRate: false,
      };
      this.outcome = undefined;
      this.revision++;
    }
  }

  /** Native metadata can refine an estimate without replacing the loaded source. */
  refineDuration(source: RecordingSource) {
    const owner = this.owner;
    const observed = duration(source.durationSeconds);
    if (
      !owner ||
      !source.sourceId ||
      !this.matches(source) ||
      owner.finalized ||
      owner.durationSeconds === undefined ||
      observed === undefined
    ) {
      this.observe(source);
      return;
    }
    if (observed === owner.durationSeconds) return;
    owner.durationSeconds = observed;
    const clip = (ranges: Range[]): Range[] =>
      ranges
        .map(([from, to]): Range => [from, Math.min(to, observed)])
        .filter(([from, to]) => to > from);
    owner.ranges = clip(owner.ranges);
    owner.resumeGaps = clip(owner.resumeGaps);
    this.revision++;
  }

  /** Native pause/buffer drain can reanchor slightly ahead without heard credit. */
  authorizeResumeGap(source: RecordingSource, from: number, to: number) {
    const owner = this.owner;
    if (
      !owner ||
      !this.matches(source) ||
      owner.finalized ||
      owner.durationSeconds === undefined ||
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from < 0 ||
      to > owner.durationSeconds ||
      to <= from ||
      to - from > Math.min(0.25, owner.durationSeconds * 0.05)
    )
      return;
    owner.resumeGaps.push([from, to]);
  }

  private bucket(owner: Owner, create: boolean) {
    if (owner.durationSeconds === undefined) return;
    const evidence = this.facts.get(owner.url);
    const found = evidence?.durations.find(
      (item) => item.durationSeconds === owner.durationSeconds,
    );
    if (found || !create) return found;
    if ((evidence?.durations.length ?? 0) >= MAX_RECORDING_PASS_DURATIONS) return;
    const bucket = { durationSeconds: owner.durationSeconds, completedPasses: 0 };
    if (evidence) evidence.durations.push(bucket);
    else
      this.facts.set(owner.url, {
        version: 1,
        method: 'native-1x',
        durations: [bucket],
      });
    this.revision++;
    return bucket;
  }

  /** Only pass source intervals already admitted as actual 1x hearing. */
  hear(source: RecordingSource, from: number, to: number, rate: number) {
    if (!this.matches(source) || !this.owner || this.owner.finalized) return;
    const owner = this.owner;
    if (rate !== 1) {
      if (!owner.unsupportedRate) {
        owner.unsupportedRate = true;
        this.revision++;
      }
      return;
    }
    if (
      owner.durationSeconds === undefined ||
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      to <= from ||
      (!this.bucket(owner, false) &&
        (this.facts.get(owner.url)?.durations.length ?? 0) >= MAX_RECORDING_PASS_DURATIONS)
    )
      return;
    const start = Math.max(0, Math.min(owner.durationSeconds, from));
    const end = Math.max(0, Math.min(owner.durationSeconds, to));
    if (end <= start) return;
    if (!owner.ranges.length) this.revision++;
    const merged: Range[] = [];
    for (const range of [...owner.ranges, [start, end] as Range].sort((a, b) => a[0] - b[0])) {
      const previous = merged.at(-1);
      // Exact overlap/adjacency only. Repeated tiny gaps must never become heard audio.
      if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
      else merged.push([...range]);
    }
    // Partial ranges are private collection state. Whole-second time refreshes
    // already update the screen; only semantic source/pass/status changes need
    // an extra publication outside that cadence.
    owner.ranges = merged;
  }

  finalize(source: RecordingSource, ended: boolean): RecordingOutcome | undefined {
    if (!ended || !this.matches(source) || !this.owner || this.owner.finalized) return;
    const owner = this.owner;
    owner.finalized = true;
    const bucket = this.bucket(owner, owner.ranges.length > 0);
    const covered = owner.ranges.reduce((sum, [from, to]) => sum + to - from, 0);
    const internalGapsAllowed = owner.ranges.every((range, index) => {
      if (!index) return true;
      const from = owner.ranges[index - 1][1];
      const to = range[0];
      return owner.resumeGaps.some(([start, end]) => start <= from && end >= to);
    });
    const completed = Boolean(
      bucket &&
      covered > 0 &&
      internalGapsAllowed &&
      owner.durationSeconds !== undefined &&
      covered >= owner.durationSeconds - recordingPassTolerance(owner.durationSeconds),
    );
    if (completed && bucket) bucket.completedPasses++;
    const reason = completed
      ? undefined
      : owner.durationSeconds === undefined
        ? 'duration-unavailable'
        : !bucket &&
            (this.facts.get(owner.url)?.durations.length ?? 0) >= MAX_RECORDING_PASS_DURATIONS
          ? 'duration-limit'
          : owner.unsupportedRate
            ? 'rate-unsupported'
            : 'incomplete';
    this.outcome = {
      id: ++this.nextOutcome,
      url: owner.url,
      completed,
      ...(reason ? { reason } : {}),
    };
    this.revision++;
    return { ...this.outcome };
  }

  discard(source?: RecordingSource) {
    if (!this.owner || (source && !this.matches(source))) return;
    if (this.owner.ranges.length) this.bucket(this.owner, true);
    this.owner = undefined;
    this.revision++;
  }

  measurements(url: string): RecordingPassEvidence | undefined {
    const evidence = this.facts.get(url);
    const durations = evidence?.durations.map((item) => ({ ...item })) ?? [];
    const owner = this.owner;
    // Keep a measured zero for partial saves, without storing every provisional
    // MP3 estimate as a separate duration group. Terminal facts remain immutable.
    if (
      owner?.url === url &&
      owner.ranges.length &&
      owner.durationSeconds !== undefined &&
      !durations.some((item) => item.durationSeconds === owner.durationSeconds) &&
      durations.length < MAX_RECORDING_PASS_DURATIONS
    )
      durations.push({ durationSeconds: owner.durationSeconds, completedPasses: 0 });
    return durations.length ? { version: 1, method: 'native-1x', durations } : undefined;
  }

  snapshot() {
    const owner = this.owner;
    const status: RecordingPassProblem | undefined = !owner
      ? undefined
      : owner.durationSeconds === undefined
        ? 'duration-unavailable'
        : !this.bucket(owner, false) &&
            (this.facts.get(owner.url)?.durations.length ?? 0) >= MAX_RECORDING_PASS_DURATIONS
          ? 'duration-limit'
          : owner.unsupportedRate
            ? 'rate-unsupported'
            : undefined;
    return {
      recordingRevision: this.revision,
      ...(owner
        ? {
            recordingProgress: {
              url: owner.url,
              ...(owner.durationSeconds !== undefined
                ? { durationSeconds: owner.durationSeconds }
                : {}),
              coveredSeconds: owner.ranges.reduce((sum, [start, end]) => sum + end - start, 0),
              ...(status ? { status } : {}),
            },
          }
        : {}),
      ...(this.outcome ? { recordingOutcome: { ...this.outcome } } : {}),
    };
  }

  reset() {
    this.owner = undefined;
    this.facts.clear();
    this.outcome = undefined;
    this.revision++;
  }
}
