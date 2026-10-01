export interface RecordingTime {
  url: string;
  speedWpm?: number;
  seconds: number;
}

export type RecallInterruption = 'hidden' | 'delayed' | 'invalid';

export interface PracticeClockSnapshot {
  seconds: number;
  recallSeconds: number;
  running: boolean;
  recalling: boolean;
  recordings: RecordingTime[];
  recallInterruption?: RecallInterruption;
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
    recording?: Omit<RecordingTime, 'seconds'>;
  };
  private recordings = new Map<string, RecordingTime>();

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
      recordings: [...this.recordings.values()].map((recording) => ({ ...recording })),
      recallInterruption: this.recallInterruption,
    };
  }

  startManual(now: number, recall = false, visible = true) {
    const sameMode = this.manual?.recall === recall;
    const interruption = this.settleManual(now, visible);
    // A redundant Start must observe a stall, not silently resume after it.
    if (sameMode) return;
    this.manual = undefined;
    this.media = undefined;
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
    recording?: Omit<RecordingTime, 'seconds'>,
    visible = true,
  ) {
    const interruption = this.pause(now, visible);
    if (
      interruption === 'invalid' ||
      !Number.isFinite(position) ||
      position < 0 ||
      !Number.isFinite(now) ||
      !Number.isFinite(rate) ||
      rate <= 0
    )
      return;
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
      if (previous.recording && credit > 0) {
        const item = this.recordings.get(previous.recording.url) ?? {
          ...previous.recording,
          seconds: 0,
        };
        this.recordings.set(item.url, { ...item, seconds: item.seconds + credit });
      }
    }
    this.media = { ...previous, position, at: now, rate };
  }

  suspendMedia() {
    this.media = undefined;
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
    this.media = undefined;
    return interruption;
  }

  reset() {
    this.seconds = 0;
    this.recallSeconds = 0;
    this.recallInterruption = undefined;
    this.manual = undefined;
    this.media = undefined;
    this.recordings.clear();
  }
}
