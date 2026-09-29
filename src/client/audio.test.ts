import { describe, expect, it } from 'vitest';
import { cleanMorseText, generatePractice, PRACTICE_WORDS, WORD_LENGTHS } from './audio';

describe('practice material', () => {
  it('contains only real-word pool entries with their declared exact length', () => {
    for (const length of WORD_LENGTHS) {
      const pool = PRACTICE_WORDS[length];
      expect(pool.length).toBeGreaterThanOrEqual(20);
      expect(new Set(pool).size).toBe(pool.length);
      for (const word of pool) {
        expect(word, `Pool ${length}: ${word}`).toMatch(/^[A-Z]+$/);
        expect(word.length, `Pool ${length}: ${word}`).toBe(length);
      }
    }
    expect(PRACTICE_WORDS[5]).toContain('RADIO');
    expect(PRACTICE_WORDS[8]).toContain('PRACTICE');
  });

  it('honors every available word length without padding or truncating words', () => {
    for (const wordLength of WORD_LENGTHS) {
      const words = generatePractice('words', { count: 50, wordLength }).split(' ');
      expect(words).toHaveLength(50);
      for (const word of words) {
        expect(word.length).toBe(wordLength);
        expect(PRACTICE_WORDS[wordLength]).toContain(word);
      }
    }
  });

  it('honors letter and number group lengths, including one-character and ten-character groups', () => {
    for (const groupLength of [1, 3, 5, 10]) {
      for (const mode of ['groups', 'numbers']) {
        const groups = generatePractice(mode, { groupLength }).split(' ');
        expect(groups).toHaveLength(12);
        for (const group of groups) {
          expect(group.length).toBe(groupLength);
          expect(group).toMatch(mode === 'numbers' ? /^\d+$/ : /^[A-Z]+$/);
        }
      }
    }
  });

  it('generates recognizable fictional callsign examples without a lookup', () => {
    const calls = generatePractice('callsigns', { count: 40 }).split(' ');
    expect(calls).toHaveLength(40);
    for (const call of calls) expect(call).toMatch(/^(K|N|W|VE|G|DL|JA|VK)\d[A-Z]{2,3}$/);
  });

  it('rejects unsupported sizes instead of silently returning unexpected practice', () => {
    expect(() => generatePractice('groups', { groupLength: 0 })).toThrow('group length');
    expect(() => generatePractice('numbers', { groupLength: 2.5 })).toThrow('group length');
    expect(() => generatePractice('words', { wordLength: 10 as never })).toThrow('word length');
    expect(() => generatePractice('words', { count: Infinity })).toThrow('practice items');
    expect(() => generatePractice('custom')).toThrow('content type');
  });

  it('keeps word gaps when text is pasted with mixed whitespace', () => {
    expect(cleanMorseText('cq\tde\n n1rwj')).toBe('CQ DE N1RWJ');
    expect(cleanMorseText('💡 HELLO!')).toBe('HELLO!');
  });
});
