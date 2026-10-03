import type { AdvisorReportDefinition } from './report-definition.ts';
import type { ReportReference } from './report-document.ts';
import { isCalendarDate } from './training.ts';

export const REPORT_EVIDENCE_SOURCES = [
  'native-runner',
  'external-runner',
  'native-audio',
  'generated-listening',
  'native-copy',
  'external-lcwo',
  'lcwo-export',
  'self-reported',
  'historical',
  'saved-practice',
] as const;
export interface ReportSourceSnapshot {
  /** Index into the document's immutable evidence references. */
  reference: number;
  source: (typeof REPORT_EVIDENCE_SOURCES)[number];
  date: string;
  occurredAt?: string;
  label: string;
  facts: string[];
}
export interface ReportFieldSuggestion {
  key: string;
  mapping: string;
  /** The suggestion at refresh time, independently of a protected learner answer. */
  value: string;
  references: number[];
  warnings: string[];
}
export interface ReportProvenance {
  version: 1;
  fields: ReportFieldSuggestion[];
  sources: ReportSourceSnapshot[];
  warnings: string[];
  /** IDs stay available even when the bounded embedded detail budget is full. */
  omittedSourceDetails: number;
}
function record(value: unknown, keys: string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`Invalid ${label}.`);
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !keys.includes(key)))
    throw new Error(`Unsupported ${label} field.`);
  return row;
}
function text(value: unknown, max: number, label: string): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
  )
    throw new Error(`Invalid ${label}.`);
  return value;
}
function references(value: unknown, count: number): number[] {
  if (
    !Array.isArray(value) ||
    value.length > count ||
    value.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= count) ||
    new Set(value).size !== value.length
  )
    throw new Error('Invalid report suggestion references.');
  return value;
}
function warnings(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error('Invalid report evidence warnings.');
  return value.map((item) => text(item, 1000, 'report evidence warning'));
}
export function validateReportProvenance(
  value: unknown,
  definition: AdvisorReportDefinition,
  evidence: ReportReference[],
): ReportProvenance {
  const row = record(
    value,
    ['version', 'fields', 'sources', 'warnings', 'omittedSourceDetails'],
    'report provenance',
  );
  if (
    row.version !== 1 ||
    !Array.isArray(row.fields) ||
    row.fields.length > definition.fields.length ||
    !Array.isArray(row.sources) ||
    row.sources.length > 256 ||
    !Number.isSafeInteger(row.omittedSourceDetails) ||
    Number(row.omittedSourceDetails) < 0 ||
    Number(row.omittedSourceDetails) > evidence.length
  )
    throw new Error('Invalid report provenance bounds.');
  const seen = new Set<string>();
  const fields = row.fields.map((value) => {
    const field = record(
      value,
      ['key', 'mapping', 'value', 'references', 'warnings'],
      'report suggestion',
    );
    const key = text(field.key, 64, 'report suggestion key');
    const configured = definition.fields.find((item) => item.key === key);
    if (!configured || configured.source !== field.mapping || seen.has(key))
      throw new Error('Report suggestions must retain distinct configured mappings.');
    seen.add(key);
    return {
      key,
      mapping: configured.source,
      value: text(field.value, 4000, 'report suggestion value'),
      references: references(field.references, evidence.length),
      warnings: warnings(field.warnings),
    };
  });
  const sourceRefs = new Set<number>();
  const sources = row.sources.map((value) => {
    const source = record(
      value,
      ['reference', 'source', 'date', 'occurredAt', 'label', 'facts'],
      'report source snapshot',
    );
    const [reference] = references([source.reference], evidence.length);
    if (
      sourceRefs.has(reference) ||
      !REPORT_EVIDENCE_SOURCES.includes(source.source as ReportSourceSnapshot['source']) ||
      !isCalendarDate(source.date) ||
      !Array.isArray(source.facts) ||
      source.facts.length > 50
    )
      throw new Error('Invalid report source snapshot.');
    sourceRefs.add(reference);
    const result: ReportSourceSnapshot = {
      reference,
      source: source.source as ReportSourceSnapshot['source'],
      date: source.date,
      label: text(source.label, 200, 'report source label'),
      facts: source.facts.map((item) => text(item, 4000, 'report source fact')),
    };
    if (source.occurredAt !== undefined) {
      const stamp = text(source.occurredAt, 40, 'report occurrence timestamp');
      if (
        !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(stamp) ||
        !Number.isFinite(Date.parse(stamp))
      )
        throw new Error('Invalid report occurrence timestamp.');
      result.occurredAt = stamp;
    }
    if ((evidence[reference].kind === 'lcwo') !== (result.source === 'lcwo-export'))
      throw new Error('Report source kind disagrees with its evidence reference.');
    return result;
  });
  return {
    version: 1,
    fields,
    sources,
    warnings: warnings(row.warnings),
    omittedSourceDetails: Number(row.omittedSourceDetails),
  };
}
