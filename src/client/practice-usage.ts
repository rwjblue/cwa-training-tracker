import type { UsageAudience, UsageTool } from '../shared/admin-stats';
import type { PracticeActivity, PracticeLaunch } from './practice-launch';
import type { CopyDraft } from './copy-storage';

/** A transient classification, never part of a result, account queue or backup. */
export interface PracticeUsage {
  tool: UsageTool;
  audience: UsageAudience;
}

export function capturePracticeUsage(tool: UsageTool, scope: string): PracticeUsage {
  return { tool, audience: scope === 'guest' ? 'guest' : 'account' };
}

/** Recovery/import of an already-finished round is not newly performed practice. */
export function captureCopyPracticeUsage(
  scope: string,
  recovered?: Pick<CopyDraft, 'attempt' | 'pending'>,
): PracticeUsage | undefined {
  if (recovered && (recovered.pending || recovered.attempt.status !== 'active')) return undefined;
  return capturePracticeUsage('copy', scope);
}

/** Classify the producer's live context, not arbitrary saved/imported metadata. */
export function studioUsageTool(
  launch: PracticeLaunch | undefined,
  activity: PracticeActivity | undefined,
  tool: NonNullable<PracticeLaunch['tool']>,
): UsageTool {
  if (launch?.material) return 'sending';
  switch (activity?.type) {
    case 'audio':
      return 'recording';
    case 'morse-runner':
      return 'runner';
    case 'copy':
      return 'copy';
    case 'sending':
      return 'sending';
    case 'timer':
    case 'external':
    case 'live-event':
      return 'manual';
    default:
      return tool;
  }
}

/** Best-effort, once at the recording boundary. Failure never changes saving. */
export function reportPracticeUsage(usage: PracticeUsage): void {
  try {
    void fetch('/api/practice-usage', {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: usage.tool, audience: usage.audience }),
    }).catch(() => {
      // Approximate aggregate counts do not have retries or a delivery queue.
    });
  } catch {
    // A disabled or synchronously throwing fetch is equally non-blocking.
  }
}
