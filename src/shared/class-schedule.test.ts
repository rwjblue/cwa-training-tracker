import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROFILE,
  courseMeetings,
  validateProfile,
  validateTrainingExport,
  type Profile,
} from './training';
import { applyAccountChange, validateAccountChange } from './account-sync';
import {
  classMeetingStatus,
  classTimestamp,
  timedClassMeetings,
  validateClassJoinUrl,
  validateClassSchedule,
  type ClassSchedule,
} from './class-schedule';

const profile: Profile = {
  ...DEFAULT_PROFILE,
  firstClassDate: '2026-10-29',
  classDays: [1, 4],
  timezone: 'America/New_York',
};
const schedule: ClassSchedule = {
  version: 1,
  timezone: 'America/New_York',
  ordinary: { startTime: '19:00', endTime: '20:00', endsNextDay: false },
  exceptions: [],
  joinUrl: 'https://meeting.example.test/j/123?pwd=synthetic-access&token=keep&x=1#join',
};
describe('private native class schedule', () => {
  it('does not reinterpret accepted early calendar years as twentieth-century dates', () => {
    for (const year of ['0000', '0001', '0099'])
      expect(classTimestamp(`${year}-01-01`, '12:00', 'UTC')).toBe(`${year}-01-01T12:00:00.000Z`);
  });
  it('retains stable curriculum dates and sessions across DST and individual exceptions', () => {
    const base = courseMeetings(profile);
    const original = timedClassMeetings({ ...profile, classSchedule: schedule });
    expect(original).toHaveLength(16);
    expect(original[0].startsAt).toBe('2026-10-29T23:00:00.000Z');
    expect(original[1].startsAt).toBe('2026-11-03T00:00:00.000Z');
    const changed = validateProfile({
      ...profile,
      classSchedule: {
        ...schedule,
        exceptions: [
          {
            session: 2,
            date: '2026-11-04',
            startTime: '21:30',
            endTime: '22:30',
            endsNextDay: false,
          },
        ],
      },
    });
    expect(courseMeetings(changed)).toEqual(base);
    const moved = timedClassMeetings(changed);
    expect(moved.find((item) => item.session === 2)).toMatchObject({
      curriculumDate: '2026-11-02',
      date: '2026-11-04',
      startsAt: '2026-11-05T02:30:00.000Z',
      exception: true,
    });
    expect(moved.filter((item) => item.session !== 2)).toEqual(
      original.filter((item) => item.session !== 2),
    );
  });
  it('rejects skipped DST wall times and chooses the earlier repeated occurrence', () => {
    expect(() => classTimestamp('2026-03-08', '02:30', 'America/New_York')).toThrow(
      /does not exist/,
    );
    expect(classTimestamp('2026-11-01', '01:30', 'America/New_York')).toBe(
      '2026-11-01T05:30:00.000Z',
    );
    expect(() => classTimestamp('2026-10-04', '02:15', 'Australia/Lord_Howe')).toThrow(
      /does not exist/,
    );
    expect(classTimestamp('2026-10-04', '02:45', 'Australia/Lord_Howe')).toBe(
      '2026-10-03T15:45:00.000Z',
    );
    expect(() => classTimestamp('2026-12-01', '12:00', '+02:00')).toThrow(/IANA|valid/);
  });
  it('keeps an overnight class active across the learner midnight and respects exact boundaries', () => {
    const overnight = {
      ...profile,
      classSchedule: {
        ...schedule,
        ordinary: { startTime: '23:30', endTime: '00:30', endsNextDay: true },
      },
    };
    const meeting = timedClassMeetings(overnight)[0];
    expect(meeting.endsAt).toBe('2026-10-30T04:30:00.000Z');
    expect(classMeetingStatus(overnight, new Date('2026-10-30T03:29:59Z')).active).toBeUndefined();
    expect(classMeetingStatus(overnight, new Date(meeting.startsAt)).active).toEqual(meeting);
    expect(classMeetingStatus(overnight, new Date('2026-10-30T04:10:00Z')).active).toEqual(meeting);
    expect(classMeetingStatus(overnight, new Date(meeting.endsAt))).toMatchObject({
      active: undefined,
      finished: meeting,
    });
    const displayChanged = { ...overnight, timezone: 'Asia/Tokyo' };
    expect(timedClassMeetings(displayChanged)).toEqual(timedClassMeetings(overnight));
    expect(classMeetingStatus(displayChanged, new Date('2026-10-30T04:10Z')).active).toEqual(
      meeting,
    );
  });
  it('supports explicit exception timezones without changing other sessions', () => {
    const result = validateProfile({
      ...profile,
      classSchedule: {
        ...schedule,
        exceptions: [
          {
            session: 3,
            date: '2026-11-05',
            timezone: 'Europe/London',
            startTime: '19:00',
            endTime: '20:00',
            endsNextDay: false,
          },
        ],
      },
    });
    expect(timedClassMeetings(result).find((item) => item.session === 3)?.startsAt).toBe(
      '2026-11-05T19:00:00.000Z',
    );
  });
  it.each([
    { exceptions: [{ session: 17, date: '2026-11-05', ...schedule.ordinary }] },
    { exceptions: [{ session: 1, date: '2026-02-30', ...schedule.ordinary }] },
    {
      exceptions: [1, 1].map((session) => ({ session, date: '2026-11-05', ...schedule.ordinary })),
    },
    { ordinary: { startTime: '20:00', endTime: '19:00', endsNextDay: false } },
    { ordinary: { startTime: '19:00', endTime: '19:00', endsNextDay: false } },
    { ordinary: { startTime: '24:00', endTime: '20:00', endsNextDay: false } },
    { timezone: 'Not/AZone' },
    { version: 2 },
    { unexpected: true },
    { exceptions: [{ session: 2, date: profile.firstClassDate, ...schedule.ordinary }] },
  ])('rejects malformed or conflicting schedule details %j', (patch) => {
    expect(() => validateClassSchedule({ ...schedule, ...patch }, profile)).toThrow();
  });
  it('retains private access parameters and rejects userinfo/nonweb links', () => {
    expect(validateClassJoinUrl(schedule.joinUrl)).toBe(schedule.joinUrl);
    expect(() => validateClassJoinUrl(`https://meeting.example.test/${'語'.repeat(1000)}`)).toThrow(
      /after URL encoding/,
    );
    for (const url of [
      'https://user:password@example.test/j',
      'javascript:alert(1)',
      'file:///join',
      '/relative',
    ])
      expect(() => validateClassJoinUrl(url)).toThrow();
  });
  it('preserves old date-only backups and versioned native private roundtrips', () => {
    const backup = {
      format: 'cwa-training-tracker',
      version: 1,
      exportedAt: '2026-10-01T00:00:00Z',
      profile,
      sessions: [],
    };
    const old = validateTrainingExport(backup);
    expect(old.profile?.classSchedule).toBeUndefined();
    expect(timedClassMeetings(old.profile!)).toEqual([]);
    const native = validateTrainingExport({
      ...backup,
      profile: { ...profile, classSchedule: schedule },
    });
    expect(validateTrainingExport(JSON.parse(JSON.stringify(native)))).toEqual(native);
    expect(native.profile?.classSchedule?.joinUrl).toBe(schedule.joinUrl);
    expect(() =>
      validateTrainingExport({
        ...backup,
        profile: { ...profile, classSchedule: { ...schedule, version: 2 } },
      }),
    ).toThrow(/version/);
  });
  it('validates a partial offline edit against the resulting owned schedule and supports explicit clearing', () => {
    const state = {
      accountId: 'synthetic',
      revision: 0,
      generation: 0,
      settings: profile,
      plan: [],
    };
    const change = validateAccountChange({
      type: 'settings',
      changes: { classSchedule: schedule },
    });
    expect(applyAccountChange(state, change).settings.classSchedule).toEqual(schedule);
    expect(() => applyAccountChange({ ...state, settings: DEFAULT_PROFILE }, change)).toThrow(
      /first class date/,
    );
    const cleared = applyAccountChange(
      { ...state, settings: { ...profile, classSchedule: schedule } },
      validateAccountChange({ type: 'settings', changes: { classSchedule: null } }),
    );
    expect(timedClassMeetings(cleared.settings)).toEqual([]);
    expect(() =>
      validateAccountChange({ type: 'settings', changes: { callsign: null } }),
    ).toThrow();
  });
});
