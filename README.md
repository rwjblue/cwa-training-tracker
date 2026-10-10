# CW Academy Companion

A welcoming place to practice Morse code, build a routine, and keep a private
training journal. Live at **https://cwa.n1rwj.com**.

This independent community project is not affiliated with or endorsed by
CWops. Official course material stays at the
[CW Academy student resources hub](https://cwops.org/cw-academy/cw-academy-student-resources/).

## What it does

- A word trainer with 70 common QSO words, 30 common English words, or your own
  list. Shuffle, repeat, adjust pauses, and optionally hear three Morse repeats
  followed by a prerecorded answer. Repeats, answers, and pauses play as one
  native recording for background listening. Custom spoken lists use the built-in
  vocabulary.
- Randomly generated contacts in four QSO scenarios: first contact,
  rigs/antennas/weather, POTA, and asking for repeats. Each New QSO combines
  different station details; replay keeps the same contact. Illustrative call-area
  locations, regional seasonal weather, and radio power choices stay consistent.
- Sentences & stories bridges word recognition and connected listening with
  24 short phrases, 24 short sentences, three two-sentence stories and the
  original longer stories. Pause after each chunk uses a native recording that
  ends at the phrase or sentence; replay the whole chunk, reveal its text, and
  choose Next when ready. Continuous playback remains available.
- Sentence copy, inside Copy practice, offers one 5–9-word sentence at a time
  with typed answers and feedback.
- QSO copy checks let you enter the station details you heard, replay the same
  contact, and check each answer. The form follows the chosen scenario; answers
  stay hidden until you reveal them. Copy feedback stays in the current studio
  visit and does not automatically create a practice-log entry.
- Continuous native audio playback with pause/resume, a seek bar, current-word
  highlighting, and clickable words. Morse rounds include their silence in one
  audio file so playback does not depend on background JavaScript timers. Native
  Play automatically counts actual listening time; pauses, seeks, and buffering
  add no idle time. Assigned recordings have a separate timer for focused recall.
  Media Session controls include the current lesson or listening title and CWA
  Morse artwork for the device's lock screen.
- Official recording speed choices keep the assigned speed visible and offer
  verified faster files when available. An Assigned/Next default is remembered on
  your device, and saved practice retains the actual recordings and speeds used.
- A practice scratchpad for recall and questions. Review and edit it when saving
  a session, then read or revise the saved scratchpad from your practice log.
  Assigned recording notes stay on your device between listens for the same
  assignment; a new assignment of that recording starts fresh.
- Embedded Web Morse Runner for Single Call and WPX practice, with synthetic
  calls and assignment settings filled in automatically. Save the engine's
  measured time, QSO count, and verified score to your journal. Public runs
  work without an account; keep this interactive simulator visible while running.
- Public Morse practice with character speed, Farnsworth spacing, tone, adjustable
  group and word lengths, generated callsigns, and custom text; no account required.
  Playback preferences stay on your device. Listening starts timing automatically;
  manual timers remain available for other practice. Review and save explicitly
  when you finish; the time target never cuts a session short.
- A private practice journal with goals, course planning, activity summaries,
  and separate practice categories.
- A Today view for your own assignments, next-class preparation, and unfinished
  work, backed by a personal homework plan with printable practice reports.
  Choosing a level and setting class dates automatically schedules the published
  Beginner v4.8, Fundamental v2.0, Intermediate v2.3, or Advanced v2.1 curriculum.
  The Academy guide explains each course's starting point, goals and practice
  coverage, with direct links to its official syllabus. Recordings
  play from CWops; sending and external exercises open their assigned material.
  Saved time stays linked to the exercise. Class time stays separate from daily
  goals. Personal and imported assignments remain available alongside the course.
- Passwordless email codes that expire in five minutes, plus passkeys.
- Readable callsign identity, optional Gravatar images, and a city-based timezone picker.
- JSON export, validated repeatable import, and a training-data reset.
- A read-only maintainer console with account growth, recently active accounts,
  approximate daily practice counts by tool and guest/account category, and
  storage and cleanup status. Practice counters contain no user identifiers and
  expire after 180 days; reporting never blocks saving or retries failed requests.
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

After signing in, bootstrap read-only statistics access for your existing
verified account with `mise run stats:grant -- your-sign-in@example.com`.
This task targets production by default; pass `--local` for development.
Use `stats:revoke` to remove access. Grants resolve email to the permanent
account ID and cannot be changed through profiles or imported backups. See
[statistics access](docs/deployment.md#statistics-access) for details.

## Data and architecture

- [Import and migration](docs/import.md)
- [Architecture and security](docs/architecture.md)
- [Testing strategy](docs/testing.md)
- [Trainer parity and remaining work](docs/trainer-parity.md)
- [Morse Runner source and updates](docs/morse-runner.md)
- [Deployment and operations](docs/deployment.md)

`src/client/` is the React interface, `src/shared/` holds training data and
validation, `src/worker/` is the API, and `migrations/` is the D1 schema.
Use Jujutsu for commits in this colocated repository. The project is MIT licensed.
