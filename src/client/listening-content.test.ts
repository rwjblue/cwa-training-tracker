import { describe, it, expect } from 'vitest';
import { wordPracticeRound, WORD_LISTS } from './word-content';
import { generateQso, QSO_CALLSIGNS, QSO_RADIOS, QSO_TEMPLATES } from './qso-content';
import { cleanMorseText } from './audio';

function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

describe('focused listening material', () => {
  it('keeps the complete QSO and common-English catalogs, shuffling without loss or duplicates', () => {
    expect(WORD_LISTS['common-qso'].words).toHaveLength(70);
    expect(wordPracticeRound('common-qso', '', true, () => 0.25)[0]).toBe('VVV');
    expect(WORD_LISTS['common-30'].words).toHaveLength(30);
    for (const id of ['common-qso', 'common-30'] as const) {
      const ordered = wordPracticeRound(id, '', false);
      expect(new Set(ordered).size).toBe(ordered.length);
      expect(wordPracticeRound(id, '', true, () => 0.25).sort()).toEqual([...ordered].sort());
      expect(ordered.every((word) => cleanMorseText(word) === word)).toBe(true);
    }
  });
  it('allows deliberate custom repeats and prosigns but refuses empty or unsendable rounds', () => {
    expect(wordPracticeRound('custom', 'cq cq <AR>', false)).toEqual(['CQ', 'CQ', '<AR>']);
    for (const text of ['', 'HELLO 💡', 'WORD '.repeat(201)])
      expect(() => wordPracticeRound('custom', text, false)).toThrow();
  });
  it('generates complete, replayable conversations between distinct illustrative stations', () => {
    for (const scenario of QSO_TEMPLATES) {
      const qso = generateQso(scenario.id, () => 0.25);
      expect(qso.stations[0]).not.toBe(qso.stations[1]);
      expect(qso.lines[0]).toContain(`DE ${qso.stations[0]}`);
      expect(qso.lines.join(' ')).toContain(qso.stations[1]);
      expect(qso.lines.join(' ')).toContain('73');
      expect(qso.lines.every((line) => cleanMorseText(line) === line)).toBe(true);
      const fresh = generateQso(scenario.id, () => 0.25, qso.stations);
      expect(fresh.stations.some((call) => qso.stations.includes(call))).toBe(false);
    }
    expect(() => generateQso('unknown')).toThrow('scenario');
  });

  it('renders geographically coherent stations with seasonal weather and compatible rig power', () => {
    const statesByDistrict = [
      'CO IA KS MN MO NE ND SD',
      'CT MA ME NH RI VT',
      'NJ NY',
      'DE MD PA',
      'AL FL GA KY NC SC TN VA',
      'AR LA MS NM OK TX',
      'CA',
      'AZ ID MT NV OR UT WA WY',
      'MI OH WV',
      'IL IN WI',
    ];
    const random = seededRandom(73);
    const calls = new Set<string>();
    const seasons = new Set<string>();
    const weather = new Set<string>();
    for (let sample = 0; sample < 160; sample++) {
      const qso = generateQso('ragchew', random);
      seasons.add(qso.season!);
      const names: string[] = [];
      for (let station = 0; station < 2; station++) {
        const call = qso.stations[station];
        calls.add(call);
        const introduction = qso.lines[station + 2];
        names.push(introduction.match(/ NAME ([A-Z]+) \1 QTH /)![1]);
        const qth = introduction.match(/ QTH (.*?) (?:HW\? |[A-Z]+\d)/)![1];
        const state = qth.split(' ').at(-1)!;
        expect(statesByDistrict[Number(call.match(/\d/)![0])].split(' ')).toContain(state);

        const details = qso.lines[station + 4].match(
          / RIG HR ([A-Z0-9]+) PWR (\d+) WATTS ANT .+? WX (SUNNY|CLEAR|CLOUDY|WINDY|RAIN|SNOW) TEMP (\d+) F /,
        )!;
        expect(details).not.toBeNull();
        const [, rig, watts, condition, degrees] = details;
        expect(QSO_RADIOS.find((radio) => radio.rig === rig)?.watts).toContain(Number(watts));
        weather.add(condition);
        const temperature = Number(degrees);
        if (condition === 'SNOW') {
          expect(qso.season).toBe('winter');
          expect(temperature).toBeLessThanOrEqual(32);
        }
        if (condition === 'RAIN') expect(temperature).toBeGreaterThanOrEqual(40);
        if (qso.season === 'summer') expect(temperature).toBeGreaterThanOrEqual(60);
        if (/^(TUCSON|TAMPA|SAN DIEGO) /.test(qth)) {
          expect(temperature).toBeGreaterThanOrEqual(45);
          expect(condition).not.toBe('SNOW');
        }
      }
      expect(names[0]).not.toBe(names[1]);
    }
    expect([...calls].sort()).toEqual([...QSO_CALLSIGNS].sort());
    expect([...seasons].sort()).toEqual(['autumn', 'spring', 'summer', 'winter']);
    expect(weather).toContain('SNOW');
    expect(weather).toContain('RAIN');
  });

  it('produces varied fresh exchanges reproducibly and avoids both previous calls', () => {
    const random = seededRandom(2026);
    const replay = seededRandom(2026);
    const conversations = new Set<string>();
    let previous: readonly string[] = [];
    for (let sample = 0; sample < 60; sample++) {
      const scenario = QSO_TEMPLATES[sample % QSO_TEMPLATES.length].id;
      const qso = generateQso(scenario, random, previous);
      expect(generateQso(scenario, replay, previous)).toEqual(qso);
      expect(qso.stations.some((call) => previous.includes(call))).toBe(false);
      conversations.add(qso.lines.join('\n'));
      previous = qso.stations;
    }
    expect(conversations.size).toBe(60);
  });
});
