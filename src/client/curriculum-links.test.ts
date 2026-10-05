import { describe, expect, it } from 'vitest';
import { curriculumForLevel, publicCurriculumExercises } from '../shared/curriculum';
import { COURSE_LEVELS } from '../shared/training';
import type { PlannedTask } from '../shared/plan';
import catalog from './recording-catalog.json';
import {
  publicLaunchFromHash,
  publicLessonHash,
  publicPracticeHash,
  publicRecordingFromId,
  publicRecordingHash,
} from './curriculum-links';

describe('public curriculum and recording links', () => {
  it('opens every public lesson with catalog material and no learner attribution', () => {
    for (const { id: level } of COURSE_LEVELS) {
      for (const item of publicCurriculumExercises(level)) {
        const hash = publicLessonHash(level, item.id)!;
        const launch = publicLaunchFromHash(hash)!;
        expect(launch.activity).toEqual(item.exercise);
        expect(launch.publicTitle).toContain(item.title);
        expect(Object.keys(launch).sort()).toEqual([
          'activity',
          'publicRoute',
          'publicSourceUrl',
          'publicTitle',
        ]);
        expect(item).not.toHaveProperty('dueDate');
        expect(item).not.toHaveProperty('done');
      }
    }
  });

  it('shares a curriculum assignment using its public identity alone', () => {
    const level = 'advanced';
    const item = publicCurriculumExercises(level)[0];
    const task: PlannedTask = {
      id: 'private-task-id',
      title: 'Private advisor title',
      kind: item.kind,
      done: true,
      createdAt: '2026-10-01T00:00:00.000Z',
      notes: 'Private notes',
      dueDate: '2026-10-05',
      curriculum: {
        id: curriculumForLevel(level)!.id,
        exerciseId: item.id,
        day: 1,
        sourceUrl: item.sourceUrl,
      },
      exercise: item.exercise,
    };
    const hash = publicPracticeHash({ task, activity: task.exercise, purpose: 'review' })!;
    expect(hash).toBe(`#practice/lesson/advanced/${item.id}`);
    const recipient = publicLaunchFromHash(hash)!;
    expect(JSON.stringify(recipient)).not.toContain('Private');
    expect(recipient).not.toHaveProperty('task');
    expect(recipient).not.toHaveProperty('purpose');
  });

  it('links every verified recording to its exact official source and file speed', () => {
    for (const group of catalog.groups) {
      for (const recording of group.variants) {
        const hash = publicRecordingHash(recording.url)!;
        const launch = publicLaunchFromHash(hash)!;
        expect(launch.activity).toEqual({
          type: 'audio',
          url: recording.url,
          characterWpm: recording.speedWpm,
        });
        expect(launch.publicTitle).toBe(recording.title);
      }
    }
    expect(publicLaunchFromHash('#practice/recording/POTA208_15')?.activity).toEqual({
      type: 'audio',
      url: 'https://cwa.cwops.org/wp-content/uploads/POTA208_15.mp3',
      characterWpm: 15,
    });
  });

  it('preserves an eligible exact recording variant on a shared lesson', () => {
    const item = publicCurriculumExercises('intermediate').find(
      ({ exercise }) => exercise?.type === 'audio' && exercise.url?.endsWith('/qso201_13.mp3'),
    )!;
    const hash = publicLessonHash('intermediate', item.id)!;
    const stretched = publicLaunchFromHash(`${hash}?recording=qso201_15`)!;
    expect(stretched.activity).toMatchObject({
      type: 'audio',
      url: 'https://cwops.org/wp-content/uploads/2022/07/qso201_13.mp3',
      characterWpm: 13,
    });
    expect(stretched.publicRecordingUrl).toBe(
      'https://cwops.org/wp-content/uploads/2022/07/qso201_15.mp3',
    );
    expect(publicLaunchFromHash(`${hash}?recording=qso201_10`)).toBeUndefined();
    expect(publicLaunchFromHash(`${hash}?recording=pota208_15`)).toBeUndefined();
    expect(publicLaunchFromHash(`${hash}?recording=qso201_15&recording=qso201_20`)).toBeUndefined();
  });

  it('rejects unknown lessons, arbitrary source URLs, and conflicting recording links', () => {
    for (const hash of [
      '#practice/lesson/unknown/s1-d1-t1',
      '#practice/lesson/advanced/private-task-id',
      '#practice/recording/missing-file',
      '#practice/recording/../../private',
      '#practice/recording/pota208_15?recording=pota208_20',
      '#practice/lesson/advanced/s1-d1-t1?recording=pota208_15',
    ])
      expect(publicLaunchFromHash(hash)).toBeUndefined();
    expect(publicRecordingFromId('https://example.com/private.mp3')).toBeUndefined();
    expect(publicRecordingHash('https://example.com/POTA208_15.mp3')).toBeUndefined();
    expect(publicRecordingHash('not a URL')).toBeUndefined();
    expect(
      publicRecordingHash('https://cwa.cwops.org/wp-content/uploads/POTA208_15.mp3?token=private'),
    ).toBeUndefined();
    expect(
      publicPracticeHash({ activity: { type: 'audio', url: 'https://example.com/private.mp3' } }),
    ).toBeUndefined();
  });

  it('keeps only public controls for the selected catalog activity', () => {
    expect(
      publicLaunchFromHash('#practice/recording/pota208_15?notes=private&task=secret')?.publicRoute,
    ).toBe('#practice/recording/pota208_15');
    const audio = publicCurriculumExercises('intermediate').find(
      ({ exercise }) => exercise?.type === 'audio' && exercise.url?.endsWith('/qso201_13.mp3'),
    )!;
    const path = publicLessonHash('intermediate', audio.id)!;
    expect(
      publicLaunchFromHash(`${path}?recording=qso201_15&notes=private&recipe=private`)?.publicRoute,
    ).toBe(`${path}?recording=qso201_15`);
  });
});
