import { useId } from 'react';
import type { PracticePurpose, Profile } from '../shared/training';
import type { PlannedTask } from '../shared/plan';
import { blockedPracticeExplanation, type nextPracticePlan } from '../shared/next-practice';
import './next-practice.css';

export default function NextPracticeAction({
  plan,
  profile,
  now,
  busy,
  finishing,
  resultPending,
  currentTaskId,
  currentPurpose,
  onStart,
  onPrepare,
  onManage,
}: {
  plan: ReturnType<typeof nextPracticePlan>;
  profile: Profile;
  now: number;
  busy: boolean;
  finishing?: boolean;
  resultPending?: boolean;
  currentTaskId?: string;
  currentPurpose?: PracticePurpose;
  onStart: () => void;
  onPrepare: (task: PlannedTask) => void;
  onManage: () => void;
}) {
  const titleId = useId();
  const next = plan.next;
  const blocked = plan.blocked[0];
  const preparation = plan.preparation[0];
  return (
    <section className="card next-practice" aria-labelledby={titleId}>
      <span className="eyebrow">ONE STEP AT A TIME</span>
      <h2 id={titleId}>Your next practice</h2>
      {resultPending ? (
        <p>
          Your current Runner result is ready. Use Review &amp; save run before choosing another
          assignment. The stopped engine cannot be resumed.
        </p>
      ) : next && next.task.id === currentTaskId && currentPurpose !== 'review' ? (
        <>
          <h3>Continue your current exercise</h3>
          <p>
            Your assignment is open below. Resume when ready, then save your work. Complete the
            exercise explicitly when it is finished; saving partial practice does not complete it or
            advance future work.
          </p>
        </>
      ) : plan.activeClass ? (
        <>
          <h3>Class is in progress · Session {plan.activeClass.session}</h3>
          <p>
            Return to your retained work when useful. New independent practice recommendations wait
            until class ends; attendance adds no practice credit.
          </p>
        </>
      ) : next ? (
        <>
          <h3>{next.task.title}</h3>
          <p>
            {next.dueDate === plan.today
              ? 'Assigned today'
              : next.task.pinnedForDate === plan.today
                ? `Added to today · originally ${next.dueDate}`
                : `Earlier work · ${next.dueDate}`}
            {next.task.lesson ? ` · Session ${next.task.lesson}` : ''}
            {next.status === 'started' ? ' · Started' : ''}
          </p>
          <p>
            {finishing
              ? 'This deliberately finishes your current block using its save policy, then prepares this assignment.'
              : 'Opens the assignment’s own material. Start playback or the timer when ready.'}{' '}
            Saving practice and completing homework remain separate.
          </p>
          <button className="button dark" disabled={busy} onClick={onStart}>
            {finishing ? 'Finish & start next block' : 'Start next block'}
          </button>
        </>
      ) : blocked ? (
        <>
          <h3>Prepare or check a resource</h3>
          <p>
            <strong>{blocked.item.task.title}</strong> ·{' '}
            {blockedPracticeExplanation(blocked, profile, now)}
          </p>
          {blocked.reason === 'live-window' ? (
            <button
              className="button outline"
              disabled={busy}
              onClick={() => onPrepare(blocked.item.task)}
            >
              Prepare live exercise
            </button>
          ) : blocked.item.task.link ? (
            <a
              className="button outline"
              href={blocked.item.task.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open exercise instructions
            </a>
          ) : null}
        </>
      ) : preparation ? (
        <>
          <h3>Prepare for your next class</h3>
          <p>
            {preparation.task.title} · Session {preparation.task.lesson}. This is upcoming
            preparation; it is not automatically started as today’s required work.
          </p>
          <button className="button outline" disabled={busy} onClick={onManage}>
            Inspect preparation
          </button>
        </>
      ) : (
        <>
          <h3>
            {plan.allComplete
              ? 'Your required exercises are complete'
              : 'No required block is ready now'}
          </h3>
          <p>
            {plan.nextPracticeDate
              ? `Your next assigned practice date is ${plan.nextPracticeDate}.`
              : plan.unscheduled.length
                ? 'Undated exercises remain in your plan. Set their dates or choose one deliberately.'
                : 'Review your plan or choose public practice when useful.'}{' '}
            Future work and extra review are not automatically advanced.
          </p>
        </>
      )}
      <div className="next-practice-actions">
        <button className="text-button" disabled={busy} onClick={onManage}>
          Inspect your plan
        </button>
      </div>
    </section>
  );
}
