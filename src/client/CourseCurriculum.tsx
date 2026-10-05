import { ArrowRight, ExternalLink } from 'lucide-react';
import {
  curriculumForLevel,
  publicCurriculumExercises,
  sessionSyllabusUrl,
} from '../shared/curriculum';
import { COURSE_LEVELS, type CourseLevel } from '../shared/training';
import { publicLaunchFromHash, publicLessonHash } from './curriculum-links';
import type { PracticeLaunch } from './practice-launch';
import './course-curriculum.css';

const practice: Record<CourseLevel, { summary: string; scheduling?: string }> = {
  beginner: {
    summary:
      'Copying and sending, spoken character recognition, and preparation for your first on-air exchanges. Assigned practice opens the official Morse Code Trainer or syllabus; record your practice and completion here.',
    scheduling:
      'Beginner work is assigned by session. The companion repeats each session’s blocks across three preparation days to help you practice between classes.',
  },
  fundamental: {
    summary:
      'Sending and copy practice with code groups, words, callsigns and plain text, plus linked spoken-answer practice, news and on-air work. Copy exercises open here with the assignment’s settings; choose your own difficult characters when requested.',
    scheduling:
      'Session 15 repeats its practice blocks across three days, with the contact goal listed once. Session 16 has one final preparation activity.',
  },
  intermediate: {
    summary:
      'Sending scales, official recordings, character recognition, Morse Runner and on-air CWT practice. Recordings and simulator assignments open with their course settings.',
  },
  advanced: {
    summary:
      'Sending scales and official head-copy recordings for words, phrases, QSOs, POTA exchanges, prefixes and suffixes. Assigned recordings open with their speed and repetition guidance; follow the syllabus for optional contest tools.',
  },
};

/** Public course discovery uses the same published catalog as the private plan. */
export default function CourseCurriculum({
  level,
  session = 1,
  onSessionChange,
  onPractice,
}: {
  level: CourseLevel;
  session?: number;
  onSessionChange?: (session: number) => void;
  onPractice?: (options: Omit<PracticeLaunch, 'id'>) => void;
}) {
  const course = curriculumForLevel(level)!;
  const details = COURSE_LEVELS.find((course) => course.id === level)!;
  const guidance = practice[level];
  const selectedSession = Number.isInteger(session) && session >= 1 && session <= 16 ? session : 1;
  const exercises = publicCurriculumExercises(level).filter(
    ({ session }) => session === selectedSession,
  );
  const syllabus = sessionSyllabusUrl(level, selectedSession) ?? course.sourceUrl;
  return (
    <section className="card curriculum-overview" aria-labelledby="curriculum-overview-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PUBLISHED SYLLABUS · VERSION {course.version}</span>
          <h2 id="curriculum-overview-title">{details.label} curriculum</h2>
          <p>16 sessions over eight weeks · {course.exerciseCount} scheduled exercises</p>
        </div>
        <a
          className="button outline small"
          href={course.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Official {details.label} syllabus <ExternalLink size={14} />
        </a>
      </div>
      <dl className="curriculum-course-goals">
        <div>
          <dt>Starting point</dt>
          <dd>{details.prerequisite}</dd>
        </div>
        <div>
          <dt>Course goals</dt>
          <dd>{details.goal}</dd>
        </div>
      </dl>
      <p>{guidance.summary}</p>
      <a className="text-button" href={course.resourcesUrl} target="_blank" rel="noreferrer">
        Official practice resources <ExternalLink size={14} />
      </a>
      <nav className="curriculum-sessions" aria-label={`${details.label} sessions`}>
        {Array.from({ length: 16 }, (_, index) => index + 1).map((number) => (
          <a
            key={number}
            href={`#course?level=${level}&session=${number}`}
            aria-current={selectedSession === number ? 'page' : undefined}
            onClick={(event) => {
              if (
                !onSessionChange ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              onSessionChange(number);
            }}
          >
            <span className="sr-only">Session </span>
            {number}
          </a>
        ))}
      </nav>
      <div className="curriculum-session-heading">
        <h3>Session {selectedSession} practice</h3>
        <a href={syllabus} target="_blank" rel="noreferrer">
          Official session instructions <ExternalLink size={14} />
        </a>
      </div>
      <p className="curriculum-public-guidance">
        Explore these exercises without an account. Your practice and progress stay private. Follow
        the official session instructions for the full assignment.
      </p>
      <ol className="curriculum-exercises">
        {exercises.map((exercise) => {
          const hash = publicLessonHash(level, exercise.id)!;
          const launch = publicLaunchFromHash(hash)!;
          return (
            <li key={exercise.id}>
              <a
                className="curriculum-exercise-link"
                href={hash}
                onClick={(event) => {
                  if (
                    !onPractice ||
                    event.button !== 0 ||
                    event.metaKey ||
                    event.ctrlKey ||
                    event.shiftKey ||
                    event.altKey
                  )
                    return;
                  event.preventDefault();
                  onPractice(launch);
                }}
              >
                <span>
                  <small>
                    Preparation day {exercise.day}
                    {exercise.optional ? ' · Optional' : ''}
                  </small>
                  <strong>{exercise.title}</strong>
                </span>
                <ArrowRight size={16} aria-hidden="true" />
              </a>
            </li>
          );
        })}
      </ol>
      <details className="curriculum-scheduling">
        <summary>How assignments fit your schedule</summary>
        {guidance.scheduling && <p>{guidance.scheduling}</p>}
        <p>
          To use this curriculum in your private plan, choose {details.label} in Course settings and
          save your first class date and meeting days. Each class’s preparation is scheduled two
          days before, one day before and on the class date. Changing levels preserves saved
          progress for when you return.
        </p>
      </details>
    </section>
  );
}
