import { describe, expect, it, vi } from 'vitest';
import { readGitHubJson, runDeploymentGate } from '../../scripts/cloudflare-deployment.ts';

const commit = 'a'.repeat(40);
const environment = { WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main', WORKERS_CI_COMMIT_SHA: commit };
const successfulRun = {
  id: 100,
  head_sha: commit,
  head_branch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
};

function gate(responses: unknown[]) {
  let elapsed = 0;
  const paths: string[] = [];
  const waits: number[] = [];
  const dependencies = {
    readJson: async (path: string) => {
      paths.push(path);
      return responses.length > 1 ? responses.shift() : responses[0];
    },
    wait: async (milliseconds: number) => {
      waits.push(milliseconds);
      elapsed += milliseconds;
    },
    now: () => elapsed,
    log: () => {},
  };
  return { dependencies, paths, waits, elapsed: () => elapsed };
}

describe('Cloudflare deployment verification', () => {
  it('waits for the exact main push to finish successfully', async () => {
    const fixture = gate([
      { workflow_runs: [] },
      { workflow_runs: [{ ...successfulRun, status: 'in_progress', conclusion: null }] },
      { workflow_runs: [successfulRun] },
    ]);
    await runDeploymentGate('wait-for-ci', environment, fixture.dependencies);
    expect(fixture.waits).toEqual([30_000, 30_000]);
    const query = new URL(fixture.paths[0], 'https://api.github.com/').searchParams;
    expect(query.get('head_sha')).toBe(commit);
    expect(query.get('event')).toBe('push');
    expect(query.get('branch')).toBe('main');
  });

  it.each([{ head_sha: 'b'.repeat(40) }, { head_branch: 'feature' }, { event: 'pull_request' }])(
    'cannot substitute a successful run with mismatched attribution: %j',
    async (mismatch) => {
      const fixture = gate([{ workflow_runs: [{ ...successfulRun, ...mismatch }] }]);
      await expect(
        runDeploymentGate('wait-for-ci', environment, fixture.dependencies),
      ).rejects.toThrow('Timed out after 14 minutes');
      expect(fixture.elapsed()).toBe(14 * 60_000);
    },
  );

  it.each(['failure', 'cancelled', 'timed_out', 'skipped', 'neutral', null])(
    'blocks a completed Verify run with conclusion %s',
    async (conclusion) => {
      const fixture = gate([{ workflow_runs: [{ ...successfulRun, conclusion }] }]);
      await expect(
        runDeploymentGate('wait-for-ci', environment, fixture.dependencies),
      ).rejects.toThrow('Verify failed');
      expect(fixture.waits).toEqual([]);
    },
  );

  it('does not accept an older success while a newer run is queued', async () => {
    const fixture = gate([
      {
        workflow_runs: [
          successfulRun,
          { ...successfulRun, id: 101, status: 'queued', conclusion: null },
        ],
      },
      { workflow_runs: [{ ...successfulRun, id: 101 }, successfulRun] },
    ]);
    await runDeploymentGate('wait-for-ci', environment, fixture.dependencies);
    expect(fixture.waits).toEqual([30_000]);
  });

  it('does not accept an older success when the newest run failed', async () => {
    const fixture = gate([
      { workflow_runs: [successfulRun, { ...successfulRun, id: 101, conclusion: 'failure' }] },
    ]);
    await expect(
      runDeploymentGate('wait-for-ci', environment, fixture.dependencies),
    ).rejects.toThrow('Verify failed');
  });

  it('bounds the wait for queued verification', async () => {
    const fixture = gate([
      { workflow_runs: [{ ...successfulRun, status: 'queued', conclusion: null }] },
    ]);
    await expect(
      runDeploymentGate('wait-for-ci', environment, fixture.dependencies),
    ).rejects.toThrow('Timed out after 14 minutes');
    expect(fixture.elapsed()).toBe(14 * 60_000);
  });

  it('requires the build commit to still be the current main commit', async () => {
    const fixture = gate([{ ref: 'refs/heads/main', object: { sha: commit } }]);
    await runDeploymentGate('require-current', environment, fixture.dependencies);
    expect(fixture.paths).toEqual(['git/ref/heads/main']);
    expect(fixture.waits).toEqual([]);
  });

  it('blocks a stale build before production changes', async () => {
    const fixture = gate([{ ref: 'refs/heads/main', object: { sha: 'b'.repeat(40) } }]);
    await expect(
      runDeploymentGate('require-current', environment, fixture.dependencies),
    ).rejects.toThrow('Refusing stale deployment');
  });

  it.each([
    { WORKERS_CI: undefined },
    { WORKERS_CI_BRANCH: 'feature' },
    { WORKERS_CI_COMMIT_SHA: undefined },
    { WORKERS_CI_COMMIT_SHA: 'short-sha' },
  ])('blocks invalid Cloudflare build context: %j', async (invalid) => {
    const fixture = gate([{ workflow_runs: [successfulRun] }]);
    await expect(
      runDeploymentGate('wait-for-ci', { ...environment, ...invalid }, fixture.dependencies),
    ).rejects.toThrow('requires a Cloudflare Workers Builds commit on main');
    expect(fixture.paths).toEqual([]);
  });

  it.each([
    null,
    { message: 'API error' },
    { workflow_runs: [{ ...successfulRun, id: undefined }] },
    { workflow_runs: [null] },
  ])('fails closed on an invalid GitHub response: %j', async (response) => {
    const fixture = gate([response]);
    await expect(
      runDeploymentGate('wait-for-ci', environment, fixture.dependencies),
    ).rejects.toThrow();
    expect(fixture.waits).toEqual([]);
  });

  it('does not continue polling after an API/network failure', async () => {
    const fixture = gate([]);
    fixture.dependencies.readJson = async () => {
      throw new Error('GitHub unavailable');
    };
    await expect(
      runDeploymentGate('wait-for-ci', environment, fixture.dependencies),
    ).rejects.toThrow('GitHub unavailable');
    expect(fixture.waits).toEqual([]);
  });

  it('uses the public GitHub API without credentials and rejects HTTP errors', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 403 }));
    await expect(readGitHubJson('git/ref/heads/main', request)).rejects.toThrow('HTTP 403');
    expect(request).toHaveBeenCalledWith(
      'https://api.github.com/repos/rwjblue/cwa-training-tracker/git/ref/heads/main',
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.anything() }),
        signal: expect.any(AbortSignal),
      }),
    );
  });
});
