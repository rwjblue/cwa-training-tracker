# Testing CW Academy Companion

Keep the suite fast enough to run while working. Add a test when it protects a
meaningful behavior or failure boundary, not just because a function or component
exists. Start with the smallest test that would catch the regression.

## Choose the right layer

| Layer              | What belongs here                                                                                                                          | Current home                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Pure logic         | Timezone dates, class/practice separation, streaks, assignment selection, import conversion, exact practice lengths, preference validation | `src/shared/*.test.ts`, `src/client/*.test.ts` |
| Worker integration | Authentication, ownership checks, validated requests, real SQL, atomic imports, storage limits, export fidelity                            | `src/worker/api.test.ts`                       |
| Browser            | A representative user journey through controls, network requests, persistence, and the resulting screen                                    | `e2e/*.spec.ts`                                |

The Worker tests execute production migrations and SQL in an in-memory SQLite
adapter. Keep those tests focused on observable responses and stored outcomes;
use direct database assertions when the storage property matters, such as hashed
credentials or transaction rollback. This adapter does not replace checking a
real Workers runtime. The browser suite provides that boundary with local
Wrangler, D1, static assets, and simulated email delivery.

Keep boundary cases cheap. Test code expiry, cross-account access, malformed
imports, rollback, and date arithmetic below the browser. For Morse generation,
check every authored word against its declared length and assert generated
content invariants; never expect a particular random sequence or require two
random outputs to differ. Test timing calculations against meaningful durations
and spacing relationships rather than duplicating the implementation's loop.

## Keep browser coverage representative

A browser test should earn its startup and maintenance cost. Keep one useful
happy path for sign-in and saved practice, one real passkey round trip, a private
assignment/report journey, and representative practice/account controls. Cover
mobile overflow, keyboard behavior, and accessibility on the screens affected by
a change instead of taking the same snapshot after every click.

Use APIs to arrange fixtures or confirm the saved result. Exercise the operation
being tested through its actual interface: an import UI test must choose a file,
a download test must inspect the downloaded backup, and a reset UI test must use
the confirmation. Calling those APIs directly in several browser tests adds
little beyond the existing Worker coverage.

Use accessible roles and names for controls, including `combobox` for selects.
Wait for a visible result, a specific response, or a polled condition. Avoid
arbitrary sleeps, positional locators, and assertions tied to React state or CSS
class names. An explicit geometry assertion is appropriate when testing overflow.
Use the browser clock for timers; minutes of practice should take milliseconds
of test time. Fix the date/timezone when a scenario depends on a calendar day.

Do not repeat every validation case in every layer. A regression may need both a
logic test and one browser test when the failure crosses a boundary, such as a
valid form value being lost before the request is submitted. Routine copy and
styling changes usually need a focused visual check, not a new unit test.

## Run only what the change needs, then validate the result

```sh
# Fast domain, client-logic, and Worker regression suite
rtk proxy mise run test

# One relevant file while iterating
rtk proxy mise exec -- npx vitest run src/shared/training.test.ts

# A relevant browser journey; Playwright manages its server
rtk proxy mise exec -- npx playwright test e2e/practice.spec.ts

# Typecheck, complete Vitest suite, and production build before committing
rtk proxy mise run pre-commit

# Complete browser coverage when frontend, auth, or runtime wiring changes
rtk proxy mise run test-browser
```

The browser launcher builds fresh assets, applies migrations to a temporary local
D1 database, creates a temporary secret, and removes its state when it exits.
Do not run a second browser suite concurrently: the current harness deliberately
uses one worker, port 8791, and one email log. Do not enable parallel workers until
mail is correlated to its recipient and server state, ports, and logs are isolated.
Do not reuse a development or production database for tests. Use synthetic
training data; personal exports never belong in fixtures or captured artifacts.

When a test fails, read its assertion, error context, and retained trace before
changing timeouts. Accessibility reports are written to `.tmp/accessibility-*.json`;
Playwright failure artifacts are under `test-results/`. Fix the cause, rerun the
failing test, then run the affected suite once. Once it passes, repeat only for a
new change or unresolved concern. Test count and line coverage are not goals;
confidence in the user's workflow is.

For playback changes, unit-test the shared word timeline, WAV boundaries, and
player lifecycle; use one browser journey to verify native playback, word
seeking, pause/resume, and highlighting together. A stubbed media element cannot
prove audio plays, and browser device emulation cannot prove iOS lock-screen
behavior. Before claiming a release is verified for locked iOS playback, use a
physical iPhone: start a Morse-only round in Safari, lock for at least one full
word/transmission boundary, exercise the lock-screen pause/resume controls, then
unlock and confirm the transcript follows the actual audio position. Repeat with
an official recording. Test local spoken answers separately with the page open.
