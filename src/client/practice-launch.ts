import type { PlannedTask } from '../shared/plan';

/** A deliberate start from Today or the studio's public tool shortcuts. */
export interface PracticeLaunch {
  id: string;
  task?: PlannedTask;
  tool?: 'words' | 'qso' | 'free';
}
