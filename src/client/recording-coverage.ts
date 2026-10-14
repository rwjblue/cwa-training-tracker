import {
  MAX_RECORDING_PASS_DURATIONS,
  recordingTimePassTolerance,
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
  listenedSeconds: number;
  status?: RecordingPassProblem;
}

export interface RecordingOutcome {
  id: number;
  url: string;
  completed: boolean;
  reason?: RecordingPassProblem | 'incomplete';
}

type Owner = {
  sourceId: string;
  url: string;
  durationSeconds?: number;
  listenedSeconds: number;
  finalized: boolean;
  unsupportedRate: boolean;
};

const duration = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 86400
    ? value
    : undefined;
const identity = (source: RecordingSource) => source.sourceId ?? source.url;

/** Personal pass credit shares the clock's accepted native listening time. */
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
    if (
      !this.matches(source) ||
      observed !== this.owner?.durationSeconds ||
      (begin && this.owner?.finalized)
    ) {
      if (this.owner) this.commit(this.owner);
      this.owner = {
        sourceId: identity(source),
        url: source.url,
        durationSeconds: observed,
        listenedSeconds: 0,
        finalized: false,
        unsupportedRate: false,
      };
      this.outcome = undefined;
      this.revision++;
    }
  }

  /** Revise the active projection as native MP3 duration estimates settle. */
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
    this.revision++;
  }

  private count(owner: Owner) {
    if (owner.durationSeconds === undefined || owner.listenedSeconds <= 0) return 0;
    const count = Math.floor(
      (owner.listenedSeconds + recordingTimePassTolerance(owner.durationSeconds)) /
        owner.durationSeconds,
    );
    return Number.isSafeInteger(count) ? count : 0;
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
        version: 2,
        method: 'native-1x-time',
        durations: [bucket],
      });
    this.revision++;
    return bucket;
  }

  private commit(owner: Owner) {
    if (owner.finalized) return;
    const bucket = this.bucket(owner, owner.listenedSeconds > 0);
    if (bucket) bucket.completedPasses += this.count(owner);
    owner.finalized = true;
  }

  /** Rehearing counts; seeking, idle time and unsupported rates add no credit. */
  hear(source: RecordingSource, seconds: number, rate: number) {
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
      !Number.isFinite(seconds) ||
      seconds <= 0 ||
      !Number.isFinite(owner.listenedSeconds + seconds)
    )
      return;
    const before = this.count(owner);
    if (!owner.listenedSeconds) this.revision++;
    owner.listenedSeconds += seconds;
    if (before !== this.count(owner)) this.revision++;
  }

  /** End only freezes the current facts; pass credit does not require its event. */
  finalize(source: RecordingSource, ended: boolean): RecordingOutcome | undefined {
    if (!ended || !this.matches(source) || !this.owner || this.owner.finalized) return;
    const owner = this.owner;
    const completed = Boolean(this.count(owner) && this.bucket(owner, owner.listenedSeconds > 0));
    this.commit(owner);
    const reason = completed
      ? undefined
      : owner.durationSeconds === undefined
        ? 'duration-unavailable'
        : !this.bucket(owner, false) &&
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
    this.commit(this.owner);
    this.owner = undefined;
    this.revision++;
  }

  measurements(url: string): RecordingPassEvidence | undefined {
    const durations = this.facts.get(url)?.durations.map((item) => ({ ...item })) ?? [];
    const owner = this.owner;
    if (
      owner?.url === url &&
      !owner.finalized &&
      owner.listenedSeconds > 0 &&
      owner.durationSeconds !== undefined
    ) {
      const bucket = durations.find((item) => item.durationSeconds === owner.durationSeconds);
      if (bucket) bucket.completedPasses += this.count(owner);
      else if (durations.length < MAX_RECORDING_PASS_DURATIONS)
        durations.push({
          durationSeconds: owner.durationSeconds,
          completedPasses: this.count(owner),
        });
    }
    return durations.length ? { version: 2, method: 'native-1x-time', durations } : undefined;
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
              listenedSeconds: owner.listenedSeconds,
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
