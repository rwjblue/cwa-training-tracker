import { describe, expect, it } from 'vitest';
import {
  lcwoRunDetails,
  lcwoSourceId,
  lcwoSourceTimestamp,
  mergeLcwoIdentity,
  mergeLcwoRuns,
  validateLcwoBackup,
  validateLcwoIdentity,
  validateLcwoRun,
  type LcwoSourceType,
} from './lcwo';

function raw(type: LcwoSourceType = 'groups', extra: Record<string, unknown> = {}) {
  return {
    version: 1,
    source: 'lcwo-export',
    id: `${type}:7:12`,
    sourceType: type,
    kind: type === 'groups' ? 'letters' : type === 'callsigns' ? 'callsign' : type,
    sourceUserId: '7',
    sourceResultId: '12',
    sourceTime: '2026-09-30 00:00:15',
    recordedAt: '2026-09-30T00:00:15.000Z',
    ...extra,
  };
}
describe('LCWO source facts and inactive portable linking', () => {
  it.each(['words', 'callsigns', 'groups', 'koch'] as const)(
    'retains exact %s facts, zero and unknown fields',
    (type) => {
      const metrics =
        type === 'words' || type === 'callsigns'
          ? { maximumWpm: 0, score: 0, competitive: false }
          : {
              characterWpm: 0,
              effectiveWpm: 0,
              accuracyPercent: 0,
              ...(type === 'koch' ? { lesson: 0 } : { competitive: false }),
            };
      const measured = validateLcwoRun(raw(type, metrics));
      const unknown = validateLcwoRun(raw(type));
      expect(measured).toMatchObject(metrics);
      expect(lcwoRunDetails(measured).join('\n')).not.toContain('NaN');
      expect(lcwoRunDetails(unknown).join('\n')).toContain('unknown (not recorded)');
      expect(lcwoRunDetails(measured).join('\n')).toContain('separate from native Copy');
      expect(measured.recordedAt).toBe('2026-09-30T00:00:15.000Z');
      if (type === 'groups' || type === 'koch')
        expect(lcwoRunDetails(measured).join('\n')).toContain(
          'Stored accuracy (%) — not displayed errors: 0',
        );
    },
  );
  it.each([
    { version: 2 },
    { source: 'manual' },
    { kind: 'words' },
    { sourceType: 'plaintext' },
    { id: 'groups:8:12' },
    { sourceUserId: '0' },
    { sourceResultId: '012' },
    { recordedAt: '2026-09-30T00:00:16.000Z' },
    { sourceTime: '2026-02-30 00:00:00' },
    { sourceTime: '2026-09-30T00:00:15Z' },
    { recordedAt: '2026-09-30T00:00:15+00:00' },
    { maximumWpm: 20 },
    { score: 0 },
    { lesson: 1 },
    { accuracyPercent: 100.01 },
    { effectiveWpm: -1 },
    { characterWpm: Infinity },
    { accuracyPercent: NaN },
    { accuracyPercent: null },
    { competitive: 0 },
    { password: 'synthetic-not-a-secret' },
  ])('rejects source contradiction %j', (patch) => {
    expect(() => validateLcwoRun(raw('groups', patch))).toThrow();
  });
  it.each([0, -1, NaN, Infinity, 1.5, '0', '001', '1e3', '', null, {}])(
    'rejects ambiguous account/result ID %j',
    (id) => {
      expect(() => lcwoSourceId(id)).toThrow();
    },
  );
  it('preserves large SQL IDs as strings and current UTC retrieval of older timestamps', () => {
    expect(lcwoSourceId('9223372036854775807')).toBe('9223372036854775807');
    expect(lcwoSourceTimestamp('2019-10-27 01:30:00')).toBe('2019-10-27T01:30:00.000Z');
    expect(() => lcwoSourceTimestamp('0000-00-00 00:00:00')).toThrow();
  });
  it('establishes a UID only from rows and preserves it through later empty exports', () => {
    const empty = validateLcwoIdentity({ username: 'Student7' });
    expect(empty).not.toHaveProperty('sourceUserId');
    const known = mergeLcwoIdentity(empty, { username: 'Student7', sourceUserId: '7' });
    expect(known.sourceUserId).toBe('7');
    expect(mergeLcwoIdentity(known, { username: 'student7' })).toEqual({
      username: 'student7',
      sourceUserId: '7',
    });
    expect(() => mergeLcwoIdentity(known, { username: 'Student8', sourceUserId: '8' })).toThrow(
      'separate Companion account',
    );
    expect(() => mergeLcwoIdentity(known, { username: 'Student7', sourceUserId: '8' })).toThrow(
      'different LCWO identity',
    );
  });
  it('deduplicates identical facts and retains missing upstream rows while rejecting conflicts', () => {
    const old = validateLcwoRun(raw());
    expect(mergeLcwoRuns([old], [])).toEqual([old]);
    expect(mergeLcwoRuns([old], [old])).toEqual([old]);
    expect(() =>
      mergeLcwoRuns([old], [validateLcwoRun(raw('groups', { accuracyPercent: 95 }))]),
    ).toThrow('Conflicting LCWO measurements');
  });
  it('portable preferences/results stay explicitly disconnected and secret-free', () => {
    const run = validateLcwoRun(raw('words', { maximumWpm: 35, score: 0 }));
    const file = {
      version: 1,
      identity: { username: 'Student7', sourceUserId: '7' },
      estimateSeconds: 60,
      connected: false,
      syncedAt: '2026-09-30T00:02:00.125Z',
      skippedMixed: 0,
      runs: [run],
    };
    expect(validateLcwoBackup(file)).toEqual(file);
    for (const patch of [
      { connected: true },
      { password: 'synthetic' },
      { cookie: 'synthetic' },
      { runs: [run, run] },
      { estimateSeconds: 301 },
      { estimateSeconds: -1 },
      { estimateSeconds: 0.5 },
      { syncedAt: '2026-02-30T00:00:00.000Z' },
      { identity: { username: 'Student7', sourceUserId: '8' } },
      { identity: { username: 'Student7' } },
    ])
      expect(() => validateLcwoBackup({ ...file, ...patch })).toThrow();
    expect(validateLcwoBackup({ ...file, estimateSeconds: 0 }).estimateSeconds).toBe(0);
    expect(
      validateLcwoBackup({ ...file, identity: { username: 'Student7' }, runs: [] }).runs,
    ).toEqual([]);
  });
});
