import type { Page } from '@playwright/test';

/** Observe generated recordings without changing native playback or its clock. */
export async function observeMorsePcm(page: Page) {
  await page.addInitScript(() => {
    const create = URL.createObjectURL;
    const blobs = new Map<string, Blob>();
    Reflect.set(window, 'emittedMorsePcmBlobs', blobs);
    URL.createObjectURL = function (blob) {
      const url = create.call(this, blob);
      if (blob instanceof Blob) blobs.set(url, blob);
      return url;
    };
  });
}

/** Measure all emitted Morse pitches from the recording's PCM samples. */
export async function morsePcmBands(page: Page) {
  return page
    .getByLabel('Practice audio', { exact: true })
    .evaluate(async (element: HTMLAudioElement) => {
      const blobs = Reflect.get(window, 'emittedMorsePcmBlobs') as Map<string, Blob>;
      const data = new DataView(await blobs.get(element.src)!.arrayBuffer());
      const rate = data.getUint32(24, true);
      const frames = (data.byteLength - 44) / 2;
      const sample = (index: number) => data.getInt16(44 + index * 2, true);
      const measured = new Set<number>();
      let beginning = -1;
      let silence = 0;
      const measure = (end: number) => {
        const crossings: number[] = [];
        for (let index = beginning + Math.ceil(rate * 0.005); index < end - rate * 0.005; index++) {
          const before = sample(index - 1),
            value = sample(index);
          if (before <= 0 && value > 0) crossings.push(index - 1 - before / (value - before));
        }
        if (crossings.length > 5)
          measured.add(
            Math.round(((crossings.length - 1) * rate) / (crossings.at(-1)! - crossings[0])),
          );
      };
      for (let index = 0; index < frames; index++) {
        if (Math.abs(sample(index)) > 1) {
          if (beginning < 0) beginning = index;
          silence = 0;
        } else if (beginning >= 0 && ++silence > rate * 0.008) {
          measure(index - silence + 1);
          beginning = -1;
        }
      }
      if (beginning >= 0) measure(frames);
      return { rate, bands: [...measured].sort((a, b) => a - b) };
    });
}
