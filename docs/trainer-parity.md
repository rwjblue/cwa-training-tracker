# Trainer feature parity

The public app is **not yet a complete port** of the personal CW trainer. This is
the canonical inventory of what works, what remains, and what should intentionally
change for a public service. Use it before starting another port or declaring a
feature complete; a shared name such as “QSO,” “Report,” or “Sending” does not mean
the full workflow is present.

The 2026-09-29 audit followed active entry points, imports, shared components,
storage, APIs, and relevant tests. It compared personal-site
[3106c9b8](https://github.com/rwjblue/rwjblue.com/tree/3106c9b8bf20b63be069f4019467cb565cdd17ec)
with tracker
[bc20fdb8](https://github.com/rwjblue/cwa-training-tracker/tree/bc20fdb817a3c42969fafddc2d84c3664d73c10d).
No personal records or private imports were inspected. Pinned links describe those
baselines; relative implementation links describe this checkout. Implementation
status is not a claim about deployment or physical-device testing.

Detailed evidence and source coverage are retained in three appendices:

- [Planning, records, integrations, reports, and migration](parity/planning.md)
- [Official audio, playback, recall, and scratchpad](parity/audio.md)
- [Generated listening, sending, Runner, and public tools](parity/listening.md)

Their baseline findings are historical. Each has an update ledger distinguishing
the fixes below from gaps that remain. **Present** means an active usable
equivalent; **partial** means only the stated subset exists; **missing** means no
active equivalent was found. P1/P2/P3 describe product priority, not security severity.

## Already usable

- **Daily curriculum and private journal:** Published Beginner v4.8, Fundamental
  v2.0, Intermediate v2.3 and Advanced v2.1 catalogs follow the learner's schedule.
  Intermediate retains 213 required exercises across 48 practice days. Beginner
  uses an explicit app scheduling convention for session-level work. Today, linked
  minutes, explicit completion, manual activities, class-time separation, editable
  logbook, basic printable reports, and repeatable backup/reset/import are present.
  Today opens exercises without completion checkboxes. An assigned exercise can
  be marked complete or reopened in the studio, independently of listening time;
  the course plan retains its explicit completion controls. Earlier unfinished
  reminders can be dismissed and restored without completing them or adding time.
  Curriculum exercises have a duration only when the source recommends one or
  the learner sets one. The studio shows elapsed practice with an optional goal.
  Syllabus links open the relevant class session.
  [Curriculum](../src/shared/curriculum.ts), [daily plan](../src/shared/plan.ts).
- **Native copy practice:** Code Groups, Word Copy, Callsign Copy and Plain Text
  run in the site, including all 20 Intermediate ICR assignments and 98
  Fundamental blocks. Typed answers, grading, actual time, private evidence,
  recovery and report details are present. Setup and typing share one workspace;
  Start focuses the existing answer field immediately. Results compare transmitted
  groups on separate aligned rows with adjacent columns, including missing groups
  and extra input. New group rounds use duration only. Random 500–900 Hz pitch
  is the default, changing per group or word/call and retained on replay/recovery;
  plain text keeps one pitch for the recording. Legacy fixed-tone/count results
  remain readable and recoverable. Grading saves automatically, with a prominent
  next-round action; word/call copy uses compact entry and per-trial progress.
  Typing `.` replays the current word without changing the answer. Notes are optional.
  [Copy trainer](../src/client/CopyTrainer.tsx),
  [domain](../src/shared/copy-practice.ts), [scope and differences](lcwo-native-trainers-proposal.md).
- **Word and QSO listening:** the same 70 unique common QSO words and 30 common
  English words, custom lists, four generated contact scenarios, native Morse
  audio, transcript highlighting, seeking, and logging are available. Switching
  tools or app pages automatically saves listening sessions with at least 30
  credited seconds; shorter sessions do not create entries. Sound controls sit
  alongside pause, repeat, and shuffle settings.
  The old “77” name is not seven missing vocabulary items. Geographic/seasonal
  coherence and scenario-aware copy checks are current-app improvements.
  [Listening](../src/client/ListeningTrainer.tsx), [content](../src/client/word-content.ts).
- **Morse Runner engine:** the same pinned embedded engine, Single Call/WPX,
  assignment settings, actual engine elapsed time, and independent run results
  are present. Remaining Runner gaps concern recovery and successive-run workflow,
  not an absent simulator. [Runner](../src/client/MorseRunnerStudio.tsx).
- **Public access and private accounts:** public practice, email codes, passkeys,
  per-user private storage, account settings, and export are intentional improvements
  over a single-owner site. [Architecture](architecture.md).

## Addressed in this change

These baseline gaps no longer describe the current implementation:

| Capability                      | Implemented behavior                                                                                                                                                                                                                                                                                                                                                           | Remaining boundary                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playback accounting             | Native Play and app Play accrue actual media movement. Pauses, seeks, and buffering do not add idle time; replay counts heard time; the target never caps the session. [Clock](../src/client/practice-clock.ts), [event hook](../src/client/usePracticeClock.ts).                                                                                                              | Non-copy audio still lacks durable unfinished-session recovery. Physical locked-iOS behavior still needs a device check.                                                                                                                             |
| Focused recall                  | Assigned audio has a separate recall timer, included in total time with its own saved measurement; hidden-page recall pauses. [Studio](../src/client/PracticeStudio.tsx).                                                                                                                                                                                                      | The personal visible-page delayed-tick interruption guard and finish-time recall correction are not yet equivalent.                                                                                                                                  |
| Scratchpad                      | Notes can be written during practice, edited when saving, and read in history for native and imported records. [Save/history UI](../src/client/main.tsx).                                                                                                                                                                                                                      | Listening notes persist locally by account and tool/assignment. Full unfinished non-copy timing/audio recovery and an advisor-report learned-word workflow remain absent.                                                                                                     |
| Official recording speeds       | Verified native-speed files, device-local Assigned/Next preference, and mixed-speed per-file actual-time metadata are supported. Official files remain at 1x. [Selector](../src/client/RecordingSpeedSelect.tsx), [catalog matching](../src/client/recording-variants.ts).                                                                                                     | Per-task remembered overrides, actual pass/coverage tracking, bookmarks, and report aggregation remain open.                                                                                                                                         |
| Historical data access          | Imported practice exposes scratchpads, ratings, recall, passes, actual recording speeds, and per-run Runner/LCWO/CWT observations. Settings has an authenticated, on-demand reader for original reports, LCWO measurements, materials/revisions, course context, and device report drafts/preferences. [Imported history](../src/client/ImportedHistory.tsx).                  | Original reports and materials are readable snapshots, not native authoring/submission workflows. Device drafts are preserved for reference, not resumed.                                                                                            |
| Native copy lifecycle           | Four public modes preserve exact targets/answers, actual trial speeds, score versions, replay/reveal flags, and separate audio/answer/review time. Account/guest-local drafts restore paused; pending saves retain stable IDs and tabs coordinate ownership. [Clock](../src/client/copy-clock.ts), [storage](../src/client/copy-storage.ts), [API](../src/worker/training.ts). | This recovery applies to CopyTrainer, not all tools. Hidden copy practice pauses; answer/review time idles after 30 seconds. Guest/signed-in desktop/mobile Chromium journeys and accessibility checks pass; physical-device behavior is unverified. |
| Native copy history and reports | Validated per-attempt evidence appears in history and printable reports, survives export/import, and does not sum scores across rounds. [Results](../src/client/CopyResult.tsx), [report details](../src/shared/copy-report.ts).                                                                                                                                               | Native corpora/timing/scoring differ from LCWO. This is not advisor-form authoring or submission.                                                                                                                                                    |
| Published course coverage       | All four published catalogs use official links and factual metadata. Native copy recipes replace supported LCWO launches; source discrepancies are documented. [Coverage and counts](curriculum.md).                                                                                                                                                                           | Beginner/Advanced non-LCWO tools remain linked or use existing workflows. Prototypes are not defaults; automatic progression is absent.                                                                                                              |
| Leaving or switching practice   | Listening navigation saves sessions with at least 30 credited seconds. Short sessions retain scoped notes without a log entry. Guest results remain in the local logbook; signed-in pending uploads retry with stable IDs. Sending/manual and Runner retain explicit review/discard flows.                                                                                                                                                                                                                                                                           | Full unfinished-session recovery after reload/crash remains separate. Queued account uploads are scoped to the account; guest history stays on this device until explicitly saved after sign-in.                                                                                                                                                                                             |
| Lock-screen information         | Official recordings and generated Morse share Media Session artwork and controls. Official titles include the session and selected recording, with actual WPM in the album; generated tracks name the active word list or QSO scenario. [Media Session](../src/client/media-session.ts).                                                                                       | Browser metadata, PNG availability, and ownership are tested; physical iPhone artwork and locked playback still need device verification.                                                                                                            |
| Foreground spoken repeats       | Each word reuses its loaded Morse recording for all three plays before the spoken answer. Repeating a list keeps the sequence active when its transcript refreshes; Stop cancels pending speech advancement. [Listening](../src/client/ListeningTrainer.tsx), [browser regression](../e2e/spoken-answers.spec.ts).                                                             | The regression uses real native Morse playback and simulated speech callbacks. An installed local English voice and an open page are still required; background spoken-audio parity remains R7.                                                      |
| Duration and explicit completion | The universal 15-minute fallback is removed. Elapsed time and an optional goal are separate from an assigned exercise's explicit Complete/Reopen action; completion is available without starting audio or creating a practice entry. Unknown manual-entry durations require actual learner input. [Studio](../src/client/PracticeStudio.tsx), [plan model](../src/shared/plan.ts). | Completion is a learner decision, not proof of a full listening pass or attainment of a proficiency target. Practice credit continues to come from saved actual time. |
| Earlier reminders and session links | Today has no completion checkboxes. Dismissal hides earlier unfinished items only, with restoration in the course plan; dates, completion and recorded practice remain intact. All four courses link to the selected session in the official syllabus. [Today](../src/client/TodayPlan.tsx), [course plan](../src/client/Plan.tsx), [curriculum links](../src/shared/curriculum.ts). | Dismissal is not deletion and does not hide a task rescheduled to today or a future date. The Beginner session 2 HTML bookmark is missing, so its link uses the official PDF's page 11. |

## Remaining inventory

Each row describes work that is still missing or partial after those fixes. The
linked appendix contains the complete subfeatures and current-app comparison.

| ID / priority                                       | Current gap and concrete next behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1 · P1** Recoverable practice beyond native copy | Native copy now has scoped drafts, paused restoration and a retryable save. Extend that work to the remaining tools: persist active time, scratchpad, exact generated script/custom list, assignment, and acknowledged Runner results. Restore paused/interrupted. Finished copy and navigation-saved listening sessions now use a durable upload queue with visible status. Isolate device state by user and protect against conflicting tabs.                                                                                                                                                          | Personal [device state](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/storage.ts#L21); [planning P15–P17](parity/planning.md#instructor-materials-and-records).                                                                                                                                                                            |
| **R2 · P1/P2** Daily guidance                       | Offer resume/next eligible exercise; rotate familiar review without assignment credit; show the separate optional ten-minute word-listening suggestion. Earlier reminders now support dismissal and restoration independently of completion. Class time, Join class, rest-day goals, and saved/current-time breakdown still need explicit policy. | Personal [planner](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L270); [planning P03–P11/P38](parity/planning.md#curriculum-and-the-daily-queue). |
| **R3 · P1** Remaining typed results                 | Native copy now saves validated speed/error/points evidence with a result inspector and whole-attempt report details. Add performance ratings and structured CWT heard/worked observations for other practice. Imported LCWO history remains readable with source identity and overlap-safe estimated group minutes; native practice does not need live LCWO synchronization.                                                                                                                                                                  | Personal [result fields](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/practice-results-form.ts#L3), [LCWO accounting](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/lcwo-practice.ts#L8); [planning P14/P18/P20–P24](parity/planning.md).                                      |
| **R4 · P1** Advisor reports                         | Keep the generic printable report, then add configurable advisor fields, per-class windows, editable durable drafts, evidence-backed suggestions, refresh preserving edits, exact prefilled-form handoff, and confirmed submitted snapshots. Saved imported report snapshots are readable with original answers/evidence in Settings. New report authoring must use actual individual verified Runner results and practiced recording speeds; do not sum scores or infer learned words from exposure.                                          | Personal [report derivation](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L196), [handoff](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report-panel.ts#L282); [planning P27–P31](parity/planning.md#reports-and-evidence).                                         |
| **R5 · P1** Sending trainer                         | The current assignment link/section list/timer is useful, but capture is absent. Port optional adapter setup/test, keyed MIDI or focus-scoped keyboard input, raw edge timing, cautious decode/target comparison, actual-timing replay, keep/discard takes, and local retention. Keep ordinary key practice available without capture.                                                                                                                                                                                                         | Personal [active panel](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-panel.ts#L68); [sending subsystem](parity/listening.md#sending-practice--large-missing-subsystem-p1).                                                                                                                                                        |
| **R6 · P1/P2** Listening content and continuity     | Add the three authored stories as a real third mode. Preserve exact word occurrence and paused/playing state through speed changes; preserve paused seeking; reshuffle repeated native rounds; allow editing a built-in into custom. Retain all actually played settings, not just the final selection.                                                                                                                                                                                                                                        | Personal [stories](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/data/cw-listening/stories.ts#L6), [retiming](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-panel.ts#L120); [listening inventory](parity/listening.md#generated-contacts-stories-and-listening-lifecycle).                 |
| **R7 · P1/P2** Spoken answers                       | Current local speech supports custom words but requires a suitable installed voice and foreground scheduling. Personal published clips are stitched with Morse into a native track, with matching prebuilt MP3 fast paths. Choose a rights-cleared native-audio path for dependable background spoken rounds; retain local speech as an explicit fallback if useful.                                                                                                                                                                           | Personal [assets](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-assets.ts#L17); [word inventory](parity/listening.md#generated-word-practice).                                                                                                                                                                                       |
| **R8 · P2** Course-audio progress                   | Count whole passes from coverage without crediting seeks; keep prior/current passes distinct; remember task-specific speed choices; retain difficult timestamps and relative rewind; apply deliberate course/daily replay policies. Current prescribed-pass labels are not actual pass tracking.                                                                                                                                                                                                                                               | Personal [audio session](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/audio-session.ts#L41); [audio appendix](parity/audio.md#findings-by-behavior).                                                                                                                                                                                      |
| **R9 · P1/P2** Runner continuity                    | Recover acknowledged partial results (not the live contest), show cumulative assigned minutes/remaining time, and make Save & next run efficient without losing individual result identity. Completion remains manual today; decide explicitly whether to adopt the personal cumulative threshold.                                                                                                                                                                                                                                             | Personal [Runner transitions](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/runner-session.ts#L48); [Runner workflow](parity/listening.md#surrounding-workflow--partial).                                                                                                                                                                  |
| **R10 · P1/P2** Instructor material                 | Add private session-linked text/link/file material, preparation/class/reference classification, original-plus-revision history, and readable practice context. Imported materials and their revision links are readable in Settings; native material authoring and practice integration remain absent. Current custom activities cover only notes/link/date/session.                                                                                                                                                                           | Personal [materials](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L757); [planning P12](parity/planning.md#instructor-materials-and-records).                                                                                                                                                                                   |
| **R11 · P1/P2** Live practice and reminders         | Connect assigned CWT work to eligible event windows before class. Later add private reminder subscriptions and the optional public SST/MST/CWT live agenda, timezone toggle, and event calendar. Generic resource links do not supply scheduling. Reverify official schedules before implementation.                                                                                                                                                                                                                                           | Personal [live-task planning](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L135), [private calendar](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L625); [planning P06/P25/P26](parity/planning.md).                                                                |
| **R12 · P2** Optional on-air tools                  | Personal real-contact guidance is separate from generated QSO listening: calling/answering roles, own-station prompts, received details, local contact log, and ADIF export. Shareable exact listening recipes are also absent. Add these as optional public tools without complicating the daily plan.                                                                                                                                                                                                                                        | Personal [real QSO helper](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-qso.ts#L137), [share recipes](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/session.ts#L115); [public-tool inventory](parity/listening.md#standalone-public-tools-distinct-features-not-duplicate-page-names). |
| **R13 · P1/P2** Migration fidelity                  | Historical imports now expose original scratchpads and structured results, map LCWO group speed correctly, omit pure dismissal bookkeeping, derive Runner completion, and add overlap-safe one-minute LCWO group estimates. A timezone-aware cutoff limits practice/completion while retaining the full source archive. Settings makes reports, LCWO, materials and device drafts readable. Native report/material editing and recoverable device work remain separate migrations; readable preserved records are not complete feature parity. | Tracker baseline [converter](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L502), [completion import](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L425); [planning P33–P36](parity/planning.md#backups-migrations-and-api-fidelity).                      |
| **R14 · P2/P3** Preference refinements              | Per-mode settings, exact/preset 51–60 WPM support, finer pause/tone choices, and two distinct QSO pitches at the upper tone bound remain different. The personal per-mode writer itself omits QSO/story effective speed; port the intended behavior with both speeds.                                                                                                                                                                                                                                                                          | Personal [speed control](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/speed-control.ts#L1); [word inventory](parity/listening.md#generated-word-practice), [known source omission](parity/listening.md#documentation-reconciliation).                                                                                                    |

## Coherent next work

1. **Protect and expose work already done:** R1 plus a shared result-details view,
   the remaining native workflows from R13, and actual-settings attribution. Validate one
   interrupted/reloaded attempt, one offline retry without duplication, and one
   export/import round trip before extending the UI.
2. **Finish the daily lesson path:** R2, R8, R9, and assigned CWT availability from
   R11. Keep “minutes practiced,” “passes heard,” and “exercise complete” distinct.
   Exercise one ordinary day and one day with earlier work and partial practice.
3. **Make reporting useful:** finish the other typed results in R3 and the
   advisor workflow in R4. Generalize the advisor mapping and use native copy
   evidence alongside preserved history. Test source selection, missing/zero values,
   deliberate edits, and exact submitted snapshots.
4. **Complete training tools:** R5–R7 and private material support from R10.
   Reuse the existing native player and stronger QSO generator/checker; avoid
   introducing duplicate engines through old wrapper filenames.
5. **Add optional conveniences:** reminder subscriptions, public on-air helpers,
   shareable recipes, and preference refinements from R11/R12/R14.

Use [the testing strategy](testing.md): focused fast domain tests for accounting,
state transitions and normalization, API tests for persistence/isolation, and a
small number of representative browser journeys. Do not clone every personal test
or add one browser test per inventory row.

## Intentional differences and boundaries

- Public accounts replace the fixed personal owner/course. Do not copy owner
  credentials, personal defaults, a private advisor form, or private imported data.
  Advisor templates need their own configuration model. Native copy requires no
  LCWO account connection or live synchronization.
- Published catalogs cover all four levels; Intermediate v2.3 metadata corrects
  unavailable v2.2 references. Official URLs,
  numeric requirements, and original concise summaries are appropriate here;
  restricted curriculum paragraphs, scales, recordings, and instructor text stay
  at their sources or in the learner's private data.
- A 2026-09-29 follow-up checked Beginner, Fundamental and Advanced against the
  current published sources. Beginner late-session speeds, spoken-recognition
  guidance and final exchange blocks were corrected. Fundamental follow-up pools,
  letters-only final practice and recording repetitions were corrected. Advanced's
  48 days, 114 recording occurrences and 48 sending blocks match the source;
  optional contest practice stays in the linked syllabus. The public Academy guide
  now shows each course's entry requirements, goals, practice coverage and syllabus,
  using the same catalog as the private plan. Beginner practice still uses the
  official external trainer. [Course evaluation and conventions](curriculum.md).
- Session destinations were checked against the published syllabi linked from
  [CWops Student Resources](https://cwops.org/cw-academy/cw-academy-student-resources/)
  on 2026-09-29. HTML bookmarks are used for all sessions except
  [Beginner session 2](https://cwa.cwops.org/wp-content/uploads/Beginner-curriculum-ver-4.8.pdf#page=11),
  whose table-of-contents bookmark has no HTML target. Fundamental session links
  open the first homework day, or the sole session 16 homework section.
- Existing version 1 backups still validate without the new optional plan fields.
  `dismissedFromToday` and `targetMinutesExplicit` survive the same export/import
  path. Curriculum merging removes an old unmarked 15-minute placeholder only
  where the catalog has no duration. Other saved duration overrides, explicit
  15-minute choices, intentional duration clearing, and manual tasks are preserved;
  saved practice minutes are never rewritten by this cleanup.
- The original private daily “77-word” recording is not supplied by having the
  generated 70-word catalog. Do not publish that recording without a reuse basis.
- Sending “recording” in the personal trainer means measured keyed timing from
  MIDI/keyboard adapters. Microphone capture and a browser iambic paddle keyer
  were not implemented there and are not parity gaps.
- The personal planner's short-block/activity filters exist in tested helpers but
  are not wired into its current visible UI. Do not report dormant helpers as
  missing user-facing controls.
- Preserve useful current improvements: editable journal, public practice,
  configurable schedules, safer typed exercise recipes, generated QSO coherence,
  and copy checking. Parity does not require reproducing old bugs or fixed defaults.

## Keeping this inventory current

When implementing a row, update its current status here and its appendix ledger.
Record the exact usable behavior, remaining limitations, evidence, and meaningful
validation. Preserve baseline evidence rather than rewriting history. Follow the
whole path from reachable UI through timing/state, save, history, export/import,
and reporting before calling a feature ported. Source availability alone does not
establish redistribution permission or real-device behavior.
