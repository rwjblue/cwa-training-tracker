import { describe, expect, it } from 'vitest';
import { formatPracticeDuration, practiceMinutesFromInput } from './practice-duration';

describe('practice duration input', () => {
  it('displays measured time as minutes and rounded seconds, including rollover', () => {
    expect(formatPracticeDuration(undefined)).toBe('');
    expect(formatPracticeDuration(0)).toBe('0:00');
    expect(formatPracticeDuration(3.816489795918367)).toBe('3:49');
    expect(formatPracticeDuration(59.6 / 60)).toBe('1:00');
    expect(formatPracticeDuration(3599.6 / 60)).toBe('60:00');
    expect(formatPracticeDuration(1440)).toBe('1440:00');
  });

  it('accepts seconds and convenient plain-minute entries', () => {
    expect(practiceMinutesFromInput('3:49')).toBe(229 / 60);
    expect(practiceMinutesFromInput('15')).toBe(15);
    expect(practiceMinutesFromInput('1.5')).toBe(1.5);
    expect(practiceMinutesFromInput(' .5 ')).toBe(0.5);
    expect(practiceMinutesFromInput('0:00')).toBe(0);
    expect(practiceMinutesFromInput('1440:00')).toBe(1440);
  });

  it('rejects malformed seconds, missing time, and values outside a day', () => {
    for (const input of ['', ' ', '-1', '1:60', '1:99', '1:2', '1:02:03', '1440:01', '1441']) {
      expect(practiceMinutesFromInput(input), input).toBeNull();
    }
  });

  it('preserves exact measured minutes when reviewing or editing other fields', () => {
    const measured = 3.816489795918367;
    expect(practiceMinutesFromInput(formatPracticeDuration(measured), measured)).toBe(measured);
    expect(practiceMinutesFromInput('3:50', measured)).toBe(230 / 60);
  });
});
