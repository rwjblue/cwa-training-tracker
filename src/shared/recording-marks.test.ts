import { expect, it } from 'vitest';
import {
  recordingReplayPosition,
  validateRecordingMarkSet,
  validateTaskRecordingMarks,
  type RecordingMarkSet,
} from './recording-marks';
import { validateRecordingEvidence } from './practice-evidence';
import { validatePracticeSession, validateTrainingExport } from './training';
import { validatePlannedTask } from './plan';
import {
  recordingVariants,
  RECORDING_URL_REPLACEMENTS,
  officialRecordingIdentity,
  recordingSpeeds,
} from './recordings';

const url = (wpm: number) => `https://cwa.cwops.org/wp-content/uploads/WD101_${wpm}.mp3`;
const marks = (wpm = 10): RecordingMarkSet => ({
  taskId: 'task',
  url: url(wpm),
  speedWpm: wpm,
  marks: [{ id: `mark-${wpm}`, positionSeconds: 3.25, label: '  Difficult word  ' }],
});
const task = () => ({
  id: 'task',
  title: 'Synthetic recording',
  kind: 'listening',
  done: false,
  source: 'manual',
  createdAt: '2026-09-30T12:00:00Z',
  link: url(10),
  recordingMarks: [marks(10), marks(18)],
});
const session = () => ({
  id: 'entry',
  date: '2026-09-30',
  kind: 'listening',
  minutes: 1,
  notes: '',
  createdAt: '2026-09-30T12:00:00Z',
  metadata: {
    plannedTaskId: 'task',
    evidence: {
      version: 1,
      type: 'timed',
      measurement: { seconds: 60, recallSeconds: 0 },
      recordings: [{ url: url(10), speedWpm: 10, seconds: 20, marks: marks() }],
    },
  },
});

it('retains separate exact-file annotations through plan, immutable history and old version 1 backups', () => {
  const original = task();
  const normalized = validatePlannedTask(original);
  expect(normalized.recordingMarks?.map((set) => set.url)).toEqual([url(10), url(18)]);
  expect(normalized.recordingMarks?.[0].marks[0].label).toBe('Difficult word');
  original.recordingMarks[0].marks[0].label = 'Changed later';
  expect(normalized.recordingMarks?.[0].marks[0].label).toBe('Difficult word');
  const backup = validateTrainingExport({
    format: 'cwa-training-tracker',
    version: 1,
    exportedAt: '2026-09-30T12:00:00Z',
    plan: [normalized],
    sessions: [session()],
  });
  expect(validateTrainingExport(JSON.parse(JSON.stringify(backup)))).toEqual(backup);
  const old = task();
  Reflect.deleteProperty(old, 'recordingMarks');
  expect(validatePlannedTask(old)).not.toHaveProperty('recordingMarks');
});

it.each([-1, NaN, Infinity, 86401])(
  'rejects invalid timestamp %s before storing private marks',
  (positionSeconds) => {
    const set = marks();
    set.marks[0].positionSeconds = positionSeconds;
    expect(() => validateRecordingMarkSet(set)).toThrow(/finite position/);
  },
);
it('rejects foreign identity, unsupported fields, overlong labels and duplicate IDs/files', () => {
  expect(() => validateRecordingMarkSet({ ...marks(), speedWpm: 18 })).toThrow(/exact verified/);
  expect(() =>
    validateRecordingMarkSet({ ...marks(), url: 'https://example.test/unverified.mp3' }),
  ).toThrow(/exact verified/);
  expect(() =>
    validateRecordingMarkSet({ ...marks(), privateEmail: 'synthetic@example.test' }),
  ).toThrow(/unsupported/);
  expect(() =>
    validateRecordingMarkSet({
      ...marks(),
      marks: [{ ...marks().marks[0], label: 'x'.repeat(121) }],
    }),
  ).toThrow(/120/);
  expect(() =>
    validateRecordingMarkSet({ ...marks(), marks: [...marks().marks, ...marks().marks] }),
  ).toThrow(/distinct/);
  expect(() => validateTaskRecordingMarks([marks(), marks()], 'task')).toThrow(/distinct exact/);
  expect(() => validateTaskRecordingMarks([marks()], 'other-task')).toThrow(/belong/);
  expect(() =>
    validateTaskRecordingMarks([marks(), { ...marks(18), marks: marks().marks }], 'task'),
  ).toThrow(/distinct difficult/);
});
it('bounds per-file and total annotations and allows clearing a task without fabricated history', () => {
  const many = (wpm: number, count: number) => ({
    ...marks(wpm),
    marks: Array.from({ length: count }, (_, i) => ({
      id: `mark-${wpm}-${i}`,
      positionSeconds: i,
    })),
  });
  expect(validateRecordingMarkSet(many(10, 50)).marks).toHaveLength(50);
  expect(() => validateRecordingMarkSet(many(10, 51))).toThrow(/50/);
  const sets = [10, 13, 18, 20].map((wpm) => many(wpm, 50));
  expect(validateTaskRecordingMarks(sets, 'task')).toHaveLength(4);
  expect(() => validateTaskRecordingMarks([...sets, many(25, 1)], 'task')).toThrow(/200/);
  expect(validateTaskRecordingMarks([], 'task')).toEqual([]);
});
it('requires saved timestamps to match the actual heard file and task including retired-task history', () => {
  const recording = session().metadata.evidence.recordings[0];
  expect(() => validateRecordingEvidence({ ...recording, marks: marks(18) })).toThrow(/match/);
  const value = session();
  value.metadata.plannedTaskId = 'other';
  expect(() => validatePracticeSession(value)).toThrow(/task/);
  const historical = session();
  Reflect.deleteProperty(historical.metadata, 'plannedTaskId');
  expect(
    validatePracticeSession({ ...historical, historicalPlannedTaskId: 'task' }),
  ).toHaveProperty('historicalPlannedTaskId', 'task');
  expect(() => validatePracticeSession(historical)).toThrow(/task/);
});
it('replays exactly eight seconds earlier, clamps at zero and never trusts invalid native positions', () => {
  expect(recordingReplayPosition(3, 60)).toBe(0);
  expect(recordingReplayPosition(20, 60)).toBe(12);
  expect(recordingReplayPosition(65, 60)).toBe(52);
  for (const [p, d] of [
    [NaN, 60],
    [Infinity, 60],
    [-1, 60],
    [1, 0],
    [1, Infinity],
    [1, 86401],
  ])
    expect(recordingReplayPosition(p, d)).toBeUndefined();
});

it('bounds timestamps to verified file duration and refuses to transplant marks to replacement URLs', () => {
  const variant = recordingVariants(url(10)).find((item) => item.url === url(10))!;
  expect(variant.durationSeconds).toBeGreaterThan(0);
  expect(() =>
    validateRecordingMarkSet({
      ...marks(),
      marks: [{ id: 'past-end', positionSeconds: variant.durationSeconds! + 0.01 }],
    }),
  ).toThrow(/inside its recording/);
  const [old, current] = Object.entries(RECORDING_URL_REPLACEMENTS)[0];
  const replacement = recordingVariants(current).find((item) => item.url === current)!;
  expect(() =>
    validateRecordingMarkSet({
      taskId: 'task',
      url: old,
      speedWpm: replacement.speedWpm,
      marks: [{ id: 'old', positionSeconds: 3 }],
    }),
  ).toThrow(/exact verified/);
});

it.each([
  ['https://cwa.cwops.org/wp-content/uploads/QSO101_07.mp3', 7],
  ['https://cwops.org/wp-content/uploads/2022/07/ss-09.111.mp3', 9],
  ['https://cwa.cwops.org/wp-content/uploads/PR303_30.mp3', 30],
])(
  'retains exact published curriculum file %s without inventing native timing',
  (url, speedWpm) => {
    expect(recordingVariants(url)).toEqual([]);
    expect(officialRecordingIdentity(url)).toEqual({ url, speedWpm });
    expect(recordingSpeeds(url)).toBeUndefined();
    const set = {
      taskId: 'task',
      url,
      speedWpm,
      marks: [{ id: 'curriculum-only', positionSeconds: 3, label: 'Synthetic published file' }],
    };
    expect(validateRecordingMarkSet(set)).toEqual(set);
    const evidence = validateRecordingEvidence({ url, speedWpm, seconds: 4, marks: set });
    expect(evidence.marks).toEqual(set);
    expect(evidence).not.toHaveProperty('characterWpm');
    expect(evidence).not.toHaveProperty('effectiveWpm');
    expect(() => validateRecordingEvidence({ ...evidence, speedWpm: 18 })).toThrow(/match/);
    expect(() => validateRecordingMarkSet({ ...set, speedWpm: 18 })).toThrow(/exact verified/);
  },
);
