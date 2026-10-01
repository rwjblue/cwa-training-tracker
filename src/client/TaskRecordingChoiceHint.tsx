import type { PlannedTask } from '../shared/plan';
import { recordingContextForTask, resolveTaskRecordingChoice } from './task-recording-choice';

/** Future launch preference, never a projection of current or historical playback. */
export default function TaskRecordingChoiceHint({
  scope,
  task,
}: {
  scope?: string;
  task: PlannedTask;
}) {
  const context = recordingContextForTask(task);
  if (!scope || !context) return null;
  const resolved = resolveTaskRecordingChoice(scope, context);
  if (resolved.status === 'invalid')
    return (
      <p className="field-hint">
        Remembered recording unavailable for this task. The next visit uses the recording default.
      </p>
    );
  if (!resolved.choice || !resolved.recording) return null;
  return (
    <p className="field-hint">
      Next visit: {resolved.recording.speedWpm} WPM remembered on this device
      {context.assignedWpm ? ` (${context.assignedWpm} WPM assigned)` : ''}. Open the exercise to
      change or reset this task’s choice.
    </p>
  );
}
