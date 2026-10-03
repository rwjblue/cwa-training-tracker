import { isCalendarDate } from './calendar-date.ts';
import type { CourseLevel, PracticeSession, Profile } from './training.ts';

export const MAX_INSTRUCTOR_MATERIALS = 200;
export const MAX_MATERIAL_TEXT = 100_000;
export const MAX_MATERIAL_BYTES = 420_000;
export const MAX_MATERIAL_FILE_BYTES = 100_000;
export const MATERIAL_USAGES = {
  preparation: 'Preparation before class',
  class: 'For use in class',
  reference: 'Reference',
  unknown: 'Not sure yet',
} as const;
export type MaterialUsage = keyof typeof MATERIAL_USAGES;
/** Identifies a known curriculum and cohort without rewriting history after settings edits. */
export interface MaterialCourse {
  level: CourseLevel;
  firstClassDate: string;
}
export interface MaterialOrigin {
  kind: 'original-material';
  archiveId: string;
  id: string;
  supersedesId?: string;
}
export interface InstructorMaterial {
  version: 1;
  id: string;
  course: MaterialCourse;
  session: number;
  title: string;
  text: string;
  url?: string;
  filename?: string;
  usage: MaterialUsage;
  createdAt: string;
  supersedesId?: string;
  /** Only an explicit first copy has an original origin; later revisions point to that copy. */
  origin?: MaterialOrigin;
}
/** The exact immutable version header travels with the attempt, without its restricted text. */
export type MaterialReference = Omit<InstructorMaterial, 'text' | 'url' | 'filename' | 'usage'>;
export interface OriginalMaterialInventory {
  archiveId: string;
  course: Record<string, unknown>;
  materials: Record<string, unknown>[];
}

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('A material must be an object.');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw new Error('Unsupported material field.');
}
function text(value: unknown, label: string, max: number, blank = false): string {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    (!blank && !value.trim()) ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) ||
    new TextDecoder().decode(new TextEncoder().encode(value)) !== value
  )
    throw new Error(`${label} must be readable text of at most ${max} characters.`);
  return value;
}
function id(value: unknown): string {
  const result = text(value, 'Material ID', 200);
  if (!/^[a-zA-Z0-9:_-][a-zA-Z0-9:._-]*$/.test(result)) throw new Error('Use a valid material ID.');
  return result;
}
function course(value: unknown): MaterialCourse {
  const input = record(value);
  keys(input, ['level', 'firstClassDate']);
  if (
    !['beginner', 'fundamental', 'intermediate', 'advanced'].includes(String(input.level)) ||
    !isCalendarDate(input.firstClassDate)
  )
    throw new Error('Choose a known CW Academy course and valid first class date.');
  return { level: input.level as CourseLevel, firstClassDate: input.firstClassDate };
}
export function materialUrl(value: unknown): string {
  const result = text(value, 'Material URL', 2000).trim();
  let url: URL;
  try {
    url = new URL(result);
  } catch {
    throw new Error('Use a complete HTTP or HTTPS material link.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw new Error('Use a complete HTTP or HTTPS material link without embedded credentials.');
  return result;
}
function origin(value: unknown): MaterialOrigin {
  const input = record(value);
  keys(input, ['kind', 'archiveId', 'id', 'supersedesId']);
  if (
    input.kind !== 'original-material' ||
    typeof input.archiveId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.archiveId)
  )
    throw new Error('Invalid original material provenance.');
  return {
    kind: 'original-material',
    archiveId: input.archiveId,
    id: id(input.id),
    ...(input.supersedesId === undefined ? {} : { supersedesId: id(input.supersedesId) }),
  };
}
export function validateInstructorMaterial(value: unknown): InstructorMaterial {
  const input = record(value);
  keys(input, [
    'version',
    'id',
    'course',
    'session',
    'title',
    'text',
    'url',
    'filename',
    'usage',
    'createdAt',
    'supersedesId',
    'origin',
  ]);
  if (input.version !== 1) throw new Error('Unsupported instructor material version.');
  if (!Number.isInteger(input.session) || Number(input.session) < 1 || Number(input.session) > 16)
    throw new Error('Choose a known class session from 1 to 16.');
  if (typeof input.usage !== 'string' || !Object.hasOwn(MATERIAL_USAGES, input.usage))
    throw new Error('Choose preparation, class, reference or not sure.');
  if (
    typeof input.createdAt !== 'string' ||
    input.createdAt.length > 40 ||
    !isCalendarDate(input.createdAt.slice(0, 10)) ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      input.createdAt,
    ) ||
    !Number.isFinite(Date.parse(input.createdAt))
  )
    throw new Error('Use a valid material creation time.');
  const material: InstructorMaterial = {
    version: 1,
    id: id(input.id),
    course: course(input.course),
    session: Number(input.session),
    title: text(input.title, 'Material title', 200),
    text: text(input.text, 'Material text', MAX_MATERIAL_TEXT, true),
    usage: input.usage as MaterialUsage,
    createdAt: new Date(input.createdAt).toISOString(),
    ...(input.url === undefined ? {} : { url: materialUrl(input.url) }),
    ...(input.filename === undefined ? {} : { filename: text(input.filename, 'File name', 255) }),
    ...(input.supersedesId === undefined ? {} : { supersedesId: id(input.supersedesId) }),
    ...(input.origin === undefined ? {} : { origin: origin(input.origin) }),
  };
  if (!material.text.trim() && !material.url)
    throw new Error('Add material text or a safe resource link.');
  if (material.supersedesId === material.id) throw new Error('A revision needs a new material ID.');
  if (material.origin && material.supersedesId)
    throw new Error(
      'A native revision follows its existing version rather than replacing original provenance.',
    );
  if (bytes(material) > MAX_MATERIAL_BYTES)
    throw new Error('This material exceeds its 420 KB encoded limit.');
  return material;
}
export function materialReference(material: InstructorMaterial): MaterialReference {
  const { text: _text, url: _url, filename: _filename, usage: _usage, ...reference } = material;
  return reference;
}
export function validateMaterialReference(value: unknown): MaterialReference {
  const input = record(value);
  keys(input, [
    'version',
    'id',
    'course',
    'session',
    'title',
    'createdAt',
    'supersedesId',
    'origin',
  ]);
  return materialReference(
    validateInstructorMaterial({ ...input, text: 'Reference', usage: 'reference' }),
  );
}
export function sameMaterialValue(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object')
      return `{${Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => `${JSON.stringify(key)}:${canonical(value)}`)
        .join(',')}}`;
    return JSON.stringify(value);
  };
  return canonical(a) === canonical(b);
}
export function validateMaterialRelationships(materials: readonly InstructorMaterial[]): void {
  const byId = new Map(materials.map((material) => [material.id, material]));
  if (byId.size !== materials.length) throw new Error('Material IDs must be unique.');
  for (const material of materials) {
    const seen = new Set([material.id]);
    let child = material;
    while (child.supersedesId) {
      const parent = byId.get(child.supersedesId);
      if (
        !parent ||
        parent.session !== child.session ||
        !sameMaterialValue(parent.course, child.course) ||
        Date.parse(parent.createdAt) > Date.parse(child.createdAt)
      )
        throw new Error(
          'A revision needs its earlier original version in the same account, course and session.',
        );
      if (seen.has(parent.id)) throw new Error('Material revisions cannot form a cycle.');
      seen.add(parent.id);
      child = parent;
    }
  }
}
export function validateInstructorMaterials(value: unknown): InstructorMaterial[] {
  if (!Array.isArray(value) || value.length > MAX_INSTRUCTOR_MATERIALS)
    throw new Error(
      'Keep up to 200 instructor material versions. Export before resetting older data.',
    );
  const materials = value.map(validateInstructorMaterial);
  validateMaterialRelationships(materials);
  return materials;
}
export function orderInstructorMaterials(
  materials: readonly InstructorMaterial[],
): InstructorMaterial[] {
  validateMaterialRelationships(materials);
  const byId = new Map(materials.map((material) => [material.id, material]));
  const done = new Set<string>();
  const output: InstructorMaterial[] = [];
  const visit = (material: InstructorMaterial) => {
    if (done.has(material.id)) return;
    if (material.supersedesId) visit(byId.get(material.supersedesId)!);
    done.add(material.id);
    output.push(material);
  };
  materials.forEach(visit);
  return output;
}
export function materialInCurrentCourse(
  material: Pick<InstructorMaterial, 'course'>,
  profile: Pick<Profile, 'level' | 'firstClassDate'>,
): boolean {
  return (
    material.course.level === profile.level &&
    material.course.firstClassDate === profile.firstClassDate
  );
}
export function requireMaterialReference(
  entry: PracticeSession,
  materials: readonly InstructorMaterial[],
): void {
  const value = entry.metadata?.instructorMaterial;
  if (value === undefined) return;
  const reference = validateMaterialReference(value);
  const material = materials.find((material) => material.id === reference.id);
  if (
    !material ||
    !sameMaterialValue(materialReference(material), reference) ||
    entry.lesson !== material.session
  )
    throw new Error(
      'The exact instructor material version is missing from this account or backup. Save or import the referenced material first.',
    );
}
export function decodeMaterialFile(bytes: Uint8Array): string {
  if (bytes.byteLength > MAX_MATERIAL_FILE_BYTES)
    throw new Error('Choose a UTF-8 text file at most 100 KB, or keep a private resource link.');
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error(
      'This file is not readable UTF-8 text. Use a text file or a safe private link.',
    );
  }
  return text(decoded, 'File text', MAX_MATERIAL_TEXT);
}
/** Original IDs/content and revision links remain in the untouched private archive. */
export function originalMaterialRecords(data: unknown): {
  course: Record<string, unknown>;
  materials: Record<string, unknown>[];
} {
  const safeRecord = (value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const root = safeRecord(data);
  const snapshot = safeRecord(root.snapshot ?? root);
  const pending = safeRecord(root.pending);
  const byId = new Map<string, Record<string, unknown>>();
  for (const values of [snapshot.materials, pending.materials])
    if (Array.isArray(values))
      for (const value of values) {
        const row = safeRecord(value);
        if (typeof row.id === 'string') byId.set(row.id, row);
      }
  const sourceCourse = safeRecord(snapshot.course);
  const course = Object.fromEntries(
    ['id', 'title', 'level', 'timezone', 'firstClassDate']
      .filter((key) => typeof sourceCourse[key] === 'string')
      .map((key) => [key, sourceCourse[key]]),
  );
  return { course, materials: [...byId.values()] };
}
export function validateOriginalMaterialInventory(value: unknown): OriginalMaterialInventory {
  const input = record(value);
  keys(input, ['archiveId', 'course', 'materials']);
  if (
    typeof input.archiveId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.archiveId) ||
    !Array.isArray(input.materials) ||
    bytes(input) > 6_291_456
  )
    throw new Error('Invalid private original material inventory.');
  const materials = input.materials.map(record);
  if (
    materials.some((row) => typeof row.id !== 'string') ||
    new Set(materials.map((row) => row.id)).size !== materials.length
  )
    throw new Error('Original material IDs must be unique.');
  return { archiveId: input.archiveId, course: record(input.course), materials };
}
export function originalMaterialCopy(
  row: Record<string, unknown>,
  archiveId: string,
  selectedCourse: MaterialCourse,
  session: number,
  now = new Date().toISOString(),
): InstructorMaterial {
  return validateInstructorMaterial({
    version: 1,
    id: crypto.randomUUID(),
    course: selectedCourse,
    session,
    title: row.title,
    text: row.text ?? '',
    usage: row.usage ?? 'unknown',
    createdAt: now,
    ...(row.url === undefined ? {} : { url: row.url }),
    ...(row.filename === undefined ? {} : { filename: row.filename }),
    origin: {
      kind: 'original-material',
      archiveId,
      id: row.id,
      ...(row.supersedesId === undefined ? {} : { supersedesId: row.supersedesId }),
    },
  });
}

/** Association may change; the explicit first copy retains the source's exact material facts. */
export function requireOriginalMaterialCopies(
  materials: readonly InstructorMaterial[],
  inventory?: OriginalMaterialInventory,
): void {
  for (const material of materials) {
    if (!material.origin) continue;
    const source = inventory?.materials.find((row) => row.id === material.origin!.id);
    if (!source || inventory?.archiveId !== material.origin.archiveId)
      throw new Error('Include the original private archive for this material copy.');
    const originals = new Map(inventory.materials.map((row) => [row.id, row]));
    const seen = new Set([source.id]);
    let child = source;
    while (child.supersedesId !== undefined) {
      const parent = originals.get(child.supersedesId);
      if (!parent || parent.session !== child.session)
        throw new Error(
          'Original revision provenance needs its retained parent in the same source session. The archive stays unchanged.',
        );
      if (seen.has(parent.id)) throw new Error('Original material revisions cannot form a cycle.');
      seen.add(parent.id);
      child = parent;
    }
    const facts = (item: InstructorMaterial) => ({
      title: item.title,
      text: item.text,
      url: item.url,
      filename: item.filename,
      usage: item.usage,
    });
    const expected = validateInstructorMaterial({
      ...material,
      title: source.title,
      text: source.text ?? '',
      usage: source.usage ?? 'unknown',
      url: source.url,
      filename: source.filename,
    });
    if (
      !sameMaterialValue(facts(material), facts(expected)) ||
      source.supersedesId !== material.origin.supersedesId
    )
      throw new Error(
        'The first material copy must retain the original content and revision provenance. Create a separate revision after copying.',
      );
  }
}
