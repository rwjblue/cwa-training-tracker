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
assignment/report journey, and representative practice/account controls. Run persistence workflows once,
using a mix of desktop keyboard and mobile touch journeys. Check the distinctive settled screens at both widths with
`expectResponsive`; repeat the whole workflow only when viewport or input mode
changes the behavior being protected. Keep explicit focus and reachable-control
assertions for keyboard/touch regressions.

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
of test time. That applies to manual and recall timers, not native audio credit:
use a short synthetic recording and its actual media movement for listening.
Fix the date/timezone when a scenario depends on a calendar day.

Give each browser journey one primary concern. Playback, guidance, recording
selection, save recovery, and backup controls need different assertions; they do
not each need another export/import/report cycle. Use the existing backup and
account recovery journeys for those controls and the fast suites for exhaustive
field fidelity. Keep separate browser coverage when paths differ, such as a
queued new result versus a direct historical edit, or a Runner terminal result
versus an ordinary timed block.

Capture screenshots and traces on failure through Playwright. Routine screenshot
files have no automatic comparison and should not be added after every click.
Run Axe on distinct screens and meaningful dialog states, not every transition.

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

## Coverage ownership

Keep exhaustive cases at the lowest layer that can detect the failure. A browser
assertion should establish wiring or an interaction that lower layers cannot
prove. When removing duplicate coverage, name the remaining test that owns the
behavior; do not replace assertions with a count or coverage-percentage target.

| Concern                                     | Fast coverage                                                                                                                                          | Browser boundary                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Authentication and privacy                  | Worker: code expiry, browser binding, single consumption, session revocation, origin checks and every private operation's ownership                    | Real email sign-in and passkey registration/sign-in against Wrangler                                                             |
| Practice time and completion                | Clocks/domain: pause, buffering, seeks, rates, recall interruption, overlap, subsecond boundaries, independent goals/completion and duration precision | Native playback into a saved record; representative manual/recall transitions and completion without added time                  |
| Generated content and scoring               | Domain/audio: corpus invariants, full alignment, versioned scores, answer keys, pitch, spacing, WAV/speech samples and strict evidence validation      | Applied content reaches playback/review; Copy focus, grading/replay and a full adaptive round; explicit QSO reveal               |
| Recording catalogs and curriculum           | Pure/catalog: all published sessions, URL groups, replacements, authored durations, learner overrides and tool recipes                                 | A course assignment launches the correct tool and official instructions; recording selection/marks/replay reach native media     |
| Autosave and offline work                   | Client queues: durable receipts, exact bodies, timeouts, failed storage, FIFO ordering, stale acknowledgements and account/dataset fencing             | Representative automatic-save, failed-review retry, offline reopen and explicit conflict decisions                               |
| Imports, backups and destructive operations | Client/Worker: schema compatibility, conflicts, byte/count limits, account scope, SQL/local rollback, lifecycle authority and exact retry receipts     | Actual downloads/file selection, reviewed restore/reset/clear, and retained recovery after an uncertain response                 |
| History and reports                         | Domain/Worker: exact raw facts, declared corrections, totals, provenance, archive fidelity and export/import round trips                               | Saved practice is readable, an edit is submitted correctly, and representative evidence appears in a report                      |
| Practice continuity                         | Client: pause/end flights, stale owners, originating-block retirement and scratchpad disposal                                                          | Inspection pauses without saving, return retains position/notes without autoplay, and unrelated edits preserve the current block |

Worker validation tests should retain representative rejection through each
distinct write/import path and assert no partial mutation. Exhaustive malformed
field matrices belong in the shared validators. Keep HTTP-specific cases, such
as JSON converting nonfinite numbers to null, and actual transactional failure
injection at the Worker layer. The SQLite adapter executes production migrations,
SQL, triggers and rollback; do not replace it with mocked repository methods.

Compatibility tests protect already-saved data. Preserve old omitted versus
measured-zero evidence, optional version 1 device inventory, fixed-tone/count
Copy recipes, original corpus/generator versions, unknown/retired dataset origins,
and exact pending bodies. A smaller browser suite does not justify deleting these
cheap tests or regenerating historical targets under today's versions.

Keep separate tests for observed failures with different ownership or durable
outcomes. A lost committed acknowledgement, rejected write, stale owner, failed
rollback and unreadable storage are different boundaries. Consolidate repeated
fixtures and validation tables without collapsing those distinctions.

## Native audio and Runner verification

Listening credit must come from actual native media movement. Use short synthetic
recordings, honor byte ranges, and wait for a paused seek destination to settle.
Fast-forward only manual/recall timers; never substitute fake elapsed time for
heard audio or AudioWorklet time. For a fixed native-audio calendar day, offset
only Date after sign-in and keep it advancing. `setSystemTime` also replaces the
performance clock and can manufacture false coverage gaps.

Keep word timeline, WAV limits, player lifecycle, three-repeat speech timing,
clip hashes/PCM format, silent gaps, baked volume and retry in fast tests. The
speech browser journey must use prerecorded speech with speechSynthesis
unavailable. Verify native seeking, pause/resume, highlighting and real Media
Session metadata/artwork. Controller tests own platform actions and stale-owner
rejection. Visibility emulation checks handlers, not OS background playback.

Recording pass tests own overlap/coverage union, once-only terminal outcomes,
changing/invalid durations, source replacement and native pause/seek gaps. Saved
facts contain completed passes, not unfinished active coverage. Generated
listening evidence describes actual applied configurations, not final selected
controls, per-configuration elapsed time, proficiency or on-air contact counts.
Recall corrections may change total/recall time but never raw measurements or
source subtotals. Selected unplayed material adds no heard evidence.

Runner browser coverage must start the actual vendored AudioWorklet and use its
acknowledged terminal result, not a forged postMessage result or running-clock
checkpoint. Keep iframe security headers and fit checks. Fast tests own protocol,
result validation, start attribution including midnight/DST, cumulative owned
assignment progress, review/class/future exclusion and legacy compatibility.
Saving transfers current time once; Complete/Reopen creates no entry or score.
Retained results and frozen review bodies must survive canceled/failed saves,
including refusal of both terminal-result and queue storage. Only server
acknowledgement can succeed without durable local storage. Verify pinned vendor
hashes when updating the bundle; do not duplicate upstream engine tests.

Browser emulation cannot verify locked iOS playback. Before claiming it works,
use a physical iPhone in Safari: start a Morse-only round, lock across a full
word/transmission boundary, use lock-screen pause/resume, unlock and verify the
transcript follows actual audio. Repeat with an official recording and with
Three repeats + spoken answer, including the answer, next word and loop seam.
Check lesson/recording metadata and artwork on the phone.

Give authenticated browser scenarios distinct reserved synthetic network
addresses through `CF-Connecting-IP`. Keep production sign-in limits intact;
inspect the actual request and visible error before treating absent simulator
email as a delay. Wait for real modal animations before geometry/Axe checks,
without arbitrary sleeps or disabled contrast rules.
