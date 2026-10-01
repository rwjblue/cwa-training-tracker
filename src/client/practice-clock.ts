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
    if (recording) {
      this.coverage.observe(recording, true);
      if (
        resume &&
        rate === 1 &&
        resume.rate === 1 &&
        resume.recording.url === recording.url &&
        (resume.recording.sourceId ?? resume.recording.url) ===
          (recording.sourceId ?? recording.url) &&
        resume.recording.durationSeconds === recording.durationSeconds
      )
        this.coverage.authorizeResumeGap(recording, resume.position, position);
    } else this.coverage.discard();
    this.media = { position, at: now, rate, recording };
  }

  sample(position: number, now: number, rate = 1) {
    const previous = this.media;
    if (!previous) return;
    const advance = position - previous.position;
    const elapsed = now - previous.at;
    if (
      !Number.isFinite(position) ||
      position < 0 ||
      !Number.isFinite(now) ||
      !Number.isFinite(elapsed) ||
      elapsed < 0 ||
      !Number.isFinite(rate) ||
      rate <= 0
    ) {
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
        if (
          wall > 0 &&
          advance <= wall * previous.rate + jitter &&
          advance <= credit * previous.rate + Number.EPSILON * Math.max(1, advance)
        )
          this.coverage.hear(previous.recording, previous.position, position, previous.rate);
      }
    }
    this.media = { ...previous, position, at: now, rate };
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
  }

  /** A Play request stops recall without stopping intentional external practice. */
  stopRecall(now: number, visible = true) {
    if (!this.manual?.recall) return;
    this.settleManual(now, visible);
    this.manual = undefined;
  }

  pause(now: number, visible = true) {
    const interruption = this.settleManual(now, visible);
    this.manual = undefined;
    this.suspendMedia();
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
