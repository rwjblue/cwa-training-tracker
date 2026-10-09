import { describe, expect, it, vi } from 'vitest';
import {
  GitHubRateLimitError,
  readGitHubJson,
  runDeploymentGate,
} from '../../scripts/cloudflare-deployment.ts';

const commit = 'a'.repeat(40);
const environment = {
  WORKERS_CI: '1',
  WORKERS_CI_BRANCH: 'main',
  WORKERS_CI_COMMIT_SHA: commit,
  CWA_DEPLOY_GITHUB_TOKEN: 'build-only-test-token',
};
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
    expect(fixture.waits).toEqual([60_000, 60_000]);
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
    expect(fixture.waits).toEqual([60_000]);
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

  it.each(['wait-for-ci', 'require-current'])(
    'requires the build secret before network access in %s',
    async (mode) => {
      for (const token of [undefined, '', ' \n\t ']) {
        const fixture = gate([{ workflow_runs: [successfulRun] }]);
        await expect(
          runDeploymentGate(
            mode,
            { ...environment, CWA_DEPLOY_GITHUB_TOKEN: token },
            fixture.dependencies,
          ),
        ).rejects.toThrow('requires the CWA_DEPLOY_GITHUB_TOKEN build secret');
        expect(fixture.paths).toEqual([]);
        expect(fixture.waits).toEqual([]);
      }
    },
  );

  it.each(['invalid token', 'invalid\nheader', 'token\u0000', 'token\u007f', 'token\u{1f512}'])(
    'rejects malformed credentials without reflecting them or accessing the network',
    async (token) => {
      const fixture = gate([]);
      const error = await runDeploymentGate(
        'wait-for-ci',
        { ...environment, CWA_DEPLOY_GITHUB_TOKEN: token },
        fixture.dependencies,
      ).catch((reason: unknown) => reason);
      expect(String(error)).toContain('invalid build credential');
      expect(String(error)).not.toContain(token);
      expect(fixture.paths).toEqual([]);
      const request = vi.fn<typeof fetch>();
      await expect(readGitHubJson('git/ref/heads/main', request, token)).rejects.toThrow(
        'invalid build credential',
      );
      expect(request).not.toHaveBeenCalled();
    },
  );

  it.each(['wait-for-ci', 'require-current'])(
    'retries a recognized rate limit within the shared deadline in %s',
    async (mode) => {
      const response =
        mode === 'require-current'
          ? { ref: 'refs/heads/main', object: { sha: commit } }
          : { workflow_runs: [successfulRun] };
      const fixture = gate([response]);
      const readJson = vi
        .fn()
        .mockRejectedValueOnce(new GitHubRateLimitError('HTTP 429.', 90_000))
        .mockResolvedValue(response);
      await runDeploymentGate(mode, environment, { ...fixture.dependencies, readJson });
      expect(readJson).toHaveBeenCalledTimes(2);
      expect(fixture.waits).toEqual([90_000]);
    },
  );

  it.each(['wait-for-ci', 'require-current'])(
    'stops promptly when a rate limit exceeds the deadline in %s',
    async (mode) => {
      const fixture = gate([]);
      const readJson = vi
        .fn()
        .mockRejectedValue(new GitHubRateLimitError('HTTP 403.', 15 * 60_000));
      await expect(
        runDeploymentGate(mode, environment, { ...fixture.dependencies, readJson }),
      ).rejects.toThrow('Retry exceeds the 14-minute deployment deadline');
      expect(readJson).toHaveBeenCalledTimes(1);
      expect(fixture.waits).toEqual([]);
    },
  );

  it('does not restart the verification deadline after rate-limit retries', async () => {
    const fixture = gate([]);
    const readJson = vi
      .fn()
      .mockResolvedValueOnce({
        workflow_runs: [{ ...successfulRun, status: 'in_progress', conclusion: null }],
      })
      .mockRejectedValue(new GitHubRateLimitError('HTTP 429.', 14 * 60_000));
    await expect(
      runDeploymentGate('wait-for-ci', environment, { ...fixture.dependencies, readJson }),
    ).rejects.toThrow('Retry exceeds the 14-minute deployment deadline');
    expect(readJson).toHaveBeenCalledTimes(2);
    expect(fixture.waits).toEqual([60_000]);
  });

  it('still rejects a mismatched successful workflow after a rate-limit retry', async () => {
    const fixture = gate([]);
    const readJson = vi
      .fn()
      .mockRejectedValueOnce(new GitHubRateLimitError('HTTP 429.', 60_000))
      .mockResolvedValue({ workflow_runs: [{ ...successfulRun, head_sha: 'b'.repeat(40) }] });
    await expect(
      runDeploymentGate('wait-for-ci', environment, { ...fixture.dependencies, readJson }),
    ).rejects.toThrow('Timed out after 14 minutes');
    expect(fixture.elapsed()).toBe(14 * 60_000);
  });

  it('authenticates the default reader with the supplied build environment', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ ref: 'refs/heads/main', object: { sha: commit } })),
      );
    vi.stubGlobal('fetch', request);
    try {
      await runDeploymentGate('require-current', {
        ...environment,
        CWA_DEPLOY_GITHUB_TOKEN: '  passed-build-token  ',
      });
      expect(request).toHaveBeenCalledTimes(1);
      expect(request).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer passed-build-token' }),
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
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

  it('allows direct public reads without implicitly using environment credentials', async () => {
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

  it.each([401, 403])(
    'fails closed without leaking secrets or retrying HTTP %s',
    async (status) => {
      const token = 'private-build-token';
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(`forbidden response body containing ${token}`, { status }));
      vi.stubGlobal('fetch', request);
      const log = vi.fn();
      try {
        const error = await runDeploymentGate(
          'wait-for-ci',
          { ...environment, CWA_DEPLOY_GITHUB_TOKEN: token },
          { log },
        ).catch((reason: unknown) => reason);
        expect(error).toBeInstanceOf(Error);
        expect(String(error)).toContain(`HTTP ${status}`);
        expect(String(error)).not.toContain(token);
        expect(String(error)).not.toContain('forbidden response body');
        expect(request).toHaveBeenCalledTimes(1);
        expect(log).not.toHaveBeenCalled();
        expect(request).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
          }),
        );
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it('recognizes primary rate limits and reports safe quota diagnostics', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('sensitive response body', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000000000' },
      }),
    );
    const error = await readGitHubJson('git/ref/heads/main', request, 'private-token').catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(GitHubRateLimitError);
    if (!(error instanceof GitHubRateLimitError)) throw new Error('Expected a rate-limit error.');
    expect(error.retryAt).toBe(2_000_000_000_000);
    expect(error.message).toContain('Rate-limit remaining: 0.');
    expect(error.message).toContain('Rate-limit reset (UTC epoch seconds): 2000000000.');
    expect(error.message).not.toContain('sensitive response body');
    expect(error.message).not.toContain('private-token');
  });

  it.each([403, 429])(
    'honors the later retry-after and reset header for HTTP %s',
    async (status) => {
      const fixedNow = 2_000_000_000_000;
      const now = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
      try {
        const request = vi.fn<typeof fetch>().mockResolvedValue(
          new Response('{}', {
            status,
            headers: {
              'retry-after': '120',
              'x-ratelimit-remaining': '0',
              'x-ratelimit-reset': '2000000090',
            },
          }),
        );
        const error = await readGitHubJson('git/ref/heads/main', request).catch(
          (reason: unknown) => reason,
        );
        expect(error).toBeInstanceOf(GitHubRateLimitError);
        if (!(error instanceof GitHubRateLimitError))
          throw new Error('Expected a rate-limit error.');
        expect(error.retryAt).toBe(fixedNow + 120_000);
      } finally {
        now.mockRestore();
      }
    },
  );

  it('honors a later reset than retry-after', async () => {
    const fixedNow = 2_000_000_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    try {
      const request = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{}', {
          status: 429,
          headers: {
            'retry-after': '30',
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '2000000120',
          },
        }),
      );
      const error = await readGitHubJson('git/ref/heads/main', request).catch(
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(GitHubRateLimitError);
      if (!(error instanceof GitHubRateLimitError)) throw new Error('Expected a rate-limit error.');
      expect(error.retryAt).toBe(fixedNow + 120_000);
    } finally {
      now.mockRestore();
    }
  });

  it('does not wait for primary quota reset when only a secondary limit applies', async () => {
    const fixedNow = 2_000_000_000_000;
    const now = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    try {
      const request = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{}', {
          status: 429,
          headers: {
            'retry-after': '30',
            'x-ratelimit-remaining': '100',
            'x-ratelimit-reset': '2000003600',
          },
        }),
      );
      const error = await readGitHubJson('git/ref/heads/main', request).catch(
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(GitHubRateLimitError);
      if (!(error instanceof GitHubRateLimitError)) throw new Error('Expected a rate-limit error.');
      expect(error.retryAt).toBe(fixedNow + 30_000);
    } finally {
      now.mockRestore();
    }
  });

  it.each<[number, Record<string, string>]>([
    [403, { 'x-ratelimit-remaining': '0' }],
    [429, { 'retry-after': 'invalid' }],
    [403, { 'x-ratelimit-reset': '2000000000' }],
    [401, { 'retry-after': '60' }],
  ])(
    'does not retry HTTP %s without recognized rate-limit evidence: %j',
    async (status, headers) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{}', { status, headers }));
      const error = await readGitHubJson('git/ref/heads/main', request).catch(
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(GitHubRateLimitError);
    },
  );
});
