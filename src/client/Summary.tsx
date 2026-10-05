import type { ReactNode } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock3,
  ExternalLink,
  Flame,
  Plus,
  Signal,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { COURSE_LEVELS, type PracticeSession, type Profile } from '../shared/training';
import { summarizeRecentPractice } from '../shared/practice-summary';
import './summary.css';

const minutesLabel = (minutes: number) => String(Math.round(minutes * 100) / 100);
const summaryDate = (date: string, short = false) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(short ? {} : { weekday: 'short' as const }),
  });

export default function Summary({
  entries,
  profile,
  today,
  demo,
  openLog,
  openLogbook,
  openCourse,
  renderSession,
}: {
  entries: PracticeSession[];
  profile: Profile;
  today: string;
  demo: boolean;
  openLog: () => void;
  openLogbook: () => void;
  openCourse: () => void;
  renderSession: (entry: PracticeSession) => ReactNode;
}) {
  const summary = summarizeRecentPractice(entries, today);
  const dailyGoal = profile.dailyGoalMinutes || 30;
  const chartMax = Math.max(dailyGoal, ...summary.days.map((day) => day.minutes), 30);
  const level = COURSE_LEVELS.find((item) => item.id === profile.level) ?? COURSE_LEVELS[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="small-line" /> YOUR PRACTICE AT A GLANCE
          </div>
          <h1>Your practice summary.</h1>
          <p>Your recent activity, steady habits, and practice history.</p>
        </div>
        <button className="button dark" onClick={openLog}>
          <Plus size={17} /> Log practice
        </button>
      </div>
      <section className="stats-grid" aria-label="Practice summary">
        <SummaryStat
          icon={Clock3}
          label="PRACTICE IN 7 DAYS"
          value={minutesLabel(summary.weekMinutes)}
          unit="min"
          sub={`${summary.sessionCount} sessions in the last 7 days`}
        />
        <SummaryStat
          icon={Flame}
          label="CURRENT STREAK"
          value={String(summary.currentStreak)}
          unit={summary.currentStreak === 1 ? 'day' : 'days'}
          sub={
            summary.currentStreak ? 'Keep the frequency alive' : 'Every new habit starts with one'
          }
          orange
        />
        <SummaryStat
          icon={CalendarDays}
          label="DAYS YOU SHOWED UP"
          value={String(summary.activeDays)}
          unit="/ 7"
          sub="Small steps. Real progress."
        />
        <SummaryStat
          icon={Signal}
          label="BEST EFFECTIVE SPEED"
          value={summary.latestSpeed === null ? '—' : String(summary.latestSpeed)}
          unit="wpm"
          sub="From this week’s practice"
        />
      </section>
      <div className="overview-bottom-grid summary-bottom-grid">
        <section className="card weekly-card summary-weekly-card">
          <div className="section-heading">
            <div>
              <h2 id="summary-chart-heading">The shape of your practice</h2>
              <p>See how you spend your practice time.</p>
            </div>
            <span className="chip">
              <CalendarDays size={13} /> Last 7 days
            </span>
          </div>
          {entries.some((entry) => entry.id.startsWith('lcwo-estimate:')) && (
            <p className="lcwo-estimate-note">
              Practice totals include explicitly estimated LCWO group time. Inspect source results
              in Practice log for the per-result assumption and overlap checks.
            </p>
          )}
          <ul className="summary-chart-legend" aria-label="Practice activity colors">
            {summary.activities.map((activity) => (
              <li key={activity.id}>
                <i
                  className={`summary-activity-color activity-${activity.id}`}
                  aria-hidden="true"
                />
                {activity.label}
              </li>
            ))}
            <li>
              <i className="legend-dash" aria-hidden="true" />
              Personal target · {dailyGoal} min
            </li>
          </ul>
          <figure className="summary-chart" aria-labelledby="summary-chart-heading">
            <div className="summary-chart-visual">
              <div className="summary-y-axis" aria-hidden="true">
                <span>{minutesLabel(chartMax)}m</span>
                <span>{minutesLabel(chartMax / 2)}m</span>
                <span>0</span>
              </div>
              <div className="summary-chart-plot">
                <div className="chart-gridline line-top" />
                <div className="chart-gridline line-middle" />
                <div className="chart-gridline line-bottom" />
                <div
                  className="chart-goal"
                  style={{ bottom: `${(dailyGoal / chartMax) * 100}%` }}
                />
                {summary.days.map((day) => {
                  const description = `${summaryDate(day.date)}: ${minutesLabel(day.minutes)} minutes${day.activities.length ? `. ${day.activities.map((activity) => `${activity.label}: ${minutesLabel(activity.minutes)} minutes`).join('; ')}` : '. No practice logged'}`;
                  return (
                    <div
                      className="summary-chart-day"
                      key={day.date}
                      role="img"
                      tabIndex={0}
                      aria-label={description}
                      title={description}
                    >
                      <span className="summary-day-total" aria-hidden="true">
                        {minutesLabel(day.minutes)}m
                      </span>
                      <div className="summary-bar-area" aria-hidden="true">
                        <div
                          className="summary-stacked-bar"
                          style={{ height: `${(day.minutes / chartMax) * 100}%` }}
                        >
                          {day.activities.map((activity) => (
                            <div
                              key={activity.id}
                              className={`summary-bar-segment activity-${activity.id}`}
                              style={{ height: `${(activity.minutes / day.minutes) * 100}%` }}
                            />
                          ))}
                        </div>
                      </div>
                      <span
                        className={`summary-chart-date${day.date === today ? ' summary-today' : ''}`}
                        aria-hidden="true"
                      >
                        {day.date === today
                          ? 'Today'
                          : new Date(`${day.date}T12:00:00`).toLocaleDateString(undefined, {
                              weekday: 'short',
                            })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <figcaption>Saved practice time by activity. Class meetings are separate.</figcaption>
          </figure>
          <details className="summary-breakdown">
            <summary>Daily activity breakdown</summary>
            <table>
              <caption>Practice minutes in the last 7 days</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col">Activity</th>
                  <th scope="col">Minutes</th>
                </tr>
              </thead>
              <tbody>
                {summary.days.flatMap((day) =>
                  day.activities.length
                    ? day.activities.map((activity) => (
                        <tr key={`${day.date}:${activity.id}`}>
                          <th scope="row">{summaryDate(day.date, true)}</th>
                          <td>{activity.label}</td>
                          <td>{minutesLabel(activity.minutes)}</td>
                        </tr>
                      ))
                    : [
                        <tr key={day.date}>
                          <th scope="row">{summaryDate(day.date, true)}</th>
                          <td>No practice logged</td>
                          <td>0</td>
                        </tr>,
                      ],
                )}
              </tbody>
            </table>
          </details>
          <div className="chart-bottom">
            <span>
              <TrendingUp size={15} />
              {summary.activeDays >= 5
                ? 'You’re building a habit worth keeping.'
                : 'A few minutes today is a step forward.'}
            </span>
            {demo && <span className="sample-label">SAMPLE DATA</span>}
          </div>
        </section>
        <section className="card course-preview">
          <div className="section-heading">
            <h2>Your academy path</h2>
            <BookOpen size={18} />
          </div>
          <span className="level-tag">{level.label.toUpperCase()}</span>
          <h3>One sound at a time.</h3>
          <p>{level.description}</p>
          <div className="course-mini-path" aria-hidden="true">
            <span className="path-stop" />
            <span />
            <span className="path-stop" />
            <span />
            <span className="path-stop" />
            <span />
            <span className="path-stop" />
          </div>
          <div className="course-preview-caption">
            <span>Build the foundation</span>
            <span>Find your fluency</span>
          </div>
          <a
            className="resource-link"
            href="https://cwops.org/cw-academy/cw-academy-student-resources/"
            target="_blank"
            rel="noreferrer"
          >
            <span>
              Official student resources<small>Curriculum, tools & assignments</small>
            </span>
            <ExternalLink size={16} />
          </a>
          <button className="text-button" onClick={openCourse}>
            Explore the academy guide <ArrowRight size={14} />
          </button>
        </section>
      </div>
      <section className="card recent-card">
        <div className="section-heading">
          <div>
            <h2>Recent practice</h2>
            <p>Every session is a small step forward.</p>
          </div>
          <button className="text-button" onClick={openLogbook}>
            View practice log <ArrowRight size={15} />
          </button>
        </div>
        {entries.length ? (
          <div className="recent-list">
            {entries
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 3)
              .map(renderSession)}
          </div>
        ) : (
          <div className="summary-empty">
            <BookOpen size={24} aria-hidden="true" />
            <h3>Your story starts with one session.</h3>
            <p>Log a few minutes of listening, sending, or time on the air.</p>
            <button className="button outline" onClick={openLog}>
              <Plus size={15} /> Log your first practice
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
  unit,
  sub,
  orange = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit: string;
  sub: string;
  orange?: boolean;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <Icon size={18} className={orange ? 'text-orange' : ''} aria-hidden="true" />
      </div>
      <div className="stat-value">
        {value}
        <span>{unit}</span>
      </div>
      <p>{sub}</p>
    </div>
  );
}
