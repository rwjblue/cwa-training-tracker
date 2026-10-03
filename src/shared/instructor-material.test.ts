import { describe, expect, it } from 'vitest';
import {
  requireOriginalMaterialCopies,
  validateOriginalMaterialInventory,
  decodeMaterialFile,
  materialReference,
  originalMaterialCopy,
  originalMaterialRecords,
  orderInstructorMaterials,
  requireMaterialReference,
  validateInstructorMaterial,
  validateInstructorMaterials,
  validateMaterialReference,
  type InstructorMaterial,
} from './instructor-material';
import { DEFAULT_PROFILE, validatePracticeSession } from './training';

const course = { level: 'intermediate' as const, firstClassDate: '2026-09-01' };
const material = (patch: Partial<InstructorMaterial> = {}): InstructorMaterial => ({
  version: 1,
  id: 'original',
  course,
  session: 2,
  title: 'Synthetic preparation',
  text: '<script>plain text only</script>\nCQ TEST',
  usage: 'preparation',
  createdAt: '2026-10-01T00:00:00.000Z',
  ...patch,
});
describe('private instructor material versions', () => {
  it('keeps exact readable content, known course/session and explicit usage', () => {
    expect(validateInstructorMaterial(material())).toEqual(material());
    for (const usage of ['preparation', 'class', 'reference', 'unknown'] as const)
      expect(validateInstructorMaterial(material({ usage })).usage).toBe(usage);
    expect(
      validateInstructorMaterial(material({ text: '', url: 'https://example.com/private' })).text,
    ).toBe('');
    expect(validateInstructorMaterial(material({ text: '漢'.repeat(100_000) })).text).toHaveLength(
      100_000,
    );
    for (const patch of [
      { session: 0 },
      { session: 17 },
      { text: '' },
      { title: ' ' },
      { text: 'nul\0text' },
      { text: '\u0001binary' },
      { text: '\ud800' },
      { text: 'x'.repeat(100_001) },
      { filename: 'x'.repeat(256) },
      { url: 'javascript:alert(1)' },
      { url: 'https://user:secret@example.com/private' },
      { url: '/relative' },
      { course: { ...course, firstClassDate: '2026-02-30' } },
    ])
      expect(() => validateInstructorMaterial({ ...material(), ...patch })).toThrow();
    expect(() => validateInstructorMaterial({ ...material(), html: 'no' })).toThrow('Unsupported');
  });

  it('decodes only bounded valid UTF-8 text and does not silently replace malformed bytes', () => {
    expect(decodeMaterialFile(new TextEncoder().encode('café\nCQ'))).toBe('café\nCQ');
    expect(decodeMaterialFile(new TextEncoder().encode('x'.repeat(100_000)))).toHaveLength(100_000);
    expect(() => decodeMaterialFile(new Uint8Array(100_001))).toThrow('100 KB');
    expect(() => decodeMaterialFile(new Uint8Array([0xc3, 0x28]))).toThrow('UTF-8');
    expect(() => decodeMaterialFile(new Uint8Array([65, 0, 66]))).toThrow('readable');
  });

  it('requires earlier same-course/session parents, rejects cycles and orders reversed imports', () => {
    const original = material();
    const revision = material({
      id: 'revision',
      supersedesId: original.id,
      text: 'Changed',
      createdAt: '2026-10-02T00:00:00Z',
    });
    const next = material({
      id: 'next',
      supersedesId: revision.id,
      createdAt: '2026-10-03T00:00:00Z',
    });
    expect(orderInstructorMaterials([next, revision, original]).map((item) => item.id)).toEqual([
      'original',
      'revision',
      'next',
    ]);
    for (const invalid of [
      [revision],
      [original, original],
      [original, { ...revision, session: 3 }],
      [original, { ...revision, course: { ...course, firstClassDate: '2026-08-01' } }],
      [original, { ...revision, createdAt: '2026-09-01T00:00:00Z' }],
      [
        material({ supersedesId: 'revision' }),
        material({ id: 'revision', supersedesId: 'original' }),
      ],
    ])
      expect(() => validateInstructorMaterials(invalid)).toThrow();
    expect(() =>
      validateInstructorMaterials(
        Array.from({ length: 201 }, (_, i) => material({ id: `material-${i}` })),
      ),
    ).toThrow('200');
  });

  it('retains the actual immutable version header without copying restricted content into evidence', () => {
    const original = material();
    const reference = materialReference(original);
    expect(reference).not.toHaveProperty('text');
    expect(reference).not.toHaveProperty('url');
    expect(validateMaterialReference(reference)).toEqual(reference);
    const entry = validatePracticeSession({
      id: 'result',
      date: '2026-10-03',
      kind: 'sending',
      minutes: 0,
      lesson: 2,
      notes: '',
      createdAt: '2026-10-03T00:00:00Z',
      metadata: { instructorMaterial: reference },
    });
    expect(() => requireMaterialReference(entry, [original])).not.toThrow();
    expect(() => requireMaterialReference(entry, [])).toThrow('exact instructor material');
    expect(() => requireMaterialReference({ ...entry, lesson: 3 }, [original])).toThrow();
    expect(() =>
      requireMaterialReference(
        { ...entry, metadata: { instructorMaterial: { ...reference, title: 'Forged' } } },
        [original],
      ),
    ).toThrow();
    expect(() => validateMaterialReference({ ...reference, text: 'private' })).toThrow();
  });

  it('makes an explicit associated native copy without changing original content or revision IDs', () => {
    const old = {
      id: 'source-old',
      session: 1,
      title: 'Source old',
      text: 'First text',
      usage: 'reference',
      createdAt: '2026-09-01T00:00:00Z',
    };
    const revised = {
      ...old,
      id: 'source-revised',
      title: 'Source revised',
      text: 'Original revision',
      supersedesId: old.id,
    };
    const archive = {
      snapshot: { course: { id: 'source-course' }, materials: [old] },
      pending: { materials: [revised] },
    };
    const frozen = JSON.stringify(archive);
    const inventory = originalMaterialRecords(archive);
    expect(inventory.materials.map((item) => item.id)).toEqual(['source-old', 'source-revised']);
    const copy = originalMaterialCopy(
      inventory.materials[1],
      'a'.repeat(64),
      course,
      2,
      '2026-10-03T00:00:00Z',
    );
    expect(copy.id).not.toBe(revised.id);
    expect(copy.text).toBe(revised.text);
    expect(copy.origin).toEqual({
      kind: 'original-material',
      archiveId: 'a'.repeat(64),
      id: revised.id,
      supersedesId: old.id,
    });
    expect(copy.session).toBe(2);
    expect(copy.course).toEqual(course);
    expect(JSON.stringify(archive)).toBe(frozen);
    expect(() =>
      originalMaterialCopy(
        revised,
        'a'.repeat(64),
        { ...course, firstClassDate: DEFAULT_PROFILE.firstClassDate },
        2,
      ),
    ).toThrow('known CW Academy');
  });
});

it('keeps large accepted original inventories usable without including restricted course assignments in account state', () => {
  const data = {
    course: {
      id: 'course-original',
      title: 'Synthetic source',
      assignments: [{ instructions: 'PRIVATE CURRICULUM' }],
    },
    materials: Array.from({ length: 1001 }, (_, i) => ({
      id: `original:${i}`,
      session: 1,
      title: `Material ${i}`,
      text: 'SOURCE',
      usage: 'reference',
    })),
  };
  const inventory = { archiveId: 'a'.repeat(64), ...originalMaterialRecords(data) };
  expect(validateOriginalMaterialInventory(inventory).materials).toHaveLength(1001);
  expect(inventory.course).toEqual({ id: 'course-original', title: 'Synthetic source' });
  expect(data.course.assignments[0].instructions).toBe('PRIVATE CURRICULUM');
  const copy = originalMaterialCopy(
    inventory.materials[1000],
    inventory.archiveId,
    { level: 'beginner', firstClassDate: '2026-09-28' },
    1,
  );
  expect(() => requireOriginalMaterialCopies([copy], inventory)).not.toThrow();
});

it('rejects invalid original revision promotion without changing its retained archive or accepting altered source facts', () => {
  const parent = {
    id: 'original-parent',
    session: 1,
    title: 'Parent',
    text: 'OLD',
    usage: 'reference',
  };
  const child = {
    id: 'original-child',
    session: 1,
    title: 'Child',
    text: 'NEW',
    usage: 'reference',
    supersedesId: parent.id,
  };
  const inventory = { archiveId: 'b'.repeat(64), course: {}, materials: [parent, child] };
  const copy = originalMaterialCopy(
    child,
    inventory.archiveId,
    { level: 'beginner', firstClassDate: '2026-09-28' },
    1,
  );
  expect(() => requireOriginalMaterialCopies([copy], inventory)).not.toThrow();
  for (const materials of [
    [child],
    [{ ...parent, session: 2 }, child],
    [{ ...parent, supersedesId: child.id }, child],
  ])
    expect(() => requireOriginalMaterialCopies([copy], { ...inventory, materials })).toThrow(
      /parent|cycle/,
    );
  expect(inventory.materials).toEqual([parent, child]);
  for (const createdAt of ['2026-02-30T12:00:00Z', 'September 30, 2026', '2026-10-01T24:00:00Z'])
    expect(() => validateInstructorMaterial({ ...copy, createdAt })).toThrow('creation time');
});
