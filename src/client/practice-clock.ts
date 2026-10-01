import type { RecordingPassEvidence } from '../shared/practice-evidence';
import {
  RecordingCoverage,
  type RecordingOutcome,
  type RecordingProgress,
  type RecordingSource,
} from './recording-coverage';

export interface RecordingTime {
  url: string;
  speedWpm?: number;
  seconds: number;
  passes?: RecordingPassEvidence;
}

export type RecallInterruption = 'hidden' | 'delayed' | 'invalid';

export interface PracticeClockSnapshot {
  seconds: number;
  recallSeconds: number;
  running: boolean;
  recalling: boolean;
  recordings: RecordingTime[];
  recallInterruption?: RecallInterruption;
  recordingRevision: number;
  recordingProgress?: RecordingProgress;
  recordingOutcome?: RecordingOutcome;
}

const sameRecording = (left: RecordingSource, right: RecordingSource) =>
  left.url === right.url &&
  (left.sourceId ?? left.url) === (right.sourceId ?? right.url) &&
  left.durationSeconds === right.durationSeconds;

const resumeGapLimit = (source: RecordingSource) => {
  const duration = source.durationSeconds;
  return duration !== undefined && Number.isFinite(duration) && duration > 0 && duration <= 86400
    ? Math.min(0.25, duration * 0.05)
    : undefined;
};

/** Count media movement, not a stopwatch left running beside paused audio. */
export class PracticeClock {
  private seconds = 0;
  private recallSeconds = 0;
  private recallInterruption?: RecallInterruption;
  private manual?: { at: number; recall: boolean };
  private media?: {
    position: number;
    at: number;
    rate: number;
    recording?: RecordingSource;
    /** Only the first observation after a verified native resume may stabilize. */
    resumePosition?: number;
  };
  private recordings = new Map<string, RecordingTime>();
  private coverage = new RecordingCoverage();
  private resume?: { position: number; rate: number; recording: RecordingSource };

  /** Every observer and mode boundary uses the same recall interruption rule. */
  private settleManual(now: number, visible: boolean) {
    const previous = this.manual;
    if (!previous) return;
    const elapsed = now - previous.at;
    const interruption: RecallInterruption | undefined =
      previous.recall && !visible
        ? 'hidden'
        : !Number.isFinite(now) || !Number.isFinite(elapsed) || elapsed < 0
          ? 'invalid'
          : previous.recall && elapsed >= 4000
            ? 'delayed'
            : undefined;
    const credit = elapsed / 1000;
    if (interruption || !Number.isFinite(this.seconds + credit)) {
      if (previous.recall) this.recallInterruption = interruption ?? 'invalid';
      this.manual = undefined;
      return interruption ?? 'invalid';
    }
    this.seconds += credit;
    if (previous.recall) this.recallSeconds += credit;
    this.manual = { ...previous, at: now };
  }

  snapshot(now: number, visible = true): PracticeClockSnapshot {
    this.settleManual(now, visible);
    return {
      seconds: this.seconds,
      recallSeconds: this.recallSeconds,
      running: Boolean(this.manual || this.media),
      recalling: this.manual?.recall === true,
      recordings: [...this.recordings.values()].map((recording) => {
        const passes = this.coverage.measurements(recording.url);
        return { ...recording, ...(passes ? { passes } : {}) };
      }),
      recallInterruption: this.recallInterruption,
      ...this.coverage.snapshot(),
    };
  }

  startManual(now: number, recall = false, visible = true) {
    const sameMode = this.manual?.recall === recall;
    const interruption = this.settleManual(now, visible);
    // A redundant Start must observe a stall, not silently resume after it.
    if (sameMode) return;
    this.manual = undefined;
    this.suspendMedia();
    if (interruption === 'invalid' || !Number.isFinite(now) || (recall && !visible)) {
      this.resume = undefined;
      if (recall) this.recallInterruption = visible ? 'invalid' : 'hidden';
      return;
    }
    this.manual = { at: now, recall };
    this.recallInterruption = undefined;
  }

  startMedia(position: number, now: number, rate = 1, recording?: RecordingSource, visible = true) {
    const interruption = this.settleManual(now, visible);
    this.manual = undefined;
    // A repeated playing/seeked anchor is not itself a native pause boundary.
    this.media = undefined;
    if (
      interruption === 'invalid' ||
      !Number.isFinite(position) ||
      position < 0 ||
      !Number.isFinite(now) ||
      !Number.isFinite(rate) ||
      rate <= 0
    ) {
      this.resume = undefined;
      return;
    }
    const resume = this.resume;
    this.resume = undefined;
    let resumePosition: number | undefined;
    if (recording) {
      this.coverage.observe(recording, true);
      const limit = resumeGapLimit(recording);
      if (
        resume &&
        rate === 1 &&
        resume.rate === 1 &&
        sameRecording(resume.recording, recording) &&
        limit !== undefined &&
        position >= resume.position &&
        position <= recording.durationSeconds! &&
        position - resume.position <= limit
      ) {
        this.coverage.authorizeResumeGap(recording, resume.position, position);
        resumePosition = resume.position;
      }
    } else this.coverage.discard();
    this.media = {
      position,
      at: now,
      rate,
      ...(recording ? { recording: { ...recording } } : {}),
      ...(resumePosition !== undefined ? { resumePosition } : {}),
    };
  }

  sample(position: number, now: number, rate = 1) {
    const previous = this.media;
    if (
      !Number.isFinite(position) ||
      position < 0 ||
      !Number.isFinite(now) ||
      !Number.isFinite(rate) ||
      rate <= 0
    ) {
      this.media = undefined;
      this.resume = undefined;
      return;
    }
    if (!previous) return;
    const advance = position - previous.position;
    const elapsed = now - previous.at;
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      this.media = undefined;
      this.resume = undefined;
      return;
    }
    const wall = elapsed / 1000;
    // A missing/delayed seeking event must not turn a jump into practiced time.
    if (advance >= 0 && advance <= wall * previous.rate + 0.75 && previous.rate > 0) {
      const credit = Math.min(advance / previous.rate, wall + 0.1);
      if (!Number.isFinite(credit) || !Number.isFinite(this.seconds + credit)) {
        this.media = undefined;
        this.resume = undefined;
        return;
      }
      this.seconds += credit;
      if (previous.recording && credit > 0) {
        const item = this.recordings.get(previous.recording.url) ?? {
          url: previous.recording.url,
          ...(previous.recording.speedWpm !== undefined
            ? { speedWpm: previous.recording.speedWpm }
            : {}),
          seconds: 0,
        };
        this.recordings.set(item.url, { ...item, seconds: item.seconds + credit });
        // Plausibility/time jitter allowances must not supply a whole tiny clip.
        // Coverage requires positive observed wall time and caps its own jitter
        // by 1% of the finite source duration, at most 0.1 source seconds.
        const duration = previous.recording.durationSeconds;
        const jitter =
          duration !== undefined && Number.isFinite(duration) && duration > 0
            ? Math.min(0.1, duration * 0.01)
            : 0;
        const unclipped = advance <= credit * previous.rate + Number.EPSILON * Math.max(1, advance);
        if (wall > 0 && advance <= wall * previous.rate + jitter && unclipped)
          this.coverage.hear(previous.recording, previous.position, position, previous.rate);
        else if (
          wall > 0 &&
          unclipped &&
          previous.resumePosition !== undefined &&
          previous.rate === 1 &&
          rate === 1
        ) {
          // A native resume can settle ahead on its first observation. Keep only
          // the tail admitted by the unchanged coverage bound; its uncertain
          // head and the original resume gap share one bounded missing interval.
          const from = position - (wall + jitter);
          const limit = resumeGapLimit(previous.recording);
          if (
            limit !== undefined &&
            position <= duration! &&
            from >= previous.position &&
            from - previous.resumePosition <= limit
          ) {
            this.coverage.authorizeResumeGap(previous.recording, previous.resumePosition, from);
            this.coverage.hear(previous.recording, from, position, 1);
          }
        }
      }
    }
    // Every observation consumes stabilization, including stalled/zero-wall or
    // rejected movement. A later jump must satisfy normal coverage admission.
    this.media = { ...previous, position, at: now, rate, resumePosition: undefined };
  }

  suspendMedia(allowResumeGap = true) {
    if (!allowResumeGap) this.resume = undefined;
    else if (this.media?.recording)
      this.resume = {
        position: this.media.position,
        rate: this.media.rate,
        recording: { ...this.media.recording },
      };
    this.media = undefined;
  }

  observeRecording(source: RecordingSource) {
    if (this.resume && !sameRecording(this.resume.recording, source)) this.resume = undefined;
    if (this.media?.recording && !sameRecording(this.media.recording, source))
      this.media.resumePosition = undefined;
    this.coverage.observe(source);
  }

  finalizeRecording(source: RecordingSource, ended: boolean) {
    return this.coverage.finalize(source, ended);
  }

  discardRecording(source?: RecordingSource) {
    this.coverage.discard(source);
    if (
      !source ||
      (this.resume?.recording.url === source.url &&
        (this.resume.recording.sourceId ?? source.url) === (source.sourceId ?? source.url))
    )
      this.resume = undefined;
    if (
      this.media &&
      (!source ||
        (this.media.recording?.url === source.url &&
          (this.media.recording.sourceId ?? source.url) === (source.sourceId ?? source.url)))
    )
      this.media.resumePosition = undefined;
  }

  /** A Play request stops recall without stopping intentional external practice. */
  stopRecall(now: number, visible = true) {
    if (!this.manual?.recall) return;
    this.settleManual(now, visible);
    this.manual = undefined;
  }

  pause(now: number, visible = true) {
    const invalidMediaTime = !Number.isFinite(now) || Boolean(this.media && now < this.media.at);
    const interruption = this.settleManual(now, visible);
    this.manual = undefined;
    this.suspendMedia(!invalidMediaTime && interruption !== 'invalid');
    return interruption;
  }

  reset() {
    this.seconds = 0;
    this.recallSeconds = 0;
    this.recallInterruption = undefined;
    this.manual = undefined;
    this.media = undefined;
    this.resume = undefined;
    this.recordings.clear();
    this.coverage.reset();
  }
}
