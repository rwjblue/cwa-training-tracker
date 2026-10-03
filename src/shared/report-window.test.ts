import { describe, expect, it } from 'vitest';
import { advisorReportWindow } from './report-window';
import { DEFAULT_PROFILE } from './training';
import { curriculumPlan } from './curriculum';
import type { PlannedTask } from './plan';
const profile = {
  ...DEFAULT_PROFILE,
  level: 'intermediate' as const,
  firstClassDate: '2026-10-01',
  timezone: 'America/New_York',
};
const tasks = curriculumPlan(profile);
const now = new Date('2026-11-10T12:00:00Z');
describe('selected class report preparation windows', () => {
  it('uses real curriculum preparation dates and inclusive early ends', () => {
    const window = advisorReportWindow(profile, tasks, 1, '2026-09-30', now);
    expect(window).toMatchObject({
      preparationDates: ['2026-09-29', '2026-09-30', '2026-10-01'],
      fromDate: '2026-09-29',
      toDate: '2026-09-30',
      empty: false,
      fallback: false,
      timezone: 'America/New_York',
    });
    expect(window.explanation).toContain('Early report');
    expect(advisorReportWindow(profile, tasks, 1, '2026-10-02', now).toDate).toBe('2026-10-01');
  });
  it('never clamps an early report up to a future preparation date', () => {
    const window = advisorReportWindow(profile, tasks, 1, '2026-09-28', now);
    expect(window.empty).toBe(true);
    expect(window.fromDate).toBe('2026-09-29');
    expect(window.toDate).toBe('2026-09-28');
    expect(window.explanation).toContain('no future evidence');
  });
  it('uses a deterministic two-day fallback with and without a class date', () => {
    expect(advisorReportWindow(profile, [], 1, '2026-10-01', now)).toMatchObject({
      fromDate: '2026-09-29',
      toDate: '2026-10-01',
      fallback: true,
    });
    expect(advisorReportWindow(DEFAULT_PROFILE, [], 1, '2026-10-01', now)).toMatchObject({
      fromDate: '2026-09-29',
      toDate: '2026-10-01',
      fallback: true,
    });
    expect(advisorReportWindow(profile, [], 1, '2026-09-28', now).empty).toBe(true);
  });
  it('separates moved overnight/DST classes and their course zone from original homework dates', () => {
    const configured = {
      ...profile,
      timezone: 'Pacific/Auckland',
      classSchedule: {
        version: 1 as const,
        timezone: 'America/New_York',
        exceptions: [
          {
            session: 1,
            date: '2026-11-01',
            startTime: '01:30',
            endTime: '02:30',
            endsNextDay: false,
          },
        ],
      },
    };
    const window = advisorReportWindow(configured, tasks, 1, '2026-10-01', now);
    expect(window).toMatchObject({
      meetingDate: '2026-11-01',
      meetingStartsAt: '2026-11-01T05:30:00.000Z',
      timezone: 'America/New_York',
      fromDate: '2026-09-29',
      toDate: '2026-10-01',
    });
    expect(advisorReportWindow(configured, [], 1, '2026-10-30', now)).toMatchObject({
      fromDate: '2026-10-30',
      toDate: '2026-10-30',
      fallback: true,
    });
  });
  it('uses the course-local current date for future rejection around midnight', () => {
    const midnight = new Date('2026-10-02T02:00:00Z');
    expect(() => advisorReportWindow(profile, tasks, 1, '2026-10-02', midnight)).toThrow('future');
    expect(advisorReportWindow(profile, tasks, 1, '2026-10-01', midnight).toDate).toBe(
      '2026-10-01',
    );
  });
  it('ignores Today pins and other sessions while retaining explicitly dated owned preparation', () => {
    const pinned = tasks.map((task) => ({ ...task, pinnedForDate: '2026-11-10' }));
    const manual: PlannedTask = {
      id: 'own-extra',
      title: 'My preparation',
      kind: 'sending',
      lesson: 1,
      dueDate: '2026-09-28',
      done: false,
      notes: '',
      createdAt: now.toISOString(),
      source: 'manual',
    };
    expect(advisorReportWindow(profile, [...pinned, manual], 1, '2026-09-30', now).fromDate).toBe(
      '2026-09-28',
    );
    expect(advisorReportWindow(profile, pinned, 1, '2026-09-30', now).fromDate).toBe('2026-09-29');
  });
  it.each([0, 17, 1.5])('rejects unknown session identities: %s', (session) => {
    expect(() => advisorReportWindow(profile, tasks, session, '2026-10-01', now)).toThrow();
  });
});
