import { describe, expect, it } from 'vitest';
import {
  validateAdvisorReportAnswers,
  validateAdvisorReportDefinition,
  starterAdvisorReportDefinition,
  type AdvisorReportField,
} from './report-definition';
const numeric: AdvisorReportField = {
  key: 'points',
  label: 'Verified points',
  section: 'Practice',
  type: 'number',
  source: 'manual',
  required: false,
  min: 0,
  max: 100,
  integer: true,
};
const rating: AdvisorReportField = {
  key: 'rating',
  label: 'My rating',
  section: 'Practice',
  type: 'rating',
  source: 'manual',
  required: false,
  options: ['Very Good', 'Good', 'Fair', 'Poor'],
};
const definition = {
  version: 1 as const,
  title: 'My report',
  fields: [
    numeric,
    rating,
    {
      ...numeric,
      key: 'date',
      label: 'Practice date',
      type: 'date' as const,
      min: undefined,
      max: undefined,
      integer: undefined,
    },
  ],
};
describe('private report field schema and literal answer rules', () => {
  it('starts with neutral learner context and no external destination or owner identity', () => {
    const starter = validateAdvisorReportDefinition(starterAdvisorReportDefinition());
    expect(starter).not.toHaveProperty('formUrl');
    expect(starter.fields.every((field) => field.externalId === undefined)).toBe(true);
    expect(JSON.stringify(starter)).not.toMatch(/N1RWJ|Robert|google\.com/);
  });
  it('retains exact options, zero limits, source mappings and owner-entered HTTPS destination', () => {
    const input = {
      ...definition,
      formUrl: 'https://forms.example.test/custom?course=synthetic#review',
      fields: definition.fields.map((field, index) => ({
        ...field,
        externalId: `entry.${index + 1}`,
      })),
    };
    expect(validateAdvisorReportDefinition(input)).toEqual(input);
  });
  it.each([
    { accountId: 'other' },
    { title: '' },
    { fields: [] },
    { version: 2 },
    { fields: [numeric, numeric] },
    { fields: [{ ...numeric, key: 'constructor' }] },
    { fields: [{ ...numeric, key: '__proto__' }] },
    { fields: [{ ...numeric, source: 'otherAccount' }] },
    { fields: [{ ...numeric, source: 'callsign' }] },
    { fields: [{ ...rating, options: ['Good', 'Good'] }] },
    { fields: [{ ...rating, options: ['Good', ''] }] },
    { fields: [{ ...numeric, options: ['Good', 'Poor'] }] },
    { fields: [{ ...numeric, min: 4, max: 3 }] },
    { fields: [{ ...numeric, min: 0.1, max: 0.9 }] },
    { fields: [{ ...numeric, min: 1, max: 1, minExclusive: 1 }] },
    { fields: [{ ...numeric, min: NaN }] },
    { fields: [{ ...numeric, max: Infinity }] },
    { fields: [{ ...numeric, userId: 'other' }] },
    {
      fields: [
        { ...numeric, externalId: 'entry.1' },
        { ...rating, externalId: 'entry.1' },
      ],
    },
    { fields: [{ ...numeric, externalId: 'entry.1&answer=secret' }] },
    ...[
      'http://forms.example.test',
      'javascript:alert(1)',
      'https://user:password@forms.example.test',
      '/relative',
    ].map((formUrl) => ({ formUrl })),
  ])('rejects an invalid complete definition atomically (%j)', (changes) => {
    expect(() => validateAdvisorReportDefinition({ ...definition, ...changes })).toThrow();
  });
  it.each([{ minExclusive: Number.MAX_SAFE_INTEGER }, { maxExclusive: Number.MIN_SAFE_INTEGER }])(
    'rejects one-sided whole-number limits with no safe answer: %j',
    (limits) => {
      expect(() =>
        validateAdvisorReportDefinition({
          ...definition,
          fields: [{ ...numeric, min: undefined, max: undefined, required: true, ...limits }],
        }),
      ).toThrow('at least one whole number');
    },
  );
  it.each([
    [{ minExclusive: Number.MAX_SAFE_INTEGER - 1 }, String(Number.MAX_SAFE_INTEGER)],
    [{ maxExclusive: Number.MIN_SAFE_INTEGER + 1 }, String(Number.MIN_SAFE_INTEGER)],
  ] as const)('accepts the adjacent feasible safe-integer edge: %j', (limits, answer) => {
    const edge = validateAdvisorReportDefinition({
      ...definition,
      fields: [{ ...numeric, min: undefined, max: undefined, required: true, ...limits }],
    });
    expect(validateAdvisorReportAnswers(edge, { points: answer })).toEqual([]);
  });
  it('bounds encoded bytes, not only field count or JavaScript string length', () => {
    expect(() =>
      validateAdvisorReportDefinition({
        ...definition,
        fields: Array.from({ length: 60 }, (_, index) => ({
          ...numeric,
          key: `field${index}`,
          label: '🟢'.repeat(80),
          section: '🟢'.repeat(40),
        })),
      }),
    ).toThrow('32,000 bytes');
  });
  it('keeps optional blanks blank and numeric zero valid; choices remain case sensitive', () => {
    expect(validateAdvisorReportAnswers(definition, { points: '', rating: '', date: '' })).toEqual(
      [],
    );
    expect(
      validateAdvisorReportAnswers(definition, {
        points: '0',
        rating: 'Very Good',
        date: '2028-02-29',
      }),
    ).toEqual([]);
    expect(validateAdvisorReportAnswers(definition, { rating: 'Very good' })[0].key).toBe('rating');
    expect(validateAdvisorReportAnswers(definition, { rating: ' Very Good ' })[0].key).toBe(
      'rating',
    );
  });
  it.each(['0%', '10 WPM', 'NaN', 'Infinity', '1e2', '-1', '101', '1.5'])(
    'rejects invalid numeric prose or bounds: %s',
    (points) => {
      expect(validateAdvisorReportAnswers(definition, { points })[0].key).toBe('points');
    },
  );
  it.each(['2026-02-29', '2028-02-30', '2026-13-01', '10/03/2026'])(
    'rejects impossible or noncanonical dates: %s',
    (date) => {
      expect(validateAdvisorReportAnswers(definition, { date })[0].key).toBe('date');
    },
  );
  it('applies exclusive bounds and complete versus partial required validation', () => {
    const rules = {
      ...definition,
      fields: [
        {
          ...numeric,
          required: true,
          min: undefined,
          max: undefined,
          integer: false,
          minExclusive: 10,
          maxExclusive: 20,
        },
      ],
    };
    expect(validateAdvisorReportAnswers(rules, {})).toHaveLength(1);
    expect(validateAdvisorReportAnswers(rules, {}, false)).toEqual([]);
    for (const points of ['10', '20'])
      expect(validateAdvisorReportAnswers(rules, { points })).toHaveLength(1);
    expect(validateAdvisorReportAnswers(rules, { points: '10.01' })).toEqual([]);
  });
});
