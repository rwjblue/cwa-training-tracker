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
It also removes practice counters outside the 180-day UTC retention window and
records the last successful cleanup time for the statistics console.

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

## Statistics access

The read-only admin console is available only to accounts explicitly granted
the `metrics_viewer` role. There is no first-account rule, recurring admin seed,
user directory, invitation flow, or access-management page. All viewers see the
same installation-wide aggregates; this role does not permit viewing private
practice records or modifying accounts.

After applying the migrations, bootstrap your own access by signing in normally
and running the operator task with your sign-in email. Additional instructors
or administrators sign in to create and verify their accounts, then give you
their sign-in email for the same task:

```sh
mise run stats:grant -- person@example.com
mise run stats:revoke -- person@example.com
```

**These tasks target production D1 by default**, using your existing Wrangler
Cloudflare login. `--remote` explicitly selects that same target. To use the
local development database instead:

```sh
mise run stats:grant -- --local person@example.com
mise run stats:revoke -- --local person@example.com
```

Both commands normalize the email exactly as sign-in does and resolve an
existing verified account. They do not create accounts or send email. Grants
are stored against the immutable account ID in `account_roles`, independently
of profile settings and imports. Repeated grants or revocations are harmless;
a missing account is a clear error. Revoking a grant takes effect on the next
dashboard API request while preserving ordinary account access. Reload the app
after granting access to see its Admin navigation link.

The underlying Node script requires an explicit `--local` or `--remote` target.
It executes Wrangler using argument arrays and safely quotes SQL literals;
email addresses with apostrophes are supported. Apply migrations before using
the task, and keep access changes out of automated tests against production.

## Cloudflare push-to-deploy

The existing `cwa-training-tracker` Worker is connected to
`rwjblue/cwa-training-tracker` through the Cloudflare GitHub app. Production
builds run on pushes to `main`. Preview builds are disabled until they have
separate database, email, and secret bindings. The configured commands and
build variables are:

| Setting                     | Value                                       |
| --------------------------- | ------------------------------------------- |
| Root directory              | `/`                                         |
| Build command               | `bash mise/tasks/cloudflare-build`          |
| Deploy command              | `$HOME/.local/bin/mise run deploy`          |
| `NODE_VERSION`              | `24.21.0`                                   |
| `SKIP_DEPENDENCY_INSTALL`   | `1`                                         |
| `MISE_IGNORED_CONFIG_PATHS` | `~/.config/mise:~/.tool-versions:/etc/mise` |

The build task requires the `CWA_DEPLOY_GITHUB_TOKEN` build secret, installs
pinned Mise, installs the repository's pinned Node and dependencies, and waits
up to fourteen minutes for the GitHub `Verify` workflow for that exact commit.
It requires a successful `main` push run, including the
fast checks and every browser shard. A failed, canceled, missing, or timed-out
verification stops the build before migrations. The gate polls once per minute
and honors GitHub rate-limit reset/retry headers within its fourteen-minute
deadline. Other API errors, invalid responses, or a reset beyond the deadline
stop the build with a diagnostic before migrations. This explicit gate connects
the two systems; Cloudflare does not automatically wait for GitHub Actions checks.

Create a dedicated fine-grained GitHub personal access token with **Public
repositories (read-only)** access and no additional repository or account
permissions. The gate only reads public workflow runs and the public `main`
reference. Save it in the Worker's **Settings > Build > Build variables and
secrets** as an encrypted secret named `CWA_DEPLOY_GITHUB_TOKEN`; it is needed
by both build and deploy commands. Choose an expiration and replace the secret
before it expires. Never reuse a broad local GitHub CLI credential, put this
token in source control, or add it to Worker runtime bindings. Missing or
rejected credentials block deployment; the gate does not fall back to anonymous
requests.

The October 8–9, 2026 failed builds reached the verification gate and stopped
with HTTP 403 despite successful GitHub `Verify` runs. One failed after six
minutes of polling; the following two failed on the first request. Anonymous
GitHub requests share a small per-IP quota, which makes them unreliable from
Cloudflare's shared build infrastructure. This failure pattern is consistent
with exhaustion of that quota; the old logs omitted the rate-limit headers.
Authentication uses the token owner's quota instead. See [GitHub rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
and [public workflow-run access](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-workflow).

The ignored config paths keep Cloudflare's global tool defaults out of Mise's
tool selection. Both commands still use this repository's `mise.toml` and file
tasks, without trying to reinstall unrelated image tools such as Hugo or Ruby.

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
