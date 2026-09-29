# CW Academy Companion

A welcoming place to practice Morse code, build a routine, and keep a private
training journal. Live at **https://cwa.n1rwj.com**.

This independent community project is not affiliated with or endorsed by
CWops. Official course material stays at the
[CW Academy student resources hub](https://cwops.org/cw-academy/cw-academy-student-resources/).

## What it does

- Public Morse practice with character speed, Farnsworth spacing, tone, random
  groups, callsigns, and custom text; no account required.
- A private practice journal with goals, course planning, activity summaries,
  and separate practice categories.
- A personal homework plan with class dates, exercises, completion tracking,
  and printable practice reports. Class time stays separate from daily goals.
- Passwordless email codes that expire in five minutes, plus passkeys.
- Readable callsign identity, optional Gravatar images, and a city-based timezone picker.
- JSON export, validated repeatable import, and a training-data reset.
- A converter for the original n1rwj.com tracker export. Personal data is never
  included in this repository or fetched automatically from the source site.

## Develop

Install [mise](https://mise.jdx.dev), then:

```sh
mise trust
mise install
mise run install
cp .dev.vars.example .dev.vars
# Replace AUTH_SECRET with a random value of at least 32 characters.
mise run preview
```

Open http://localhost:8787. Preview builds the app, applies **local** migrations,
and runs the real Worker with local D1 and simulated email. Wrangler prints a
path to each simulated email so you can read the one-time code locally.
No real email is sent in this mode.

For hot reload, set `APP_ORIGIN=http://localhost:5173` in `.dev.vars`, run
`mise run dev-api` in one terminal and `mise run dev` in another, then open
http://localhost:5173. Restore the origin to port 8787 for the built preview.
The origin must exactly match the browser address for email and passkeys.

```sh
mise run check         # TypeScript
mise run test          # Domain + API/security regression tests
mise run build         # Production assets
mise run test-browser  # Real Worker + Chromium user journeys
mise run pre-commit    # Check, test, build
mise run types         # Regenerate Cloudflare bindings
mise run format        # Format source and documentation
```

The browser suite requires `npx playwright install chromium`. It uses isolated
local test data and simulated mail; it does not access production.

## Deploy

Production uses Cloudflare Workers Static Assets, D1, and Email Service.
`wrangler.jsonc` is the source of truth; the top-level configuration is
production. It serves only the custom domain, with workers.dev disabled.

```sh
npx wrangler login
npx wrangler secret put AUTH_SECRET
mise run deploy
```

The deploy task runs checks, tests, build, a Wrangler dry run, remote D1
migrations, and the production deployment. Read [deployment notes](docs/deployment.md)
before operating your own instance. There are no production credentials in CI.

## Data and architecture

- [Import and migration](docs/import.md)
- [Architecture and security](docs/architecture.md)
- [Deployment and operations](docs/deployment.md)

`src/client/` is the React interface, `src/shared/` holds training data and
validation, `src/worker/` is the API, and `migrations/` is the D1 schema.
Use Jujutsu for commits in this colocated repository. The project is MIT licensed.
