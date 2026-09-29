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

The checked-in CI workflow verifies pull requests and main commits. Deployment
is manual through mise until a scoped deployment credential is deliberately
configured in your GitHub environment. No token is needed for tests or a
Wrangler dry run.

## Choosing push-to-deploy

Automatic deployment is not configured yet. For this repository, prefer a
production deployment job after the existing GitHub Actions verification job
succeeds. That keeps type checks, unit/Worker tests, browser journeys, and the
Wrangler dry run ahead of each release. Run it only for pushes to `main`, never
for pull requests, and serialize production deployments so migrations and
Worker releases cannot race. Use a GitHub production environment for deployment
credentials and restrict its allowed branch to `main`.

This approach does not require installing the Cloudflare GitHub app. It needs
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in the deployment environment.
Limit the API credential to the necessary account/zone and Worker deployment,
D1 migration, and configured email-binding permissions. Keep the existing
`AUTH_SECRET` in Cloudflare; CI does not need a copy of that runtime secret.
Use the repository's pinned Node version and mise tasks. See Cloudflare's
[GitHub Actions guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

Cloudflare Workers Builds is an alternative. Connect the existing
`cwa-training-tracker` Worker to this repository using the Cloudflare GitHub app,
granting access only to this repository and selecting `main` as the production
branch. Configure validation in its build command and D1 migrations before its
deploy command; do not rely on a separate GitHub workflow to gate a build that
starts independently on push. Keep preview builds disabled until they have
separate database, email, and secret bindings. Choose one production deployment
system to avoid duplicate releases. See
[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/).
