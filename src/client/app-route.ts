import type { CourseLevel } from '../shared/training';
import type { PracticeLaunch } from './practice-launch';
import { practiceTools } from './practice-tools';
import { publicLaunchFromHash, publicPracticeHash } from './curriculum-links';

export type Page =
  | 'summary'
  | 'overview'
  | 'tools'
  | 'practice'
  | 'logbook'
  | 'course'
  | 'settings'
  | 'events'
  | 'admin';
const pages: Page[] = [
  'summary',
  'overview',
  'tools',
  'practice',
  'logbook',
  'course',
  'settings',
  'events',
  'admin',
];

export function readAppRoute(hash: string): {
  page: Page;
  hash: string;
  launch?: Omit<PracticeLaunch, 'id'>;
  level?: CourseLevel;
  session?: number;
} {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const params = new URLSearchParams(query);
  const catalogLaunch = publicLaunchFromHash(hash);
  if (catalogLaunch)
    return { page: 'practice', hash: catalogLaunch.publicRoute ?? hash, launch: catalogLaunch };
  const tool = practiceTools.find((item) => path === `practice/${item.tool}`)?.tool;
  if (tool) return { page: 'practice', hash, launch: { tool, publicRoute: hash } };
  const page = pages.includes(path as Page) ? (path as Page) : 'overview';
  if (path.startsWith('practice/')) return { page: 'tools', hash: '#tools' };
  if (page === 'course') {
    const level = ['beginner', 'fundamental', 'intermediate', 'advanced'].includes(
      params.get('level') ?? '',
    )
      ? (params.get('level') as CourseLevel)
      : undefined;
    const session = Number(params.get('session'));
    const validSession =
      Number.isInteger(session) && session >= 1 && session <= 16 ? session : undefined;
    return { page, hash: courseHash(level, validSession), level, session: validSession };
  }
  if (page === 'events')
    return { page, hash: params.get('time') === 'utc' ? '#events?time=utc' : '#events' };
  return { page, hash: `#${page}` };
}

export function courseHash(level?: CourseLevel, session?: number) {
  const params = new URLSearchParams();
  if (level) params.set('level', level);
  if (session) params.set('session', String(session));
  return `#course${params.size ? `?${params}` : ''}`;
}

export function launchHash(launch?: Omit<PracticeLaunch, 'id'>): string {
  if (!launch) return '#practice';
  return (
    launch.publicRoute ??
    publicPracticeHash(launch) ??
    (launch.tool ? `#practice/${launch.tool}` : '#practice')
  );
}

/** Preserve native copy-link, new-tab and modified-click behavior. */
export function isPlainNavigation(event: {
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
