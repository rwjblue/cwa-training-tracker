# CW Academy Companion

A welcoming place to practice Morse code, build a routine, and keep a private
training journal. Live at **https://cwa.n1rwj.com**.

This independent community project is not affiliated with or endorsed by
CWops. Official course material stays at the
[CW Academy student resources hub](https://cwops.org/cw-academy/cw-academy-student-resources/).

## What it does

- A word trainer with 70 common QSO words, 30 common English words, or your own
  list. Shuffle, repeat, adjust pauses, and optionally hear three Morse repeats
  followed by an answer from a local English voice on your device (keep the page
  open for spoken answers).
- Randomly generated contacts in four QSO scenarios: first contact,
  rigs/antennas/weather, POTA, and asking for repeats. Each New QSO combines
  different station details; replay keeps the same contact. Illustrative call-area
  locations, regional seasonal weather, and radio power choices stay consistent.
- QSO copy checks let you enter the station details you heard, replay the same
  contact, and check each answer. The form follows the chosen scenario; answers
  stay hidden until you reveal them. Copy feedback stays in the current studio
  visit and does not automatically create a practice-log entry.
- Continuous native audio playback with pause/resume, a seek bar, current-word
  highlighting, and clickable words. Morse rounds include their silence in one
  audio file so playback does not depend on background JavaScript timers.
- Embedded Web Morse Runner for Single Call and WPX practice, with synthetic
  calls and assignment settings filled in automatically. Save the engine's
  measured time, QSO count, and verified score to your journal. Public runs
  work without an account; keep this interactive simulator visible while running.
- Public Morse practice with character speed, Farnsworth spacing, tone, adjustable
  group and word lengths, generated callsigns, and custom text; no account required.
  Playback preferences stay on your device. Start practice plays and starts the
  timer together; review and save explicitly when you finish.
- A private practice journal with goals, course planning, activity summaries,
  and separate practice categories.
- A Today view for your own assignments, next-class preparation, and unfinished
  work, backed by a personal homework plan with printable practice reports.
  Choosing Intermediate and setting class dates automatically schedules the
  v2.3 curriculum's 213 required exercises over 48 practice days. Recordings
  play from CWops; sending and external exercises open their assigned material.
  Saved time stays linked to the exercise. Class time stays separate from daily
  goals. Other levels currently support personal and imported assignments.
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
- [Testing strategy](docs/testing.md)
- [Morse Runner source and updates](docs/morse-runner.md)
- [Deployment and operations](docs/deployment.md)

`src/client/` is the React interface, `src/shared/` holds training data and
validation, `src/worker/` is the API, and `migrations/` is the D1 schema.
Use Jujutsu for commits in this colocated repository. The project is MIT licensed.
