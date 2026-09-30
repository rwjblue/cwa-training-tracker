import { PracticeClock } from './practice-clock';

export const COPY_IDLE_SECONDS = 30;
export interface CopyTimes {
  audioSeconds: number;
  answerSeconds: number;
  reviewSeconds: number;
}

/** Media movement and foreground thinking are separate, non-overlapping intervals. */
export class CopyClock {
  private audio = new PracticeClock();
  private base: CopyTimes;
  private thinking?: { mode: 'answer' | 'review'; start: number; touched: number };

  constructor(base: CopyTimes = { audioSeconds: 0, answerSeconds: 0, reviewSeconds: 0 }) {
    this.base = { ...base };
  }

  private thinkingTime(now: number) {
    if (!this.thinking) return 0;
    const until = Math.min(now, this.thinking.touched + COPY_IDLE_SECONDS * 1000);
    return Math.max(0, until - this.thinking.start) / 1000;
  }

  snapshot(now: number) {
    const thinking = this.thinkingTime(now);
    const idle = Boolean(this.thinking && now >= this.thinking.touched + COPY_IDLE_SECONDS * 1000);
    return {
      audioSeconds: this.base.audioSeconds + this.audio.snapshot(now).seconds,
      answerSeconds: this.base.answerSeconds + (this.thinking?.mode === 'answer' ? thinking : 0),
      reviewSeconds: this.base.reviewSeconds + (this.thinking?.mode === 'review' ? thinking : 0),
      thinking: idle ? undefined : this.thinking?.mode,
      idle,
    };
  }

  pauseThinking(now: number) {
    if (this.thinking) {
      const key = this.thinking.mode === 'answer' ? 'answerSeconds' : 'reviewSeconds';
      this.base[key] += this.thinkingTime(now);
      this.thinking = undefined;
    }
  }

  startThinking(mode: 'answer' | 'review', now: number) {
    this.pauseThinking(now);
    this.audio.suspendMedia();
    this.thinking = { mode, start: now, touched: now };
  }

  touch(now: number) {
    if (!this.thinking) return;
    const mode = this.thinking.mode;
    this.pauseThinking(now);
    this.thinking = { mode, start: now, touched: now };
  }

  startAudio(position: number, now: number, rate = 1) {
    this.pauseThinking(now);
    this.audio.startMedia(position, now, rate);
  }

  sampleAudio(position: number, now: number, rate = 1) {
    this.audio.sample(position, now, rate);
  }

  pauseAudio() {
    this.audio.suspendMedia();
  }

  pause(now: number) {
    this.pauseThinking(now);
    this.audio.suspendMedia();
  }
}
