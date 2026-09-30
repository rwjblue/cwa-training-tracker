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
  Signal,
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
  COURSE_LEVELS,
  courseMeetings,
  dateInTimezone,
  addDays,
  summarizePractice,
  validatePracticeSession,
} from '../shared/training';
import { evidenceTime, sessionEvidence, type PracticeEvidence } from '../shared/practice-evidence';
import { EvidenceSummary, PracticeEvidenceDetails } from './PracticeEvidenceDetails';
import { api, getEntries, getSettings, type Passkey, type User } from './api';
import { MORSE } from './audio';
const PracticeStudio = React.lazy(() => import('./PracticeStudio'));
import './styles.css';
import Plan from './Plan';
import CourseCurriculum from './CourseCurriculum';
import TimeZoneSelect from './TimeZoneSelect';
import { AccountIdentity } from './AccountIdentity';
import TodayPlan from './TodayPlan';
import type { PlannedTask } from '../shared/plan';
import { practiceLaunchForTask, type PracticeLaunch } from './practice-launch';
import WelcomePanel from './WelcomePanel';
import { ImportedHistory, LegacyAttemptDetails, legacyAttemptTitle } from './ImportedHistory';
import CopyResult, { CopyAttemptDetails } from './CopyResult';
import { savedCopyAttempt } from '../shared/copy-report';
import { clearCopyDraft } from './copy-storage';
import { clearSavedStudioNotes } from './studio-session';
import { formatPracticeDuration, practiceMinutesFromInput } from './practice-duration';
import {
  autoSavePractice,
  flushPracticeSaves,
  loadLocalPractice,
  removeLocalPractice,
  PRACTICE_SAVED_EVENT,
  PRACTICE_UPLOADED_EVENT,
} from './practice-autosave';

type Page = 'overview' | 'practice' | 'logbook' | 'course' | 'settings';
// Choose once per page load so navigation keeps the decoration still.
const sidebarLetters = Object.keys(MORSE).filter((letter) => /^[A-Z]$/.test(letter));
const sidebarLetter = sidebarLetters[Math.floor(Math.random() * sidebarLetters.length)];
const sidebarMorse = [...MORSE[sidebarLetter]]
  .map((symbol) => (symbol === '.' ? '·' : '−'))
  .join(' ');
const kinds: { id: PracticeKind; label: string; icon: LucideIcon; color: string }[] = [
  { id: 'listening', label: 'Listening', icon: Headphones, color: 'green' },
  { id: 'sending', label: 'Sending', icon: Radio, color: 'orange' },
  { id: 'head-copy', label: 'Head copy', icon: AudioLines, color: 'blue' },
  { id: 'icr', label: 'Instant recognition', icon: Signal, color: 'green' },
  { id: 'simulator', label: 'Simulator', icon: Radio, color: 'orange' },
  { id: 'on-air', label: 'On air', icon: Send, color: 'blue' },
  { id: 'other', label: 'Other practice', icon: BookOpen, color: 'green' },
];
const levels = COURSE_LEVELS;
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
  const currentPage = useRef(page);
  currentPage.current = page;
  const studioUnsaved = useRef(false);
  const beforeLeaveStudio = useRef<(() => Promise<boolean>) | undefined>(undefined);
  const [practiceLaunch, setPracticeLaunch] = useState<PracticeLaunch>();
  const [savedPracticeVersion, setSavedPracticeVersion] = useState(0);
  const [savedPracticeEntry, setSavedPracticeEntry] = useState<PracticeSession>();
  const pendingLog = useRef<Partial<PracticeSession> | null>(null);
  const pendingDestination = useRef<Page | null>(null);
  const [tasks, setTasks] = useState<PlannedTask[]>([]);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState('');
  const [planVersion, setPlanVersion] = useState(0);
  const [startNewTask, setStartNewTask] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const activeAccount = useRef(user?.id);
  activeAccount.current = user?.id;
  const [localHistory, setLocalHistory] = useState(() => ({
    scope: 'guest',
    entries: loadLocalPractice('guest'),
  }));
  const localEntries = localHistory.scope === (user?.id ?? 'guest') ? localHistory.entries : [];
  const [entries, setEntries] = useState<PracticeSession[]>([]);
  const [profile, setProfile] = useState<Profile>({
    ...DEFAULT_PROFILE,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [profileAccountId, setProfileAccountId] = useState<string>();
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
    activeAccount.current = current?.id;
    if (current?.id !== user?.id) {
      setEntries([]);
      setProfile(DEFAULT_PROFILE);
      setProfileAccountId(undefined);
    }
    setUser(current);
    if (current) {
      const [sessionData, settingsData] = await Promise.all([getEntries(), getSettings()]);
      if (activeAccount.current !== current.id) return;
      setEntries(sessionData.entries);
      setProfile(settingsData.settings);
      setProfileAccountId(current.id);
      setDemo(false);
      setPlanVersion((version) => version + 1);
      return settingsData.settings;
    }
  };
  useEffect(() => {
    load()
      .catch((error: Error) => setAppError(error.message))
      .finally(() => setBooting(false));
  }, []);
  useEffect(() => {
    if (!user) {
      setTasks([]);
      setPlanError('');
      return;
    }
    if (page !== 'overview') return;
    let cancelled = false;
    setPlanLoading(true);
    setPlanError('');
    api<{ plan: PlannedTask[] }>('/plan')
      .then(({ plan }) => {
        if (!cancelled) setTasks(plan);
      })
      .catch((error: Error) => {
        if (!cancelled) setPlanError(error.message);
      })
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    user?.id,
    page,
    planVersion,
    profile.level,
    profile.firstClassDate,
    profile.classDays.join(','),
  ]);
  const updateTaskStatus = async (
    selected: PlannedTask[],
    changes: { done?: boolean; dismissedFromToday?: boolean },
  ) => {
    const accountId = activeAccount.current;
    const result = await api<{ tasks: PlannedTask[] }>(
      '/plan/status',
      { ids: selected.map((task) => task.id), ...changes },
      'POST',
      AbortSignal.timeout(10_000),
    );
    if (activeAccount.current !== accountId) return;
    const updated = new Map(result.tasks.map((task) => [task.id, task]));
    setTasks((current) => current.map((task) => updated.get(task.id) ?? task));
    setPracticeLaunch((current) =>
      current?.task && updated.has(current.task.id)
        ? { ...current, task: updated.get(current.task.id)! }
        : current,
    );
  };
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 5500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    const changed = async () => {
      const next = readPage();
      if (next !== 'practice' && !(await confirmLeaveStudio())) {
        window.history.replaceState(null, '', '#practice');
        return;
      }
      currentPage.current = next;
      if (next !== 'practice') setPracticeLaunch(undefined);
      setPage(next);
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!studioUnsaved.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('hashchange', changed);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('hashchange', changed);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);
  useEffect(() => {
    if (!booting && !user && page === 'settings') {
      setPage('overview');
      window.location.hash = 'overview';
    }
  }, [booting, user, page]);
  const confirmLeaveStudio = async () => {
    if (currentPage.current !== 'practice') return true;
    if (beforeLeaveStudio.current) return beforeLeaveStudio.current();
    if (!studioUnsaved.current) return true;
    if (
      !window.confirm(
        'Leave this practice? Copy practice can be recovered on this device. Unsaved time and notes from other tools will be discarded.',
      )
    )
      return false;
    studioUnsaved.current = false;
    return true;
  };
  const showPage = (next: Page) => {
    setStartNewTask(false);
    currentPage.current = next;
    if (next !== 'practice') setPracticeLaunch(undefined);
    window.location.hash = next;
    setPage(next);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const navigate = async (next: Page): Promise<boolean> => {
    if (next !== 'practice' && !(await confirmLeaveStudio())) return false;
    showPage(next);
    return true;
  };
  const openPractice = async (options: Omit<PracticeLaunch, 'id'> = {}) => {
    if (currentPage.current === 'practice' && !(await confirmLeaveStudio())) return;
    setPracticeLaunch({ id: crypto.randomUUID(), ...options });
    navigate('practice');
  };
  const openLog = (initial: Partial<PracticeSession> = {}) => {
    if (!user) {
      pendingLog.current = initial;
      setAuthOpen(true);
      return;
    }
    const latest = initial.id ? entries.find((entry) => entry.id === initial.id) : undefined;
    setSessionEditor({ date: dateInTimezone(new Date(), profile.timezone), ...initial, ...latest });
  };
  const acceptSavedPractice = (entry: PracticeSession) => {
    removeLocalPractice('guest', entry.id);
    setSavedPracticeEntry(entry);
    setEntries((current) =>
      [entry, ...current.filter((item) => item.id !== entry.id)].sort((a, b) =>
        b.date.localeCompare(a.date),
      ),
    );
    if (entry.source === 'morse' || entry.source === 'timer') {
      setSavedPracticeVersion((version) => version + 1);
    }
    const attempt = savedCopyAttempt(entry);
    if (attempt) {
      clearCopyDraft('guest', attempt.id);
      if (user) clearCopyDraft(user.id, attempt.id);
    }
  };
  const mergeSavedEntry = (entry: PracticeSession) => {
    setEntries((current) =>
      [entry, ...current.filter((item) => item.id !== entry.id)].sort((a, b) =>
        b.date.localeCompare(a.date),
      ),
    );
  };
  const autoSave = async (entry: PracticeSession) => {
    const scope = user?.id ?? 'guest';
    const result = await autoSavePractice(scope, entry);
    if ((activeAccount.current ?? 'guest') !== scope) return;
    if (result.destination === 'history') mergeSavedEntry(result.entry);
    notify(
      result.destination === 'history'
        ? 'Practice saved to history.'
        : scope === 'guest'
          ? 'Practice saved on this device. Find it in your logbook.'
          : 'Practice saved on this device. Upload will retry when you reconnect.',
    );
  };
  useEffect(() => {
    const scope = user?.id ?? 'guest';
    const refresh = () => setLocalHistory({ scope, entries: loadLocalPractice(scope) });
    const uploaded = (event: Event) => {
      const detail = (event as CustomEvent<{ scope: string; entry: PracticeSession }>).detail;
      if (detail.scope === scope && (activeAccount.current ?? 'guest') === scope)
        mergeSavedEntry(detail.entry);
    };
    const retry = () =>
      void flushPracticeSaves(
        scope,
        mergeSavedEntry,
        () => (activeAccount.current ?? 'guest') === scope,
      );
    refresh();
    retry();
    window.addEventListener(PRACTICE_SAVED_EVENT, refresh);
    window.addEventListener(PRACTICE_UPLOADED_EVENT, uploaded);
    window.addEventListener('storage', refresh);
    window.addEventListener('online', retry);
    const retryTimer = window.setInterval(retry, 30_000);
    return () => {
      window.clearInterval(retryTimer);
      window.removeEventListener(PRACTICE_SAVED_EVENT, refresh);
      window.removeEventListener(PRACTICE_UPLOADED_EVENT, uploaded);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('online', retry);
    };
  }, [user?.id]);
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
  const visibleEntries = user
    ? [
        ...entries,
        ...localEntries.filter((local) => !entries.some((entry) => entry.id === local.id)),
      ]
    : localEntries.length
      ? localEntries
      : demo
        ? sampleEntries
        : [];
  const signedIn = async (newUser: User) => {
    setAuthOpen(false);
    setAppError('');
    try {
      const settings = await load(newUser);
      if (pendingLog.current) {
        setSessionEditor({
          date: dateInTimezone(new Date(), settings?.timezone),
          ...pendingLog.current,
        });
        pendingLog.current = null;
      } else if (pendingDestination.current) {
        navigate(pendingDestination.current);
      }
      pendingDestination.current = null;
      notify('You’re signed in. Make yourself at home.');
    } catch (error) {
      setAppError((error as Error).message);
    } finally {
      setBooting(false);
    }
  };
  const logout = async () => {
    try {
      activeAccount.current = undefined;
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
    { page: 'overview', label: user ? 'Today' : 'Overview', icon: LayoutDashboard },
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
          <img
            className="brand-mark"
            src="/favicon.svg"
            alt=""
            title="CWA in Morse code: −·−· ·−− ·−"
          />
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
          <span className="tiny-dots" aria-hidden="true" title={`${sidebarLetter} in Morse code`}>
            {sidebarMorse}
          </span>
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
              aria-expanded={menuOpen}
              aria-controls="workspace-navigation"
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
              <button
                className="account-identity-button"
                onClick={() => navigate('settings')}
                aria-label="Open your account"
                title={user.email}
              >
                <AccountIdentity
                  email={user.email}
                  callsign={profile.callsign}
                  displayName={profile.displayName}
                  useGravatar={profileAccountId === user.id && profile.useGravatar !== false}
                />
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
              {!user && page === 'logbook' && (
                <div className="demo-banner">
                  <span>
                    <span className="demo-badge">
                      {localEntries.length ? 'ON THIS DEVICE' : 'TAKE A LOOK'}
                    </span>{' '}
                    {localEntries.length
                      ? 'Your practice is saved in this browser. Open an entry to sign in and keep it in your private history.'
                      : demo
                        ? 'You’re exploring a sample practice log. Your journey starts here.'
                        : 'Your own quiet corner for making progress in CW.'}
                  </span>
                  <button onClick={() => setAuthOpen(true)}>
                    Make it yours <ArrowRight size={14} />
                  </button>
                </div>
              )}
              {page === 'overview' &&
                (user ? (
                  <Overview
                    entries={visibleEntries}
                    profile={profile}
                    user={user}
                    demo={!user && demo}
                    navigate={navigate}
                    openLog={openLog}
                    onPractice={() => openPractice()}
                    todayPlan={
                      user ? (
                        <TodayPlan
                          profile={profile}
                          entries={entries}
                          tasks={tasks}
                          loading={planLoading}
                          error={planError}
                          onRetry={() => setPlanVersion((version) => version + 1)}
                          onDismiss={(tasks) =>
                            updateTaskStatus(tasks, { dismissedFromToday: true })
                          }
                          onLog={openLog}
                          onPracticeTask={(task) => openPractice(practiceLaunchForTask(task))}
                          onManagePlan={() => navigate('course')}
                          onAddTask={async () => {
                            if (await navigate('course')) setStartNewTask(true);
                          }}
                          onImport={() => {
                            navigate('settings');
                            requestAnimationFrame(() =>
                              document
                                .getElementById('training-backups')
                                ?.scrollIntoView({ behavior: 'smooth' }),
                            );
                          }}
                          onPractice={() => openPractice()}
                          onSetupCourse={() => navigate('settings')}
                        />
                      ) : undefined
                    }
                  />
                ) : (
                  <WelcomePanel
                    onPractice={(tool) => openPractice({ tool })}
                    onSignIn={() => setAuthOpen(true)}
                    onGuide={() => navigate('course')}
                  />
                ))}
              {page === 'practice' && (
                <React.Suspense fallback={<p role="status">Opening your practice studio…</p>}>
                  <PracticeStudio
                    onLog={openLog}
                    onAutoSave={autoSave}
                    onTaskCompletion={(task: PlannedTask, done: boolean) =>
                      updateTaskStatus([task], { done })
                    }
                    onBeforeLeaveChange={(handler: (() => Promise<boolean>) | undefined) => {
                      beforeLeaveStudio.current = handler;
                    }}
                    accountId={user?.id}
                    timezone={profile.timezone}
                    onSaved={(entry: PracticeSession) => {
                      acceptSavedPractice(entry);
                      studioUnsaved.current = false;
                      notify('Copy result saved.');
                    }}
                    savedVersion={savedPracticeVersion}
                    savedEntry={savedPracticeEntry}
                    launch={practiceLaunch}
                    onBack={() => navigate('overview')}
                    onUnsavedChange={(unsaved: boolean) => {
                      studioUnsaved.current = unsaved;
                    }}
                  />
                </React.Suspense>
              )}
              {page === 'logbook' && (
                <Logbook
                  entries={visibleEntries}
                  profile={profile}
                  demo={!user && localEntries.length === 0}
                  pendingIds={user ? localEntries.map((entry) => entry.id) : []}
                  openLog={openLog}
                  onEdit={(entry) => openLog(entry)}
                  onDelete={async (id) => {
                    if (!user) {
                      removeLocalPractice('guest', id);
                      notify('Local practice entry deleted.');
                      return;
                    }
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
                  onPracticeTask={(task) => openPractice(practiceLaunchForTask(task))}
                  startNewTask={startNewTask}
                  user={user}
                  onSettings={() => {
                    if (user) navigate('settings');
                    else {
                      pendingDestination.current = 'settings';
                      setAuthOpen(true);
                    }
                  }}
                />
              )}
              {page === 'settings' && user && (
                <Account
                  key={user.id}
                  user={user}
                  profile={profile}
                  setProfile={setProfile}
                  notify={notify}
                  logout={logout}
                  reload={load}
                  onReauth={() => setAuthOpen(true)}
                  onToday={() => navigate('overview')}
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
      {authOpen && (
        <AuthModal
          onClose={() => {
            setAuthOpen(false);
            pendingLog.current = null;
            pendingDestination.current = null;
          }}
          onSuccess={signedIn}
        />
      )}
      {sessionEditor && (
        <SessionModal
          initial={sessionEditor}
          isExisting={entries.some((entry) => entry.id === sessionEditor.id)}
          onClose={() => setSessionEditor(null)}
          onSaved={(entry) => {
            if (activeAccount.current !== user?.id) return;
            const wasExisting = entries.some((saved) => saved.id === sessionEditor.id);
            if (!wasExisting && user) clearSavedStudioNotes(user.id, entry);
            acceptSavedPractice(entry);
            setSessionEditor(null);
            if (
              !wasExisting &&
              !(entry.metadata?.practiceTool === 'copy' && currentPage.current === 'practice') &&
              (currentPage.current === 'practice' || entry.metadata?.plannedTaskId)
            ) {
              studioUnsaved.current = false;
              // The paused studio snapshot was just acknowledged by the server.
              // Its reset effect has not run yet; asking it to leave would save
              // that same time again (or prompt to discard already-saved time).
              showPage('overview');
            }
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
  onPractice,
  todayPlan,
}: {
  todayPlan?: React.ReactNode;
  entries: PracticeSession[];
  profile: Profile;
  user: User | null;
  demo: boolean;
  navigate: (page: Page) => void;
  openLog: (initial?: Partial<PracticeSession>) => void;
  onPractice: () => void;
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
          <h1>{user ? 'Your practice for today.' : 'A little practice. A better fist.'}</h1>
          <p>
            {user
              ? `${prettyDate(today)}${name ? ` · Welcome back, ${name}.` : ''}`
              : 'A thoughtful space for your CW Academy journey.'}
          </p>
        </div>
        <button className="button dark" onClick={() => openLog()}>
          <Plus size={17} /> Log practice
        </button>
      </div>
      <div className="overview-top-grid">
        {user ? (
          todayPlan
        ) : (
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
        )}
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
          {user && (
            <button className="button dark daily-practice-button" onClick={onPractice}>
              <Play size={14} /> Practice now
            </button>
          )}
          <button className="text-button" onClick={() => (user ? navigate('settings') : openLog())}>
            {user ? 'Change daily goal' : 'Set your own pace'} <ArrowRight size={14} />
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
            legacyAttemptTitle(entry) ||
            (entry.characterWpm
              ? `${entry.characterWpm} character WPM${entry.effectiveWpm ? ` · ${entry.effectiveWpm} effective WPM` : ''}`
              : 'A little progress, logged.')}
        </span>
        {typeof entry.metadata?.scratchpad === 'string' && entry.metadata.scratchpad && (
          <details className="session-scratchpad">
            <summary>Scratchpad</summary>
            <p>{entry.metadata.scratchpad}</p>
          </details>
        )}
        <LegacyAttemptDetails entry={entry} />
        <CopyAttemptDetails entry={entry} />
        <PracticeEvidenceDetails entry={entry} />
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

function Logbook({
  entries,
  profile,
  demo,
  openLog,
  onEdit,
  onDelete,
  pendingIds = [],
}: {
  entries: PracticeSession[];
  profile: Profile;
  demo: boolean;
  openLog: () => void;
  onEdit: (entry: PracticeSession) => void;
  onDelete: (id: string) => Promise<void>;
  pendingIds?: string[];
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
                    {pendingIds.includes(entry.id) && <small>Waiting to upload</small>}
                    <button
                      className="icon-button"
                      aria-label={`Edit ${kindInfo(entry.kind).label} on ${entry.date}`}
                      onClick={() => onEdit(entry)}
                      disabled={pendingIds.includes(entry.id)}
                    >
                      <Pencil size={15} />
                    </button>
                    {!demo && (
                      <button
                        className="icon-button danger-text"
                        aria-label={`Delete ${kindInfo(entry.kind).label} on ${entry.date}`}
                        onClick={() => setDeleting(entry.id)}
                        disabled={pendingIds.includes(entry.id)}
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
  onPracticeTask,
  user,
  onSettings,
  startNewTask,
}: {
  startNewTask?: boolean;
  profile: Profile;
  entries: PracticeSession[];
  onLog: (initial?: Partial<PracticeSession>) => void;
  onPracticeTask: (task: PlannedTask) => void;
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
          <p>Academy assignments, official resources, and your personal practice plan.</p>
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
      {user && (
        <Plan
          profile={profile}
          entries={entries}
          onLog={onLog}
          onPracticeTask={onPracticeTask}
          onSetupCourse={onSettings}
          startNewTask={startNewTask}
        />
      )}
      <div className="course-intro">
        <div>
          <span className="eyebrow">YOUR ACADEMY JOURNEY</span>
          <h2>
            Different starting points.
            <br />
            The same love of CW.
          </h2>
          <p>
            Daily assignments appear automatically after you choose your level and save your course
            dates. Follow the official resources and add your advisor’s exercises to your plan.
          </p>
        </div>
        <div className="course-intro-note">
          <BookOpen size={25} />
          <h3>Follow your advisor.</h3>
          <p>
            Open the official curriculum for full instructions. The built-in plan organizes daily
            practice and links to the original resources; your advisor’s guidance comes first.
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
            aria-pressed={selectedLevel === level.id}
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
      <CourseCurriculum level={selectedLevel} />
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
  initialFocus,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  initialFocus?: React.RefObject<HTMLElement | null>;
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
          'button:enabled, input:enabled, select:enabled, textarea:enabled, a[href], [tabindex="0"]',
        ) ?? [],
      );
    // Establish focus before the dialog is painted. A delayed autofocus can
    // steal focus from a field the user has already started filling.
    const target =
      initialFocus?.current ??
      panel.current?.querySelector<HTMLElement>('[autofocus], input') ??
      elements()[0];
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
          <>
            Keep your sessions, goals, and course notes together. No password to remember.
            <br />
            New here? Your first code creates your private account.
          </>
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
  isExisting,
  onClose,
  onSaved,
}: {
  initial: Partial<PracticeSession>;
  isExisting: boolean;
  onClose: () => void;
  onSaved: (entry: PracticeSession) => void;
}) {
  const saveButton = useRef<HTMLButtonElement>(null);
  const saving = useRef(false);
  const [identity] = useState(() => ({
    id: initial.id ?? crypto.randomUUID(),
    createdAt: initial.createdAt ?? new Date().toISOString(),
  }));
  const close = () => {
    if (!saving.current) onClose();
  };
  const copyAttempt = savedCopyAttempt(initial);
  let evidence: PracticeEvidence | undefined;
  let measuredInitial = initial;
  let evidenceError = '';
  try {
    evidence =
      initial.evidenceMode === 'historical' ? undefined : sessionEvidence(initial.metadata);
    if (evidence)
      measuredInitial = validatePracticeSession({
        ...initial,
        ...identity,
        date: initial.date ?? dateString(),
        kind: initial.kind ?? 'listening',
        minutes: initial.minutes ?? 0,
      });
  } catch (err) {
    evidenceError = (err as Error).message;
  }
  const measuredSpeeds = Boolean(
    copyAttempt ||
    evidence?.type === 'runner' ||
    (evidence?.type === 'timed' && evidence.recordings.length),
  );
  const [correctTime, setCorrectTime] = useState(
    evidence?.type === 'timed' && Boolean(evidence.correction),
  );
  const [correction, setCorrection] = useState({
    seconds:
      evidence?.type === 'timed' ? formatPracticeDuration(evidenceTime(evidence).seconds / 60) : '',
    recallSeconds:
      evidence?.type === 'timed'
        ? formatPracticeDuration(evidenceTime(evidence).recallSeconds / 60)
        : '',
    reason: evidence?.type === 'timed' ? (evidence.correction?.reason ?? '') : '',
  });
  const [form, setForm] = useState({
    date: initial.date ?? dateString(),
    kind: measuredInitial.kind ?? 'listening',
    minutes: formatPracticeDuration(measuredInitial.minutes),
    characterWpm:
      measuredInitial.characterWpm === undefined ? '' : String(measuredInitial.characterWpm),
    effectiveWpm:
      measuredInitial.effectiveWpm === undefined ? '' : String(measuredInitial.effectiveWpm),
    accuracy: measuredInitial.accuracy === undefined ? '' : String(measuredInitial.accuracy),
    lesson: initial.lesson === undefined ? '' : String(initial.lesson),
    notes: initial.notes ?? '',
    scratchpad: typeof initial.metadata?.scratchpad === 'string' ? initial.metadata.scratchpad : '',
    context: initial.context ?? 'practice',
    qsoCount: initial.qsoCount === undefined ? '' : String(initial.qsoCount),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(evidenceError);
  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving.current) return;
    const minutes = practiceMinutesFromInput(form.minutes, initial.minutes);
    if (minutes === null) {
      setError('Enter time as minutes:seconds or minutes, from 0:00 to 1440:00.');
      return;
    }
    saving.current = true;
    setError('');
    setBusy(true);
    const data: Record<string, unknown> = {
      ...initial,
      ...identity,
      date: form.date,
      kind: form.kind,
      minutes,
      notes: form.notes,
      metadata: { ...initial.metadata, scratchpad: form.scratchpad },
      context: form.context,
      source: initial.source ?? 'manual',
    };
    for (const key of ['characterWpm', 'effectiveWpm', 'accuracy', 'lesson', 'qsoCount'] as const) {
      if (form[key] !== '') data[key] = Number(form[key]);
      else delete data[key];
    }
    try {
      if (evidence?.type === 'timed') {
        const corrected = { ...evidence };
        if (correctTime) {
          const seconds = practiceMinutesFromInput(
            correction.seconds,
            evidenceTime(evidence).seconds / 60,
          );
          const recallSeconds = practiceMinutesFromInput(
            correction.recallSeconds,
            evidenceTime(evidence).recallSeconds / 60,
          );
          if (seconds === null || recallSeconds === null)
            throw new Error('Enter corrected time as minutes:seconds or minutes.');
          corrected.correction = {
            seconds: seconds * 60,
            recallSeconds: recallSeconds * 60,
            reason: correction.reason,
          };
        } else delete corrected.correction;
        data.metadata = { ...initial.metadata, scratchpad: form.scratchpad, evidence: corrected };
      }
      const validated = validatePracticeSession(data);
      const result = await api<{ entry: PracticeSession }>(
        isExisting ? `/entries/${initial.id}` : '/entries',
        validated,
        isExisting ? 'PUT' : 'POST',
        AbortSignal.timeout(10_000),
      );
      onSaved(result.entry);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title={isExisting ? 'A closer look at your practice.' : 'A little progress, worth recording.'}
      onClose={close}
      wide
      initialFocus={saveButton}
    >
      <p className="modal-intro">
        {copyAttempt || evidence
          ? 'Your measured time and results stay with this attempt. Add notes and choose where to record it.'
          : 'Capture what you practiced and how it felt. The details are up to you.'}
      </p>
      {copyAttempt && <CopyResult attempt={copyAttempt} />}
      {evidence && <EvidenceSummary evidence={evidence} />}
      {!evidence && <PracticeEvidenceDetails entry={initial} expanded />}
      <form onSubmit={save} aria-busy={busy}>
        <fieldset className="session-form-fields" disabled={busy}>
          <div className="form-grid">
            <label className="field">
              Activity
              <select
                value={form.kind}
                disabled={evidence?.type === 'runner'}
                onChange={(e) => update('kind', e.target.value)}
              >
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
              Time practiced <span className="label-hint">minutes:seconds</span>
              <input
                type="text"
                placeholder="m:ss or minutes"
                required
                value={form.minutes}
                readOnly={Boolean(copyAttempt || evidence)}
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
                placeholder={copyAttempt ? 'See trial speeds' : 'Optional'}
                value={form.characterWpm}
                readOnly={measuredSpeeds}
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
                placeholder={copyAttempt ? 'See trial speeds' : 'Optional'}
                value={form.effectiveWpm}
                readOnly={measuredSpeeds}
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
                placeholder={copyAttempt ? 'No submitted answers' : 'Optional'}
                value={form.accuracy}
                readOnly={Boolean(copyAttempt || evidence?.type === 'runner')}
                onChange={(e) => update('accuracy', e.target.value)}
              />
            </label>
          </div>
          {evidence?.type === 'timed' && (
            <>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={correctTime}
                  onChange={(event) => setCorrectTime(event.target.checked)}
                />{' '}
                Correct measured time
              </label>
              {correctTime && (
                <div className="form-grid">
                  <label className="field">
                    Corrected total time <span className="label-hint">minutes:seconds</span>
                    <input
                      value={correction.seconds}
                      onChange={(event) =>
                        setCorrection((value) => ({ ...value, seconds: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    Corrected recall time <span className="label-hint">minutes:seconds</span>
                    <input
                      value={correction.recallSeconds}
                      onChange={(event) =>
                        setCorrection((value) => ({ ...value, recallSeconds: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    Correction reason
                    <input
                      value={correction.reason}
                      maxLength={1000}
                      required
                      onChange={(event) =>
                        setCorrection((value) => ({ ...value, reason: event.target.value }))
                      }
                    />
                  </label>
                </div>
              )}
            </>
          )}
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
          {(form.scratchpad || typeof initial.metadata?.scratchpad === 'string') && (
            <label className="field">
              Scratchpad
              <textarea
                value={form.scratchpad}
                onChange={(event) => update('scratchpad', event.target.value)}
                maxLength={10000}
                rows={5}
              />
            </label>
          )}
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
            <button className="button outline" type="button" onClick={close} disabled={busy}>
              Cancel
            </button>
            <button ref={saveButton} className="button dark" disabled={busy} type="submit">
              {busy ? 'Saving…' : isExisting ? 'Save changes' : 'Save practice'}
              <Check size={16} />
            </button>
          </div>
        </fieldset>
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
  onToday,
}: {
  user: User;
  profile: Profile;
  setProfile: (profile: Profile) => void;
  notify: (message: string) => void;
  logout: () => void;
  reload: () => Promise<unknown>;
  onReauth: () => void;
  onToday: () => void;
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
  const [archiveVersion, setArchiveVersion] = useState(0);
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
          'This file is not a recognized training backup. Choose a JSON file exported by a supported tracker.',
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
      const result = await api<{ imported: number; skipped: number; historicalLinks?: number }>(
        '/import',
        {
          data: importData.data,
          mode: importMode,
        },
      );
      setArchiveVersion((value) => value + 1);
      await reload();
      setImportData(null);
      notify(
        `Imported ${result.imported} sessions${result.skipped ? `; ${result.skipped} duplicates skipped` : ''}.${result.historicalLinks ? ` Retained ${result.historicalLinks} old exercise links as history without current assignment credit.` : ''}`,
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
      setArchiveVersion((value) => value + 1);
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
              <TimeZoneSelect
                value={form.timezone}
                onChange={(timezone) => setForm({ ...form, timezone })}
              />
            </div>
            <div className="avatar-preference">
              <input
                id="use-gravatar"
                type="checkbox"
                checked={form.useGravatar !== false}
                onChange={(event) => setForm({ ...form, useGravatar: event.target.checked })}
                aria-describedby="gravatar-help"
              />
              <span>
                <label htmlFor="use-gravatar">
                  <strong>Use my Gravatar image</strong>
                </label>
                <span className="field-hint" id="gravatar-help">
                  Gravatar is a profile picture linked to your email address. We show the picture
                  for your sign-in email beside your callsign.{' '}
                  <a href="https://gravatar.com/" target="_blank" rel="noopener noreferrer">
                    Set or change your Gravatar
                  </a>
                  .
                </span>
                <span className="field-hint">
                  Loading it shares an email hash and your IP address with Gravatar.
                </span>
              </span>
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
            <p className="course-material-note">
              Save your first class date and meeting days to populate daily assignments for your
              Academy level. Changing dates keeps recorded practice and completion.
            </p>
            <div className="account-form-actions">
              <button className="button dark" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save preferences'}
                <Check size={16} />
              </button>
              {profile.firstClassDate && (
                <button className="button outline" type="button" onClick={onToday}>
                  View Today <ArrowRight size={16} />
                </button>
              )}
            </div>
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
      <section id="training-backups" className="card data-card">
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
            <h3>Back up your data</h3>
            <p>
              Download your practice log, homework plan, account preferences, and any preserved
              import data as a JSON file. It contains only your account’s training data, never your
              passkeys.
            </p>
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
              Restore a training backup. Merge it with your current log and skip duplicates, or
              replace your training data after reviewing the import.
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
      <ImportedHistory key={archiveVersion} />
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
