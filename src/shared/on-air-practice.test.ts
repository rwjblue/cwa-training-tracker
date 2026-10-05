import { describe, expect, it } from 'vitest';
import { ON_AIR_CATEGORIES, onAirCategoryLabel } from './on-air-practice';
import {
  DEFAULT_PROFILE,
  validatePracticeSession,
  validateTrainingExport,
  type PracticeSession,
} from './training';
import { weeklyReport } from './plan';

const base: PracticeSession = {
  id: 'on-air-category',
  date: '2026-10-02',
  kind: 'on-air',
  source: 'manual',
  minutes: 5,
  notes: 'Synthetic on-air practice',
  createdAt: '2026-10-02T13:00:00Z',
};

describe('on-air activity categories', () => {
  it.each(ON_AIR_CATEGORIES)(
    'retains explicit $id categories in backup and readable reports',
    ({ id, label }) => {
      const saved = validatePracticeSession({
        ...base,
        metadata: { onAirCategory: id, scratchpad: 'Retained private note' },
      });
      const restored = validateTrainingExport({
        format: 'cwa-training-tracker',
        version: 1,
        exportedAt: base.createdAt,
        sessions: [saved],
      });
      expect(restored.sessions).toEqual([saved]);
      expect(saved.metadata?.onAirCategory).toBe(id);
      expect(onAirCategoryLabel(id)).toBe(label);
      expect(weeklyReport([saved], DEFAULT_PROFILE, base.date, base.date)).toContain(
        `5 min · on-air · ${label}`,
      );
    },
  );

  it('leaves older uncategorized records unchanged without inferring categories from notes', () => {
    const saved = validatePracticeSession({
      ...base,
      notes: 'POTA, SOTA and CWT mentioned in notes',
    });
    expect(saved.metadata?.onAirCategory).toBeUndefined();
    expect(onAirCategoryLabel(undefined)).toBeUndefined();
  });

  it.each(['', 'POTA', 'ragchew', 'unknown', null, 0, true, [], {}])(
    'rejects malformed category %j',
    (onAirCategory) => {
      expect(() => validatePracticeSession({ ...base, metadata: { onAirCategory } })).toThrow(
        'valid on-air category',
      );
    },
  );

  it.each([
    { kind: 'listening' },
    { kind: 'simulator' },
    { source: 'morse' },
    { metadata: { practiceTool: 'audio' } },
    { metadata: { practiceTool: 'copy' } },
    { metadata: { legacyTask: { id: 'other:morse-runner', kind: 'simulator' } } },
  ])('rejects categories on unrelated or synthetic practice %j', (extra) => {
    expect(() =>
      validatePracticeSession({
        ...base,
        ...extra,
        metadata: { ...extra.metadata, onAirCategory: 'pota' },
      }),
    ).toThrow('On-air categories require on-air practice');
  });

  it('allows an ordinary measured on-air timer without manufacturing contact counts', () => {
    const saved = validatePracticeSession({
      ...base,
      source: 'timer',
      metadata: { practiceTool: 'manual', elapsedSeconds: 300, onAirCategory: 'qso' },
    });
    expect(saved.metadata?.onAirCategory).toBe('qso');
    expect(saved.metadata?.evidence).toMatchObject({
      type: 'timed',
      measurement: { seconds: 300 },
    });
    expect(saved.qsoCount).toBeUndefined();
  });
});
