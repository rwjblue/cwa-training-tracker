/** Bounded tool keys; never user-provided text, assignment IDs, or results. */
export const USAGE_TOOLS = [
  'words',
  'qso',
  'stories',
  'copy',
  'sending',
  'free',
  'runner',
  'recording',
  'manual',
] as const;

export type UsageTool = (typeof USAGE_TOOLS)[number];
export type UsageAudience = 'guest' | 'account';
export const USAGE_RETENTION_DAYS = 180;
export const STATS_RANGES = [7, 30, 180] as const;
export type AdminStatsRange = (typeof STATS_RANGES)[number];

export const usageToolLabels: Record<UsageTool, string> = {
  words: 'Word listening',
  qso: 'QSO practice',
  stories: 'Story listening',
  copy: 'Copy practice',
  sending: 'Sending practice',
  free: 'Free practice',
  runner: 'Morse Runner',
  recording: 'Assigned recordings',
  manual: 'Logged practice',
};

export function isUsageTool(value: unknown): value is UsageTool {
  return typeof value === 'string' && (USAGE_TOOLS as readonly string[]).includes(value);
}

export interface PracticeUsageDay {
  day: string;
  /** Null denotes a day before collection began, rather than a measured zero. */
  guest: number | null;
  account: number | null;
}

export interface PracticeToolUsage {
  tool: UsageTool;
  guest: number;
  account: number;
}

export interface AdminStats {
  generatedAt: string;
  timezone: 'UTC';
  accounts: {
    total: number;
    created7: number;
    created30: number;
    activeToday: number;
    active7: number;
    active30: number;
  };
  practice: {
    days: AdminStatsRange;
    today: string;
    collectionStartedDay: string | null;
    series: PracticeUsageDay[];
    tools: PracticeToolUsage[];
    totals: { guest: number; account: number; total: number };
  };
  operations: {
    accountStorageBytes: number;
    databaseStorageBytes: number | null;
    databaseReachable: boolean;
    lastCleanupAt: string | null;
    monitoringUrl: string | null;
  };
}
