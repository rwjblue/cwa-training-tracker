import type { Locator, Page } from '@playwright/test';

/** Observe native movement without supplying media events, time or played ranges. */
export async function observeNativeMovement(media: Locator) {
  await media.evaluate((audio: HTMLAudioElement) => {
    const time = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime')!;
    let anchor: { source: string; at: number } | undefined;
    let seconds = 0;
    const intervals: { source: string; from: number; to: number }[] = [];
    const settle = () => {
      const at = time.get!.call(audio) as number;
      if (anchor && anchor.source === audio.src && at > anchor.at) {
        seconds += (at - anchor.at) / audio.playbackRate;
        intervals.push({ source: anchor.source, from: anchor.at, to: at });
      }
      anchor = undefined;
    };
    // Settle the old native position before a UI seek assigns its destination.
    Object.defineProperty(audio, 'currentTime', {
      configurable: true,
      get: () => time.get!.call(audio),
      set: (at: number) => {
        settle();
        time.set!.call(audio, at);
      },
    });
    for (const type of ['pause', 'ended', 'waiting', 'emptied', 'seeking'])
      audio.addEventListener(type, settle, { capture: true });
    for (const type of ['playing', 'seeked'])
      audio.addEventListener(
        type,
        () => {
          settle();
          if (!audio.paused && !audio.seeking && audio.readyState >= 3)
            anchor = { source: audio.src, at: time.get!.call(audio) as number };
        },
        { capture: true },
      );
    Reflect.set(window, 'readNativeMovement', () => ({ seconds, intervals }));
  });
}

export function readNativeMovement(page: Page) {
  return page.evaluate(() =>
    (
      Reflect.get(window, 'readNativeMovement') as () => {
        seconds: number;
        intervals: { source: string; from: number; to: number }[];
      }
    )(),
  );
}
