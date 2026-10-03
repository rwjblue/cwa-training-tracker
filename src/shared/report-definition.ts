/** Learner-owned schema. No advisor identity, destination or field IDs are defaults. */
export const REPORT_FIELD_TYPES = ['text', 'textarea', 'number', 'rating', 'date'] as const;
export const REPORT_SOURCE_MAPPINGS = [
  { id: 'manual', label: 'Learner answer' },
  { id: 'callsign', label: 'Profile callsign' },
  { id: 'displayName', label: 'Profile name' },
  { id: 'session', label: 'Selected class session' },
  { id: 'reportDate', label: 'Selected report date' },
] as const;
export type ReportSourceMapping = (typeof REPORT_SOURCE_MAPPINGS)[number]['id'];
export interface AdvisorReportField {
  key: string;
  label: string;
  section: string;
  type: (typeof REPORT_FIELD_TYPES)[number];
  required: boolean;
  source: ReportSourceMapping;
  options?: string[];
  min?: number;
  max?: number;
  minExclusive?: number;
  maxExclusive?: number;
  integer?: boolean;
  externalId?: string;
}
export interface AdvisorReportDefinition {
  version: 1;
  title: string;
  fields: AdvisorReportField[];
  formUrl?: string;
}
export const MAX_REPORT_DEFINITION_BYTES = 32_000;
export const MAX_REPORT_FIELDS = 60;

function object(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected report configuration.');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !allowed.includes(key)))
    throw new Error('Unsupported report configuration field.');
  return row;
}
function text(value: unknown, label: string, limit: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > limit ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error(`${label} must contain 1 to ${limit} characters without control characters.`);
  return value;
}
export function validateAdvisorReportDefinition(value: unknown): AdvisorReportDefinition {
  const row = object(value, ['version', 'title', 'fields', 'formUrl']);
  if (row.version !== 1) throw new Error('Unsupported report definition version.');
  if (!Array.isArray(row.fields) || !row.fields.length || row.fields.length > MAX_REPORT_FIELDS)
    throw new Error(`Choose 1 to ${MAX_REPORT_FIELDS} report fields.`);
  const keys = new Set<string>();
  const externalIds = new Set<string>();
  const definition: AdvisorReportDefinition = {
    version: 1,
    title: text(row.title, 'Report title', 120),
    fields: row.fields.map((value, index) => {
      try {
        const field = object(value, [
          'key',
          'label',
          'section',
          'type',
          'required',
          'source',
          'options',
          'min',
          'max',
          'minExclusive',
          'maxExclusive',
          'integer',
          'externalId',
        ]);
        const key = text(field.key, 'Field key', 64);
        if (
          !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key) ||
          ['constructor', 'prototype', '__proto__'].includes(key) ||
          keys.has(key)
        )
          throw new Error('Use distinct field keys made of letters, numbers and underscores.');
        keys.add(key);
        if (
          !REPORT_FIELD_TYPES.includes(field.type as AdvisorReportField['type']) ||
          typeof field.required !== 'boolean'
        )
          throw new Error('Choose a field type and whether an answer is required.');
        if (!REPORT_SOURCE_MAPPINGS.some((mapping) => mapping.id === field.source))
          throw new Error('Choose a supported report source mapping.');
        const result: AdvisorReportField = {
          key,
          label: text(field.label, 'Field label', 160),
          section: text(field.section, 'Section', 80),
          type: field.type as AdvisorReportField['type'],
          required: field.required,
          source: field.source as ReportSourceMapping,
        };
        const expectedType =
          field.source === 'session'
            ? 'number'
            : field.source === 'reportDate'
              ? 'date'
              : field.source !== 'manual'
                ? 'text'
                : undefined;
        if (expectedType && result.type !== expectedType)
          throw new Error(`The ${field.source} mapping requires a ${expectedType} field.`);
        if (result.type === 'rating') {
          if (
            !Array.isArray(field.options) ||
            field.options.length < 2 ||
            field.options.length > 20
          )
            throw new Error('Provide 2 to 20 exact rating choices.');
          result.options = field.options.map((value) => text(value, 'Rating choice', 80));
          if (new Set(result.options).size !== result.options.length)
            throw new Error('Rating choices must be distinct.');
        } else if (field.options !== undefined) throw new Error('Only rating fields have choices.');
        for (const bound of ['min', 'max', 'minExclusive', 'maxExclusive'] as const) {
          if (field[bound] === undefined) continue;
          if (
            result.type !== 'number' ||
            typeof field[bound] !== 'number' ||
            !Number.isFinite(field[bound]) ||
            Math.abs(field[bound]) > Number.MAX_SAFE_INTEGER
          )
            throw new Error('Numeric limits must be finite numbers on a numeric field.');
          result[bound] = field[bound];
        }
        if (field.integer !== undefined) {
          if (result.type !== 'number' || typeof field.integer !== 'boolean')
            throw new Error('Choose whole-number rules only for numeric fields.');
          result.integer = field.integer;
        }
        const low = Math.max(result.min ?? -Infinity, result.minExclusive ?? -Infinity);
        const high = Math.min(result.max ?? Infinity, result.maxExclusive ?? Infinity);
        if (
          low > high ||
          (low === high && (result.minExclusive === low || result.maxExclusive === high))
        )
          throw new Error('Numeric limits must allow at least one answer.');
        if (result.integer && Number.isFinite(low) && Number.isFinite(high)) {
          const first = result.minExclusive === low ? Math.floor(low) + 1 : Math.ceil(low);
          const last = result.maxExclusive === high ? Math.ceil(high) - 1 : Math.floor(high);
          if (first > last) throw new Error('Numeric limits must allow at least one whole number.');
        }
        if (field.externalId !== undefined) {
          result.externalId = text(field.externalId, 'External field ID', 100);
          if (
            !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(result.externalId) ||
            externalIds.has(result.externalId)
          )
            throw new Error('Use distinct external field IDs without URL parameters.');
          externalIds.add(result.externalId);
        }
        return result;
      } catch (error) {
        throw new Error(`Field ${index + 1}: ${(error as Error).message}`);
      }
    }),
  };
  if (row.formUrl !== undefined) {
    const raw = text(row.formUrl, 'Form URL', 4000);
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error('Choose a complete HTTPS form URL.');
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 4000)
      throw new Error('Form destinations must use HTTPS without username/password credentials.');
    definition.formUrl = url.href;
  }
  if (new TextEncoder().encode(JSON.stringify(definition)).length > MAX_REPORT_DEFINITION_BYTES)
    throw new Error('Report configuration exceeds 32,000 bytes.');
  return definition;
}

/** Neutral starting point; the learner can replace every rule and mapping. */
export function starterAdvisorReportDefinition(): AdvisorReportDefinition {
  return {
    version: 1,
    title: 'Advisor practice report',
    fields: [
      {
        key: 'callsign',
        label: 'Callsign',
        section: 'Report context',
        type: 'text',
        required: false,
        source: 'callsign',
      },
      {
        key: 'name',
        label: 'Name',
        section: 'Report context',
        type: 'text',
        required: false,
        source: 'displayName',
      },
      {
        key: 'session',
        label: 'Class session',
        section: 'Report context',
        type: 'number',
        required: true,
        source: 'session',
        min: 1,
        max: 16,
        integer: true,
      },
      {
        key: 'reportDate',
        label: 'Report date',
        section: 'Report context',
        type: 'date',
        required: true,
        source: 'reportDate',
      },
    ],
  };
}
export interface ReportAnswerError {
  key: string;
  message: string;
}
/** Validate literal ratings and optional blanks without converting missing values to zero. */
export function validateAdvisorReportAnswers(
  definition: AdvisorReportDefinition,
  answers: Readonly<Record<string, string>>,
  requireComplete = true,
): ReportAnswerError[] {
  const errors: ReportAnswerError[] = [];
  const known = new Set(definition.fields.map((field) => field.key));
  if (Object.keys(answers).some((key) => !known.has(key)))
    errors.push({ key: '', message: 'Unknown report answer field.' });
  for (const field of definition.fields) {
    const raw = answers[field.key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    let message = '';
    if (raw !== undefined && typeof raw !== 'string') message = 'Use a text answer.';
    else if (
      raw &&
      (raw.length > 4000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(raw))
    )
      message = 'Use an answer of at most 4,000 characters without control characters.';
    else if (!value) {
      if (field.required && requireComplete) message = 'An answer is required.';
    } else if (field.type === 'rating' && !field.options?.includes(raw))
      message = 'Choose one of the exact listed ratings.';
    else if (field.type === 'date') {
      const date = new Date(`${value}T00:00:00.000Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      )
        message = 'Use a valid date in YYYY-MM-DD format.';
    } else if (field.type === 'number') {
      const number = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) ? Number(value) : NaN;
      if (!Number.isFinite(number)) message = 'Enter a number without units or a percent sign.';
      else if (field.integer && !Number.isSafeInteger(number)) message = 'Enter a whole number.';
      else if (field.min !== undefined && number < field.min)
        message = `Enter at least ${field.min}.`;
      else if (field.max !== undefined && number > field.max)
        message = `Enter at most ${field.max}.`;
      else if (field.minExclusive !== undefined && number <= field.minExclusive)
        message = `Enter more than ${field.minExclusive}.`;
      else if (field.maxExclusive !== undefined && number >= field.maxExclusive)
        message = `Enter less than ${field.maxExclusive}.`;
    }
    if (message) errors.push({ key: field.key, message });
  }
  return errors;
}
