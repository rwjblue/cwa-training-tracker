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
of test time. That applies to manual and recall timers, not native audio credit:
use a short synthetic recording and its actual media movement for listening.
Fix the date/timezone when a scenario depends on a calendar day.

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
Check the displayed lesson/selected recording title and CWA artwork on the phone
as well. Browser journeys should inspect actual Media Session metadata and decode
the artwork URLs; shared-controller tests cover platform actions and ownership
transfer without trying to emulate an OS lock screen.

Keep time-credit boundaries in fast clock tests: paused/buffering media, seeks,
repeated listening, native rates, manual/recall transitions, and multiple source
files. The assigned-recording journey should prove native Play starts counting,
speed changes retain notes/time, and the reviewed saved record contains actual
sources and scratchpad text. Reuse synthetic audio instead of downloading course
recordings. Catalog tests protect exact URL groups and known replacements; live
network availability is an explicit catalog maintenance check, not a CI test.
Recording speed tests distinguish 25-WPM Farnsworth character timing from the
effective variant label and normally spaced CWT files. Check single-speed review
fields and mixed-speed per-file metadata in the assigned-recording journey.
Duration input tests cover minutes:seconds, rollover, validation, and preserving
unchanged measured precision; the record-edit journey verifies conversion back
to stored minutes. Inspect the review form at desktop/mobile widths.

For assigned practice, keep recommended duration, elapsed practice, and completion
separate. Pure tests cover absent duration recommendations, removal of old generated
15-minute placeholders, preserved learner overrides (including explicitly clearing
a duration), and version 1 backup round trips. A browser journey should open an
untimed assignment with elapsed time at zero and no invented goal, mark it complete
without playing audio or saving time, then reopen it. Assert the practice log is
unchanged. Optional goals must not cap elapsed time or complete the exercise.
When manually logging an exercise with no recommendation, require the learner's
actual duration rather than supplying 15 minutes.

Today should have no completion checkbox; completion remains explicit in the studio
and course plan. Keep dismissal selection in pure tests: only earlier unfinished
items disappear, restoration retains linked practice, and rescheduling a dismissed
item to today or the future makes it eligible again. Test bulk dismissal and restore
at the Worker layer for account isolation, atomicity, and preservation of completion
and other task fields. One browser journey should dismiss earlier work, verify it
stays in the course plan, restore it, and confirm that no time or completion was
added. Keep overflow and accessible button names in the desktop/mobile check.

Curriculum link tests cover all 16 sessions in each of the four published catalogs.
Verify the current-session syllabus link in the browser rather than just a generic
resources URL. The Beginner session 2 HTML bookmark is missing: the tested fallback
is the official PDF at `#page=11`. Fundamental uses each session's first homework
day, with the sole session 16 heading as an exception. Recheck real bookmark targets
and the PDF's physical page when updating source versions; do not put live external
fetches or restricted curriculum content into fixtures.

For QSO copy checks, test scenario-specific answer keys and accepted formatting
at the pure-logic layer. Missing substantive details, wrong station attribution,
and near-match callsigns must not pass. Keep one browser journey for hidden
answers, check/retry/reveal, draft retention during replay, and a fresh form when
the contact changes. Copy feedback is self-assessment, not a saved proficiency
score; revealing answers should remain explicit.

For embedded Morse Runner, keep protocol and result validation in pure tests.
One browser journey should start the actual vendored AudioWorklet, stop a short
run, and save its measured time and score against the assignment. Do not fake
postMessage results in that journey or fast-forward its JavaScript clock: only
the audio engine establishes credited practice time. Check the iframe's narrow
security headers and desktop/mobile fit in the same journey. Verify pinned
vendor hashes when updating the bundle; do not duplicate upstream engine tests.

For sending scales, protect prescribed-section filtering, complete mechanical
character patterns and prosign notation with fast tests. One browser journey
covers public access, readable section selection, text size, Start without a
popup, uninterrupted timer changes and a reviewed assignment-linked sending save.
Check the large-text reader at desktop/mobile widths and keep the PDF link visible.
Native patterns do not require fetching external reference material in CI.
The learner journey starts from the guest homepage and checks understandable
prosign targets, a single timer/save area, and compact, reachable controls while
reading the lower rows at mobile width.

For native copy, keep generation, full-text alignment, adaptive scoring, and
evidence validation in the shared domain tests. Clock tests cover non-overlap,
countdown exclusion, replay and inactivity; recovery tests cover account scope,
tab ownership and immutable pending saves. Browser journeys use real short audio
to cover guest recovery/sign-in, a complete 25-word round, uncertain-save retry,
callsign controls, punctuation, downloads, curriculum presets and report evidence.
The Start regression checks the same answer field stays in place, receives focus
during the countdown, and retains the first typed characters into playback.
Comparison tests retain the complete edit alignment across missing group boundaries
and keep columns adjacent with long extra input wrapping. Pitch tests verify
500–900 Hz per-group audio, fixed tones, and repeatable replay/recovery without
changing timing. Preserve legacy fixed-tone/count recipes and pending-save JSON.
Never infer listening credit from a mocked timer. Corpus/generator versions are
part of saved-result validation: a future revision must preserve validation of
already-saved versions rather than silently regenerating different targets.

For automatic practice saves, test the queue below the browser: successive guest
rounds, immutable retries after lost responses, storage/network failure, and
stopping a flush when the authenticated account changes. Browser journeys prove
automatic grading saves, immediate next-round focus, word progress and period
replay, and listening navigation above/below the 30-second threshold with actual
media movement. Guest local history must survive reload and support explicitly
saving a selected result after sign-in; background upload acknowledgements must
not reset a newly started session. Keep notes and report checks in those journeys.
Use fake timers for the queue's 750ms local receipt and 10-second upload timeout,
including a stalled response body. A local receipt requires durable storage; with
storage unavailable, only server acknowledgement counts as success. Confirmed
manual saves must clear the original scratchpad context even when navigation
unmounts the studio before its effects run; canceled or failed saves retain notes.
Hold a manual-save acknowledgement after the server commits it to verify that
Escape, Close, and Cancel cannot dismiss the saving dialog. A confirmed save
returns directly to Today without asking the old studio snapshot to save again.
