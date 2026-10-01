import index from '../../public/audio/cw-training/words/index.json';
import { MORSE_SAMPLE_RATE } from './morse-track';

const clips: Record<string, { url: string; sha256: string }> = index.clips;
const samples = new Map<string, Promise<Float32Array>>();

/** Preload immutable clips; no device voices, audio context, or runtime inference. */
export async function loadWordSpeech(words: readonly string[]): Promise<Map<string, Float32Array>> {
  const unique = [...new Set(words)];
  const missing = unique.filter((word) => !clips[word]);
  if (missing.length)
    throw new Error(
      `No prerecorded answer for ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ', …' : ''}. Turn off Three repeats + spoken answer to hear this list in Morse.`,
    );
  const result = new Map<string, Float32Array>();
  for (let at = 0; at < unique.length; at += 4)
    await Promise.all(
      unique.slice(at, at + 4).map(async (word) => {
        const clip = clips[word];
        const url = `${clip.url}?v=${clip.sha256}`;
        if (!samples.has(url))
          samples.set(
            url,
            fetch(url)
              .then(async (response) => {
                if (!response.ok)
                  throw new Error(
                    'Spoken audio could not load. Check your connection and press Play to retry.',
                  );
                return decodeWordWav(await response.arrayBuffer());
              })
              .catch((error) => {
                samples.delete(url);
                throw error;
              }),
          );
        result.set(word, await samples.get(url)!);
      }),
    );
  return result;
}

/** Decode without starting Web Audio, including WAVs with extra metadata chunks. */
export function decodeWordWav(bytes: ArrayBuffer): Float32Array {
  const view = new DataView(bytes);
  const text = (at: number, length: number) =>
    String.fromCharCode(...new Uint8Array(bytes, at, length));
  const invalid = () => new Error('Speech clip must be a 22050 Hz mono 16-bit PCM WAV.');
  if (
    bytes.byteLength < 44 ||
    text(0, 4) !== 'RIFF' ||
    text(8, 4) !== 'WAVE' ||
    view.getUint32(4, true) + 8 !== bytes.byteLength
  )
    throw invalid();
  let validFormat = false;
  let data: { start: number; size: number } | undefined;
  for (let at = 12; at + 8 <= bytes.byteLength;) {
    const size = view.getUint32(at + 4, true);
    const start = at + 8;
    if (start + size > bytes.byteLength) throw invalid();
    if (text(at, 4) === 'fmt ') {
      validFormat =
        size >= 16 &&
        view.getUint16(start, true) === 1 &&
        view.getUint16(start + 2, true) === 1 &&
        view.getUint32(start + 4, true) === MORSE_SAMPLE_RATE &&
        view.getUint16(start + 12, true) === 2 &&
        view.getUint16(start + 14, true) === 16;
    }
    if (text(at, 4) === 'data') data = { start, size };
    at = start + size + (size % 2);
  }
  if (
    !validFormat ||
    !data ||
    !data.size ||
    data.size % 2 ||
    data.size > MORSE_SAMPLE_RATE * 2 * 10
  )
    throw invalid();
  const samples = new Float32Array(data.size / 2);
  for (let i = 0; i < samples.length; i++)
    samples[i] = view.getInt16(data.start + i * 2, true) / 32768;
  return samples;
}
