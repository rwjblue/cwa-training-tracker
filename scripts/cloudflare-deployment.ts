#!/usr/bin/env node
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const repository = 'rwjblue/cwa-training-tracker';
const pollInterval = 60_000;
const waitLimit = 14 * 60_000;

type GateDependencies = {
  readJson: (path: string) => Promise<unknown>;
  wait: (milliseconds: number) => Promise<void>;
  now: () => number;
  log: (message: string) => void;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('GitHub returned an invalid deployment verification response.');
  return value as Record<string, unknown>;
}

export class GitHubRateLimitError extends Error {
  readonly retryAt: number;

  constructor(message: string, retryAt: number) {
    super(message);
    this.name = 'GitHubRateLimitError';
    this.retryAt = retryAt;
  }
}

function headerInteger(value: string | null): number | undefined {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const result = Number(value);
  return Number.isSafeInteger(result) ? result : undefined;
}

function retryAfterTime(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const result = now + Number(value) * 1000;
    return Number.isSafeInteger(result) ? result : undefined;
  }
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : undefined;
}

function buildCredential(token: string | undefined): string | undefined {
  const credential = token?.trim();
  if (credential && /[^\u0021-\u007e]/.test(credential))
    throw new Error('GitHub deployment verification failed: invalid build credential.');
  return credential;
}

export async function readGitHubJson(
  path: string,
  request: typeof fetch = fetch,
  token?: string,
): Promise<unknown> {
  const credential = buildCredential(token);
  const response = await request(`https://api.github.com/repos/${repository}/${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
      'User-Agent': 'cwa-training-tracker-deployment',
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const remaining = headerInteger(response.headers.get('x-ratelimit-remaining'));
    const reset = headerInteger(response.headers.get('x-ratelimit-reset'));
    const retryAfter = retryAfterTime(response.headers.get('retry-after'), Date.now());
    const message = [
      `GitHub deployment verification failed: HTTP ${response.status}.`,
      ...(remaining === undefined ? [] : [`Rate-limit remaining: ${remaining}.`]),
      ...(reset === undefined ? [] : [`Rate-limit reset (UTC epoch seconds): ${reset}.`]),
    ].join(' ');
    if (
      (response.status === 403 || response.status === 429) &&
      ((remaining === 0 && reset !== undefined) || retryAfter !== undefined)
    ) {
      const retryAt = Math.max(
        retryAfter ?? 0,
        remaining === 0 && reset !== undefined ? reset * 1000 : 0,
      );
      throw new GitHubRateLimitError(message, retryAt);
    }
    throw new Error(message);
  }
  return response.json();
}

export async function runDeploymentGate(
  mode: string,
  environment: Record<string, string | undefined> = process.env,
  overrides: Partial<GateDependencies> = {},
): Promise<void> {
  if (mode !== 'wait-for-ci' && mode !== 'require-current')
    throw new Error('Usage: node scripts/cloudflare-deployment.ts <wait-for-ci|require-current>');
  const commit = environment.WORKERS_CI_COMMIT_SHA;
  if (
    environment.WORKERS_CI !== '1' ||
    environment.WORKERS_CI_BRANCH !== 'main' ||
    !commit ||
    !/^[a-f0-9]{40}$/.test(commit)
  )
    throw new Error('Deployment requires a Cloudflare Workers Builds commit on main.');

  const token = buildCredential(environment.CWA_DEPLOY_GITHUB_TOKEN);
  if (!token) throw new Error('Deployment requires the CWA_DEPLOY_GITHUB_TOKEN build secret.');

  const { readJson, wait, now, log }: GateDependencies = {
    readJson: (path) => readGitHubJson(path, fetch, token),
    wait: async (milliseconds) => {
      await sleep(milliseconds);
    },
    now: Date.now,
    log: console.log,
    ...overrides,
  };

  const deadline = now() + waitLimit;
  async function readWithRateLimitRetry(path: string): Promise<unknown> {
    while (now() < deadline) {
      try {
        const response = await readJson(path);
        if (now() >= deadline)
          throw new Error('Timed out after 14 minutes waiting for GitHub; deployment blocked.');
        return response;
      } catch (error) {
        if (!(error instanceof GitHubRateLimitError)) throw error;
        // A minimum pause also bounds retries if a reset header is already in the past.
        const delay = Math.max(1000, error.retryAt - now());
        if (delay >= deadline - now())
          throw new Error(`${error.message} Retry exceeds the 14-minute deployment deadline.`);
        log(`${error.message} Retrying in ${Math.ceil(delay / 1000)} seconds.`);
        await wait(delay);
      }
    }
    throw new Error('Timed out after 14 minutes waiting for GitHub; deployment blocked.');
  }

  if (mode === 'require-current') {
    const ref = record(await readWithRateLimitRetry('git/ref/heads/main'));
    if (ref.ref !== 'refs/heads/main' || record(ref.object).sha !== commit)
      throw new Error(`Refusing stale deployment: ${commit} is no longer the current main commit.`);
    log(`Current main commit confirmed: ${commit}.`);
    return;
  }

  const query = new URLSearchParams({
    event: 'push',
    branch: 'main',
    head_sha: commit,
    per_page: '100',
  });
  while (now() < deadline) {
    const response = record(await readWithRateLimitRetry(`actions/workflows/ci.yml/runs?${query}`));
    if (!Array.isArray(response.workflow_runs))
      throw new Error('GitHub returned an invalid workflow runs response.');
    const matching = response.workflow_runs
      .map(record)
      .filter(
        (run) => run.head_sha === commit && run.head_branch === 'main' && run.event === 'push',
      );
    if (matching.some((run) => !Number.isSafeInteger(run.id) || typeof run.status !== 'string'))
      throw new Error('GitHub returned an invalid matching workflow run.');
    // A previous success must not bypass a newer queued or failed run of this commit.
    matching.sort((left, right) => Number(right.id) - Number(left.id));
    const run = matching[0];
    if (run?.status === 'completed') {
      if (run.conclusion !== 'success')
        throw new Error(`Verify failed for ${commit}: ${String(run.conclusion)} (run ${run.id}).`);
      log(`Verify passed for ${commit}: https://github.com/${repository}/actions/runs/${run.id}`);
      return;
    }
    log(`Waiting for Verify on ${commit}: ${run?.status ?? 'push workflow not yet visible'}.`);
    await wait(Math.min(pollInterval, Math.max(0, deadline - now())));
  }
  throw new Error(
    `Timed out after 14 minutes waiting for Verify on ${commit}; deployment blocked.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDeploymentGate(process.argv[2] ?? '').catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Deployment verification failed.');
    process.exitCode = 1;
  });
}
