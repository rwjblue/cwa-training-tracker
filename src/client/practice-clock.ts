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
  wordListeningSeconds?: number;
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
  private wordListeningSeconds = 0;
  private recallInterruption?: RecallInterruption;
  private manual?: { at: number; recall: boolean };
  private media?: {
    position: number;
    at: number;
    rate: number;
    recording?: RecordingSource;
    words: boolean;
  };
  private recordings = new Map<string, RecordingTime>();
  private coverage = new RecordingCoverage();

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
      wordListeningSeconds: this.wordListeningSeconds,
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
      if (recall) this.recallInterruption = visible ? 'invalid' : 'hidden';
      return;
    }
    this.manual = { at: now, recall };
    this.recallInterruption = undefined;
  }

  startMedia(
    position: number,
    now: number,
    rate = 1,
    recording?: RecordingSource,
    visible = true,
    words = false,
  ) {
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
      return;
    }
    if (recording) this.coverage.observe(recording, true);
    else this.coverage.discard();
    this.media = {
      position,
      at: now,
      rate,
      words: words && !recording,
      ...(recording ? { recording: { ...recording } } : {}),
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
      return;
    }
    if (!previous) return;
    const advance = position - previous.position;
    const elapsed = now - previous.at;
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      this.media = undefined;
      return;
    }
    const wall = elapsed / 1000;
    // A missing/delayed seeking event must not turn a jump into practiced time.
    if (advance >= 0 && advance <= wall * previous.rate + 0.75 && previous.rate > 0) {
      const credit = Math.min(advance / previous.rate, wall + 0.1);
      if (!Number.isFinite(credit) || !Number.isFinite(this.seconds + credit)) {
        this.media = undefined;
        return;
      }
      this.seconds += credit;
      if (previous.words) this.wordListeningSeconds += credit;
      if (previous.recording && credit > 0) {
        const item = this.recordings.get(previous.recording.url) ?? {
          url: previous.recording.url,
          ...(previous.recording.speedWpm !== undefined
            ? { speedWpm: previous.recording.speedWpm }
            : {}),
          seconds: 0,
        };
        this.recordings.set(item.url, { ...item, seconds: item.seconds + credit });
        this.coverage.hear(previous.recording, credit, previous.rate);
      }
    }
    this.media = { ...previous, position, at: now, rate };
  }

  suspendMedia() {
    this.media = undefined;
  }

  private updateRecording(source: RecordingSource, refineDuration: boolean) {
    if (refineDuration) this.coverage.refineDuration(source);
    else this.coverage.observe(source);
  }

  observeRecording(source: RecordingSource) {
    this.updateRecording(source, false);
  }

  refineRecordingDuration(source: RecordingSource) {
    this.updateRecording(source, true);
  }

  finalizeRecording(source: RecordingSource, ended: boolean) {
    return this.coverage.finalize(source, ended);
  }

  discardRecording(source?: RecordingSource) {
    this.coverage.discard(source);
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
    this.wordListeningSeconds = 0;
    this.recallInterruption = undefined;
    this.manual = undefined;
    this.media = undefined;
    this.recordings.clear();
    this.coverage.reset();
  }
}
