import { describe, it, expect } from 'vitest';
import { wordPracticeRound, WORD_LISTS } from './word-content';
import { generateQso, QSO_TEMPLATES } from './qso-content';
import { cleanMorseText } from './audio';

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
});
