# Deployment and operations

Production consists of the `cwa-training-tracker` Worker and its D1 database,
both configured in `wrangler.jsonc`. The Worker custom domain is
`cwa.n1rwj.com`. Public files are built into `dist/`; only `/api/*` runs the
Worker first. Static routes fall back to the app shell.

## Credentials and email

Wrangler uses your existing Cloudflare login. Never copy OAuth credentials
into this repo or GitHub Actions. `AUTH_SECRET` is a random Worker secret used
to protect short-lived authentication challenges; set it with
`wrangler secret put AUTH_SECRET`. Local secrets live in ignored `.dev.vars`.

Email Service is enabled for `cwa.n1rwj.com`; transactional codes are sent from
`signin@cwa.n1rwj.com`. SPF, DKIM, and DMARC records are scoped to that subdomain,
leaving the personal domain's existing mail configuration alone.

```sh
npx wrangler email sending list
npx wrangler email sending dns get cwa.n1rwj.com
```

New installations need their own Cloudflare account, managed DNS zone, D1
database, origin, sender, and secret. Run `wrangler d1 create <name>`, update
the configuration, and onboard the chosen email subdomain with
`wrangler email sending enable <subdomain>`. Custom domains provision DNS/TLS
through Wrangler on deployment. Check email limits in your Cloudflare account
before inviting a large group.

## Release and verify

Use `mise run deploy`; it validates and builds before applying migrations and
deploying. Remote D1 migration is intentionally part of this task. Schema
changes should stay backward compatible with the previous Worker version.
Do not deploy the local `.dev.vars` configuration to production.

After deployment, open the site, check `/api/health`, request a code to your
own real inbox, and confirm an authenticated journal can load. Never send
test mail to fake addresses in production. Browser tests run locally and use
the email simulator.

## Operations

Workers observability is enabled. Authentication code, token, and email body
values must never be added to application logs. API responses are not cached.
A daily scheduled handler cleans expired authentication and rate-limit data.

Use `npx wrangler tail` to inspect failures. Keep personal exports out of log
output. D1 supports Time Travel for disaster recovery; inspect the available
restore window and bookmarks before any database recovery. An app rollback
does not reverse schema migrations or user data writes.

```sh
npx wrangler deployments list
npx wrangler rollback <version-id>
npx wrangler d1 time-travel info DB
```

The checked-in GitHub Actions workflow verifies pull requests and main commits.
No deployment credential is needed for its tests or Wrangler dry run.

## Cloudflare push-to-deploy

The existing `cwa-training-tracker` Worker is connected to
`rwjblue/cwa-training-tracker` through the Cloudflare GitHub app. Production
builds run on pushes to `main`. Preview builds are disabled until they have
separate database, email, and secret bindings. The configured commands and
build variables are:

| Setting                   | Value                              |
| ------------------------- | ---------------------------------- |
| Root directory            | `/`                                |
| Build command             | `bash mise/tasks/cloudflare-build` |
| Deploy command            | `$HOME/.local/bin/mise run deploy` |
| `NODE_VERSION`            | `24.21.0`                          |
| `SKIP_DEPENDENCY_INSTALL` | `1`                                |

The build task installs pinned Mise, installs the repository's pinned Node and
dependencies, and waits up to fourteen minutes for the GitHub `Verify` workflow
for that exact commit. It requires a successful `main` push run, including the
fast checks and every browser shard. A failed, canceled, missing, or timed-out
verification stops the build before migrations. API errors also stop the build;
the public GitHub API needs no credential, but a rate-limited build must be
retried after the quota resets. This explicit gate connects the two systems;
Cloudflare does not automatically wait for GitHub Actions checks.

The deploy task then runs its checks, tests, build, and Wrangler dry run before
applying remote D1 migrations and publishing the Worker. In Workers Builds it
checks the current `main` revision before migrations and again before publishing,
rejecting a build that has already been superseded. These checks are not a
deployment mutex; keep migrations backward compatible and avoid overlapping
manual releases. Cloudflare skips superseded queued builds, but a running build
can finish while another push arrives.

Select a user-owned build token scoped to this Cloudflare account and the
required zone. Verify that it includes **D1 Edit** for remote migrations,
alongside the permissions required to deploy the Worker and its custom domain.
An existing build token with those permissions can be reused without creating
a new credential. Keep `AUTH_SECRET` in Cloudflare; the build does not need a copy.
Do not copy local Wrangler OAuth credentials into build variables or GitHub.
Use one production deployment system to avoid duplicate releases. See
[Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
and the [Builds API reference](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/).
