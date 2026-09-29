import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type {
  PublicKeyCredentialRequestOptionsJSON,
  PublicKeyCredentialCreationOptionsJSON,
} from '@simplewebauthn/browser';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  AudioLines,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  Clock3,
  Coffee,
  Download,
  ExternalLink,
  Fingerprint,
  Flame,
  Headphones,
  LayoutDashboard,
  LogOut,
  Menu,
  Pencil,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Shuffle,
  Signal,
  Square,
  Target,
  Trash2,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CourseLevel, PracticeKind, PracticeSession, Profile } from '../shared/training';
import {
  DEFAULT_PROFILE,
  PUBLIC_RESOURCES,
  COURSE_ROADMAP,
  courseMeetings,
  dateInTimezone,
  addDays,
  summarizePractice,
} from '../shared/training';
import { api, getEntries, getSettings, type Passkey, type User } from './api';
import { cleanMorseText, generatePractice, MorsePlayer } from './audio';
import './styles.css';
import Plan from './Plan';

type Page = 'overview' | 'practice' | 'logbook' | 'course' | 'settings';
const kinds: { id: PracticeKind; label: string; icon: LucideIcon; color: string }[] = [
  { id: 'listening', label: 'Listening', icon: Headphones, color: 'green' },
  { id: 'sending', label: 'Sending', icon: Radio, color: 'orange' },
  { id: 'head-copy', label: 'Head copy', icon: AudioLines, color: 'blue' },
  { id: 'icr', label: 'Instant recognition', icon: Signal, color: 'green' },
  { id: 'simulator', label: 'Simulator', icon: Radio, color: 'orange' },
  { id: 'on-air', label: 'On air', icon: Send, color: 'blue' },
  { id: 'other', label: 'Other practice', icon: BookOpen, color: 'green' },
];
const levels: { id: CourseLevel; label: string; description: string }[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    description: 'Build your foundation. Learn the sound of Morse and get comfortable sending.',
  },
  {
    id: 'fundamental',
    label: 'Fundamental',
    description: 'Strengthen instant character recognition and start copying words by ear.',
  },
  {
    id: 'intermediate',
    label: 'Intermediate',
    description: 'Develop conversational head copy and confidence on the air.',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Refine your fluency, increase your speed, and enjoy the conversation.',
  },
];
const kindInfo = (id: PracticeKind) => kinds.find((k) => k.id === id) ?? kinds[6];
const dateString = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dayOffset = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return dateString(d);
};
const prettyDate = (value: string, short = false) =>
  new Date(`${value}T12:00:00`).toLocaleDateString(
    undefined,
    short ? { month: 'short', day: 'numeric' } : { weekday: 'long', month: 'long', day: 'numeric' },
  );
const duration = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
const sampleEntries: PracticeSession[] = [
  {
    id: 'sample-1',
    date: dayOffset(0),
    kind: 'listening',
    minutes: 15,
    characterWpm: 20,
    effectiveWpm: 10,
    accuracy: 94,
    notes: 'Finding the rhythm. Short words are starting to click.',
    lesson: 4,
    createdAt: new Date().toISOString(),
    source: 'manual',
  },
  {
    id: 'sample-2',
    date: dayOffset(-1),
    kind: 'sending',
    minutes: 20,
    characterWpm: 20,
    effectiveWpm: 10,
    notes: 'Callsigns and a few familiar phrases.',
    lesson: 4,
    createdAt: new Date().toISOString(),
    source: 'manual',
  },
  {
    id: 'sample-3',
    date: dayOffset(-1),
    kind: 'head-copy',
    minutes: 10,
    characterWpm: 20,
    effectiveWpm: 9,
    accuracy: 88,
    notes: 'Letting go of the pencil.',
    lesson: 4,
    createdAt: new Date().toISOString(),
    source: 'manual',
  },
  {
    id: 'sample-4',
    date: dayOffset(-2),
    kind: 'listening',
    minutes: 25,
    characterWpm: 20,
    effectiveWpm: 9,
    accuracy: 86,
    notes: 'Five-letter groups, with plenty of space.',
    lesson: 3,
    createdAt: new Date().toISOString(),
    source: 'manual',
  },
  {
    id: 'sample-5',
    date: dayOffset(-3),
    kind: 'sending',
    minutes: 20,
    characterWpm: 20,
    effectiveWpm: 8,
    notes: 'A little practice before work.',
    lesson: 3,
    createdAt: new Date().toISOString(),
    source: 'manual',
  },
  {
    id: 'sample-6',
    date: dayOffset(-5),
    kind: 'listening',
    minutes: 15,
    characterWpm: 20,
    effectiveWpm: 8,
    accuracy: 82,
    notes: '',
    lesson: 3,
    createdAt: new Date().toISOString(),
    source: 'manual',
  },
  {
    id: 'sample-7',
    date: dayOffset(-6),
    kind: 'head-copy',
    minutes: 10,
    characterWpm: 20,
    effectiveWpm: 8,
    accuracy: 80,
    notes: '',
    lesson: 3,
    createdAt: new Date().toISOString(),
    source: 'manual',
  },
  {
    id: 'sample-8',
    date: dayOffset(-8),
    kind: 'sending',
    minutes: 15,
    characterWpm: 20,
    effectiveWpm: 8,
    notes: '',
    lesson: 2,
    createdAt: new Date().toISOString(),
    source: 'manual',
  },
];

function App() {
  const readPage = (): Page => {
    const value = window.location.hash.slice(1);
    return ['overview', 'practice', 'logbook', 'course', 'settings'].includes(value)
      ? (value as Page)
      : 'overview';
  };
  const [page, setPage] = useState<Page>(readPage);
  const [savedPracticeVersion, setSavedPracticeVersion] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [entries, setEntries] = useState<PracticeSession[]>([]);
  const [profile, setProfile] = useState<Profile>({
    ...DEFAULT_PROFILE,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [booting, setBooting] = useState(true);
  const [appError, setAppError] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [sessionEditor, setSessionEditor] = useState<Partial<PracticeSession> | null>(null);
  const [toast, setToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [demo, setDemo] = useState(true);
  const notify = (message: string) => setToast(message);
  const load = async (signedInUser?: User) => {
    const current = signedInUser ?? (await api<{ user: User | null }>('/me')).user;
    if (current?.id !== user?.id) {
      setEntries([]);
      setProfile(DEFAULT_PROFILE);
    }
    setUser(current);
    if (current) {
      const [sessionData, settingsData] = await Promise.all([getEntries(), getSettings()]);
      setEntries(sessionData.entries);
      setProfile(settingsData.settings);
      setDemo(false);
    }
  };
  useEffect(() => {
    load()
      .catch((error: Error) => setAppError(error.message))
      .finally(() => setBooting(false));
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 5500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    const changed = () => setPage(readPage());
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  useEffect(() => {
    if (!booting && !user && page === 'settings') {
      setPage('overview');
      window.location.hash = 'overview';
    }
  }, [booting, user, page]);
  const navigate = (next: Page) => {
    window.location.hash = next;
    setPage(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const openLog = (initial: Partial<PracticeSession> = {}) => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setSessionEditor({ date: dateInTimezone(new Date(), profile.timezone), ...initial });
  };
  useEffect(() => {
    if (!menuOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.querySelector<HTMLElement>('#workspace-navigation .nav-item')?.focus();
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        previouslyFocused?.focus();
      }
    };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [menuOpen]);
  const visibleEntries = user ? entries : demo ? sampleEntries : [];
  const signedIn = async (newUser: User) => {
    setAuthOpen(false);
    setBooting(true);
    setAppError('');
    try {
      await load(newUser);
      notify('You’re signed in. Make yourself at home.');
    } catch (error) {
      setAppError((error as Error).message);
    } finally {
      setBooting(false);
    }
  };
  const logout = async () => {
    try {
      await api('/auth/logout', {});
      setUser(null);
      setEntries([]);
      setProfile(DEFAULT_PROFILE);
      navigate('overview');
      setDemo(true);
      notify('You’ve been signed out.');
    } catch (error) {
      notify((error as Error).message);
    }
  };
  const navItems: { page: Page; label: string; icon: LucideIcon }[] = [
    { page: 'overview', label: 'Overview', icon: LayoutDashboard },
    { page: 'practice', label: 'Practice studio', icon: AudioLines },
    { page: 'logbook', label: 'Practice log', icon: BookOpen },
    { page: 'course', label: 'Academy guide', icon: CalendarDays },
  ];
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to main content
      </a>
      {menuOpen && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside id="workspace-navigation" className={`sidebar ${menuOpen ? 'is-open' : ''}`}>
        <button
          className="brand"
          onClick={() => navigate('overview')}
          aria-label="CW Academy Companion home"
        >
          <span className="brand-mark">
            <i />
            <b />
            <i />
            <b />
          </span>
          <span>
            CW Academy<small>COMPANION</small>
          </span>
        </button>
        <div className="sidebar-label">YOUR PRACTICE SPACE</div>
        <nav aria-label="Main navigation">
          {navItems.map((item) => (
            <button
              key={item.page}
              className={`nav-item ${page === item.page ? 'active' : ''}`}
              onClick={() => navigate(item.page)}
              aria-current={page === item.page ? 'page' : undefined}
            >
              <item.icon size={19} strokeWidth={1.7} />
              <span>{item.label}</span>
              {page === item.page && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-dots">· − · ·</span>
          <p>
            Progress is a practice.
            <br />
            Show up. Tune in.
            <br />
            Enjoy the conversation.
          </p>
          <span className="sidebar-note-line" />
        </div>
        <div className="sidebar-bottom">
          <a href="https://cwops.org/cw-academy/" target="_blank" rel="noreferrer">
            <span>About CW Academy</span>
            <ExternalLink size={14} />
          </a>
          <button
            className={`nav-item ${page === 'settings' ? 'active' : ''}`}
            onClick={() => (user ? navigate('settings') : setAuthOpen(true))}
          >
            <Settings2 size={18} />
            <span>{user ? 'Your account' : 'Save your progress'}</span>
          </button>
          <div className="sidebar-foot">
            An independent companion.
            <br />
            Made for the love of CW. <span>73.</span>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-start">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">
              <span className="workspace-label">Your workspace</span>
              <span className="mobile-workspace-label">CW Companion</span> <span>/</span>{' '}
              <strong>
                {page === 'settings' ? 'Account' : navItems.find((i) => i.page === page)?.label}
              </strong>
            </span>
          </div>
          <div className="topbar-end">
            <span className="online-indicator">
              <i /> {user ? 'Your private workspace' : 'Open to every operator'}
            </span>
            {user ? (
              <button className="avatar" onClick={() => navigate('settings')} title={user.email}>
                {(profile.callsign || profile.displayName || user.email).slice(0, 2).toUpperCase()}
              </button>
            ) : (
              <button className="button small outline" onClick={() => setAuthOpen(true)}>
                Sign in <ArrowRight size={15} />
              </button>
            )}
          </div>
        </header>
        <main id="main-content" className="main-content" tabIndex={-1}>
          {appError && (
            <div className="alert error" role="alert">
              {appError}
              <button
                onClick={() => {
                  setAppError('');
                  load().catch((e) => setAppError(e.message));
                }}
              >
                Try again
              </button>
            </div>
          )}
          {booting ? (
            <div className="loading-workspace">
              <span className="loading-spinner" />
              <p>Tuning in to your workspace…</p>
            </div>
          ) : (
            <>
              {!user && page !== 'practice' && page !== 'course' && (
                <div className="demo-banner">
                  <span>
                    <span className="demo-badge">TAKE A LOOK</span>{' '}
                    {demo
                      ? 'You’re exploring a sample practice log. Your journey starts here.'
                      : 'Your own quiet corner for making progress in CW.'}
                  </span>
                  <button onClick={() => setAuthOpen(true)}>
                    Make it yours <ArrowRight size={14} />
                  </button>
                </div>
              )}
              {page === 'overview' && (
                <Overview
                  entries={visibleEntries}
                  profile={profile}
                  user={user}
                  demo={!user && demo}
                  navigate={navigate}
                  openLog={openLog}
                />
              )}
              {page === 'practice' && (
                <Practice onLog={openLog} savedVersion={savedPracticeVersion} />
              )}
              {page === 'logbook' && (
                <Logbook
                  entries={visibleEntries}
                  profile={profile}
                  demo={!user}
                  openLog={openLog}
                  onEdit={(entry) => (user ? setSessionEditor(entry) : setAuthOpen(true))}
                  onDelete={async (id) => {
                    await api(`/entries/${id}`, {}, 'DELETE');
                    setEntries(entries.filter((entry) => entry.id !== id));
                    notify('Practice entry deleted.');
                  }}
                />
              )}
              {page === 'course' && (
                <Course
                  profile={profile}
                  entries={entries}
                  onLog={openLog}
                  user={user}
                  onSettings={() => (user ? navigate('settings') : setAuthOpen(true))}
                />
              )}
              {page === 'settings' && user && (
                <Account
                  user={user}
                  profile={profile}
                  setProfile={setProfile}
                  notify={notify}
                  logout={logout}
                  reload={load}
                  onReauth={() => setAuthOpen(true)}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>CW ACADEMY COMPANION</span>
            <p>
              A little practice, every day. <a href="/privacy.html">Privacy</a>
            </p>
            <span>
              − · · · &nbsp; · · − − &nbsp; <b>73</b>
            </span>
          </footer>
        </main>
      </div>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} onSuccess={signedIn} />}
      {sessionEditor && (
        <SessionModal
          initial={sessionEditor}
          onClose={() => setSessionEditor(null)}
          onSaved={(entry) => {
            setEntries((current) =>
              [entry, ...current.filter((item) => item.id !== entry.id)].sort((a, b) =>
                b.date.localeCompare(a.date),
              ),
            );
            setSessionEditor(null);
            if (entry.source === 'morse') setSavedPracticeVersion((v) => v + 1);
            notify('Practice logged. A little progress adds up.');
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function Overview({
  entries,
  profile,
  user,
  demo,
  navigate,
  openLog,
}: {
  entries: PracticeSession[];
  profile: Profile;
  user: User | null;
  demo: boolean;
  navigate: (page: Page) => void;
  openLog: (initial?: Partial<PracticeSession>) => void;
}) {
  const today = dateInTimezone(new Date(), profile.timezone);
  const practiceEntries = entries.filter(
    (e) => e.context !== 'class' && e.date <= today && e.minutes > 0,
  );
  const summary = summarizePractice(practiceEntries, today, profile.dailyGoalMinutes);
  const days = Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
  const weeklyEntries = practiceEntries.filter((e) => days.includes(e.date));
  const weekMinutes = weeklyEntries.reduce((n, e) => n + e.minutes, 0);
  const dayMinutes = summary.todayMinutes;
  const dailyGoal = profile.dailyGoalMinutes || 30;
  const activeDays = new Set(weeklyEntries.map((e) => e.date)).size;
  const speeds = weeklyEntries
    .filter((e) => e.effectiveWpm !== undefined)
    .map((e) => e.effectiveWpm!);
  const latestSpeed = speeds.length ? Math.max(...speeds) : null;
  const streak = summary.currentStreak;
  const level = levels.find((l) => l.id === profile.level) ?? levels[0];
  const name = profile.displayName?.split(' ')[0] || profile.callsign;
  const chartMax = Math.max(
    dailyGoal,
    ...days.map((day) =>
      practiceEntries.filter((e) => e.date === day).reduce((n, e) => n + e.minutes, 0),
    ),
    30,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="small-line" /> YOUR DAILY FREQUENCY
          </div>
          <h1>
            {user ? `Welcome back${name ? `, ${name}` : ''}.` : 'A little practice. A better fist.'}
          </h1>
          <p>
            {user
              ? 'Good habits make great operators. Let’s keep yours going.'
              : 'A thoughtful space for your CW Academy journey.'}
          </p>
        </div>
        <button className="button dark" onClick={() => openLog()}>
          <Plus size={17} /> Log practice
        </button>
      </div>
      <div className="overview-top-grid">
        <section className="hero-card">
          <div className="hero-content">
            <div className="hero-overline">
              <span className="live-dot" /> A LITTLE PRACTICE, EVERY DAY
            </div>
            <h2>
              Find your rhythm.
              <br />
              Build your confidence.
            </h2>
            <p>
              Listen a little closer. Send a little smoother.
              <br />
              Your next good conversation starts here.
            </p>
            <button className="button cream" onClick={() => navigate('practice')}>
              <Play size={14} fill="currentColor" /> Start a practice session{' '}
              <ArrowRight size={17} />
            </button>
            <span className="hero-caption">A quiet moment. A lasting habit.</span>
          </div>
          <div className="radio-illustration" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="orbit orbit-three" />
            <div className="radio-disc">
              <div className="dial-ticks" />
              <div className="dial-face">
                <span>LISTEN · LEARN · REPEAT</span>
                <div className="dial-center">
                  <AudioLines size={50} strokeWidth={1.05} />
                </div>
                <b>CW</b>
              </div>
              <div className="dial-marker" />
            </div>
            <div className="radio-bottom">
              14.025 <span>MHz</span>
            </div>
            <div className="illustration-dot d1" />
            <div className="illustration-dot d2" />
          </div>
        </section>
        <section className="daily-card">
          <div className="card-top">
            <span className="eyebrow">TODAY’S INTENTION</span>
            <Coffee size={18} />
          </div>
          <div
            className="goal-ring"
            style={
              {
                '--progress': `${Math.min(100, (dayMinutes / dailyGoal) * 100)}%`,
              } as React.CSSProperties
            }
          >
            <div>
              <strong>
                {Math.round(dayMinutes * 10) / 10}
                <span> / {dailyGoal}</span>
              </strong>
              <span>MINUTES PRACTICED</span>
            </div>
          </div>
          <h3>
            {dayMinutes >= dailyGoal
              ? 'A good day’s practice.'
              : dayMinutes
                ? 'You’re finding your rhythm.'
                : 'Make a little room for CW.'}
          </h3>
          <p>
            {dayMinutes >= dailyGoal
              ? 'Goal met. Every minute helps your ear grow.'
              : `${Math.round(Math.max(0, dailyGoal - dayMinutes) * 10) / 10} more minutes toward your daily goal.`}
          </p>
          <button className="text-button" onClick={() => (user ? navigate('settings') : openLog())}>
            Set your own pace <ArrowRight size={14} />
          </button>
        </section>
      </div>
      <section className="stats-grid" aria-label="Practice summary">
        <Stat
          icon={Clock3}
          label="PRACTICE IN 7 DAYS"
          value={String(Math.round(weekMinutes * 10) / 10)}
          unit="min"
          sub={`${weeklyEntries.length} sessions in the last 7 days`}
        />
        <Stat
          icon={Flame}
          label="CURRENT STREAK"
          value={String(streak)}
          unit={streak === 1 ? 'day' : 'days'}
          sub={streak ? 'Keep the frequency alive' : 'Every new habit starts with one'}
          orange
        />
        <Stat
          icon={CalendarDays}
          label="DAYS YOU SHOWED UP"
          value={String(activeDays)}
          unit="/ 7"
          sub="Small steps. Real progress."
        />
        <Stat
          icon={Signal}
          label="BEST EFFECTIVE SPEED"
          value={latestSpeed === null ? '—' : String(latestSpeed)}
          unit="wpm"
          sub="From this week’s practice"
        />
      </section>
      <div className="overview-bottom-grid">
        <section className="card weekly-card">
          <div className="section-heading">
            <div>
              <h2>The shape of your practice</h2>
              <p>A little consistency goes a long way.</p>
            </div>
            <span className="chip">
              <CalendarDays size={13} /> Last 7 days
            </span>
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-dot green-dot" /> Practice time
            </span>
            <span>
              <i className="legend-dash" /> Daily goal · {dailyGoal} min
            </span>
          </div>
          <div className="practice-chart">
            <div className="chart-y-axis">
              <span>{chartMax}m</span>
              <span>{Math.round(chartMax / 2)}m</span>
              <span>0</span>
            </div>
            <div className="chart-plot">
              <div className="chart-gridline line-top" />
              <div className="chart-gridline line-middle" />
              <div className="chart-gridline line-bottom" />
              <div className="chart-goal" style={{ bottom: `${(dailyGoal / chartMax) * 100}%` }} />
              {days.map((day) => {
                const minutes = practiceEntries
                  .filter((e) => e.date === day)
                  .reduce((n, e) => n + e.minutes, 0);
                return (
                  <div className={`chart-column ${day === today ? 'today-column' : ''}`} key={day}>
                    <div className="bar-area">
                      <div
                        className={`chart-bar ${day === today ? 'today-bar' : ''}`}
                        style={{
                          height: `${Math.max(minutes ? 3 : 0, (minutes / chartMax) * 100)}%`,
                        }}
                        title={`${prettyDate(day)}: ${minutes} minutes`}
                      >
                        <span>{Math.round(minutes * 10) / 10}m</span>
                      </div>
                    </div>
                    <span className="chart-day">
                      {day === today
                        ? 'Today'
                        : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, {
                            weekday: 'short',
                          })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="chart-bottom">
            <span>
              <TrendingUp size={15} />{' '}
              {activeDays >= 5
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
          <div className="course-mini-path">
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
          <button className="text-button" onClick={() => navigate('course')}>
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
          <button className="text-button" onClick={() => navigate('logbook')}>
            View practice log <ArrowRight size={15} />
          </button>
        </div>
        {entries.length ? (
          <div className="recent-list">
            {entries
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 3)
              .map((entry) => (
                <SessionRow key={entry.id} entry={entry} />
              ))}
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title="Your story starts with one session."
            description="Log a few minutes of listening, sending, or time on the air."
            action={
              <button className="button outline" onClick={() => openLog()}>
                <Plus size={15} /> Log your first practice
              </button>
            }
          />
        )}
      </section>
    </>
  );
}
function Stat({
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
        <Icon size={18} className={orange ? 'text-orange' : ''} />
      </div>
      <div className="stat-value">
        {value}
        <span>{unit}</span>
      </div>
      <p>{sub}</p>
    </div>
  );
}
function SessionRow({ entry, actions }: { entry: PracticeSession; actions?: React.ReactNode }) {
  const kind = kindInfo(entry.kind);
  return (
    <div className="session-row">
      <span className={`activity-icon ${kind.color}`}>
        <kind.icon size={19} />
      </span>
      <div className="session-summary">
        <strong>
          {kind.label}
          {entry.context === 'class' && <span className="lesson-label">Class</span>}
          {entry.lesson && <span className="lesson-label">Session {entry.lesson}</span>}
        </strong>
        <span>
          {entry.notes ||
            (entry.characterWpm
              ? `${entry.characterWpm} character WPM${entry.effectiveWpm ? ` · ${entry.effectiveWpm} effective WPM` : ''}`
              : 'A little progress, logged.')}
        </span>
      </div>
      <span className="session-date">
        {entry.date === dateString() ? 'Today' : prettyDate(entry.date, true)}
      </span>
      <strong className="session-minutes">
        {Math.round(entry.minutes * 100) / 100}
        <span> min</span>
      </strong>
      {actions}
    </div>
  );
}
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

function Practice({
  onLog,
  savedVersion,
}: {
  onLog: (initial?: Partial<PracticeSession>) => void;
  savedVersion: number;
}) {
  const [mode, setMode] = useState('words');
  const [text, setText] = useState('GOOD MORNING HAVE A GREAT DAY 73');
  const [characterWpm, setCharacterWpm] = useState(20);
  const [effectiveWpm, setEffectiveWpm] = useState(10);
  const [tone, setTone] = useState(600);
  const [volume, setVolume] = useState(40);
  const [playing, setPlaying] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(15);
  const [timerDone, setTimerDone] = useState(false);
  const previousSaved = useRef(savedVersion);
  useEffect(() => {
    if (previousSaved.current !== savedVersion) {
      setRunning(false);
      setSeconds(0);
      setTimerDone(false);
      previousSaved.current = savedVersion;
    }
  }, [savedVersion]);
  const player = useRef(new MorsePlayer());
  const startedAt = useRef(0);
  const elapsedAtStart = useRef(0);
  useEffect(() => () => player.current.stop(), []);
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const elapsed = elapsedAtStart.current + Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(Math.min(elapsed, timerMinutes * 60));
      if (elapsed >= timerMinutes * 60) {
        setRunning(false);
        setTimerDone(true);
        player.current.stop();
        setPlaying(false);
      }
    };
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [running, timerMinutes]);
  const startTimer = () => {
    if (timerDone) {
      setSeconds(0);
      elapsedAtStart.current = 0;
      setTimerDone(false);
    } else elapsedAtStart.current = seconds;
    startedAt.current = Date.now();
    setRunning(true);
  };
  const stopPlayback = () => {
    player.current.stop();
    setPlaying(false);
  };
  const play = async () => {
    if (playing) {
      stopPlayback();
      return;
    }
    setError('');
    setPlaying(true);
    try {
      await player.current.play(text, characterWpm, effectiveWpm, tone, volume / 100, () =>
        setPlaying(false),
      );
    } catch (err) {
      setError((err as Error).message);
      setPlaying(false);
    }
  };
  const generate = (newMode = mode) => {
    stopPlayback();
    setText(generatePractice(newMode));
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="small-line" /> TUNE IN. TAKE YOUR TIME.
          </div>
          <h1>Your practice studio.</h1>
          <p>A clear tone, a little space, and your full attention. Free for everyone.</p>
        </div>
        <span className="chip">
          <span className="status-dot" /> No sign-in needed
        </span>
      </div>
      <div className="practice-layout">
        <section className="card studio-card">
          <div className="section-heading">
            <div>
              <h2>The listening room</h2>
              <p>Hear the sound. Let the letters follow.</p>
            </div>
            <Headphones size={23} />
          </div>
          <div className="practice-tabs" role="group" aria-label="Practice content">
            {[
              ['words', 'Words'],
              ['groups', 'Letter groups'],
              ['numbers', 'Numbers'],
              ['callsigns', 'Callsigns'],
              ['custom', 'Your text'],
            ].map(([value, label]) => (
              <button
                className={mode === value ? 'selected' : ''}
                key={value}
                onClick={() => {
                  setMode(value);
                  if (value !== 'custom') generate(value);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="transmission-panel">
            <div className="transmission-label">
              <span>
                <i className={playing ? 'pulse-dot' : ''} />{' '}
                {playing ? 'TRANSMITTING' : 'READY TO LISTEN'}
              </span>
              <button onClick={() => setHidden(!hidden)}>
                {hidden ? 'Reveal text' : 'Hide text'}
              </button>
            </div>
            <label className="sr-only" htmlFor="practice-text">
              Practice text
            </label>
            {hidden ? (
              <div className="hidden-transmission">
                <AudioLines size={30} />
                <span>Trust your ears.</span>
                <button onClick={() => setHidden(false)}>Reveal when you’re ready</button>
              </div>
            ) : (
              <textarea
                id="practice-text"
                value={text}
                maxLength={1200}
                onChange={(e) => {
                  stopPlayback();
                  setText(e.target.value);
                  setMode('custom');
                }}
                spellCheck={false}
                aria-describedby="morse-text-help"
              />
            )}
            <div className={`waveform ${playing ? 'is-playing' : ''}`} aria-hidden="true">
              {Array.from({ length: 72 }, (_, i) => (
                <i
                  key={i}
                  style={
                    {
                      '--height': `${[10, 18, 8, 31, 44, 22, 12, 36, 16, 28, 7, 20][i % 12]}px`,
                      '--delay': `${i * 0.035}s`,
                    } as React.CSSProperties
                  }
                />
              ))}
            </div>
          </div>
          <p id="morse-text-help" className="field-hint">
            Letters, numbers, and common punctuation. Unsupported characters are skipped.
          </p>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <div className="playback-toolbar">
            <button
              className="button dark play-button"
              onClick={play}
              disabled={!cleanMorseText(text)}
            >
              {playing ? (
                <Square size={16} fill="currentColor" />
              ) : (
                <Play size={16} fill="currentColor" />
              )}
              {playing ? 'Stop playback' : 'Play Morse'}
            </button>
            <button
              className="button outline"
              onClick={() => generate()}
              disabled={mode === 'custom'}
            >
              <Shuffle size={16} /> New set
            </button>
            <span className="playback-note">
              {characterWpm} / {effectiveWpm} WPM <span>·</span> {tone} Hz
            </span>
          </div>
          <div className="studio-divider" />
          <div className="studio-controls">
            <Range
              label="Character speed"
              value={characterWpm}
              min={5}
              max={50}
              unit="WPM"
              onChange={(v) => {
                stopPlayback();
                setCharacterWpm(v);
                setEffectiveWpm(Math.min(effectiveWpm, v));
              }}
              hint="The speed of each individual character."
            />
            <Range
              label="Effective speed"
              value={effectiveWpm}
              min={3}
              max={characterWpm}
              unit="WPM"
              onChange={(v) => {
                stopPlayback();
                setEffectiveWpm(v);
              }}
              hint="Farnsworth spacing gives you time to hear."
            />
            <Range
              label="Sidetone"
              value={tone}
              min={300}
              max={1000}
              step={25}
              unit="Hz"
              onChange={(v) => {
                stopPlayback();
                setTone(v);
              }}
              hint="Find a comfortable pitch for your ears."
            />
            <Range
              label="Volume"
              value={volume}
              min={5}
              max={100}
              unit="%"
              onChange={(v) => {
                stopPlayback();
                setVolume(v);
              }}
              hint="Start softly. Comfort comes first."
            />
          </div>
        </section>
        <div className="practice-aside">
          <section className="card timer-card">
            <div className="card-top">
              <span className="eyebrow">A MOMENT FOR MORSE</span>
              <Clock3 size={18} />
            </div>
            <h2>Make a little time.</h2>
            <p>Short, focused sessions add up.</p>
            <div className={`timer-readout ${running ? 'running' : ''}`} aria-live="off">
              {duration(Math.max(0, timerMinutes * 60 - seconds))}
            </div>
            <div className="timer-presets">
              {[5, 10, 15, 30].map((minutes) => (
                <button
                  key={minutes}
                  className={timerMinutes === minutes ? 'selected' : ''}
                  disabled={running}
                  onClick={() => {
                    setTimerMinutes(minutes);
                    setSeconds(0);
                    setTimerDone(false);
                  }}
                >
                  {minutes} min
                </button>
              ))}
            </div>
            <button
              className="button dark full"
              onClick={() => (running ? setRunning(false) : startTimer())}
            >
              {running ? <Square size={14} /> : <Play size={14} />}
              {running ? 'Pause timer' : seconds > 0 && !timerDone ? 'Resume timer' : 'Start timer'}
            </button>
            <div className="timer-secondary">
              <button
                className="text-button"
                onClick={() => {
                  setRunning(false);
                  setSeconds(0);
                  setTimerDone(false);
                }}
              >
                <RotateCcw size={13} /> Reset
              </button>
              <button
                className="text-button"
                disabled={seconds < 60}
                onClick={() => {
                  setRunning(false);
                  onLog({
                    kind: 'listening',
                    minutes: Math.max(1, Math.floor(seconds / 60)),
                    characterWpm,
                    effectiveWpm,
                    source: 'morse',
                  });
                }}
              >
                Log {Math.floor(seconds / 60)} min <ArrowRight size={13} />
              </button>
            </div>
            {timerDone && (
              <div className="timer-complete" role="status">
                <CheckCheck size={18} /> A little practice, well spent. Log your session to save it.
              </div>
            )}
          </section>
          <section className="practice-tip">
            <span className="eyebrow">A NOTE FROM THE SHACK</span>
            <h3>Listen for the music.</h3>
            <p>
              Try hearing each character as one complete sound, rather than counting dots and
              dashes. Leave a little space. Let it sink in.
            </p>
            <div className="morse-word" aria-label="73 in Morse code">
              − − · · · &nbsp; · · · − −
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (value: number) => void;
  hint: string;
}) {
  const id = React.useId();
  return (
    <div className="range-control">
      <div>
        <label htmlFor={id}>{label}</label>
        <span>
          {value} <small>{unit}</small>
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p>{hint}</p>
    </div>
  );
}

function Logbook({
  entries,
  profile,
  demo,
  openLog,
  onEdit,
  onDelete,
}: {
  entries: PracticeSession[];
  profile: Profile;
  demo: boolean;
  openLog: () => void;
  onEdit: (entry: PracticeSession) => void;
  onDelete: (id: string) => Promise<void>;
}) {
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState('');
  const practiceSummary = summarizePractice(
    entries,
    dateInTimezone(new Date(), profile.timezone),
    profile.dailyGoalMinutes,
  );
  const shown = entries
    .filter(
      (e) =>
        (filter === 'all' || e.kind === filter) &&
        `${e.notes} ${kindInfo(e.kind).label} ${e.date}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="small-line" /> YOUR SMALL STEPS, ALL TOGETHER
          </div>
          <h1>Keep a record. See the progress.</h1>
          <p>A log of the minutes that make you a more confident operator.</p>
        </div>
        <button className="button dark" onClick={openLog}>
          <Plus size={17} /> Log practice
        </button>
      </div>
      <div className="logbook-summary">
        <div>
          <strong>{Math.round(practiceSummary.totalMinutes * 10) / 10}</strong>
          <span>minutes of practice</span>
        </div>
        <div>
          <strong>{entries.length}</strong>
          <span>sessions logged</span>
        </div>
        <div>
          <strong>{practiceSummary.practiceDays}</strong>
          <span>days you showed up</span>
        </div>
      </div>
      <section className="card logbook-card">
        <div className="logbook-toolbar">
          <h2>Practice log {demo && <span className="sample-label">SAMPLE DATA</span>}</h2>
          <div>
            <label className="sr-only" htmlFor="search-log">
              Search practice log
            </label>
            <input
              id="search-log"
              placeholder="Search your notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label className="sr-only" htmlFor="filter-log">
              Filter practice activity
            </label>
            <select id="filter-log" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All activities</option>
              {kinds.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && <div className="alert error">{error}</div>}
        {shown.length ? (
          <div className="logbook-rows">
            {shown.map((entry) => (
              <SessionRow
                key={entry.id}
                entry={entry}
                actions={
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      aria-label={`Edit ${kindInfo(entry.kind).label} on ${entry.date}`}
                      onClick={() => onEdit(entry)}
                    >
                      <Pencil size={15} />
                    </button>
                    {!demo && (
                      <button
                        className="icon-button danger-text"
                        aria-label={`Delete ${kindInfo(entry.kind).label} on ${entry.date}`}
                        onClick={() => setDeleting(entry.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                }
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={BookOpen}
            title={
              entries.length ? 'No sessions match that search.' : 'Your first session belongs here.'
            }
            description={
              entries.length
                ? 'Try a different word or activity.'
                : 'Listening, sending, head copy, or a good QSO. It all counts.'
            }
            action={
              !entries.length && (
                <button className="button outline" onClick={openLog}>
                  Log your first session <ArrowRight size={14} />
                </button>
              )
            }
          />
        )}
      </section>
      {deleting && (
        <Modal title="Delete this practice entry?" onClose={() => setDeleting(null)}>
          <p className="modal-intro">
            This removes one session from your practice log. Your other sessions stay in place.
          </p>
          <div className="modal-actions">
            <button className="button outline" onClick={() => setDeleting(null)}>
              Keep entry
            </button>
            <button
              className="button danger"
              onClick={async () => {
                try {
                  await onDelete(deleting);
                  setDeleting(null);
                } catch (e) {
                  setDeleting(null);
                  setError((e as Error).message);
                }
              }}
            >
              Delete entry
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function Course({
  profile,
  entries,
  onLog,
  user,
  onSettings,
}: {
  profile: Profile;
  entries: PracticeSession[];
  onLog: (initial?: Partial<PracticeSession>) => void;
  user: User | null;
  onSettings: () => void;
}) {
  const [selectedLevel, setSelectedLevel] = useState<CourseLevel>(profile.level);
  const meetings = courseMeetings(profile);
  const nextMeeting = meetings.find((m) => m.date >= dateInTimezone(new Date(), profile.timezone));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="small-line" /> A JOURNEY BEST TAKEN TOGETHER
          </div>
          <h1>A guide for the road ahead.</h1>
          <p>Find your level, build a routine, and keep your advisor’s guidance close.</p>
        </div>
        <a
          className="button outline"
          href="https://cwops.org/cw-academy/"
          target="_blank"
          rel="noreferrer"
        >
          Visit CW Academy <ExternalLink size={15} />
        </a>
      </div>
      {user && <Plan profile={profile} entries={entries} onLog={onLog} />}
      <div className="course-intro">
        <div>
          <span className="eyebrow">YOUR ACADEMY JOURNEY</span>
          <h2>
            Different starting points.
            <br />
            The same love of CW.
          </h2>
          <p>
            CW Academy brings operators together to learn Morse code. This independent companion
            helps you track the practice between classes.
          </p>
        </div>
        <div className="course-intro-note">
          <BookOpen size={25} />
          <h3>Follow your advisor.</h3>
          <p>
            The official curriculum and your advisor’s assignments come first. The prompts below are
            here to help you reflect and build a habit.
          </p>
          <a
            href="https://cwops.org/cw-academy/cw-academy-student-resources/"
            target="_blank"
            rel="noreferrer"
          >
            Open official student resources <ArrowRight size={15} />
          </a>
        </div>
      </div>
      <div className="course-levels" role="group" aria-label="Explore academy levels">
        {levels.map((level, index) => (
          <button
            key={level.id}
            className={`course-level ${selectedLevel === level.id ? 'selected' : ''}`}
            onClick={() => setSelectedLevel(level.id)}
          >
            <span>
              0{index + 1}
              <Signal size={17} />
            </span>
            <h3>{level.label}</h3>
            <p>{level.description}</p>
            {selectedLevel === level.id && (
              <span className="level-selected">
                <Check size={13} /> Exploring this level
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="section-heading outside-heading">
        <div>
          <h2>Eight weeks of showing up</h2>
          <p>Personal reflection prompts to accompany your official course.</p>
        </div>
        <button className="text-button" onClick={onSettings}>
          {meetings.length ? 'Edit your course schedule' : 'Set your course schedule'}{' '}
          <ArrowRight size={14} />
        </button>
      </div>
      {meetings.length > 0 && (
        <div className="schedule-strip">
          <CalendarDays size={20} />
          <div>
            <strong>
              {nextMeeting
                ? `Next planned class: ${prettyDate(nextMeeting.date)}`
                : 'Your planned course dates are complete.'}
            </strong>
            <span>
              {nextMeeting
                ? `Session ${nextMeeting.lesson} · ${profile.timezone}. Confirm meeting changes with your advisor.`
                : 'Keep the habit going, one good session at a time.'}
            </span>
          </div>
        </div>
      )}
      <div className="roadmap-grid">
        {COURSE_ROADMAP.map((week) => {
          const dates = meetings.filter((m) => m.week === week.week);
          return (
            <section key={week.week} className="card roadmap-card">
              <span className="week-label">WEEK {String(week.week).padStart(2, '0')}</span>
              <h3>{week.title}</h3>
              <p>{week.description}</p>
              <div className="focus-tags">
                {week.focus.map((focus) => (
                  <span key={focus}>{focus}</span>
                ))}
              </div>
              {dates.length > 0 && (
                <div className="roadmap-dates">
                  {dates.map((d) => (
                    <span key={d.lesson}>
                      Session {d.lesson}: {prettyDate(d.date, true)}
                    </span>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
      <div className="section-heading outside-heading">
        <div>
          <h2>Good company for your practice</h2>
          <p>A few trusted places to listen, learn, and get on the air.</p>
        </div>
      </div>
      <div className="resources-grid">
        {PUBLIC_RESOURCES.map((resource) => (
          <a
            className="card resource-card"
            key={resource.id}
            href={resource.url}
            target="_blank"
            rel="noreferrer"
          >
            <div>
              <span className="eyebrow">{resource.category}</span>
              <ExternalLink size={16} />
            </div>
            <h3>{resource.title}</h3>
            <p>{resource.description}</p>
          </a>
        ))}
      </div>
      <p className="independence-note">
        CW Academy Companion is independently built and is not affiliated with, endorsed by, or
        operated by CWops or CW Academy. CWops and CW Academy names identify their respective
        programs.
      </p>
    </>
  );
}

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const elements = () =>
      Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
        ) ?? [],
      );
    // Establish focus before the dialog is painted. A delayed autofocus can
    // steal focus from a field the user has already started filling.
    const target = panel.current?.querySelector<HTMLElement>('[autofocus], input') ?? elements()[0];
    target?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const all = elements();
        const first = all[0];
        const last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', handle);
    return () => {
      document.removeEventListener('keydown', handle);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? 'wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panel}
      >
        <div className="modal-heading">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function AuthModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (user: User) => void;
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const requestCode = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/auth/email/request', { email });
      setStep('code');
      setCode('');
      setResendAt(Date.now() + 60000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api<{ user: User }>('/auth/email/verify', {
        email,
        code,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      onSuccess(result.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const passkey = async () => {
    setBusy(true);
    setError('');
    try {
      const options = await api<PublicKeyCredentialRequestOptionsJSON>(
        '/auth/passkeys/login/options',
        {},
      );
      const response = await startAuthentication({ optionsJSON: options });
      const result = await api<{ user: User }>('/auth/passkeys/login/verify', { response });
      onSuccess(result.user);
    } catch (err) {
      setError(
        (err as Error).name === 'NotAllowedError'
          ? 'The passkey prompt was closed. You can try again or use an email code.'
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={step === 'email' ? 'Your practice. Your progress.' : 'Check your inbox.'}
      onClose={onClose}
    >
      <div className="auth-symbol">
        <Radio size={30} strokeWidth={1.5} />
      </div>
      <p className="modal-intro">
        {step === 'email' ? (
          'Keep your sessions, goals, and course notes together. No password to remember.'
        ) : (
          <>
            We sent a six-digit sign-in code to <strong>{email}</strong>. It expires in five
            minutes.
          </>
        )}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          step === 'email' ? requestCode() : verify();
        }}
      >
        {step === 'email' ? (
          <label className="field">
            Email address
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              maxLength={254}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={busy}
            />
          </label>
        ) : (
          <label className="field">
            One-time code
            <input
              className="code-input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              disabled={busy}
            />
          </label>
        )}
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <button
          className="button dark full"
          disabled={busy || (step === 'code' && code.length !== 6)}
          type="submit"
        >
          {busy ? 'One moment…' : step === 'email' ? 'Email me a sign-in code' : 'Sign in'}
          {!busy && <ArrowRight size={16} />}
        </button>
      </form>
      {step === 'email' ? (
        <>
          <div className="or-divider">
            <span>or, if you’ve set one up</span>
          </div>
          <button
            className="button outline full"
            onClick={passkey}
            disabled={busy || !window.PublicKeyCredential}
          >
            <Fingerprint size={19} /> Sign in with a passkey
          </button>
        </>
      ) : (
        <div className="auth-code-actions">
          <button
            className="text-button"
            onClick={() => {
              setStep('email');
              setError('');
            }}
            disabled={busy}
          >
            <ArrowLeft size={13} /> Change email
          </button>
          <button className="text-button" disabled={busy || now < resendAt} onClick={requestCode}>
            {now < resendAt
              ? `Resend in ${Math.ceil((resendAt - now) / 1000)}s`
              : 'Send another code'}
          </button>
        </div>
      )}
      <p className="auth-fineprint">
        <ShieldCheck size={15} /> Your practice log is private to your account.
      </p>
    </Modal>
  );
}

function SessionModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Partial<PracticeSession>;
  onClose: () => void;
  onSaved: (entry: PracticeSession) => void;
}) {
  const [form, setForm] = useState({
    date: initial.date ?? dateString(),
    kind: initial.kind ?? 'listening',
    minutes: String(initial.minutes ?? 15),
    characterWpm: initial.characterWpm === undefined ? '' : String(initial.characterWpm),
    effectiveWpm: initial.effectiveWpm === undefined ? '' : String(initial.effectiveWpm),
    accuracy: initial.accuracy === undefined ? '' : String(initial.accuracy),
    lesson: initial.lesson === undefined ? '' : String(initial.lesson),
    notes: initial.notes ?? '',
    context: initial.context ?? 'practice',
    qsoCount: initial.qsoCount === undefined ? '' : String(initial.qsoCount),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    const data: Record<string, unknown> = {
      ...initial,
      date: form.date,
      kind: form.kind,
      minutes: Number(form.minutes),
      notes: form.notes,
      context: form.context,
      source: initial.source ?? 'manual',
    };
    for (const key of ['characterWpm', 'effectiveWpm', 'accuracy', 'lesson', 'qsoCount'] as const) {
      if (form[key] !== '') data[key] = Number(form[key]);
      else delete data[key];
    }
    try {
      const result = await api<{ entry: PracticeSession }>(
        initial.id ? `/entries/${initial.id}` : '/entries',
        data,
        initial.id ? 'PUT' : 'POST',
      );
      onSaved(result.entry);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={initial.id ? 'A closer look at your practice.' : 'A little progress, worth recording.'}
      onClose={onClose}
      wide
    >
      <p className="modal-intro">
        Capture what you practiced and how it felt. The details are up to you.
      </p>
      <form onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            Activity
            <select value={form.kind} onChange={(e) => update('kind', e.target.value)}>
              {kinds.map((kind) => (
                <option key={kind.id} value={kind.id}>
                  {kind.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Practice date
            <input
              type="date"
              value={form.date}
              required
              onChange={(e) => update('date', e.target.value)}
            />
          </label>
          <label className="field">
            Time practiced <span className="label-hint">minutes</span>
            <input
              type="number"
              min="0"
              max="1440"
              step="any"
              required
              value={form.minutes}
              onChange={(e) => update('minutes', e.target.value)}
            />
          </label>
          <label className="field">
            Academy session <span className="label-hint">optional</span>
            <select value={form.lesson} onChange={(e) => update('lesson', e.target.value)}>
              <option value="">No session selected</option>
              {Array.from({ length: 16 }, (_, i) => (
                <option key={i} value={i + 1}>
                  Session {i + 1}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-grid three">
          <label className="field">
            Character WPM
            <input
              type="number"
              min="1"
              max="150"
              step="0.1"
              placeholder="Optional"
              value={form.characterWpm}
              onChange={(e) => update('characterWpm', e.target.value)}
            />
          </label>
          <label className="field">
            Effective WPM
            <input
              type="number"
              min="1"
              max={form.characterWpm || 150}
              step="0.1"
              placeholder="Optional"
              value={form.effectiveWpm}
              onChange={(e) => update('effectiveWpm', e.target.value)}
            />
          </label>
          <label className="field">
            Accuracy <span className="label-hint">%</span>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              placeholder="Optional"
              value={form.accuracy}
              onChange={(e) => update('accuracy', e.target.value)}
            />
          </label>
        </div>
        {form.kind === 'on-air' && (
          <label className="field">
            QSO count <span className="label-hint">optional</span>
            <input
              type="number"
              min="0"
              max="100000"
              value={form.qsoCount}
              onChange={(e) => update('qsoCount', e.target.value)}
            />
          </label>
        )}
        <label className="field">
          Notes <span className="label-hint">optional</span>
          <textarea
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            maxLength={10000}
            rows={3}
            placeholder="What clicked? What would you like to try next time?"
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.context === 'class'}
            onChange={(e) => update('context', e.target.checked ? 'class' : 'practice')}
          />{' '}
          This was a class meeting <span>(kept separate from practice goals)</span>
        </label>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button className="button outline" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button dark" disabled={busy} type="submit">
            {busy ? 'Saving…' : initial.id ? 'Save changes' : 'Save practice'}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Account({
  user,
  profile,
  setProfile,
  notify,
  logout,
  reload,
  onReauth,
}: {
  user: User;
  profile: Profile;
  setProfile: (profile: Profile) => void;
  notify: (message: string) => void;
  logout: () => void;
  reload: () => Promise<void>;
  onReauth: () => void;
}) {
  const [form, setForm] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(true);
  const [keyBusy, setKeyBusy] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [removeKey, setRemoveKey] = useState<Passkey | null>(null);
  const [importData, setImportData] = useState<{
    data: unknown;
    name: string;
    count: number;
  } | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [dataBusy, setDataBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const loadPasskeys = async () => {
    const data = await api<{ passkeys: Passkey[] }>('/auth/passkeys');
    setPasskeys(data.passkeys);
  };
  useEffect(() => {
    loadPasskeys()
      .catch((e) => setError(e.message))
      .finally(() => setPasskeysLoading(false));
  }, []);
  useEffect(() => setForm(profile), [profile]);
  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const result = await api<{ settings: Profile }>('/settings', form, 'PUT');
      setProfile(result.settings);
      notify('Your preferences are saved.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const register = async () => {
    setKeyBusy(true);
    setError('');
    try {
      const options = await api<PublicKeyCredentialCreationOptionsJSON>(
        '/auth/passkeys/register/options',
        {},
      );
      const response = await startRegistration({ optionsJSON: options });
      await api('/auth/passkeys/register/verify', {
        response,
        name: keyName.trim() || 'My passkey',
      });
      await loadPasskeys();
      setKeyName('');
      notify('Passkey added. Next time, just use your device to sign in.');
    } catch (err) {
      setError(
        (err as Error).name === 'NotAllowedError'
          ? 'The passkey prompt was closed. You can try again when you’re ready.'
          : (err as Error).message,
      );
    } finally {
      setKeyBusy(false);
    }
  };
  const exportData = async () => {
    setDataBusy(true);
    setError('');
    try {
      const data = await api<unknown>('/export');
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data)], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `cw-academy-backup-${dateString()}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify('Your practice backup has been downloaded.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDataBusy(false);
    }
  };
  const inspectImport = async (file?: File) => {
    if (!file) return;
    setError('');
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error('Choose a JSON backup smaller than 8 MB.');
      const data = JSON.parse(await file.text());
      const count =
        data.sessions?.length ?? data.snapshot?.attempts?.length ?? data.attempts?.length;
      if (!Number.isInteger(count))
        throw new Error(
          'This file is not a recognized Companion backup or n1rwj.com training export.',
        );
      setImportData({ data, name: file.name, count });
      setImportMode('merge');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };
  const doImport = async () => {
    if (!importData) return;
    setDataBusy(true);
    setError('');
    try {
      const result = await api<{ imported: number; skipped: number }>('/import', {
        data: importData.data,
        mode: importMode,
      });
      await reload();
      setImportData(null);
      notify(
        `Imported ${result.imported} sessions${result.skipped ? `; ${result.skipped} duplicates skipped` : ''}.`,
      );
    } catch (err) {
      setError((err as Error).message);
      setImportData(null);
    } finally {
      setDataBusy(false);
    }
  };
  const doReset = async () => {
    setDataBusy(true);
    setError('');
    try {
      await api('/reset', { confirmation: resetText });
      await reload();
      setResetOpen(false);
      setResetText('');
      notify('Practice data reset. You can import a fresh backup whenever you’re ready.');
    } catch (err) {
      setError((err as Error).message);
      setResetOpen(false);
    } finally {
      setDataBusy(false);
    }
  };
  const timezones = Array.from(
    new Set([
      profile.timezone,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Anchorage',
      'Pacific/Honolulu',
      'America/Toronto',
      'America/Vancouver',
      'America/Sao_Paulo',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Asia/Tokyo',
      'Asia/Kolkata',
      'Australia/Sydney',
      'Pacific/Auckland',
    ]),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="small-line" /> MAKE YOURSELF AT HOME
          </div>
          <h1>Your space, at your pace.</h1>
          <p>Your practice preferences, sign-in methods, and a copy of your data.</p>
        </div>
        <button className="button outline" onClick={logout}>
          <LogOut size={16} /> Sign out
        </button>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      <div className="account-layout">
        <section className="card account-card">
          <div className="section-heading">
            <div>
              <h2>Your practice preferences</h2>
              <p>Build a routine that fits your life.</p>
            </div>
            <Target size={20} />
          </div>
          <form onSubmit={saveProfile}>
            <div className="form-grid">
              <label className="field">
                Name
                <input
                  value={form.displayName}
                  maxLength={100}
                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                  placeholder="What should we call you?"
                />
              </label>
              <label className="field">
                Callsign <span className="label-hint">optional</span>
                <input
                  value={form.callsign}
                  maxLength={30}
                  onChange={(e) => setForm({ ...form, callsign: e.target.value.toUpperCase() })}
                  placeholder="N0CALL"
                />
              </label>
              <label className="field">
                Your course level
                <select
                  value={form.level}
                  onChange={(e) => setForm({ ...form, level: e.target.value as CourseLevel })}
                >
                  {levels.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Daily practice goal <span className="label-hint">minutes</span>
                <input
                  type="number"
                  min="5"
                  max="480"
                  required
                  value={form.dailyGoalMinutes}
                  onChange={(e) => setForm({ ...form, dailyGoalMinutes: Number(e.target.value) })}
                />
              </label>
              <label className="field">
                First class date <span className="label-hint">optional</span>
                <input
                  type="date"
                  value={form.firstClassDate}
                  onChange={(e) => setForm({ ...form, firstClassDate: e.target.value })}
                />
              </label>
              <label className="field">
                Practice timezone
                <input
                  list="timezones"
                  value={form.timezone}
                  required
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                />
                <datalist id="timezones">
                  {timezones.map((timezone) => (
                    <option value={timezone} key={timezone} />
                  ))}
                </datalist>
              </label>
            </div>
            <fieldset className="weekday-field">
              <legend>Class meeting days</legend>
              <div>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => (
                  <label key={day} className={form.classDays.includes(index) ? 'selected' : ''}>
                    <input
                      type="checkbox"
                      checked={form.classDays.includes(index)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          classDays: e.target.checked
                            ? [...form.classDays, index].sort()
                            : form.classDays.filter((d) => d !== index),
                        })
                      }
                    />
                    <span>{day}</span>
                  </label>
                ))}
              </div>
              <p className="field-hint">
                Used to plan your 16 class dates. Confirm your actual schedule with your advisor.
              </p>
            </fieldset>
            <button className="button dark" type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save preferences'}
              <Check size={16} />
            </button>
          </form>
        </section>
        <div className="account-side">
          <section className="card account-card security-card">
            <div className="section-heading">
              <div>
                <h2>A simple, secure sign-in.</h2>
                <p>{user.email}</p>
              </div>
              <Fingerprint size={24} />
            </div>
            <p>
              Use a one-time email code, or add a passkey to sign in with your fingerprint, face, or
              device PIN.
            </p>
            {passkeysLoading ? (
              <p className="field-hint">Loading your passkeys…</p>
            ) : passkeys.length ? (
              <div className="passkey-list">
                {passkeys.map((key) => (
                  <div className="passkey-row" key={key.id}>
                    <Fingerprint size={18} />
                    <div>
                      <strong>{key.name}</strong>
                      <span>Added {new Date(key.createdAt).toLocaleDateString()}</span>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${key.name}`}
                      onClick={() => setRemoveKey(key)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-passkeys">
                <ShieldCheck size={18} /> No passkeys yet. Email codes are ready to use.
              </div>
            )}
            <label className="field">
              Passkey name
              <input
                value={keyName}
                maxLength={100}
                placeholder="e.g. My MacBook"
                onChange={(e) => setKeyName(e.target.value)}
              />
            </label>
            <button
              className="button outline full"
              onClick={register}
              disabled={keyBusy || !window.PublicKeyCredential}
            >
              <Fingerprint size={18} />
              {keyBusy ? 'Follow your device prompt…' : 'Add a passkey'}
            </button>
            <button className="text-button reauth-button" onClick={onReauth}>
              Verify sign-in again <ArrowRight size={13} />
            </button>
          </section>
          <section className="privacy-note">
            <ShieldCheck size={20} />
            <div>
              <h3>Your log stays yours.</h3>
              <p>
                Your practice records are private. Export them anytime and take your progress with
                you.
              </p>
            </div>
          </section>
        </div>
      </div>
      <section className="card data-card">
        <div className="section-heading">
          <div>
            <h2>Your progress is portable.</h2>
            <p>Keep a backup, bring in an existing log, or start fresh.</p>
          </div>
          <ArrowDownToLine size={21} />
        </div>
        <div className="data-options">
          <div>
            <span className="activity-icon green">
              <Download size={20} />
            </span>
            <h3>Take a copy</h3>
            <p>Download your sessions, preferences, and preserved import data as a JSON backup.</p>
            <button className="button outline" onClick={exportData} disabled={dataBusy}>
              <Download size={15} /> Export backup
            </button>
          </div>
          <div>
            <span className="activity-icon blue">
              <Upload size={20} />
            </span>
            <h3>Bring your practice along</h3>
            <p>
              Import a Companion backup or your n1rwj.com training export. Reimports can skip
              duplicates.
            </p>
            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              accept="application/json,.json"
              onChange={(e) => inspectImport(e.target.files?.[0])}
              tabIndex={-1}
              aria-label="Choose a training backup"
            />
            <button
              className="button outline"
              onClick={() => fileInput.current?.click()}
              disabled={dataBusy}
            >
              <Upload size={15} /> Import backup
            </button>
          </div>
          <div>
            <span className="activity-icon orange">
              <RotateCcw size={20} />
            </span>
            <h3>A fresh page</h3>
            <p>
              Clear your sessions, private plan, and course preferences, then reimport whenever
              you’re ready. Your sign-in stays.
            </p>
            <button
              className="button outline danger-text"
              onClick={() => setResetOpen(true)}
              disabled={dataBusy}
            >
              Reset practice data
            </button>
          </div>
        </div>
      </section>
      <p className="independence-note">
        Email addresses are used for sign-in. Practice records are stored privately for your
        account. To keep your own archive, export a backup before replacing or resetting data.
      </p>
      {removeKey && (
        <Modal title="Remove this passkey?" onClose={() => setRemoveKey(null)}>
          <p className="modal-intro">
            You’ll remove “{removeKey.name}” from this account. You can still sign in with an email
            code.
          </p>
          <div className="modal-actions">
            <button className="button outline" onClick={() => setRemoveKey(null)}>
              Keep passkey
            </button>
            <button
              className="button danger"
              disabled={keyBusy}
              onClick={async () => {
                setKeyBusy(true);
                try {
                  await api(`/auth/passkeys/${encodeURIComponent(removeKey.id)}`, {}, 'DELETE');
                  await loadPasskeys();
                  setRemoveKey(null);
                  notify('Passkey removed.');
                } catch (err) {
                  setError((err as Error).message);
                  setRemoveKey(null);
                } finally {
                  setKeyBusy(false);
                }
              }}
            >
              Remove passkey
            </button>
          </div>
        </Modal>
      )}
      {importData && (
        <Modal title="Bring your practice along." onClose={() => setImportData(null)}>
          <p className="modal-intro">
            <strong>{importData.name}</strong>
            <br />
            {importData.count} records found. The server will validate the file before saving any
            changes.
          </p>
          <label className="import-choice">
            <input
              type="radio"
              checked={importMode === 'merge'}
              onChange={() => setImportMode('merge')}
              name="import-mode"
            />
            <span>
              <strong>Merge with my practice log</strong>
              <small>Add new sessions and skip records already imported.</small>
            </span>
          </label>
          <label className="import-choice">
            <input
              type="radio"
              checked={importMode === 'replace'}
              onChange={() => setImportMode('replace')}
              name="import-mode"
            />
            <span>
              <strong>Replace my practice data</strong>
              <small>
                Remove current sessions and private plan, then apply this backup. Export a backup
                first if you want to keep them.
              </small>
            </span>
          </label>
          <div className="modal-actions">
            <button className="button outline" onClick={() => setImportData(null)}>
              Cancel
            </button>
            <button
              className={`button ${importMode === 'replace' ? 'danger' : 'dark'}`}
              disabled={dataBusy}
              onClick={doImport}
            >
              {dataBusy
                ? 'Importing…'
                : importMode === 'replace'
                  ? 'Replace and import'
                  : 'Import sessions'}
              <Upload size={15} />
            </button>
          </div>
        </Modal>
      )}
      {resetOpen && (
        <Modal title="Start with a fresh page?" onClose={() => setResetOpen(false)}>
          <p className="modal-intro">
            This deletes your practice sessions, private plan, imported archive, and course
            preferences. Your account and passkeys stay active. Export a backup first if you want to
            recover this data.
          </p>
          <label className="field">
            Type RESET to continue
            <input
              autoComplete="off"
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
              placeholder="RESET"
            />
          </label>
          <div className="modal-actions">
            <button className="button outline" onClick={() => setResetOpen(false)}>
              Keep my data
            </button>
            <button
              className="button danger"
              disabled={resetText !== 'RESET' || dataBusy}
              onClick={doReset}
            >
              {dataBusy ? 'Resetting…' : 'Reset practice data'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
