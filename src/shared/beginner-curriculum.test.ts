import { describe, expect, it } from 'vitest';
import { curriculumPlan, sessionSyllabusUrl } from './curriculum';
import { DEFAULT_PROFILE, type Profile } from './training';

const profile: Profile = {
  ...DEFAULT_PROFILE,
  level: 'beginner',
  firstClassDate: '2026-09-07',
  classDays: [1, 4],
};

describe('published Beginner curriculum', () => {
  it('changes the introductory speeds when the QSO sessions begin', () => {
    const tasks = curriculumPlan(profile);
    const introductory = tasks.filter((task) => task.lesson! <= 10);
    expect(introductory.filter((task) => task.kind === 'listening')).toHaveLength(30);
    expect(introductory.filter((task) => task.kind === 'sending')).toHaveLength(30);
    for (const task of introductory)
      expect(task.notes).toContain(
        task.kind === 'listening'
          ? '18 character / 6 effective WPM'
          : '15 character / 6 effective WPM',
      );

    const qso = tasks.filter(
      (task) => task.lesson! >= 11 && task.lesson! <= 13 && task.kind !== 'icr',
    );
    expect(qso).toHaveLength(18);
    for (const task of qso) {
      expect(task.notes).toContain('25 character / at least 6 effective WPM');
      expect(task.notes).toMatch(/(?:clear|no) extra gaps/);
      expect(task.exercise).toEqual({
        type: 'external',
        url: 'https://morsecode.world/international/trainer/trainer.html',
      });
      expect(task.curriculum?.sourceUrl).toBe(sessionSyllabusUrl('beginner', task.lesson!));
    }
  });

  it('keeps spoken recognition distinct from typed copy and manual completion', () => {
    const icr = curriculumPlan(profile).filter((task) => task.kind === 'icr');
    expect(icr).toHaveLength(9);
    expect(new Set(icr.map((task) => task.lesson))).toEqual(new Set([11, 12, 13]));
    for (const task of icr) {
      expect(task.exercise).toEqual({
        type: 'external',
        url: 'https://morsecode.world/international/trainer/character.html',
      });
      expect(task.notes).toContain('CW Academy sessions 1–10 and Letters with Speech After');
      expect(task.notes).toContain('75%');
      expect(task.notes).toContain('1–2 WPM');
      expect(task.done).toBe(false);
      expect(task.targetMinutes).toBeUndefined();
    }
  });

  it('retains distinct station, callsign listening, and full exchange work in the final sessions', () => {
    const tasks = curriculumPlan(profile);
    for (const day of [1, 2, 3]) {
      const at = (session: number, number: number) =>
        tasks.find(
          (task) => task.id === `curriculum:cwa-beginner-v4.8:s${session}-d${day}-t${number}`,
        )!;
      expect(at(14, 2)).toMatchObject({ kind: 'sending', title: 'Send your station introduction' });
      expect(at(15, 2)).toMatchObject({ kind: 'listening', title: 'Recognize your own callsign' });
      expect(at(16, 2)).toMatchObject({
        kind: 'sending',
        title: 'Send complete contact exchanges',
      });
      expect(at(16, 2).notes).toContain('opening, follow-up, and closing exchanges');
      for (const session of [14, 15, 16]) {
        expect(at(session, 1).kind).toBe('on-air');
        expect(at(session, 2).exercise).toEqual({
          type: 'external',
          url: sessionSyllabusUrl('beginner', session),
        });
        expect(at(session, 2).curriculum?.sourceUrl).toBe(sessionSyllabusUrl('beginner', session));
      }
    }
  });
});
