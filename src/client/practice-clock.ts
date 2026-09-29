export interface RecordingTime {
  url: string;
  speedWpm?: number;
  seconds: number;
}

/** Count media movement, not a stopwatch left running beside paused audio. */
export class PracticeClock {
  private seconds = 0;
  private recallSeconds = 0;
  private manual?: { at: number; recall: boolean };
  private media?: {
    position: number;
    at: number;
    rate: number;
    recording?: Omit<RecordingTime, 'seconds'>;
  };
  private recordings = new Map<string, RecordingTime>();

  snapshot(now: number) {
    const manual = this.manual ? Math.max(0, now - this.manual.at) / 1000 : 0;
    return {
      seconds: this.seconds + manual,
      recallSeconds: this.recallSeconds + (this.manual?.recall ? manual : 0),
      running: Boolean(this.manual || this.media),
      recalling: this.manual?.recall === true,
      recordings: [...this.recordings.values()].map((recording) => ({ ...recording })),
    };
  }

  startManual(now: number, recall = false) {
    if (this.manual?.recall === recall) return;
    this.pause(now);
    this.manual = { at: now, recall };
  }

  startMedia(position: number, now: number, rate = 1, recording?: Omit<RecordingTime, 'seconds'>) {
    this.pause(now);
    this.media = { position, at: now, rate, recording };
  }

  sample(position: number, now: number, rate = 1) {
    const previous = this.media;
    if (!previous) return;
    const advance = position - previous.position;
    const wall = Math.max(0, now - previous.at) / 1000;
    // A missing/delayed seeking event must not turn a jump into practiced time.
    if (advance >= 0 && advance <= wall * previous.rate + 0.75 && previous.rate > 0) {
      const credit = Math.min(advance / previous.rate, wall + 0.1);
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

  pause(now: number) {
    if (this.manual) {
      const elapsed = Math.max(0, now - this.manual.at) / 1000;
      this.seconds += elapsed;
      if (this.manual.recall) this.recallSeconds += elapsed;
    }
    this.manual = undefined;
    this.media = undefined;
  }

  reset() {
    this.seconds = 0;
    this.recallSeconds = 0;
    this.manual = undefined;
    this.media = undefined;
    this.recordings.clear();
  }
}
