import { describe, expect, it } from 'vitest';
import catalog from './recording-catalog.json';
import {
  eligibleRecordingVariants,
  loadRecordingSpeedPreference,
  recordingVariants,
  saveRecordingSpeedPreference,
  selectRecordingVariant,
} from './recording-variants';

const words = 'https://cwa.cwops.org/wp-content/uploads/WD101_10.mp3';
const longQso = 'https://cwops.org/wp-content/uploads/2022/07/qso203_13.mp3';
const shortQso = 'https://cwa.cwops.org/wp-content/uploads/QSO_203_13.mp3';

describe('official recording choices', () => {
  it('keeps the entire published catalog well-formed with unambiguous groups and speeds', () => {
    const urls = new Set<string>();
    const groups = new Set<string>();
    for (const group of catalog.groups) {
      expect(groups.has(group.id)).toBe(false);
      groups.add(group.id);
      const speeds = group.variants.map((variant) => variant.speedWpm);
      expect(speeds).toEqual([...new Set(speeds)].sort((a, b) => a - b));
      for (const variant of group.variants) {
        const url = new URL(variant.url);
        expect(url.protocol).toBe('https:');
        expect(['cwops.org', 'cwa.cwops.org']).toContain(url.hostname);
        expect(`${url.username}${url.password}${url.search}${url.hash}`).toBe('');
        expect(url.pathname).toMatch(/\.mp3$/i);
        expect(urls.has(variant.url)).toBe(false);
        urls.add(variant.url);
        expect([10, 13, 15, 18, 20, 25, 30]).toContain(variant.speedWpm);
        expect(variant.durationSeconds).toBeGreaterThan(0);
        expect(variant.durationSeconds).toBeLessThan(3600);
        expect(Object.keys(variant).sort()).toEqual([
          'durationSeconds',
          'speedWpm',
          'title',
          'url',
        ]);
      }
    }
    expect(groups.has('long-qso-qso203')).toBe(true);
    expect(groups.has('short-qso-qso203')).toBe(true);
  });

  it('anchors to exact URLs and keeps short and long contacts separate', () => {
    const long = recordingVariants(longQso);
    const short = recordingVariants(shortQso);
    expect(long.map((variant) => variant.speedWpm)).toEqual([10, 13, 15, 18, 20, 25]);
    expect(long.some((variant) => short.some((item) => item.url === variant.url))).toBe(false);
    expect(recordingVariants(`${longQso}?speed=25`)).toEqual([]);
    expect(recordingVariants('https://example.com/qso203_13.mp3')).toEqual([]);
    expect(recordingVariants(undefined)).toEqual([]);
    long[0].url = 'changed';
    expect(recordingVariants(longQso)[0].url).not.toBe('changed');
  });

  it('selects only prescribed-or-faster recordings and never wraps the fastest speed', () => {
    expect(selectRecordingVariant(words, 10, 'assigned')?.url).toBe(words);
    expect(selectRecordingVariant(words, 10, 'next')?.speedWpm).toBe(13);
    expect(selectRecordingVariant(words, 10, 'next', 25)?.speedWpm).toBe(25);
    expect(eligibleRecordingVariants(longQso, 13).map((item) => item.speedWpm)).toEqual([
      13, 15, 18, 20, 25,
    ]);
    expect(selectRecordingVariant(longQso, 13, 'assigned', 10)?.url).toBe(longQso);
    expect(selectRecordingVariant(longQso, 13, 'assigned', 14)?.url).toBe(longQso);
    const fastest = recordingVariants(words).at(-1)!;
    expect(selectRecordingVariant(fastest.url, 25, 'next')?.url).toBe(fastest.url);
    const single = 'https://cwops.org/wp-content/uploads/2020/06/CWT-201-20.mp3';
    expect(selectRecordingVariant(single, 20, 'next')?.url).toBe(single);
    for (const speed of [undefined, NaN, Infinity, 0, -10]) {
      expect(eligibleRecordingVariants(words, speed)).toEqual([]);
      expect(selectRecordingVariant(words, speed, 'next')?.url).toBe(words);
    }
  });

  it('maps only the six verified superseded QSO207 recordings to the current same-speed files', () => {
    for (const speed of [10, 13, 15, 18, 20, 25]) {
      const original = `https://cwops.org/wp-content/uploads/2022/07/qso207_${speed}.mp3`;
      const selected = selectRecordingVariant(original, speed, 'assigned');
      expect(selected?.url).toBe(
        `https://cwops.org/wp-content/uploads/2026/09/qso207_${speed}.mp3`,
      );
      expect(selected?.speedWpm).toBe(speed);
      expect(selected?.durationSeconds).toBeGreaterThan(0);
    }
    expect(recordingVariants('https://cwops.org/wp-content/uploads/2022/07/qso207_12.mp3')).toEqual(
      [],
    );
    expect(
      selectRecordingVariant(
        'https://cwops.org/wp-content/uploads/2022/07/qso207_13.mp3',
        13,
        'next',
      )?.speedWpm,
    ).toBe(15);
  });

  it('persists a device default and tolerates unavailable or malformed storage', () => {
    let stored: string | null = null;
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };
    expect(loadRecordingSpeedPreference(storage)).toBe('assigned');
    expect(saveRecordingSpeedPreference('next', storage)).toBe(true);
    expect(loadRecordingSpeedPreference(storage)).toBe('next');
    stored = '{"unexpected":"private data"}';
    expect(loadRecordingSpeedPreference(storage)).toBe('assigned');
    const blocked = {
      getItem: () => {
        throw new Error('Blocked');
      },
      setItem: () => {
        throw new Error('Blocked');
      },
    };
    expect(loadRecordingSpeedPreference(blocked)).toBe('assigned');
    expect(saveRecordingSpeedPreference('next', blocked)).toBe(false);
  });
});
