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

The [October 2 publication journal](parity/publication-2026-10-02.md) confirms
external signed publication and closure of accepted issues #10–#27. Earlier
ledger entries describing those revisions as unpublished record their status
at the time. This agent did not push; subsequent local work follows the current
commit/main/deploy instruction.

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
  Practice review/edit duration uses minutes:seconds and preserves the original
  measured precision when unchanged. Official recording logs distinguish
  character and effective speeds using exact catalog sources and
  [documented timing measurements](recording-speeds.md).
  [Curriculum](../src/shared/curriculum.ts), [daily plan](../src/shared/plan.ts).
- **Daily time and goals:** Required goals use the existing daily target on
  dates with assignments, including completed work, and are zero on rest dates.
  The same optional personal target remains visible every day. Today/Overview
  and Studio share saved/current/combined independent time and separate class
  time. Recall stays inside total. Durable local saves transfer stable identities
  once; upload acknowledgements do not add them again. Studio, Copy and Runner
  publish readonly observations from their existing measured owners. One learner
  calendar refresh switches all summaries together; retained blocks keep the day
  and timezone captured at start. Guest totals contain actual device work only.
  [Summary](../src/shared/practice-time.ts),
  [shared display](../src/client/PracticeTimeSummary.tsx). Review and production
  acceptance are recorded in the #19 ledger below when complete.
- **Public live practice:** SST/MST/CWT current/next windows, Local/UTC choice,
  rules links and public recurring calendar are implemented in #20. Shared UTC
  rules are verified October 2, 2026; class/reminder data stays private. Studio
  inspection retains practice. Independently accepted and deployed; the #20 ledger
  records verification and client/physical-device limits. [Schedule](../src/shared/cw-events.ts).
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
  New `native-copy-v2` Code Groups attempts use the lower error total from
  positional group comparison and whole-text comparison, counting extra copied
  groups and supporting full text without LCWO's 255-byte cutoff. Results keep
  the whole-text alignment and explain both error counts when they differ.
  Recovered and saved `native-copy-v1` attempts retain their original scores;
  word, callsign and plain-text scoring is unchanged.
  [Copy trainer](../src/client/CopyTrainer.tsx),
  [domain](../src/shared/copy-practice.ts), [scope and differences](lcwo-native-trainers-proposal.md).
- **Words, QSO and Stories listening:** the same 70 unique common QSO words and 30 common
  English words, private custom lists, four generated contact scenarios and three
  original public authored Stories, native Morse
  audio, transcript highlighting, seeking, and logging are available. Inspecting
  app views pauses and retains the current block without a save; returning keeps
  it paused. Explicit Finish or switching tools automatically saves at least one
  measured second; Save notes explicitly retains nonempty zero-time text.
  Review & save still permits checking and canceling an entry.
  Sound controls sit alongside pause, repeat, and shuffle settings.
  The old “77” name is not seven missing vocabulary items. Geographic/seasonal
  coherence and scenario-aware copy checks are current-app improvements.
  [Listening](../src/client/ListeningTrainer.tsx), [content](../src/client/word-content.ts).
- **Morse Runner engine:** the same pinned embedded engine, Single Call/WPX,
  assignment settings, actual engine elapsed time, and independent run results
  are present. In-app inspection retains the same acknowledged result; a running
  engine stops into a partial result before the inspected view opens. Issue #16
  presents validated saved/current/combined/remaining assignment time in Studio
  and Today, with a separate time milestone and explicit Complete/Reopen.
  Issue #17 adds receipt-gated Save & start next run with retained settings,
  deliberate assignment/review/class context and a fresh paused owner. Recovered
  Logbook continuation focuses the committed studio after dialog cleanup.
  [Runner](../src/client/MorseRunnerStudio.tsx).
- **Sending scales reader:** Warm-up, Exercise and Drill now display native
  practice rows beside the timer, with adjustable text size and a prominent link
  to Bob Carter WR7Q’s original PDF. Assigned scales show their prescribed
  sections; a public Sending practice tool offers all three without an account.
  Starting scales keeps practice on this page, and changing sections preserves
  elapsed time. The reader uses mechanical character patterns, the conventional
  pangram and original guidance rather than imported curriculum prose. Optional
  sending input/capture remains R5. [Reader](../src/client/SendingScales.tsx),
  [patterns](../src/client/sending-scales.ts), [journey](../e2e/sending.spec.ts).
  A learner usability review adds a direct homepage entry, one compact sending
  control bar, a full-width reader and session options below the material.
  Warm-up notation is explained beside the targets; drills show repeated
  `<SK>`, `<AR>` and `<BT>` targets with their meanings instead of symbol aliases.
- **Public access and private accounts:** public practice, email codes, passkeys,
  per-user private storage, account settings, and export are intentional improvements
  over a single-owner site. [Architecture](architecture.md).

## Addressed in this change

These baseline gaps no longer describe the current implementation:

| Capability                      | Implemented behavior                                                                                                                                                                                                                                                                                                                                                           | Remaining boundary                                                                                                                                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playback accounting | Native Play and app Play accrue actual media movement. Pauses, seeks, and buffering do not add idle time; replay counts heard time; the target never caps the session. In-app inspection settles and pauses the same clock without resetting its source subtotals. [Clock](../src/client/practice-clock.ts), [event hook](../src/client/usePracticeClock.ts). | Existing Copy recovery remains separate; restoring unfinished non-copy elapsed time after reload/crash is excluded. Physical locked-iOS behavior still needs a device check. |
| Focused recall | Assigned Start recall physically pauses audio; app, native and Media Session Play stop recall before playback. Every recall settlement rejects hidden, invalid, backward or at least four-second delayed samples, retains prior credit and announces deliberate resume/correction. Review edits recall within total time while retaining raw measurements and per-file listening; the split survives private saves, history, reports and backups. [Clock](../src/client/practice-clock.ts), [journey](../e2e/recall.spec.ts). | Ordinary manual/external practice intentionally continues off-page until paused; in-app inspection pauses its owner. Actual background audio remains media-derived. No reload/crash elapsed-time recovery or physical-device verification is claimed. Issue #8 validation and independent review are recorded below. |
| Scratchpad                           | Notes can be written during practice, explicitly saved at zero time, edited when saving, and read in history for native and imported records. In-app inspection retains the current notes; unrelated historical edits cannot clear the current block. [Save/history UI](../src/client/main.tsx).                                                                                                                                                                                                                                                                   | Listening notes persist locally by account and tool/assignment. Elapsed-time recovery after reload/crash is excluded; the advisor-report learned-word workflow remains separate.                                                                                                                                                                                                             |
| Generated listening source summaries | Native accepted playback captures word/list/count, QSO scenario/stations, or free mode together with applied speed, pitch, spacing and relevant shuffle/repeat/answer settings. Up to 15 distinct configurations plus explicit overflow survive review, exact retries, history, reports and account backups. Mixed or overflowed evidence supplies no single session WPM pair. [Model](../src/shared/generated-listening.ts), [journey](../e2e/generated-listening.spec.ts). | Validated custom words and selection are retained privately by account/Guest device scope in #29, including explicit device backups; free scripts remain with the active owner. Equal custom label/count/settings deliberately share a descriptive identity. Live retiming is delivered in #26; authored Stories with independent device settings are implemented in #30, with review/deployment tracked below. Public exact recipes remain #45. Independent review accepted the mobile review-focus correction; signed publication and production verification are recorded in the #7 ledger. |
| Official recording speeds | Verified native-speed files, shared Assigned/Next default and private device-local exact choices per stable task are supported. New launches prefer a valid scoped override; the player and Today/Plan distinguish future preference from prescribed/current WPM. Actual mixed-file evidence remains native 1x. [Selector](../src/client/RecordingSpeedSelect.tsx), [scoped choices](../src/client/task-recording-choice.ts). | Reset/default changes leave current playback intact. Invalid choices fall back visibly, with fenced cleanup/retry; choices join private device backup/restore/clear, independently of shared defaults. #11 independently accepted validation and production evidence are recorded below. Issue #12 adds exact-file difficult marks and Replay 8 sec; advisor aggregation remains later work. |
| Assigned listening guidance | Seven verified audio families receive concise mental approaches and optional scratchpad prompts beside native playback. Exact public recording metadata precedes conservative title/instruction matching; unknown audio has an instructor-first fallback. [Guidance](../src/shared/listening-guidance.ts). | Original instructions, speed/pass policy, time, completion and private saved evidence retain their existing owners. No proficiency or learned-word inference. #13 independently accepted and deployed; evidence and limits are recorded below. |
| Recording coverage and passes | Native 1x movement supplies recording-local coverage and once-only completed passes. Overlap unions, file ownership and measured duration groups remain separate from heard time. Prior saved/current/remaining counts appear in Today, Plan and Studio; per-file facts survive review, history, reports and account/device backups. [Coverage](../src/client/recording-coverage.ts), [progress](../src/shared/plan.ts), [journey](../e2e/listening-passes.spec.ts). | Partial coverage stays in memory during in-app inspection; unfinished elapsed/coverage reload recovery is excluded. Old records remain unmeasured. Explicit imported source counts are labeled separately, and extra review supplies no required-pass credit. Independent validation/review are recorded in the #9 ledger below. |
| Assigned course replay | Device-local automatic replay starts off. Only an observed full pass can continue while owned prior/current passes remain below the assigned minimum. Native 1x, the existing clock and Media Session remain in use. [Policy](../src/client/course-replay.ts), [journey](../e2e/course-replay.spec.ts). | Pause/recall/inspection/source changes cancel pending Play; ended feedback offers deliberate another pass and finish. Generated Repeat is independent. Optional daily loop remains #25. Validation and review are tracked below. |
| Historical data access          | Imported practice exposes scratchpads, ratings, recall, passes, actual recording speeds, and per-run Runner/LCWO/CWT observations. Settings has an authenticated, on-demand reader for original reports, LCWO measurements, materials/revisions, course context, and device report drafts/preferences. [Imported history](../src/client/ImportedHistory.tsx).                  | Original reports and materials are readable snapshots, not native authoring/submission workflows. Device drafts are preserved for reference, not resumed.                                                                                            |
| Native copy lifecycle           | Four public modes preserve exact targets/answers, actual trial speeds, score versions, replay/reveal flags, and separate audio/answer/review time. Account/guest-local drafts restore paused; pending saves retain stable IDs and tabs coordinate ownership. [Clock](../src/client/copy-clock.ts), [storage](../src/client/copy-storage.ts), [API](../src/worker/training.ts). | This recovery applies to CopyTrainer, not all tools. Hidden copy practice pauses; answer/review time idles after 30 seconds. Guest/signed-in desktop/mobile Chromium journeys and accessibility checks pass; physical-device behavior is unverified. |
| Native copy history and reports      | Validated per-attempt evidence appears in history and printable reports, survives export/import, and does not sum scores across rounds. New Code Groups use `native-copy-v2`; older attempts retain `native-copy-v1` scores rather than being regraded. [Results](../src/client/CopyResult.tsx), [report details](../src/shared/copy-report.ts).                                                                                                                                                                              | Code Groups uses LCWO's lower-error comparison choice with deliberate extra-group and full-text handling. Native normalization, corpora, timing and other scoring details still differ from LCWO; exact LCWO parity and advisor-form submission are not claimed.                                                                                                           |
| Published course coverage       | All four published catalogs use official links and factual metadata. Native copy recipes replace supported LCWO launches; source discrepancies are documented. [Coverage and counts](curriculum.md).                                                                                                                                                                           | Beginner/Advanced non-LCWO tools remain linked or use existing workflows. Prototypes are not defaults; automatic progression is absent.                                                                                                              |
| Inspecting and finishing practice    | Today, Week, Report and other in-app views pause and retain one scoped block, with a reachable Return action and no autoplay or automatic save. Explicit Finish/tool or assignment switch uses one guarded save/discard decision; all non-copy/non-Runner timed practice saves at least one measured second; nonempty zero-time scratchpad notes have an explicit Save notes action. Copy drafts, Runner results and immutable pending bodies retain their owners. [Navigation](../src/client/practice-navigation.ts), [Studio](../src/client/PracticeStudio.tsx). | Unfinished elapsed-time reload/crash recovery is excluded. A running Runner stops into an acknowledged partial result rather than resuming the live contest. Queued uploads retain their account scope; guest history stays local until explicitly saved after sign-in. Browser and independent acceptance are tracked in the issue #6 ledger below.                                         |
| Lock-screen information         | Official recordings and generated Morse share Media Session artwork and controls. Official titles include the session and selected recording, with actual WPM in the album; generated tracks name the active word list or QSO scenario. [Media Session](../src/client/media-session.ts).                                                                                       | Browser metadata, PNG availability, and ownership are tested; physical iPhone artwork and locked playback still need device verification.                                                                                                            |
| Native spoken repeats               | Both built-in lists use checked-in generated answer clips. Three Morse plays, speech, and pauses form one native WAV with seeking, pause/resume, looping and media-derived credit. Custom spoken lists require published words. [Listening](../src/client/ListeningTrainer.tsx), [audio provenance](spoken-audio.md), [browser regression](../e2e/spoken-answers.spec.ts).                                                                                                             | Real media decoding/progression and desktop/mobile fit are covered; physical iPhone lock-screen verification remains outstanding. A shuffled round loops its current order; New round reshuffles.                                                                                                                                                    |
| Duration and explicit completion | The universal 15-minute fallback is removed. Elapsed time and an optional goal are separate from an assigned exercise's explicit Complete/Reopen action; completion is available without starting audio or creating a practice entry. Unknown manual-entry durations require actual learner input. [Studio](../src/client/PracticeStudio.tsx), [plan model](../src/shared/plan.ts). | Completion is a learner decision, not proof of a full listening pass or attainment of a proficiency target. Practice credit continues to come from saved actual time. |
| Earlier reminders and session links | Today has no completion checkboxes. Dismissal hides earlier unfinished items only, with restoration in the course plan; dates, completion and recorded practice remain intact. All four courses link to the selected session in the official syllabus. [Today](../src/client/TodayPlan.tsx), [course plan](../src/client/Plan.tsx), [curriculum links](../src/shared/curriculum.ts). | Dismissal is not deletion and does not hide a task rescheduled to today or a future date. The Beginner session 2 HTML bookmark is missing, so its link uses the official PDF's page 11. |
| Extra review purpose | Deliberate review retains its task, raw results and captured purpose through save/retry, history, reports and portable backups. Independent review counts once toward useful daily practice and supplies no required assignment credit; class review stays separate. [Purpose](../src/shared/training.ts), [workflow](../e2e/review-purpose.spec.ts). | Familiar-material recommendation rotation remains separate; issue #16 delivers cumulative Runner time with explicit completion; observed recording passes are delivered below. Independent acceptance and production evidence are tracked in the issue #5 ledger below. |

## Accepted September 30 delivery ledger

Issue #1 introduces versioned non-copy Runner and timer/recording evidence at
save and import boundaries. Review, history and printable reports expose raw
measurements and explicit learner time corrections. Measured time/speeds cannot
be replaced by generic form values; account plan references are validated.
Known recording timing comes from exact catalog URLs. Historical source archives
retain their own accounting instead of being promoted to native measurements.
Old Companion duration edits and deleted-task links also round-trip as explicit
historical accounting/provenance. New version 1 backups declare `evidenceVersion: 1`;
marked native links are strict, while old orphan links retain no assignment credit.
Near-limit raw timed records use `evidenceMode: historical`, preserving their full
metadata without promotion. Final normalized metadata stays within the budget.
Exact saved retries survive task deletion, and reopening Runner review preserves
its run-owned session ID/date/timestamp, preventing duplicate credit after a lost
acknowledgement. Issue #2 implements finished-result offline durability; its
independent review gate is tracked in the execution journal.
[Evidence model](../src/shared/practice-evidence.ts),
[execution and review status](parity/execution-progress-2026-09-30.md).

The accepted issues supersede conflicting older recommendations: no reload/crash
elapsed-time recovery, new spoken-recognition work, real-contact walkthrough/ADIF,
or unrelated public tools. In-app continuity, retained content/preferences,
completed-result queues, report drafts, Stories, exact listening recipes and the
SST/MST/CWT calendar remain required. The ledger records delivered behavior only;
remaining issue workflows are not implied by this evidence foundation.

## Remaining inventory

Each row describes work that is still missing or partial after those fixes. The
linked appendix contains the complete subfeatures and current-app comparison.

| ID / priority                                       | Current gap and concrete next behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **R1 · P1** Recoverable practice beyond native copy       | Issue #6 implements one in-memory owner across in-app inspection, preserving content, preferences, measured time and acknowledged results. Finished Copy, listening, manual and Runner sessions retain durable upload queues; issues #2–#4 cover mutable outboxes, selected-scope device backup and destructive lifecycle fencing. Remaining accepted recovery work includes durable report drafts and private material ordering. Elapsed-time reload/crash recovery is excluded. Issue #6 is independently accepted, published and deployed. | Personal [device state](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/storage.ts#L21); [planning P15–P17](parity/planning.md#instructor-materials-and-records); [current navigation](../src/client/practice-navigation.ts).                                                                                                                |
| **R2 · P1/P2** Daily guidance                       | Offer resume/next eligible exercise; rotate familiar review without assignment credit; show the separate optional ten-minute word-listening suggestion. Earlier reminders now support dismissal and restoration independently of completion. Issue #18 adds private timed meetings, exceptions and Join class; class logs remain separate from independent credit. Issue #19 adds exact-date required/rest goals, a preserved optional personal target, and shared saved/current/combined time from the existing owners. Issue #22 independently delivers retained-work-first guidance and eligible required next actions in production. Issue #23 independently delivers private dated Today pins, original schedule/history preservation, midnight expiry, exact retry and backward-compatible backups. Issue #24 independently delivers bounded familiar-review rotation and discoverable reached Runner/ICR recipes, with explicit review provenance and no required credit. Issue #25 implements a separate optional ten-minute word-listening goal with permitted generated words, actual native word-source subtotals, separate recall, receipt deduplication and deliberate continuation; independent acceptance and production evidence are recorded in its ledger. | Personal [planner](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L270); [planning P03–P11/P38](parity/planning.md#curriculum-and-the-daily-queue). |
| **R3 · P1** Remaining typed results                 | Native copy saves validated attempts. Issue #1 adds validated Runner and timer/recording evidence, immutable measurements, explicit corrections, history/report details and account plan checks. Issue #33 implements optional explicit performance ratings and bounded CWT observations through the common form, private save/edit/retry, history, reports and backups; independently accepted and deployed in production. Issue #34 implements optional source-specific LCWO/manual Runner capture and actual completion timestamps with explicit DST resolution; independently accepted and deployed in production. Imported LCWO history remains readable with source identity and overlap-safe estimated group minutes; Issue #35 adds optional, consented request-only LCWO linking/refresh, privately retained immutable source facts, inactive portable restore, and explicit overlap-safe group estimates; independently accepted after the exact-quota Disconnect correction and deployed in production.                                                                                                                                                                  | Personal [result fields](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/practice-results-form.ts#L3), [LCWO accounting](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/lcwo-practice.ts#L8); [planning P14/P18/P20–P24](parity/planning.md).                                      |
| **R4 · P1** Advisor reports                         | Generic printable reporting remains available. Issues #36–#37 deliver private configurable fields and preparation windows, editable per-session device drafts, protected edits/blanks, immutable account copies, exact retry/conflict feedback, native backups and explicit compatible original-device-draft copies. Issue #38 adds explicit source mappings, single eligible Runner points, actual played catalog file/speed pairs, whole latest LCWO/manual observations, matching character/effective-speed group errors and compatible native Copy fields. Frozen suggestions, source IDs/facts and warnings remain private and portable; refresh protects edits and blanks. Extra review is reportable without required credit. Independent review and deployment of #38 remain pending; exact handoff/submission (#39) and confirmed learned words (#40) follow. Saved imported report snapshots are readable with original answers/evidence in Settings. New report authoring must use actual individual verified Runner results and practiced recording speeds; do not sum scores or infer learned words from exposure.                                          | Personal [report derivation](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L196), [handoff](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report-panel.ts#L282); [planning P27–P31](parity/planning.md#reports-and-evidence).                                         |
| **R5 · P1** Sending trainer                         | The native scales reader, prescribed sections, PDF reference and timer are present, but capture is absent. Port optional adapter setup/test, keyed MIDI or focus-scoped keyboard input, raw edge timing, cautious decode/target comparison, actual-timing replay, keep/discard takes, and local retention. Keep ordinary key practice available without capture.                                                                                                                                                                                                         | Personal [active panel](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-panel.ts#L68); [sending subsystem](parity/listening.md#sending-practice--large-missing-subsystem-p1).                                                                                                                                                        |
| **R6 · P1/P2** Listening content and continuity     | Add the three authored stories as a real third mode. Issue #26 delivers live word-prefix retiming and exact QSO occurrence with playing/paused state, native rate, source accounting and volume continuity; its ledger records validation and platform limits. Issue #27 delivers state-preserving word/item/relative seeks and explicit replay for Words/QSO/Free. Issue #28 prepares fresh validated Morse-only word rounds on native end, defers Shuffle and retains current playback through Repeat changes. It is independently accepted and deployed; the #28 ledger records keyboard/native-volume corrections and platform limits. Issue #29 delivers editable built-in copies, validated private custom sources, retained selection, scoped clear/retry and reviewed device backups. It is independently accepted and deployed; the #29 ledger records validation, recovery and platform limits. Issue #30 independently delivers authored Stories in production. Issue #31 implements precise independent sound settings; its review/deployment gate is tracked below. Issue #7 now retains bounded actual played configurations; selected-but-unplayed preferences supply no source evidence.                                                                                                                                                                                                                                        | Personal [stories](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/data/cw-listening/stories.ts#L6), [retiming](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-panel.ts#L120); [listening inventory](parity/listening.md#generated-contacts-stories-and-listening-lifecycle).                 |
| **R7 · Implemented; device check pending** Spoken answers | The September 30 follow-up explicitly adds prerecorded native spoken rounds and credits actual playback through the shared media clock. Runtime browser speech is removed. Physical iPhone locked playback remains unverified; compact prebuilt MP3 optimization remains absent.                                                                                                                                                                                                                                                                                                   | [Implementation](../src/client/morse-track.ts), [asset loader](../src/client/word-speech.ts), [verification](testing.md).                                                                                                                                                                                                                                                                             |
| **R8 · P2** Course-audio progress                   | Issue #9 delivers actual coverage and whole passes without seek credit, distinct saved/current/remaining counts, and portable per-file evidence. Task-specific choices are independently accepted in #11; Issue #12 adds bounded private difficult timestamps and relative Replay 8 sec with deliberate native playback; optional daily listening remains #25. Course replay is delivered in #10.                                                                                                                                                                                                                                               | Personal [audio session](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/audio-session.ts#L41); [audio appendix](parity/audio.md#findings-by-behavior).                                                                                                                                                                                      |
| **R9 · P1/P2** Runner continuity                          | Issue #15 retains acknowledged terminal results on the device before review, with stable run ID, accepted-start timezone/date, terminal creation time and distinct frozen review timestamp. Mixed-speed results omit generic WPM and expose recorded engine speed segments and bounded-history omissions. Logbook recovery, canceled review edits, exact retry and optional device backup inventory reuse the shared save/account/device boundaries. Issue #16 adds shared saved/current/combined/remaining time and an explicit completion policy, independently accepted and deployed. Issue #17 adds receipt-gated Save & next, retained settings/context and a fresh paused owner, including recovered Logbook continuation; no running-clock reload/crash estimate or live-engine resumption. | Personal [Runner transitions](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/runner-session.ts#L48); [Runner workflow](parity/listening.md#surrounding-workflow--partial).                                                                                                                                                                  |
| **R10 · P1/P2** Instructor material                 | Add private session-linked text/link/file material, preparation/class/reference classification, original-plus-revision history, and readable practice context. Imported materials and their revision links are readable in Settings; native material authoring and practice integration remain absent. Current custom activities cover only notes/link/date/session.                                                                                                                                                                           | Personal [materials](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L757); [planning P12](parity/planning.md#instructor-materials-and-records).                                                                                                                                                                                   |
| **R11 · P1/P2** Live practice and reminders         | Public SST/MST/CWT agenda, Local/UTC preference and recurring feed are independently accepted and deployed in #20 with current organizer verification. Assigned typed live eligibility and retained manual work are independently accepted and deployed in #21; private reminder subscriptions remain #46. Public schedule does not infer participation or query private data.                                                                                                                                                                                                                                           | Personal [live-task planning](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L135), [private calendar](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L625); [planning P06/P25/P26](parity/planning.md).                                                                |
| **R12 · P2** Exact public listening recipes                  | Bounded, versioned public listening recipes that reproduce the exact exercise remain accepted issue #45. Real-contact operating guidance, contact logs, ADIF export and unrelated public practice tools are excluded from this execution.                                                                                                                                                                                                                                        | Personal [real QSO helper](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-qso.ts#L137), [share recipes](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/session.ts#L115); [public-tool inventory](parity/listening.md#standalone-public-tools-distinct-features-not-duplicate-page-names). |
| **R13 · P1/P2** Migration fidelity                  | Historical imports now expose original scratchpads and structured results, map LCWO group speed correctly, omit pure dismissal bookkeeping, derive Runner completion, and add overlap-safe one-minute LCWO group estimates. A timezone-aware cutoff limits practice/completion while retaining the full source archive. Settings makes reports, LCWO, materials and device drafts readable. Native report/material editing and recoverable device work remain separate migrations; readable preserved records are not complete feature parity. | Tracker baseline [converter](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L502), [completion import](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L425); [planning P33–P36](parity/planning.md#backups-migrations-and-api-fidelity).                      |
| **R14 · P2/P3** Preference refinements              | Issue #31 implements independent Words/QSO/Stories setups with both speeds, exact/preset entry through 60 WPM, 1 Hz pitch and 0.1-second pauses, local drag preview and explicit storage retry. Independent review accepted the implementation; production delivery and limits are recorded in its ledger. Issue #32 delivers a shared distinct bounded QSO pair with actual native audio, stable station cues and historical-fact compatibility. Independent review accepted it; production validation and limits are in its ledger.                                                                                                                                                                                                                                                                          | Personal [speed control](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/speed-control.ts#L1); [word inventory](parity/listening.md#generated-word-practice), [known source omission](parity/listening.md#documentation-reconciliation).                                                                                                    |

## Coherent next work

1. **Protect and expose work already done:** R1 plus a shared result-details view,
   the remaining native workflows from R13, and actual-settings attribution. Validate one
   in-app navigation/return, one offline retry without duplication, and one
   export/import round trip before extending the UI.
2. **Finish the daily lesson path:** R2, R8, R9, and assigned CWT availability from
   R11. Keep “minutes practiced,” “passes heard,” and “exercise complete” distinct.
   Exercise one ordinary day and one day with earlier work and partial practice.
3. **Make reporting useful:** finish the other typed results in R3 and the
   advisor workflow in R4. Generalize the advisor mapping and use native copy
   evidence alongside preserved history. Test source selection, missing/zero values,
   deliberate edits, and exact submitted snapshots.
4. **Complete training tools:** R5–R6 and private material support from R10. R7 native spoken playback was added by the subsequent explicit request; physical-device verification remains pending.
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
  restricted curriculum paragraphs, recordings, and instructor text stay at
  their sources or in the learner's private data. The scales reader displays
  mechanical practice patterns with original guidance; Bob Carter’s full
  instructions and original reference remain linked at the source.
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

## Accepted issue #2 delivery ledger

Manual and terminal Runner review now share the stable-ID copy/listening result
queue. A readable durable device receipt can release review; failed, expired-auth
and uncertain uploads remain visible and retry the original payload. Guest work
stays local until the learner explicitly selects a result for account saving.

One account data owner now projects profile and plan semantic edits across Today,
the course plan and practice completion. Bounded cached confirmed state and
per-operation device records support offline reopening. Editors retain their
original baseline and revision; atomic Worker compare-and-swap and exact operation
receipts reject stale writes without duplicate effects. Conflicts show the online
value and local intent, with deliberate keep-online or reapply choices. Queued
result ownership is checked against the current authenticated account at the
Worker; account switching hides other scopes and fences late acknowledgements.
A delayed result whose previously owned task was removed retains historical
placement and raw evidence; it cannot grant current assignment credit.

Evidence: [shared protocol](../src/shared/account-sync.ts),
[Worker revisions](../src/worker/account-sync.ts),
[account outbox](../src/client/account-outbox.ts),
[result queue](../src/client/practice-autosave.ts), and
[offline workflow](../e2e/offline-sync.spec.ts). Fast checks and independent review
status are recorded in [execution progress](parity/execution-progress-2026-09-30.md).
Offline usability requires the app shell to load; this issue caches account data,
not a service worker or an actively running timer. Device backup/clear and full
reset/replacement generation enforcement remain the separate #3/#4 workflows.
Browser mobile/touch emulation does not establish physical-device behavior.

Review corrections also cover failed essential selection writes separately from
optional snapshot-cache failure. The previous offline selection is invalidated;
a scoped storage notice explains recovery, and queued work remains retained.
Preference fields pause editing during their short durable receipt window, then
allow new drafts while old uploads finish. Merge imports preserve removed owned
links, and linked-result placement is guarded atomically against course changes.

## Accepted issue #3 delivery ledger

“This device” is reachable to guests and account users. It identifies the selected
scope and separates device-retained work from confirmed account backup. Version 1
device files contain finished results with exact original retry bodies and
origins/statuses, queued semantic account edits with original operation order,
optional offline account context, retained copy drafts and four mode preferences,
and scoped scratchpads including memory-only notes. Shared practice defaults and
recording-speed preferences appear in a separate section and restore only by
explicit choice. Authentication, active account selection, leases and lifecycle
fences are excluded.

Restore uses the scope displayed in the dialog. A disconnected Guest reopen can
restore Guest work without changing a retained account selection; private restore
still requires the exact selected account. File enums require their actual string
types, including nested immutable operations and source evidence.

Whole-file validation enforces a 16 MiB UTF-8 bound, store/item/count limits and
exact guest/account scope before mutation. Repeated restore preserves immutable
identities without duplicate work. Changed bodies or origins under the same ID
are explicit conflicts; replacing a different copy draft requires a reviewed
choice. Current colliding scratchpads and newer retained retry failures remain
intact. Unknown historical result generations stay unknown, including finished
copy saves retained only in their draft.

Local clear offers a recoverable device download and affects only the selected
scope. It stops affected practice and real uploads, preserves other scopes/shared
defaults/confirmed server history, and fences stale mounted writers, delayed
receipts, acknowledgements and copy cleanup across tabs. Staged local writes
require readback; failed updates roll back original work. Failed rollback leaves
uploads paused with recovery download and retry, including deliberate recovery of
an interrupted update after reopening. The UI identifies retained request IDs
whose server outcome may be uncertain; local clear cannot erase an already
committed server write. Reset/replacement dataset invalidation remains issue #4.

Internal rollback preserves current memory-only notes and volatile failure/conflict
states even when damaged retained work prevents a complete portable export. Ready
observers retain those newly rebound states, so failed clear does not silently
retry a permanent rejection. Actual mutations retire the revoked Copy lease,
allowing the restored owner to resume; unchanged restore retains its current owner.
The shared modal selects visible, enabled, tabbable controls and keeps keyboard
focus inside the dialog, including forward/reverse wrap and explicit initial focus.
Dialogs also sit above global notifications so transient notices cannot obscure
or intercept required file, backup, save and cancellation controls.

Evidence: [device inventory and strict restore](../src/client/device-backup.ts),
[scope ownership fence](../src/client/device-scope.ts),
[device controls](../src/client/DeviceData.tsx),
[synthetic download/restore/clear workflow](../e2e/device-data.spec.ts).
Validation and independent gate status belong in
[execution progress](parity/execution-progress-2026-09-30.md).
The app shell must load; no service-worker shell, new active non-copy elapsed
reload/crash recovery or physical-device verification is claimed. Later native
report drafts, lists and sending takes must extend the explicit device inventory
and its coverage test as their issues land.

## Accepted issue #4 delivery ledger

Reset and replacement import share one scoped client coordinator and a frozen
request identity. The review names the account and affected work, offers actual
server and complete device files, and requires a choice to keep recovery files or
discard old waiting work. Success retires only that account's old active device
results, edits, Copy drafts and notes; shared defaults and other scopes remain.
Recovery files preserve their original bodies, origins and evidence rather than
granting authority to upload old work into a new dataset.

The Worker applies the whole destructive transaction behind the original semantic
revision, history revision and dataset generation, advances the semantic revision
and generation once, and records its terminal outcome. Ordinary entry mutations
advance a separate history counter without creating semantic outbox conflicts.
Server recovery files and their runtime authority come from one coherent database
snapshot; Keep freezes that downloaded authority. Later entry creates, edits or
deletions refuse the destructive transaction rather than erase work missing from
the file. Safe cancellation and newer observed authority require a fresh download.
Portable files still carry no runtime authority.
Exact retries return that receipt without executing deletion again. Entry create,
edit, delete, linked-result placement, semantic account operations and merge
imports keep their original generation at actual SQL execution. Coherent history
reads include account/generation/revision; the client fences old responses and
mounted producers before publishing an observed new dataset.

Before admission, a compact pending receipt reserves one of eight 512-byte
control slots. An admitted request can be canceled even at the 6 MiB payload
quota. Terminal cancellation records move into ordinary quota when space allows,
preserving their identity/outcome while freeing control slots. All actual bytes
remain accounted. If both budgets are full, a new destructive request is refused
before data mutation; freeing ordinary storage permits admission again.

Lost responses keep a durable, compact account identity and pause its work. The
persistent controls can check the outcome, retry the same request, stop it safely,
or download device recovery. A reopened replacement asks for the matching file
instead of storing a second large private import. Applied-but-unfinished device
cleanup retries locally; it never replays the destructive server operation.
Authoritative cancellation restores exact pending work and volatile retry state.
If another device advanced the dataset, cancellation instead retires the old
work and identifies the changed server log. Only account lifecycle completion
refreshes server history; local device clear retains its local-only behavior.
Remote boundaries require a recovery download or explicit local discard before
using the changed log. Local-only device restore/clear cannot bypass a pending
server boundary.

Evidence: [lifecycle protocol](../src/shared/account-lifecycle.ts),
[Worker authority](../src/worker/account-lifecycle.ts),
[client coordinator](../src/client/account-lifecycle.ts),
[review and recovery controls](../src/client/AccountLifecyclePanel.tsx), and
[synthetic browser journeys](../e2e/account-lifecycle.spec.ts).
Validation and the independent review gate are recorded in
[execution progress](parity/execution-progress-2026-09-30.md).
Local validation passes 463 fast checks and 47 serialized browser journeys.
The first independent review required corrections to mobile pending/error layout
and recovery downloads that could omit newer server-only work. Both corrections
passed complete local validation and independent recheck: 16 new browser probes,
seven committed lifecycle journeys, 105 client/shared tests, 42 Worker tests and
fresh production-migration SQL probes. The reviewer inspected 28 desktop/mobile
captures and accepted the complete workflow with no remaining substantive finding.
Signed publication and production migration/deployment are complete; their commit
references and verification are recorded in the execution journal.
It does not add active elapsed-time recovery or physical-device verification.

## Issue #5 delivery ledger — extra review purpose

Today and the full plan provide deliberate Extra review for incomplete and
completed exercises, including older completed work through Whole course and
Show completed. The launch captures assigned/review purpose with its originating
task. Timer, manual Studio, Copy and Runner results use the same attribution
serializer; source measurements and immutable queued bodies keep that purpose.
Explicit Complete/Reopen remains a separate learner decision.

Saved native purpose is strictly validated in metadata. Missing purpose remains
ordinary work, while original imported `review:true` stays review and retains its
owned task link. Malformed or contradictory flags reject. The shared required
practice rule excludes review before direct or catalog-alias task matching, while
useful daily totals and reports include it once. History, save review and report
evidence identify Extra review. Generic note edits retain purpose; Worker edits
cannot remove or change it. Review follows the same owned/retired task checks,
generation fences, persistence and portable export/import as ordinary practice.
The save/edit explanation follows the selected class/practice placement; class
review stays outside daily practice totals. An immutable retry describes the
captured saved placement.

A restored Copy round retains its captured task, recipe and purpose even when
the requested launch has the same task with another purpose. Its actual context
and the requested next context are readable separately. A deliberate new round
adopts the requested attribution and, when changing exercise, its recipe; public
missed-character practice detaches task and purpose together. Old pending bodies
remain unchanged rather than receiving a new default field.

Evidence: [purpose validation](../src/shared/training.ts),
[attribution](../src/shared/practice-attribution.ts),
[required accounting and report selection](../src/shared/plan.ts),
[captured Copy context](../src/client/copy-storage.ts),
[Runner result](../src/client/runner-session.ts), and
[student workflow](../e2e/review-purpose.spec.ts).
Typecheck, 496 tests across 37 files, production build and all 49 serialized
browser journeys passed before the implementation commit. The independent
post-commit review passed five student workflows and 202 focused checks, and
required a correction to the class-placement explanation. Correction typecheck,
all 496 tests, production build and all 49 serialized browser journeys pass.
The independent reviewer accepted the correction after four fresh desktop/mobile
workflows, including class save/edit and exact retry with storage unavailable;
30 captures were inspected across review and recheck. Signed commits `7f73db09`
and `a608fd37` preserve the reviewed trees. Production deployment and root/health,
anonymous privacy and asset-hash checks pass; issue #5 is closed. Details are in
[execution progress](parity/execution-progress-2026-09-30.md).
This does not implement the separate review recommendation rotation, recording
pass coverage or cumulative Runner completion issues.

## Issue #6 delivery ledger — current block across in-app views

One mounted Studio now owns the current block independently of the selected
view. Inspect Today, this week or Report, and Return to practice, preserve its
captured task/purpose, identity, measured/source subtotals, scratchpad, selected
recording/position and exact generated content. Inspection settles and pauses
the existing producer without saving, resetting or replacing it. Return reveals
that same owner with playback and timers paused. Retained controls are hidden
and inert while another view is open.

A running Runner receives its existing Stop command before the inspected view
opens; its acknowledged terminal result, settings, raw metrics and run identity
remain available for review. The existing bounded interrupted fallback retains
the last acknowledged time if the engine cannot confirm stopping. Copy keeps its
draft, answer, position, lease and immutable pending result. Completed-result
uploads may continue, but hidden acknowledgements and audio/speech continuations
cannot focus the old input, start another target or resume hidden playback.

Explicit Finish, assignment replacement and public tool switches use one guarded
pause/end decision. Listening/public timed practice retains its automatic save
threshold of 30 credited seconds for those deliberate transitions; Review & save
includes shorter practice. Assigned manual practice and unsaved Runner results
keep the explicit save/discard flow. Canceling retains the paused owner. Saved
review receipts match their originating launch/session rather than a global
history counter, so an unrelated historical edit cannot reset current work.
Scratchpad cleanup also requires that captured owner: a separate manual log for
the same assignment cannot erase its paused notes. Manual Finish discards unsaved
elapsed time and explicitly explains that the scoped scratchpad stays on device.
Copy and Runner acknowledgements remain with their child result owner and cannot
clear another tool's scratchpad. A same-account reconnect refresh keeps the
mounted block; actual account selection invalidates obsolete identity reads.
Deferred view focus yields when the learner has already focused another control.

The existing account/device boundary disposes the owner on identity or lifecycle
change and fences late asynchronous view changes. This is in-memory continuity
inside the running app. It adds no elapsed-time reload/crash recovery, portable
unfinished elapsed draft, database entity or playback engine. Existing completed
result queues, evidence validation and account isolation remain authoritative.
Actual played-settings history, pass coverage, cumulative Runner completion and
advisor draft/submission workflows remain their separate accepted issues.

Evidence: [original view boundary](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L506),
[current view coordinator](../src/client/practice-navigation.ts),
[mounted host](../src/client/main.tsx),
[Studio](../src/client/PracticeStudio.tsx),
[generated listening](../src/client/ListeningTrainer.tsx), and
[player transport guard](../src/client/morse-player.ts).
Typecheck, all 512 tests across 40 files, production build and all 54 serialized
browser journeys pass. Focused checks include actual native audio/Runner,
desktop keyboard/mobile emulated touch, cancellation, reconnect, exact retries,
accessibility and overflow. Initial independent review found two ownership/copy
boundaries: ownerless same-assignment logging erased retained notes, and manual
Finish promised to discard notes that remain locally. Focused corrections are
validated at both widths and independently accepted in 18 distinct cases (17 plus
one reviewer-only selector recheck). Signed commits are published, production is
verified and #6 is closed; exact outcomes belong in
[execution progress](parity/execution-progress-2026-09-30.md).
No physical-device verification is claimed.

## Issue #7 delivery ledger — actually played generated listening

The original bounded played-configuration model is implemented inside version 1
timed evidence. Native accepted playback records a frozen track configuration;
opening, preparing, failed playback and selected-but-unplayed controls do not
append a source. Word rounds retain their actual list/count/shuffle identity.
QSO summaries retain actual station calls and the two rendered tones; retiming,
review and replay keep the exact contact and its Copy answers in memory.

The Studio owns one collector beside its existing clock/save coordinator. In-app
inspection retains it; ending/resetting its block clears it. Snapshots and pending
saves preserve the first captured body. Up to 15 distinct configurations are kept,
with visible overflow thereafter. One WPM pair is derived only from complete,
uniform actual source evidence. Review inputs cannot relabel mixed playback.
Generated review opens with focus on its heading so the played evidence remains
visible; its keyboard trap still provides access to Save and cancellation.
Worker validation rejects unsupported/private script/text fields, invalid source
identities/counts and oversized summaries. Existing account isolation, owned-task
validation, immutable raw facts, corrections and portable v1 backups apply.

Custom labels/count/settings are descriptive: equal configurations deduplicate
without sending custom words or hashes. No per-configuration time, proficiency,
on-air contact credit, public sharing or crash/reload elapsed recovery is added.
No Worker binding/configuration/schema change was needed. Check, all 583 tests in
43 files, build and all 56 browser journeys pass. Independent review accepted
the focused mobile review correction after four fresh rechecks and a viewport
capture check. Signed commits are published, production is verified and #7 is
closed; exact evidence belongs in the execution journal. No physical-device
verification is claimed.

## Issue #8 delivery ledger — guarded recall and correction

Implementation is independently accepted, published and deployed; #8 is closed.
The shared clock settles each observed recall interval at every boundary and
retains finite prior credit when hidden, invalid, backward or delayed at least
four seconds. Direct recall pauses actual assigned audio; Play requests settle
recall before buffering, failure or real media-derived listening. Owner-local
interruption feedback survives inspection and canceled review until deliberate
resume/reset. The existing correction envelope keeps raw measurements immutable
and corrected recall inside corrected total, including retained recording time.
Ordinary manual/external timing intentionally continues away from this page,
with explicit instructions; in-app inspection pauses the block. This issue adds
no schema, binding, reload/crash elapsed restoration or speech-recognition work.
Recall and Resume listening controls sit beside the assigned player at both
widths. New and historical recording review starts at its heading/raw evidence,
with keyboard access to Save and cancellation. Successful native playback clears
earlier playback errors; canceled requests cannot erase a newer recall mode.

Check, all 624 tests in 43 files and build pass. The complete serialized browser
suite passes all 58 journeys in 7.6 minutes. After the final control placement,
nine affected recall/correction/Today journeys pass in 52.6 seconds, including
desktop keyboard and emulated mobile touch, invalid correction, exact new-save
retry, historical retry, actual backup download/import and report output. Root
inspected initial review, interruption, correction and report captures; no
physical device or reload/crash elapsed behavior is claimed.

Fresh independent review passes eleven workflow probes, 200 focused tests and
23 accessibility/geometry states, with 24 images inspected and no substantive
finding. Signed publication matches the accepted tree; production health, private
endpoint rejection and asset hashes are verified. Exact references and review
evidence belong in the [execution journal](parity/execution-progress-2026-09-30.md).

## Issue #9 delivery ledger — observed recording passes

Implementation and review corrections pass required checks and the full browser
suite. The independent gate accepted the final corrections, and production is
deployed and verified. GitHub publication is deferred under the learner’s latest
no-push instruction; the issue remains open. Original interval
union, terminal completion, per-recording results and required/prior-pass
projections were rechecked at the pinned source. Deliberate course replay is tracked separately in the #10 ledger.

One recording owner retains exact heard intervals through pause, buffering, recall
and in-app inspection. Accepted native 1x movement supplies coverage; seeks, idle
time and loading supply none. Overlap counts once toward coverage and replay adds
only actual heard seconds. Every terminal outcome finalizes once. A new pass,
source identity, actual duration or selected file starts fresh partial coverage,
while completed per-URL duration facts and heard time remain. Retired elements and
late transport requests cannot contribute to a replacement owner.

Completion requires positive finite duration up to 24 hours and at least
`duration - min(1 second, 5% of duration)` actual union coverage. Internal gaps are
rejected except a known native suspension/resume position discontinuity bounded
by `min(0.25 second, 5% of duration)`. The 0.25-second bound is one observation
interval. Such gaps add no seconds or coverage, and the
combined missing amount must remain inside the same completion budget. Explicit
seeking invalidates suspension continuity even while paused. This handles native
pause-position lag without turning deliberate skipped material into a pass.

Native position can also settle on the first observation after that known resume.
Only the plausible tail of otherwise accepted movement supplies coverage; its
uncertain head shares the original boundary limit and combined missing budget.
The allowance is consumed by that first observation and cannot widen later or
ordinary movement. No missing material adds coverage or time. Matching paused
owner errors explicitly revoke the retained boundary before another Play.
Native movement without a delivered seek event is judged only by observed
positions, actual time and the same bounded missing allowance; this is not a
universal detector of silent seeks.

Optional version 1 `native-1x` pass facts retain 1–100 distinct observed duration
groups per actual URL, with safe nonnegative integer counts and counts bounded by
that file's actual heard seconds. Older omission means unmeasured; measured zero
is explicit. No arbitrary 100-pass cap is imposed. Raw facts stay immutable during
time correction, historical edits and exact queue retries; snapshots deep-clone
nested duration facts. Existing strict Worker validation, private plan ownership,
transactional backup and device lifecycle paths carry the same model.

Independent review found that absolute millisecond padding accepted tiny-duration
pass claims without actual listening. Per-file floors and pass-bearing raw or
corrected aggregate listening now use relative numerical bounds with a positive
time budget. Operand-aware aggregate tolerance preserves small real listening
beside long recall. Old valid omitted/zero-pass evidence keeps its original raw
comparison and the original corrected addition order, including floating-point
boundary records, rather than being promoted to observed completed-pass facts.

Saved task progress deduplicates owned entries and excludes class, extra review,
future dates, retired task links and the active block identity. Exact task identity
precedes conservative original aliases. Native counts require the assigned exact
URL or its verified official variant group; unknown links require exact matching.
Explicit original imported pass counts remain labeled source observations, never
inferred from seconds or promoted from archived records. Completion/reopening
remains a separate learner action and creates no time or pass evidence.

No database entity, schema, configuration or binding change is required. No
restricted course recording, personal import, automatic replay, elapsed recovery
after reload/crash or physical-device verification is introduced. Final validation
and the independent review gate are recorded in
[execution progress](parity/execution-progress-2026-09-30.md).


## Issue #10 delivery ledger — deliberate assigned recording replay

Rechecked issue body and pinned `daily-listening.ts:17–18,51–52`, original
`client.ts:1705–1752` and the replay checkbox. Course replay initially pauses
between passes; the public device choice stores a boolean without account,
task or recording identity. The existing optional v1 device backup captures,
strictly validates and restores it only by opt-in. Scoped private clear retains
shared choices, and old backups lacking the choice remain compatible. A failed
write leaves the present choice usable with an honest retry notice.

The existing clock finalizes native coverage before the ended callback. A
once-consumed terminal outcome and imperative actual pass snapshot determine
continuation; neither selected duration nor the render's lagging count decides
it. Only a completed observed pass in required practice with unmet minimum can
repeat. Native Play at ended starts at the beginning, at 1x, without native loop
suppressing ended. The existing paused Media Session owner retains its Pause
and Stop actions through pending continuation; actual playing reclaims normally. Previously saved owned counts apply. Skipped/incomplete or
unmeasured passes stop with retained time and explanation. Extra review and
passes beyond the minimum require deliberate Play. Completion stays explicit.

The existing recording request counter, element identity and navigation/device
gates fence pending continuations. Pending Play has reachable Pause practice;
Pause, recall, inspection, reset, source change and Media Session Pause/Stop
cancel it. Obsolete resolutions physically pause retired audio and cannot erase
new recall or a newer valid same-element playback request. Queued old pause
events cannot publish paused state after native playback resumes. Turning the
choice off cancels pending automatic continuation while an already playing pass
continues. Failed automatic Play keeps actual facts and offers explicit Play,
recall or finish. Ended feedback supplies reachable another-pass/finish actions.

Generated Repeat list remains independent; the future optional daily-listening
loop is not introduced here. Suggested time cannot truncate ongoing native
listening. No backend entity, schema, binding, restricted audio redistribution,
spoken-recognition work or unfinished elapsed recovery is added. Check, all 800
tests in 45 files, build and all 63 serialized browser journeys pass at the final
combined candidate. Original post-commit independent replay review passes; the
final combined desktop/mobile keyboard/touch recheck also accepts the preserved
session-attribution change and focused corrections, with no substantive finding.
Actual device backup restore, precise saved source/pass facts and exact durable
save retry are verified. Physical-device/lock-screen behavior remains unverified.

Implementation is local `313fca74`; focused corrections are `60e60480` (#6),
`e605a833` (#7 tests) and `d97e8c26` (#9 tests). The independently accepted combined
tree is `5acc0bb2252cfe33c9ce06dc3cfb96fa5a31295e`. Production version
`ca935f6a-2302-4575-85d2-245aeb8108ba` passes homepage/health, unauthenticated
private-endpoint rejection and exact built/public-bootstrap hash checks. The
latest instruction prohibits pushes: local acceptance/deployment is complete,
and #10 stays open pending publication rather than claiming GitHub delivery.


### Issue #6 follow-up — embedded Runner startup focus

Combined #10 regression verification exposed unsolicited upstream startup focus
into the embedded Runner Call field. The retained trace shows the outer tool
button visible before dispatch, followed by a parent scroll to the iframe during
initialization; one immediate Word listening click was consumed. An independent
reviewer confirmed this as a P2 usability finding rather than a selector failure.

The local bootstrap suppresses instance focus only during synchronous initial
setup and restores it in `finally`. Upstream and generated runtime files, bridge
ownership, engine timing and deliberate Run/exchange focus remain unchanged.
Held-bootstrap desktop/mobile checks preserve the focused outer control and
parent scroll. Actual Run still focuses Call, and mobile tool switching works.
The final 63-journey combined regression passes. Independent post-commit held
bootstrap and actual-engine desktop/mobile keyboard/touch checks accept the
correction. Production serves the verified bootstrap hash; evidence and local
publication limits are recorded in
[execution progress](parity/execution-progress-2026-09-30.md).


## Issue #11 delivery ledger — scoped official recording choices

Rechecked live #11 (open, no comments, no native dependencies) and pinned original
`storage.ts:68`, exact selection in `audio-variants.ts:15–41`, and active/inactive
choice changes in `client.ts:2236–2283`. A public Assigned/Next default remains
separate from private device/task overrides. Each explicit choice captures a
stable task ID, original assigned exact URL/prescribed WPM and selected exact URL.
Only current verified same-group, prescribed-or-faster files or explicit known
replacements are accepted; highest Next never wraps. Changed assignment context,
unknown/wrong-group/below-assigned/malformed/removed choices supply no override.
The next launch uses the current safe default with visible fallback and fenced
cleanup, including retry if the browser refuses removal.

The Studio keeps actual source ownership: explicit file switching uses its
existing settle/pause/discard-partial boundary, starts the new file paused at zero
and retains cumulative heard time, completed passes and scratchpad. Preference
writes or failures cannot manufacture heard facts. Default changes and Use
recording default next time leave current media intact; Remember current recording
allows an explicit same-file override. Failed save/reset/default writes check
readback and offer accurately named retry. Today/Plan preview the next remembered
choice with prescribed WPM and direct students to the exercise to change/reset it.
Same-view mobile navigation now dismisses its drawer, keeping task controls
reachable without replacing an active block.

Choices are bounded to 1,000 exact task keys per account/Guest scope, fenced by
existing device tokens, and included in optional private v1 device inventory.
Strict whole-file validation, unique task IDs/current catalog, account isolation,
transactional restore/rollback and exact registered clear reuse existing device
workflow. Current choice collisions win with a visible preview count; missing
choices restore. Old v1 files omitting the store retain current choices. Shared
Assigned/Next restoration still requires opt-in. Account lifecycle retirement
includes this store. No Worker entity, schema, binding or elapsed recovery is added.
Saved raw source/WPM/time/passes and reports continue to describe actually played
files rather than current preferences; prior history is not relabeled.

Focused synthetic native desktop/mobile keyboard/touch journeys verify exact
reopen, independent tasks sharing one resource, default/reset/highest behavior,
failed preference writes and clear retry, actual played files plus an unplayed
selection, cancel review/exact failed-save retry, actual download/chooser restore,
scoped clear/collisions/old-v1, stale catalog fallback and same-browser A/B/Guest
isolation. Guest scope is arranged as synthetic local preference data and exercised
through public tools/device backup, without exposing private assignment planning.
Physical-device/OS lock-screen and restricted long-course recordings are not
verified. Check, all 829 tests/46 files and build pass; the complete serialized browser
regression passes all 65 journeys in 11.6 minutes. Implementation `18f867ec`
and separate drawer correction `d2aac559` are independently accepted. The reviewer
passes 167 focused checks and own 1366-keyboard/375-touch student journeys,
including actual source/pass history/report and storage/network retries, with
four empty Axe reports and inspected screenshots. No substantive finding remains.
Production version `da27e54a-ae21-4e7b-a555-84c0cdaa1659` serves the exact built
assets; health/public access and unauthenticated private rejection are verified.
Latest no-push instruction leaves these commits local and #11 open/unpublished;
see the execution journal. Generic reports still omit scratchpad text, while
review/history/private export retain it; expanded advisor reporting is later work.


## Issue #12 delivery ledger — short replay and difficult recording marks

Rechecked live #12 (open, no comments or native dependencies) and read-only
original pin `3106c9b8bf20b63be069f4019467cb565cdd17ec`: `client.ts:1224–1228`,
`:1998–2001`, `:2069–2077`, and `audio-session.ts:1–93`. The original rewinds
by eight seconds, clamps at zero, and deliberately plays; named timestamps play
the exact recording position. Generated-listening Back 10 sec stays #27.

The Studio exposes Replay 8 sec beside the native player, current position and
optional difficult-mark labels. Replaying settles the prior heard interval before
moving the native timeline and uses the existing guarded Play path. A jump adds
no skipped time or coverage; actual rehearing adds native listening time. Marking
while playing or paused leaves transport unchanged. Timestamp replay and removal
have explicit accessible names. Only the current exact URL/native WPM is shown;
marks for another speed remain retained for later revisits. Current task identity
stays stable through in-app inspection. Relative replay itself needs no private data; existing public practice remains
usable without an account. Private marks require an owned account task and
verified recording identity. Labels never enter public links or listening recipes.

Private `PlannedTask.recordingMarks` reuses authenticated account operations,
revision conflict handling, generation fencing and the durable outbox. Mark-only
saves create neither practice time nor history. Server acknowledgements and
pending device receipts are distinguished; server failures use Retry account
sync. Refused local admission retains the exact candidate with explicit retry
or cancellation. Curriculum annotations preserve fixed assignment facts.
Validation bounds labels to 120 characters, each file to 50 marks and the task to
200; IDs are unique, positions finite/nonnegative, bounded by known catalog
duration when available and otherwise 24 hours. Creation also checks the actual
native duration. Superseded URLs cannot silently transplant
timestamps to replacement recordings. A shorter actual file disables out-of-range
timestamp replay with visible explanation. The native end must be replayed before
adding a mark.

Saved actual-file evidence receives a cloned annotation snapshot matching its task,
URL and WPM. Later task edits cannot rewrite that history or an immutable save
retry. Unplayed selected files do not acquire heard evidence. Existing private
history/review/report details include useful labels, timestamps and exact URLs;
version 1 account export/import and lifecycle backup preserve both task annotations
and saved snapshots. Older backups without marks remain valid. No new D1 entity,
queue, binding or alternate clock was added.

Validation and independent review evidence are appended after the delivery gate.
Physical iPhone/lock-screen verification remains unclaimed. Reload/crash elapsed
recovery stays excluded. These local commits will remain unpublished and #12 open
under the user's no-push instruction; production deployment is separately verified.

Validation before implementation commit: `mise run check`, `mise run test`
(842 tests in 47 files), and `mise run build` pass. The full single-worker
Wrangler/D1 browser suite passes all 67 checks in 12.0 minutes. After scoped
44px input/16px mobile text and bounded mark-list styling, both changed journeys
pass again in 26.7 seconds (1440px keyboard and 390px touch emulation); two Axe
reports are empty and both screenshots were visually inspected. The journeys
exercise native replay at 3→0 and 20→12 seconds, paused/playing marks, exact-file
switches/revisits, inspection continuity, storage refusal with cancel/retry,
503 device receipt with account retry, review cancellation, immutable history
and reports, and Guest/second-account isolation. They retain partial actual
hearing and zero completed passes; seeking creates no skipped-time credit.
Worker tests cover private mark-only saves, idempotent operations, curriculum
annotation retention, invalid-import atomicity, version 1 export/import and
reset fencing. No binding/configuration change requires regeneration of types.
Independent review and deployment remain pending at this implementation commit.


Independent review found one P2: a refused local mark edit and its label were
lost when keyed controls unmounted on a speed switch. The follow-up lifts unsent
label/candidate/busy/feedback state into a small Studio-owned map keyed by stable
task, exact URL and WPM. Captured callbacks update that file even after switching;
other files retain independent drafts, and the existing device-generation fence
rejects retired owners. This adds no persisted cache or second queue. Inspection
retains the draft; explicit cancellation clears it; finishing/switching practice
with any dirty mark edit offers a deliberate discard or cancel before leaving.
Required check/test/build still pass (842/47); both extended native journeys pass
again in 27.4 seconds, including failed 10→18→10 retention and canceling Finish.
Independent correction recheck and final regression/deployment remain pending.


A second P2 emerged from the complete published-curriculum workflow: 8 Fundamental
and 22 Advanced linked files have no speed-variant group. The enabled mark action
rejected them indefinitely. Independent actual-course probes confirmed QSO07,
story09 and Advanced30. `officialRecordingIdentity` now prioritizes exact native
variant metadata, then uses exact published curriculum URL/file-WPM metadata.
Direct public JSON imports avoid a curriculum/plan/marks cycle and include Node
JSON attributes for the private legacy CLI. Conflicting labels and superseded
URLs remain rejected. This supplies no guessed links, variants, duration or
character/effective timing. Annotation-bearing evidence must match the parent's
file WPM; old unmarked unknown recordings remain compatible. Unknown unpublished
files no longer expose a mark action that cannot save.

All 30 additional official URLs returned HTTP 200 with audio MIME types on a
metadata-only HEAD recheck; no course audio was downloaded or copied into assets
or fixtures. Native creation bounds positions to actual loaded duration; import
uses known catalog duration when present and a 24-hour bound otherwise, with
out-of-range actual-file replay visibly disabled. `mise run check`, all 846 tests
in 47 files, and build pass. Four affected journeys pass in 54.8 seconds, including
two new real-course desktop Space/mobile-touch journeys covering all three source
families, saved actual partial hearing, task revisits, private snapshots and no
invented timing. Six new-course Axe checks are empty; two screenshots inspected.
The independent second-finding recheck and final full regression remain pending.


The exhaustive independent 30-file recheck found one remaining source-label edge:
Fundamental Session 12 Day 1 Copy 3 links `ss-10.112.mp3` but has no stored WPM.
The [official recording label](https://cwops.org/wp-content/uploads/2025/04/CW-Academy-Fundamental-Curriculum-v2.0.htm#_Toc173138663)
says 9 WPM although its filename and session heading say 10. Its public factual
metadata now stores `recordingLabelWpm: 9`; annotation identity prefers this
explicit label. Character/effective timing remains unknown, and the existing
source discrepancy/advisor note remains visible. No filename-derived speed,
link, duration or alternate recording was added. A fourth pure source case and
both actual-course browser journeys cover this exact row. Check, 847 tests in
47 files and build pass; the two four-source desktop/mobile journeys pass in
40.5 seconds. Independent final recheck and full regression remain
pending; this entry does not declare the issue accepted or deployed.


Final independent review **ACCEPTED** at `b11165ca`, after correction commits
`9527072f` and `6f2ea519`. Both substantive P2 findings are resolved, including the
last published recording-label edge. The independent 30-file matrix passes two
checks for strict exact source identity, parent-WPM agreement, unknown/lookalike
rejection, legacy compatibility and absent guessed timing. The final actual
story-112 desktop Space/mobile-touch journeys pass in 22.1 seconds: mark at three
seconds, rewind to zero, native hearing, reviewed server save, task revisit,
private history and actual UI backup download/import. Actual hearing is
1.893366/1.906184 seconds with zero completed passes and no character/effective
fields. Both Axe checks are empty and both screenshots were inspected.

Earlier independent source journeys passed six cases in 57.6 seconds with six
empty Axe reports; original mark/retry/limit/history/import journeys passed four
cases in 38.5 seconds plus a 6.9-second late-acknowledgement case. Failed admission
drafts, per-file labels and owner cancellation survive exact switches; late
acknowledgements clear only their originating draft. No remaining substantive UX,
privacy, timing-integrity or maintainability findings. The reviewer runtime is
released; final full regression and production verification remain pending.


Final complete single-worker browser regression: **69/69 pass in 12.7 minutes**.
The production task reran check, all 847 tests in 47 files, build and Wrangler
dry-run, found no pending migrations, and deployed version `53875837-a545-471f-a27d-fb773221092f`
to https://cwa.n1rwj.com. Candidate code/tree is `b11165ca5eacabfc27313d180e8ac3b4899e036e` /
`cfd8f7bdf87773c3ce01713e20a54736e4a0cb49`. Initial immediate verification found an entry-reference mismatch;
a subsequent root inspection showed the expected entry references and the complete
unchanged nonce verification passed. Four production JS/CSS asset hashes and the
Runner integration hash match the validated build; root/health are 200, and
entries/account-state/account-lifecycle backup reject anonymous requests with 401.
No weakened assertions, push, signing override or original-site mutation.

GitHub reports this local commit absent (422); under the latest no-push direction
#12 remains open/unpublished despite accepted local implementation and verified
production. Physical iPhone lock-screen behavior remains unverified; generated
Back 10 and elapsed-time reload/crash recovery are outside this issue.


## Issue #13 implementation ledger — listening guidance

Rechecked the live issue body/comments (open, none), both native dependency lists
(empty), approved audit finding 6 and the original read-only source pin
`3106c9b8bf20b63be069f4019467cb565cdd17ec`: `guidance.ts:11/58` and
`client.ts:909`. The original supplies family-specific mental approaches and
optional prompts, with separate pass/instruction ownership. Explicit learned-word
reporting remains #40; no exposure-based learning inference is introduced here.

A small typed [guidance helper](../src/shared/listening-guidance.ts) maps words,
phrases, affixes, QSOs, POTA, CWT and stories to original concise suggestions and
optional scratchpad prompts. Exact verified native-file metadata takes priority
over learner-renamed titles or conflicting instructions; exact linked public
curriculum codes cover generic-title Fundamental/Advanced recordings outside the
variant catalog. Unknown sources use conservative complete code references or
narrow short-story/prefix/suffix matching, then a useful instructor-first fallback.
Arbitrary filename URLs and ordinary prose tokens do not identify families.
Non-audio copy/sending/external/Runner tools receive no assigned-audio guidance.

The approach sits directly beside assigned native playback, with explicit
original-instruction/advisor priority. Optional family prompts remain visible
beside the existing scratchpad and join its accessible description. Phrase/story
copy supports meaning and recognizable fragments while preserving any prescribed
writing/transcription requirements. Existing speed/pass displays, source links,
replay/marks, recall, notes, completion, save/outbox and history/report owners are
unchanged. Guidance is derived presentation, not persisted evidence or a new
private entity; no schema/binding change requires generated types. Public tools
remain usable without an account; restricted material and the original site stay
linked/read-only.

Initial seven-family fixtures exposed three guessed URLs; they were corrected to
exact published catalog links, with no lookup/validation relaxation. Type checks,
all 874 tests in 48 files (27 new guidance cases), and build pass. Browser desktop/
mobile verification is pending because another primary-checkout suite owns port
8791; the launcher aborted before competing with that runtime. No interface gate,
independent acceptance or production delivery is claimed yet.


The two actual-course desktop Space/mobile-touch journeys pass in 26.0 seconds.
They cover assigned phrase and Fundamental story playback, exact official-source
links and speed/pass requirements, visible optional prompts, unchanged export
plans/completion before playback, native partial hearing, paused inspection,
canceled review, refused durable storage plus HTTP 503, exact frozen retry/server
receipt, private history and exported scratchpad. Guidance never enters saved
metadata. Four Axe reports are empty and four screenshots were inspected; mobile
approaches stay below the tested 190px bound with no horizontal overflow.

The first actual browser attempt failed because its fixture expected unmodified
generated curriculum tasks in the portable export. Tests now independently check
unchanged exported overrides and actual `/api/plan` completion; no product or
completion/time assertion was weakened. A separate primary-checkout suite had
initially occupied port 8791; it was left intact until completion, with no competing
runtime. The user's concurrent scoring commit `03d70aea` is preserved alongside
accepted #12 history in separate conflict-free integration `106d501b`; eight
non-overlapping user paths match byte for byte. Required combined-base checks,
851 tests and build passed before that integration commit. Issue #13 remains a
separate focused change. Final combined checks/full browser regression and the
post-implementation independent gate are pending.


Final combined validation: `mise run check`, all **878 tests in 48 files**, build,
and the complete single-worker **71/71 browser journeys pass in 13.1 minutes**.
The first full run had 70 passes and one existing desktop course-replay failure
at its delayed-Play scenario (expected one pass, observed zero). Its retained
trace reported an incomplete pass; no native position/performance event log from
that original run establishes the exact gap. An isolated passive native-event
probe passed the unchanged complete desktop scenario in 1.1 minutes, followed by
the final full pass. Its event collector resets on page reload, so its final
60 events/three 3.6-second native endings do not reconstruct the original failure.
No product timing code, source data, assertion or timeout was weakened to pass.
Independent post-implementation review and production delivery remain pending.


Independent post-implementation review **accepted** commit
`563be598b24b40cec4988b2784f648019647586d` with no substantive findings.
The reviewer independently verified 243 linked public curriculum rows/239 exact
URLs and conservative replacement/unknown boundaries (2 pure probes). Its own
all-seven-family/generic desktop-keyboard/mobile-touch and actual-course
retry/history/export/source-popup journeys pass 4/4 in 57.3 seconds, with 18
empty named Axe reports and inspected surrounding-player/notes screenshots.
Both unchanged complete native replay scenarios pass independently (1.1/1.2
minutes); passive Node-persistent logs each contain 378 events, 22 plays and 16
native endings at 3.6 seconds. These do not establish the earlier failed run's
cause. Actual partial phrase hearing remains 1.849122/1.849245 seconds with zero
passes/no completion, even after selecting another speed. Review confirmed the
four product source files match the implementation commit. Runtime was released.

Production deploy reran check, all 878 tests, build and Worker dry run. Its first
remote D1 check returned Cloudflare 7403; the unchanged whole-task retry passed,
found no pending migrations and deployed version
`1e3849a4-ca61-4132-b90f-357242556c04`. Exact production asset/privacy verification
is recorded below. Browser widths/touch are emulation; physical-device behavior
remains unverified. Full Stories and learned-word reporting remain #30/#40.

Fresh nonce-based production verification passes: all four JS/CSS assets and
public Runner integration match local SHA-256 bytes; the entry point references
the deployed assets, root/health return 200 and three private endpoints return
401 without authentication. The immediate first asset request differed from
local bytes; the unchanged complete retry and fresh root check passed. GitHub
returns 422 for the implementation SHA; no push was attempted under the user's
policy. Issue #13 remains open for publication, although local implementation,
independent acceptance and production delivery are complete.

Delivery comment: https://github.com/rwjblue/cwa-training-tracker/issues/13#issuecomment-5937759827.

## Issue #14 implementation ledger — short practice and zero-time notes

Rechecked the current live issue body/comments (open, none), native dependency
lists (empty) and body dependencies #2/#5/#6 (closed, delivery evidence reread).
Original read-only pin `3106c9b8bf20b63be069f4019467cb565cdd17ec`,
`client.ts:2291–2399`, permits actual zero duration and retains scratchpad/context.
Companion preserves precise fractional seconds rather than porting original
flooring, default durations or automatic completion conventions. Approved finding
47 supersedes earlier 30-second/manual-discard parity recommendations.

The existing Studio capture/shared immutable queue now retains at least one
actual measured second on deliberate Finish or assignment/tool switch, including
assigned audio, manual, external and sending blocks and public/generated timed
practice. Inspection still pauses and retains the current block without saving.
Explicit Review & save retains cancellation. Copy and Runner keep their separate
completed-result workflows; this does not invent a generic simulator/copy timer.

Save notes is reachable beside the existing scratchpad, enabled only for nonempty
learner text at actual zero while stopped. It retains original text, exact zero,
task/source/review purpose and stable identity through the same queue, while
excluding selected/unplayed generated source summaries. It grants no time/pass
or completion credit. Empty/whitespace/subsecond blocks produce no automatic junk
records. In-flight/failed save locks preserve the frozen block; Retry uses the
same body, with clearing/reset only after an actual durable device or server
receipt. Destination feedback distinguishes private history, guest device and
account device awaiting upload. Existing account-generation/device fences,
private history, portable export/import and report calculations remain owners;
no schema/binding/config change requires generated types.

Focused capture/queue tests cover one-second and fractional boundaries, invalid
samples, exact-zero/empty/running eligibility, no unheard evidence, review
provenance and concurrent uncertain receipt retries. A real-SQL Worker journey
covers zero notes plus 12-second partial hearing, exact duplicate receipts, private
history isolation, portable restore and totals/progress without false completion.
Its initial fixture omitted native-1x method and used noncanonical dates/property;
those were corrected without relaxing validation. Initial browser guest save
passed but its next fixture incorrectly requested signed-in Inspect Today;
the retained trace identified actual guest Inspect Overview. The mobile repeat
was stopped after reaching that same missing control. The fixture control was
corrected without changing product logic or timeouts. Browser/full regression,
post-implementation independent review and production delivery remain pending.


Desktop keyboard/mobile touch notes journeys pass 2/2 (30.5/32.5 seconds) on
the final implementation. They verify guest zero notes/no empty records/device
receipt, private review-zero notes, storage refusal plus a lost committed server
response, two exactly equal POST bodies yielding one row, frozen controls and
visible retry focus, inspection/return after failure, actual native assigned and
generated listening above 12 seconds/below 14 seconds, canceled review, zero
passes/no completion, opened history scratchpads and actual backup download/import.
Six named Axe reports are empty; surrounding controls, retry and history screenshots
are retained. Assigned external Finish retains exactly 12 manual seconds and
notes at both widths, with no save from inspection and cleared notes after receipt.

The media fixture initially used an arbitrary example.test URL blocked by the
production media policy. It was corrected to an exact known public URL with
synthetic PCM, without fetching course audio or changing CSP. The first complete
73-test run had 71 passes and two new-fixture disclosure-selector failures: retained
Studio label and history summary both matched Scratchpad. The trace identified
the ambiguity; the probe now opens the semantic summary. No product evidence,
credit assertions or timeout was weakened. Self-review added focus on the existing
retry control for active notes-save failure, including return from inspection,
so an error above the player is reachable from the lower notes area. Scope-owned
formatting and typecheck, all 885 tests/48 files and build pass. Final complete
browser regression and independent post-commit gate remain pending.


A subsequent complete run passed 72/73 journeys in 13.3 minutes, including both
#14 notes journeys (30.2/33.7 seconds). The unchanged mobile course-replay test
failed after resetting and enabling automatic replay at its line 169 (expected
one observed completed pass, got zero); desktop passed. Root inspected the failed
assertion, context and trace. A mistaken copy glob then failed before the next
harness removed that trace, so no separately retained trace is claimed for this
run; the assertion/location remain in the tool transcript. No original native
position/performance log establishes its cause.

An ignored passive probe copies the entire canonical replay scenario unchanged,
except its helper import and appended Node-persistent native-event collection.
Both widths pass (1.1/1.2 minutes). These logs survive reload and are retained in
ignored progress evidence. This validates subsequent complete replay workflows;
it does not reconstruct or resolve the earlier failure. No clock/source/credit
assertion/timeout was changed. Final canonical regression remains pending.


The final unchanged canonical browser run passes all 73 journeys in 14.0 minutes,
including desktop/mobile native replay and both notes journeys (30.1/32.6 seconds).
Product file hashes match the required check/885-test/build and focused browser
implementation. Earlier failures and the missing second-run trace copy remain
recorded above; this passing run does not establish their original timing cause.
Post-implementation independent review and production delivery remain pending.


Issue #14 independently ACCEPTED at local implementation
`46498f2fdff640daa745ddbba2893ca6a3fc45fa`, accepted tree
`2769e316d03a3da22cbab0195683c2f60ae441e7`, with no substantive findings.
The post-commit reviewer independently passed ten desktop/mobile journeys:
two committed notes, two unchanged native replay (1.1/1.2 minutes), four added
keyboard/failure/manual/sending checks and two assigned external checks.
Actual Scratchpad → Tab → Save notes → Enter works; repeated Enter creates no
second record. A save failing while inspected keeps Return focused; returning
focuses Retry. Durable offline receipt and later upload retain a newly entered
draft. Manual assignment switching and sending/external Finish each retain
exactly 12 seconds without automatic completion. Actual History, backup UI and
Report preserve zero-note records and 0.4 total measured practice minutes.
Its 41 capture/queue tests and one focused real-SQL test pass; twelve relevant
Axe reports are empty and twelve screenshots were inspected. Native persistent
logs contain 382/381 events, 22 plays and sixteen actual 3.6-second endings per
width. Earlier unexplained native failure is not reconstructed by these logs.
Independent fixture failures and their retained traces are disclosed in the
ignored review report; there were no product corrections required by review.

Production deploy passed check, all 885 tests/48 files, build, dry-run and remote
migration check on a complete retry after the first D1 7403 response. No migrations
or binding/config changes. Version `774089f5-859c-4b91-8048-e2d94a9ef794`
serves the accepted implementation at https://cwa.n1rwj.com. Fresh verification
passes root/health 200, all four built JS/CSS SHA-256 matches and entry-point
references, public Runner integration SHA-256, and three anonymous private 401s.
Delivery comment: https://github.com/rwjblue/cwa-training-tracker/issues/14#issuecomment-5939318861.
No push was attempted under the current instruction; GitHub commit lookup remains
422, so #14 stays OPEN pending publication. Local main advances with this journal.
Mobile checks remain emulation; no physical lock-screen claim. Original site is
read-only, and unfinished elapsed reload/crash recovery remains excluded.


Local main advancement initially refused a sideways move because external signed
publication had moved main to scoring commit `05718a8f5319dd450b98eea2ef2bec7cb02552ed`.
GitHub verifies that signature. All ten path-specific added/deleted line sequences
are identical to the preserved original scoring change `03d70aea`; only its base
history changed. Root created a conflict-free merge of the accepted #14 delivery
journal and that published head; before this documentation addition its source
tree is byte-identical to the accepted delivery journal. No product change or
weakened validation was introduced. Both user scoring history and all local
implementation/review/deploy journals are retained. No push was attempted.

### Issue #15 — acknowledged Runner result identity and recovery

New native Runner results capture their account/device authority and learner IANA
timezone when the accepted Run starts. Each result preserves `runner:runId`, exact
engine seconds, settings, summary and speed measurements. Practice date derives
from that actual start; creation is the acknowledged terminal end. First review
submission adds a distinct immutable `runnerReviewedAt`, rather than restamping
the practice date. Shared/Worker validation rejects contradictory ID/date/end/
duration/QSO/timezone/review-time relationships. Earlier valid unmarked native,
manual and historical evidence remains portable without invented timestamps.

Completed, stopped and interrupted terminal results with at least one acknowledged
engine second are stored separately from the upload queue. Logbook exposes Review,
canceled-review edits, explicit Keep/Discard, and frozen submitted-result retry.
Review opens at its heading so captured facts remain visible before the fields;
Save remains reachable by keyboard and touch.
Reopening never creates elapsed time or resumes the simulator. Public results stay
guest-scoped; private results retain their original account generation and device
fences. Storage refusal leaves truthful open-page retention feedback and retry.
Cold reopening keeps workspace navigation/device selection pending until its
account bootstrap settles, avoiding a startup owner change that drops an
immediate keyboard navigation. A server row discovered after a lost response
cannot silently substitute a historical edit for the exact submitted POST body. Receipt retires only that
device result. Private history/report and account export/import preserve the same
timeline; mixed speed clears generic WPM and labels starting WPM explicitly.

Device backup version 1 gains an optional bounded terminal-result inventory with
scope/identity/origin validation, conflict detection, transactional rollback and
selected-scope clear/reset/replacement. Older files without the inventory remain
valid. Malformed stored bytes remain available for device recovery instead of
being silently deleted. No restricted curriculum, real contacts, new recognition,
running elapsed reload recovery, cumulative completion or Save & next is added.

Root validation before the implementation commit: typecheck, all 910 tests in
49 files and production build pass. The final serialized browser suite passes
all 75 journeys in 14.7 minutes, including actual AudioWorklet recovery at
1440px keyboard and 390px emulated touch. Eight scoped accessibility checks have
no violations; recovery/review/history/report screenshots are inspected.
Actual device download/discard/chooser restore, private download/import, canceled
notes and a lost committed response with refused queue storage preserve exact
facts and one server row. No physical-device or lock-screen claim is made.

Earlier runs are retained as failures: one mobile native-listening pass rejection
has an unproven internal cause; its actual media trace and an exact-journey passive
probe are retained. Two cold keyboard navigation failures were reproduced at the
account bootstrap boundary; pending controls and enabled-state keyboard waits
correct them. A later recording-choice fixture fired Enter on disabled Today;
its trace confirms the same readiness assumption. Focused rechecks pass, followed
by the complete passing gate. No audio clock, credit rule, timeout or behavioral
assertion was weakened. Independent post-commit review and deployment remain
pending; their outcomes will be recorded in the delivery journal. Source: [pinned original Runner](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/runner-session.ts#L48),
[start-date report evidence](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L49),
[terminal producer](../src/client/runner-session.ts),
[device result store](../src/client/runner-results.ts), and
[native recovery journey](../e2e/runner-recovery.spec.ts).

Independent post-commit #15 review found four P2 boundaries: zero-time restart
required unnecessary storage removal; canceled online-only uncertain review lost
its first submission; lifecycle confirmations omitted terminal counts; and device
restore accepted contradictory submitted terminal/queue bodies. The correction
keeps failed-write drafts in a bounded cloned cache for the original account and
device token, before optional inventory/storage checks. Canceled edits and the
first immutable submitted body survive storage refusal, full inventory or
unrelated damaged data. No local receipt, live engine, exportable runtime state
or reload recovery is inferred from that cache. Original generation is retained.
Review displays the frozen queued notes/context when an older editable terminal
draft coexists with that submitted body. Actual result discard still requires
successful removal; a zero-time failed load can restart without it.

Both preparation and pending lifecycle summaries count finished Runner results;
older four-count records remain readable. Backup validation and restore reject
conflicting submitted bodies inside a file and in either direction against
existing terminal/queue stores before writes. Editable unreviewed drafts retain
their distinct policy. Malformed data is preserved; no result is evicted.

Correction validation: typecheck, 917 tests in 49 files and production build pass.
The final serialized full browser gate passes all 77 journeys in 15.7 minutes.
Four actual native recovery/failure journeys pass at desktop keyboard/mobile
touch, covering real load timeout, protected actual-result discard, counted reset,
canceled edits, frozen queued display, both terminal/pending stores refusing
writes, lost committed response and two identical POST bodies/one server row.
Ten named settled Runner accessibility reports are empty; representative recovery,
review, history and report screenshots were inspected at both widths. This is
Chromium emulation, with no physical-device/lock-screen claim.

Honest correction iterations: two full runs were deliberately stopped after 27
and 16 passes before source refinements. An unchanged local-import CLI test once
hit its existing five-second timeout; focused rerun and complete suite pass
without a timeout change. A later full gate passed 76 journeys but sign-in for
Today dismissal returned HTTP429: the added tests shared the local network limit.
Retained trace proves that response/visible error. Reserved synthetic addresses
now isolate those two fixtures; limits and email timeouts remain unchanged. The
failed journey and final full gate pass. Independent correction recheck and
production deployment remain pending; #15 is not yet accepted.


### Issue #15 — independently accepted Runner recovery and production

Implementation `a6a8bbcac939483487b5710ab704fd0d83b9118c` and correction
`cfcab92c98a2e4c5417f5e182dc709bab576b5c6` are independently accepted.
The four initial P2 findings are resolved: zero-time restart, exact uncertain
review through storage refusal and cancellation, truthful lifecycle inventory,
and symmetric frozen terminal/queue conflicts before restore writes. No required
scoped finding is deferred to cumulative progress #16 or Save & next #17.

Root check, all 917 tests/49 files and build pass before the correction commit
and again in deployment. The final serialized full browser gate passes all
77 journeys in 15.7 minutes. Independent correction review adds 24 passing
browser executions (22 distinct desktop/mobile cases), 14 pure probes and
36 empty settled Axe reports. Representative viewport and scrolled review/error/
class screenshots were inspected; all 421 tracked files match the correction.
The original independent rejection and honest failed fixture/full-run evidence
remain recorded. No physical handset or OS lock-screen verification is claimed.

`mise run deploy` succeeds with no pending migrations. Production version
`6d92f2f9-0d95-414f-a303-6b6ad16ef40a` serves exact hashes for all four built
JS/CSS assets and the public Runner integration module. Fresh nonce checks
confirm root/health200, three private endpoints401 and root asset references.
The ignored independent correction report and production verification are
mirrored into the primary workspace. Original trainer remains read-only.

The latest instruction prohibits pushes. These accepted implementation commits
remain local and deployed; local main advances with this delivery record, while
#15 remains open until source publication. No PR or push was attempted; signing
configuration is preserved. Continue ascending #16–#46.


### Issue #16 — cumulative saved and current Runner assignment time

The pinned original plan/client and Runner progress were rechecked against live
issue #16. Companion now shares validated cumulative Runner accounting between
Today and the existing native studio. Four totals show saved required time,
current required engine time, combined time and remaining assigned time. The
15-minute example is covered exactly: two unique five-minute saved runs plus
two current minutes produce 10 saved, 2 current, 12 combined and 3 remaining.
A saved acknowledgement transfers the current identity to saved evidence once.

Shared owned-placement/alias rules exclude extra review, class, future, retired
placement, duplicates and invalid/nonpositive evidence. Native saved facts are
validated before contributing; actual float seconds are retained. Remaining
display rounds positive fractions upward rather than showing premature zero.
Valid manual/legacy credit and historical imported cumulative Runner completion
remain compatible; other simulators retain their existing uninterrupted rule.
No implicit time recommendation appears when the task has no target.

Native completion policy is explicit Complete/Reopen plus a distinct **Time
requirement met** milestone. Neither the milestone nor clicking Complete invents
a run, elapsed time or score. Required saves, review/class history and reports
continue through the existing validated queue/Worker/export/import architecture.
Public unassigned Runner has ordinary engine progress and creates no account
plan. No binding/schema changes, restricted assets or live elapsed recovery.

One engine owner remains authoritative. Saved totals are memoized; current Studio
time comes only from its native events. Today receives acknowledged stopped/reset
projections after inspection, fenced by account, device token and launch identity.
Retained canceled/frozen class/review choice controls required current credit.
The projection is discarded when the owner changes and is never persisted.

Focused progress/plan tests pass 34 cases, including fractions, invalid evidence,
alias ownership and imported Runner/other-simulator regressions. The actual native
desktop keyboard/mobile touch journey passes both widths in 50.2 seconds: guest
use, unique archived fixtures, two real saves, actual Stop/Today/Return, canceled
notes/class choice, refused pending storage/503/frozen exact retry, no double
count, time milestone, Complete/Reopen with unchanged entries, and extra review
class save. Four settled Axe arrays are empty; Today and Studio screenshots
were inspected with no horizontal overflow. This is Chromium emulation, not
physical-device/OS lock-screen verification. Final check, all 923 tests/50 files
and production build pass. The final serialized full browser gate passes all
79 journeys in 16.3 minutes, including both new Runner journeys and corrected
difficult-mark journeys. Implementation commit, independent post-commit review
and production delivery remain pending.

Honest fixture iterations remain retained: same-URL API arrangement left the old
empty plan visible; a nested locator was invalid; a seven-real-second observation
used the default five-second poll; and the class checkbox used an incorrect name.
Actual snapshots/traces were read before targeted fixture corrections. Fresh
account reload, actual accessible checkbox with Space/tap, and sufficient native
observation time fix those assumptions. No production timeout, clock or evidence
rule was weakened. Source: pinned original plan.ts79/111 and client.ts449; current
`src/shared/runner-progress.ts`, `src/client/RunnerAssignmentProgress.tsx`,
`src/client/MorseRunnerStudio.tsx`, `src/client/TodayPlan.tsx` and
`e2e/runner-progress.spec.ts`.

Root self-review aligned current-progress bounds with the existing engine's
`RUNNER_MAX_SECONDS` and requires a stable Runner identity. Its boundary tests
pass. The first complete gate passed 77 journeys and failed only two existing
#12 fixtures dated in UTC against a New York account after midnight UTC; retained
traces prove that scheduling mismatch. A separate focused #12 fixture correction
uses the account timezone. Four focused journeys pass in 1.2 minutes, followed
by the final complete 79-journey passing gate. Independent combined acceptance
remains pending; the earlier interrupted 23-pass gate is not counted
as complete.


### Issue #16 — independent acceptance and production delivery

Implementation `5bba61b24a9e0f8a89b27403a277aec418469e6d` is independently
ACCEPTED with no substantive scoped findings. The post-commit reviewer authored
six desktop/mobile journeys, including actual native Stop/inspection, canceled
class edits, refused terminal and pending writes with a lost committed server
response, exact retry/one exported identity, Complete/Reopen, guest separation,
a fifteen-minute milestone and an absent target. Actual short native times were
3.900952/3.935782 seconds. The exact two-current-minute example is a domain test;
no two-minute live-engine execution is claimed.

Independent validation passes three new pure probes, 112 focused tests/five files,
and three actual-SQL Worker tests (134 unrelated tests explicitly skipped).
Eight specifically named settled Axe reports are empty; eight desktop/mobile
screenshots were inspected. The shared memoized saved calculation and stopped
projection retain a single scoped engine owner. No reviewer product correction
was required. Failed reviewer fixture assumptions and traces remain retained in
the ignored detailed report; no evidence rule, timeout or native clock changed.

Root check, all 923 tests/50 files and build pass, including deployment. The final
serialized complete browser gate passes 79 journeys in 16.3 minutes. Production
version `cce343ac-d4fa-4c78-a704-df84ca331c94` serves the accepted implementation
at https://cwa.n1rwj.com. Fresh root/health 200, three anonymous private 401s,
four exact JS/CSS SHA-256 matches and entry-point references, and the public
Runner integration hash pass. Dry-run and remote migration check pass; there
are no pending migrations or binding/config changes.

Local main advances with this delivery journal. No push or PR was attempted;
source publication remains pending and #16 stays OPEN. Mobile checks are
Chromium touch emulation, not physical-device/OS lock-screen verification.
Original trainer remains read-only evidence. Save & next is separate #17;
no elapsed reload/crash recovery or live-engine restoration was added.


### Issue #17 — save an exact Runner result and prepare the next run

The live issue and pinned original Runner transition were rechecked. Runner review
now offers **Save & start next run** alongside ordinary Save. The existing save
queue returns only after verified durable device retention or a server receipt;
only then does the existing app owner replacement open a fresh, paused engine.
No unreviewed result is auto-uploaded and no Run action is triggered automatically.

The next launch retains the current owned assignment and deliberate review/class
placement, chosen mode, full duration, activity and band conditions, plus the last
actual recorded speed. It receives new owner/run identities and no old dates,
elapsed time, score or manual notes. Deleted or non-Runner assignments cannot be
re-created from retained titles; malformed or legacy unmarked results do not gain
new native attribution. A different current owner is preserved. Existing account,
device token and immutable original-generation queue guards remain authoritative.

Successful ordinary Save still returns to Today. Cancel preserves the acknowledged
result and notes; failed first-submission retries keep its exact body. A durable
pending result remains in the existing logbook/status/retry UI while the new run
is usable. Without local retention, a failed or uncertain upload keeps the old
result and blocks continuation. Late background acknowledgements merge history
without retiring the new owner. Class context is readable before the next Run.
No new queue, backend entity, binding or migration was introduced; actual history,
reports and portable account/device backups retain the existing validated facts.

Three new pure transition probes and one actual Runner queue-receipt test cover
cloned settings, latest speed, fresh identity/time/score, deliberate placement,
removed/malformed contexts and persistence-before-reset/late acknowledgement.
Focused tests pass 33 cases; check, all 927 tests/51 files and build pass. The
native desktop keyboard/mobile touch journey passes both widths in 1.0 minute
before its final failed-upload/report extensions: guest refused-storage retry,
chosen WPX/three-minute/22-to-24-WPM/activity/QRM/QSB setup, canceled notes,
refused terminal/pending writes with actual committed/lost response and exact
retry, double Enter while saving, durable pending continuation, live next-run late
acknowledgement, five separate assigned/class/review results, ordinary Save,
history and actual export/import. Final expanded browser/full regression,
post-commit independent review and production delivery remain pending.

Six exact settled Axe arrays were parsed empty and six screenshots inspected.
Additional scrolled action/Report captures are being checked on the final expanded
journey. Mobile checks are Chromium emulation, not physical-device verification.
No native clock was fast-forwarded and no native result event was fabricated.
Original trainer was read-only evidence; restricted assets were not redistributed.
Live elapsed recovery and automatic engine resumption after reload remain excluded.

Honest first iterations are retained in ignored evidence: a contrast scan ran
during modal entrance; three unwrapped actions clipped Cancel outside the mobile
dialog (fixed with scoped wrapping); an immediate post-Stop fixture read preceded
real acknowledgement; upload status matched both persistent text and the toast;
an exact-text query incorrectly treated a sentence as a whole paragraph; export
was incorrectly sought in Practice log rather than Your account. Actual contexts
and traces were read and preserved before subsequent harnesses. Only the mobile
action wrap required product correction; no production timeout or evidence rule
was weakened. Source: original runner-session.ts48/client.ts635 and1068;
current `src/client/practice-launch.ts`, `main.tsx`, `MorseRunnerStudio.tsx`,
`runner-session.ts`, existing `practice-autosave.ts` and `e2e/runner-next.spec.ts`.


The final expanded native journeys pass desktop keyboard (25.5 seconds) and
mobile touch (31.7 seconds), 2/2 in 1.0 minute. An actual HTTP503 upload leaves the
second run durably queued before opening the third; Retry sends its identical
body while the third native engine runs, and the delayed real acknowledgement
leaves that run intact. Five unique private records retain exact measured facts,
class/review placement and independent identities. Actual export/import skips
duplicates unchanged. The practice report shows original notes, starting/mixed
speed evidence and separate class time.

Eight exact settled Axe arrays are empty. Ten screenshots were inspected,
including scrolled review actions, pending feedback and the report at both
widths. All three actions fit inside the narrow dialog; keyboard/touch Cancel,
retry and next/ordinary save remain reachable. Complete canonical regression,
post-commit review and deployment are the remaining gates.


Final pre-implementation gate: `mise run check`, all 927 tests in 51 files,
and `mise run build` pass. The complete serialized canonical browser suite
passes all 81 tests in 17.5 minutes, including both expanded save-next journeys,
Runner recovery/progress, account isolation and existing public tools. Independent
post-commit review and production delivery remain pending.


Independent #17 review identified an intermittent recovered Logbook continuation
focus race. The explicit save-next action now requests focus once after the new
owner host and closed dialog commit, guarded by owner/account/device identity.
Generic navigation retains its user-focus protection. The canonical desktop/mobile
journey now performs a real guest result reload and recovered save-next with a
destination-focus assertion. Review correction validation remains pending.


The #17 focus correction passes check, all 927 tests/51 files and build. Its
canonical recovered/direct desktop/mobile journeys pass 2/2 in 1.1 minutes; the
complete serialized regression passes all 81 tests in 17.5 minutes. Existing
ordinary saves, cancellation, offline/account boundaries and actual native timing
remain covered. Independent correction recheck and production delivery are pending.


### Issue #17 — independent acceptance and production delivery

Implementation `10729b76b86f3e5b5c9dcabd20b41fd6d2ed23dd` and focused recovery-focus
correction `50620dba6c295309c6f4d46bcc37b4d550dd2ae8` passed independent review.
The reviewer found one substantive P2: recovered Logbook save-next intermittently
left focus on the body. Its owner/account/device-fenced post-commit focus request
resolved the finding. Four repeated independent desktop/mobile native journeys
pass in 1.2 minutes with hard host-focus and next-Tab assertions. They verify real
canceled class-draft reload, HTTP503 durable continuation, chosen settings, fresh
identities, exact retry, current-owner protection, ordinary Save, historical edits
and deleted-task handling. Independent focused tests pass 40 cases; eight settled
Axe scans across initial/recheck captures are empty and six screens inspected.

Root final check, all 927 tests/51 files and build pass; the full serialized suite
passes 81 browser tests in 17.5 minutes. Its native keyboard/touch journeys retain
five distinct private results, exact measured facts, mixed speeds, class/review
placement, export/import duplicate handling and report evidence. Eight root Axe
arrays are empty; ten screenshots were inspected. Earlier failed fixture attempts
and the actual focus failure remain retained as evidence, not counted as passes.

`mise run deploy` completed after a transient remote D1 error7403 cleared on the
single retry. No migrations were pending. Production version
`0800f460-a0c3-43e9-9b98-2ef7759ad4e5` serves matching hashes for all four built
JS/CSS assets and the public Runner module. Root/health return200; anonymous
entries, account-state and lifecycle-backup requests return401.

Mobile is Chromium touch emulation, not physical-device/lock-screen verification.
Short native runs have actual zero contacts/points; no proficiency is inferred.
No live-engine or elapsed-time reload recovery was added. Original trainer and
protected scope documents remain unchanged. Per the user's no-push instruction,
these focused commits remain local and #17 stays open until source publication.
New primary-checkout browser/testing edits are preserved without rebasing that
working copy; the local main bookmark tracks the accepted delivery journal.


### Issue #18 — private timed meetings and safe Join class

Rechecked the live issue body/comments/dependencies and pinned original
`types.ts:48`, `plan.ts:278`, `client.ts:625`, and Worker `cw-training.ts:347`.
The approved issue retains meeting access query parameters, superseding the
original generic URL sanitizer. Original trainer remains read-only evidence.

Learners configure ordinary start/end wall times in an explicit meeting timezone,
optional next-day ends, and individual session 1–16 date/time/timezone exceptions.
Curriculum dates and session identities remain unchanged. Skipped DST wall times
are rejected; repeated hours use their earlier occurrence. Actual duration must
be 1 minute through 24 hours and meeting intervals cannot overlap. Changing the
practice/display timezone preserves meeting wall times and absolute instants.
The preview, Today and Academy guide show local starts/ends and explicit timezone
context; Today refreshes at calendar boundaries/visibility changes for upcoming,
active and finished classes. No practice clock or inferred attendance is involved.
Join class opens the private HTTP/S URL with `noopener noreferrer`, retaining
meeting query parameters and fragments, and rejects username/password userinfo.
Neither guest UI nor a public endpoint receives personal meeting details.

Version 1 optional `Profile.classSchedule` travels through the existing settings
projection, durable semantic outbox, exact-retry/CAS receipts and account lifecycle.
Migration 0007 adds nullable owner-row `class_schedule_json`, separately bound
from ordinary preferences. All settings/import/reset writes share one scoped
statement; existing snapshot/CAS query offsets remain intact. Private account
exports/backups restore the versioned schedule. Old date-only backups remain
untimed. Imported original meeting timestamps and join references remain readable
in Imported history, with no automatic native conversion or published content.

Log class time opens the existing private manual log with class context and stable
session prefilled. Saved history labels Class; existing goals, required progress
and reports exclude it from independent totals. Cancellation adds no record.
Meeting edits can be canceled independently of other preference edits. Validation
retains invalid input; an unavailable save retains its scoped durable edit and
Retry account sync reuses the exact request before confirming persistence.

New fast coverage protects DST gaps/folds including Lord Howe, overnight/exact
boundaries, display/exception timezones, early accepted calendar years, stable
curriculum dates, overlap/duration/URL validation, partial edits and old/new backup
compatibility. Five actual-SQL API cases exercise isolated settings/semantic
operations/private exports, old/native imports and original archives, exact
receipts, injected replacement rollback, lifecycle reset and restoration.

The representative browser journey uses desktop keyboard and mobile touch once
across real controls: configuration/exception preview, actual 503 and exact retry,
synthetic Join popup, before/during/after timing, canceled class log, one private
class save, unchanged plan, canceled meeting edits, retained validation errors,
actual downloaded backup, Class history, Academy guide and a stale-revision
conflict with readable online/local times and deliberate Keep online version. Six distinct screens
fit 1440/390 pixels with twelve empty settled Axe reports. Screenshots were inspected.
Calendar Date is fixed independently of actual browser timers; no native media or
engine credit is fabricated. Emulation is not physical-device verification.
Check, all 950 tests/52 files and production build pass. The complete serialized
browser gate passes all 64 journeys in 13.1 minutes, including integrated user
coverage cleanup. Independent review and deployment remain pending.

Honest fixture failures remain retained: pausing the browser clock froze Axe's own
timers; checking an entering modal caused transient contrast failures; history's
actual label is Class. The fixture now fixes only Date, waits actual finite
animations and asserts the existing label. One new SQL test needed an explicit
unknown JSON response type. No product timer, validation, evidence rule or contrast
check was weakened. Binding/config types did not change.

The existing imported-history browser journey now independently opens original
course/meeting references, reads both preserved timestamps and the exact private
join URL, and confirms no native schedule was invented. It passes in 5.5 seconds.
The class-schedule journey with its shared readable conflict comparison passes
in 18 seconds. New controls retain the existing wrapped private conflict panel.
The first full gate was deliberately interrupted for this required UX correction
after 14 passing journeys; it is not a complete gate. Its interrupted native
course-replay wait and trace remain retained, without treating partial playback
as a completed pass. The corrected serialized 64-journey gate passes in 13.1 minutes.

Final normalized URL length is checked after percent-encoding as well as before
parsing, so valid-looking Unicode input cannot exceed the private storage bound.
Its shared rejection test passes; subsequent check, all 950 tests/52 files, build
and the complete focused schedule journey (17.9 seconds) pass. The 64-journey
gate precedes this isolated validation-boundary correction; no interface or native
playback wiring changed afterward. Twelve final settled Axe reports are empty.


### Issue #18 — independent acceptance and production delivery

Implementation `2a0dd2731bc5e3621292f98e305dd3c6a6fb87ea` is independently
ACCEPTED with no substantive scoped findings. The reviewer separately authored
two actual-runtime journeys (17.4 and 11.9 seconds): overnight UTC-midnight class,
display-timezone travel retaining the exact meeting schedule, exception-only
editing, keyboard traversal, touch cancel/removal, date-only Join and guest privacy.
A lost committed acknowledgement retries the identical request with one revision.
A safe exact-query popup has null opener; skipped DST input stays editable without
server mutation. Canceled class logging adds no row. One manual 20-minute Class
record leaves the plan unchanged and appears in actual history/report with zero
independent-practice minutes and a separate class row.

Independent evidence includes nine distinct states at both widths, eighteen empty
settled Axe reports, inspected screenshots, eight extra calendar assertions and
23 focused shared/actual-SQL tests (137 unrelated cases explicitly skipped).
Apia skipped day, Lord Howe earlier fold, Kathmandu fractional offset, actual DST
durations, greater-than-24-hour rejection, reordered stable IDs and touching
intervals pass. Two reviewer fixture assumptions were corrected with retained
traces; no product assertion or timing rule was weakened. Review confirms shared
validation, settings state ownership, two-query CAS snapshots, scoped centralized
writes and reuse of existing private logs/outbox/backups, with no new practice clock.

The user-committed coverage cleanup `38d5848308ed62cdd967ae1cd12d420213aac0c1`
is integrated separately by `c38aa2a4d1c076b079ff085591e67a37fb43b55d`.
Its updated testing guide is retained; pending scope documents and primary working
copy are untouched. The complete serialized runtime gate passes 64 journeys in
13.1 minutes. After the final isolated encoded-URL size guard, check, all 950
fast tests/52 files, build and focused schedule journey pass again. Deployment
repeats the required checks successfully. Binding/config types are unchanged.

Production version `7618a3f0-72b9-4f77-bf4b-482c80e6e4a3` serves the reviewed
implementation at https://cwa.n1rwj.com. Migration 0007 applies successfully.
Fresh nonce root/health 200, three anonymous private 401s, four exact JS/CSS
SHA-256 matches and entry-point references, and public Runner module hash pass.
The first remote D1 request failed with 7403 before deployment; the single full
retry succeeded. Both attempts and production evidence remain in ignored notes.

Local main advances with this delivery journal. No push or PR was attempted;
#18 remains OPEN with source publication pending under the user's instruction.
Original trainer remains read-only evidence. Chromium touch/viewport emulation
is not physical-device or OS lock-screen verification. No attendance inference,
elapsed reload/crash recovery, public join feed or automatic original conversion
was added. Rest/disjoint practice windows remain separate #19.


### Issue #19 — required/rest goals and shared daily practice time

Fresh issue #19 is OPEN with no comments or native blockers; its body depends on
completed, previously verified #1. Pinned original plan.ts:278 and
practice-time.ts:35 at 3106c9b8 were rechecked as read-only evidence. Required
quota follows assignment presence on the exact date, independent of completion.
Companion uses its validated existing dailyGoalMinutes on such dates, and zero
otherwise. Future undated session preparation and earlier work do not invent a
required date. The unchanged amount remains the optional personal target every
day; settings and printable reports explain that distinction. Streaks and weekly
charts continue to describe saved positive independent practice, not required
quota attainment. Legacy estimates retain their existing explicitly estimated
meaning and stable identity.

A shared pure summary validates saved evidence, gives server receipts precedence
over local receipts, and deduplicates saved/current/retained versions by ID.
Local queued results already own saved time; later acknowledgement adds nothing.
An edited zero or class receipt also retires its current version. Class has its
own saved/current/total and cannot meet independent goals. Recall, including
validated corrections and imported subtotals, stays a subset of total rather
than an extra duration. Zero, malformed and future/other-day observations add no
credit. Retained finished Runner results await review in Current until saved.

App owns the scope/device/launch-fenced readonly projection. Existing Studio,
CopyClock and acknowledged Runner owners supply measured observations, published
once per readable second and with settled precision; no summary starts a clock.
Validated saved summaries and plan policy are memoized. Native media/coverage,
recall integrity, engine bridge, task completion and exact save queues remain
with their existing owners. Runner assignment progress keeps its separate
required-placement/purpose contract; this daily summary includes ordinary extra
practice without granting required task credit.

One app learner-date refresh, including visibility return, feeds Today, Overview
and Studio even when a block is paused. Ordinary blocks freeze their start zone;
new Copy drafts capture an optional validated start timezone in existing private
device inventory. Old drafts omit it unchanged and keep their existing mount-time
fallback; frozen pending bodies still win. Accepted Runner start attribution is
reused. Across local midnight, today resets while a retained block explicitly
shows its start date outside today's totals. A save preserves that same date.
No profile goal policy, database schema or Worker binding changes are needed.
Existing account validation, private history, export/import, report provenance,
queue/lifecycle fences and strict Copy device backups remain the write boundaries.
Guest practice needs no account and its summary never uses demonstration entries.

Evidence: [domain and receipt policy](../src/shared/practice-time.ts),
[summary boundary tests](../src/shared/practice-time.test.ts),
[clock projections](../src/client/usePracticeTimeProjection.ts),
[calendar refresh](../src/client/useLearnerDate.ts),
[manual save/midnight journey](../e2e/practice-time.spec.ts), and added real native
Copy/Runner assertions in their existing representative journeys. No duplicate
full export/import/report cycle was added. Independent review/deployment gate is
pending at implementation documentation time; validation results follow below.

No elapsed reload/crash recovery, running engine restoration, new recognition,
restricted source redistribution, personal data or original-site mutation.
Existing Copy drafts and completed-result queues keep their established recovery.
Mobile Chromium viewport/touch checks cannot establish physical-device or locked
OS behavior. No push is permitted; source publication and issue closure remain
pending even after local implementation acceptance and production deployment.


### Issue #19 — implementation validation before independent review

Required check, all 967 fast tests in 53 files, and production build pass.
The final serialized browser gate passes all 65 journeys in 13.4 minutes.
The earlier full run passed 64 with one obsolete goal-ring selector; its retained
trace showed the correct new summary. That journey now asserts exact saved,
current and total seconds plus required/personal goals after task completion.
Its focused correction passes in 14.5 seconds and the clean full gate includes it.

Fifteen new pure summary cases cover stable receipts, stale owners, terminal
identity, zero/class edits, recall corrections, invalid/future data, legacy
estimates, three start-day zones and exact assignment presence. Two Copy storage
cases cover optional captured-zone compatibility and strict device backup.
Focused 83 tests in four files pass. The mixed desktop-keyboard/mobile-touch
manual journey verifies cancel, a 503 local save, unchanged retry, two stable
records and Honolulu midnight attribution. Eight settled Axe reports are empty;
both midnight screenshots were inspected. Three existing native Copy/Runner
journeys verify actual current time and terminal/receipt deduplication using
real audio and AudioWorklet clocks. No native time was accelerated or fabricated.

Binding/config types are unchanged. Independent review follows the implementation
commit; acceptance and production delivery are not yet claimed.


### Issue #19 — independent acceptance and production delivery

Implementation `bca5901b744f72d6e4d1f095907d29d1ae01fc3f` is independently
ACCEPTED with no substantive scoped findings. Four distinct independently
written browser journeys pass: manual completed-day/zone-change/storage retry
(8.9 seconds), native mobile Runner class-cancel/terminal dedup/online save with
local storage refusal (10.3 seconds), guest native Copy captured-zone recovery
and durable save (15.8 seconds), and generated native listening across midnight
with an identical lost-acknowledgement retry (6.2 seconds). Native measurements
use actual media or AudioWorklet movement; the manual calendar case alone advances
its manual timer. One precise server receipt owns each stable result.

Eight distinct states at both widths pass sixteen settled Axe scans and sixteen
overflow checks; nine representative captures were visually inspected. Reviewer
focused verification passes 51 tests in four files and ten own boundary groups
in one additional test. Reviewed state ownership, readonly projection, old/new
Copy compatibility, exact assignment goals, class/recall/legacy semantics,
start-day attribution, guest isolation and existing private write boundaries
require no correction. Reviewer fixture assumptions were corrected against actual
source/error contexts, with failures retained and no timing/assertion weakening.
The complete 65-journey root gate and 967 fast tests remain separate root evidence.

Production version `40d406d3-dede-49c0-b5c5-03e908e084d1` serves the accepted
implementation at https://cwa.n1rwj.com. Deployment repeats check, all 967 tests
in 53 files and build successfully; no migrations are pending. Fresh nonce
homepage/health 200, three anonymous private 401s, all four exact JS/CSS SHA-256
matches and root references, and public Runner module hash pass. The first remote
D1 call stopped with 7403 before publication; the single complete retry succeeded.
Both attempts and production verification are retained in ignored progress notes.

Local main advances with this delivery journal; no push or PR was attempted.
#19 remains OPEN because source publication is pending under the user's explicit
no-push instruction. Primary user work and its pending scope documents are
untouched. Chromium viewport/touch emulation does not establish physical-device
or lock-screen behavior. No unsaved elapsed reload/crash recovery, running engine
restoration, restricted redistribution or original-site mutation was added.


### Issue #20 — verified public SST/MST/CWT agenda and recurring calendar

Fresh #20 is OPEN with no comments, native blockers or documented prerequisite.
Pinned original cw-practice.ts, public page/client and feed handler at 3106c9b8
were rechecked as read-only evidence. The approved scope retains these three
organizer events/calendar; historical NNN/Giving Back/resource/contact guides
remain excluded. Current sources were verified October 2, 2026, rather than
copying the original table's older verification date:

| Organizer event | Weekly UTC windows, each 60 minutes | Current official source |
| --- | --- | --- |
| SST | Monday 00:00–01:00; Friday 20:00–21:00 | [K1USN rules](https://www.k1usn.com/sst_rules.html), including its [published embedded rules](https://docs.google.com/document/d/e/2PACX-1vTFtjDXVkS_wGX2XmBV4P8VyT40iSx_NJcx-m2C9Gb9ANJiCMwNeZdpqk_P8DMNJ2OvIGHydv5e36lQ/pub?embedded=true) |
| MST | Monday 13:00–14:00 and 19:00–20:00; Tuesday 03:00–04:00 | [ICWC MST](https://internationalcwcouncil.org/mst-contest/) |
| CWT | Wednesday 13:00–14:00 and 19:00–20:00; Thursday 03:00–04:00 and 07:00–08:00 | [CWops Tests](https://cwops.org/cwops-tests/) |

The MST web reader timed out; a successful direct current organizer-page fetch
and official indexed text independently confirmed both time lines. This is not
an unavailable organizer fact. Source provenance/verification date, explicit
UTC basis, durations and stable logical slot IDs live in one readonly shared
[cw-events module](../src/shared/cw-events.ts). Its half-open bounded queries
include running windows until exact end; UI, recurring calendar and later #21
eligibility consume that same definition. Public list queries return 1–100 future
windows; range consumers can request at most 366 days without a second table.

Guests can reach Live practice from the welcome page, public navigation and the
Studio's existing inspection path. Opening it pauses/retains the current owner;
returning does not save, replace or autoplay practice. Current, next and eight
further windows show both dates/ends and official rules. Boundary-aligned local
wall-clock refresh handles starts/ends and visibility/pageshow without backend
polling or repeated screen-reader countdown announcements. Local uses the
browser's explicit IANA zone, independently of private course timezone; UTC stays
UTC. Native date formatting handles DST/local-midnight weekday changes.

The display preference tolerates unavailable/corrupt storage, offers explicit
failed-retention feedback/retry, and joins strict optional shared device inventory,
capture, existing reviewed opt-in restore and rollback. Old valid v1 backups
omit it unchanged. Private clear preserves shared choice; choice confers no
account authority. Calendar viewing produces no practice row, completion, score,
on-air contact or report evidence. Private history/import/export remain unchanged.

The public route `/api/live-practice/calendar.ics` matches existing Worker-first
routing and bypasses auth/origin/private database dispatch, retaining outer
security headers. GET/HEAD, strong/weak/list/star ETags, date conditions with
If-None-Match precedence, 304 bodies, 405/Allow and deployment-origin variants are
tested. SHA-256 ETag identifies serialized content; caching is public max-age300/
s-maxage3600. No account, private meeting, reminder token or result enters it.
No schema, binding or configuration change is needed.

Recurring ICS uses nine stable logical UIDs, a fixed Monday UTC anchor, one-hour
ends, weekly RRULE, deterministic DTSTAMP/LAST-MODIFIED, sequence1 and current
version. Rechecking published schedule changes must deliberately advance sequence
and modifiedAt while retaining an existing slot ID when its time changes. New
slots receive new IDs; retired-series handling requires an intentional calendar
publication decision rather than reusing an ID. Dates before verification are
recurrence extrapolation, not a claim of historical organizer schedules. Text
escaping, CRLF and UTF-8 octet folding follow RFC5545. Calendar URLs and agenda
links use this deployment; no personal-site defaults are inherited.

Subscribe uses webcal; the exact HTTPS URL remains selectable. Clipboard denial
focuses/selects the field with manual-copy feedback. Download imports through an
independent iCalendar parser. Refresh hints request six hours, but clients choose
their own cadence and imports are snapshots. External OS/calendar subscription
behavior and physical-device operation are not claimed from Chromium emulation.

Initial validation: 58 focused schedule/calendar/HTTP/device cases pass. A new
restore fixture used the wrong existing API arguments and was corrected without
weakening assertions. The parser's narrow sequence typing was handled with
explicit numeric conversion. Check passes. One representative mixed desktop
keyboard/mobile touch runtime journey passes (8.8 seconds, 13.7 total), including
boundary states, preference/reload/storage retry, denied clipboard selection,
actual downloaded/parser-imported feed, HEAD/304 and guest401, plus manual Studio
inspection/return retaining time. Ten settled responsive Axe/overflow checks pass.
Both widths' screenshots were inspected; subscription actions were moved before
the longer list and the duplicate next row removed. Full required gates and the
post-commit independent review/deployment are pending; evidence follows below.


Final implementation validation: typecheck, all 983 tests in 57 files and build
pass. The complete serialized browser gate passes all 66 journeys in 13.6 minutes,
including native audio and Runner workflows. The new agenda journey passes in
8.3 seconds. An earlier full run was deliberately stopped after two confirmed
720px-high sidebar reachability failures (34 passed, two failed, one interrupted,
29 unrun, exit130). Added navigation had pushed account controls outside the
viewport. Sidebar scrolling, nonshrinking children and hiding only the decorative
quote at short heights fixed the cause; seven focused checks pass in 33 seconds
and both failures pass in the final clean full gate. Screenshots, contexts and
traces from the interrupted run remain retained; its interrupted continuity case
is not counted as a product failure. No assertions or timeouts were weakened.
The implementation commit is ready for fresh independent review. Review and
production acceptance remain pending; this source remains local under no-push.


Independent #20 review ACCEPTED implementation
`44296a12334fddfc8a3d63970c02847832404e3d` with no substantive findings.
Its own nine fast probes pass in 700ms and three fresh browser journeys pass in
25.2 seconds (9.7 calendar/manual, 8.8 native playback, 1.7 short-height account
navigation). Ten empty Axe scans and ten overflow checks pass; seven captures
were visually inspected. The reviewer independently reverified all organizer
pages, including successful MST web-reader retrieval, actual downloaded ICS
recurrence, revisions/escaping, full Worker dispatch with private-data traps,
shared preference old-backup/opt-in/clear/rollback behavior, and retained native
media position/owner/content/notes with no autoplay or entry/queue writes.
Native clocks were untouched. All 23 implementation files match the commit;
primary protected files and original site remain unchanged. Runtime lease released.

Production `2fe8a9b4-ed9d-45ce-9cfa-4b97633a0aef` serves that implementation
at [CW Academy Companion](https://cwa.n1rwj.com/#events). The first deploy task
stopped before publication on transient D1 7403; one complete task retry passes
check/983 tests/build/dry-run/migrations/deploy, with no migrations to apply.
Fresh homepage/health200, three private401 endpoints, four exact built JS/CSS
hashes/references and the public Runner module hash pass. The live public calendar
returns GET200, bodyless HEAD200, conditional304 and POST405/Allow; all nine unique
series/sequence1/verification date and exact emitted body match the shared module.
Independent parser expansion matches shared UTC windows around autumn DST.
An initial ignored production probe stopped before network on an absent older
TypeScript transpilation API; Node24 type stripping corrected that probe without
changing product code or weakening its comparison. The corrected probe passes.

No physical-device, lock-screen, screen-reader speech, external OS calendar UI or
subscription refresh cadence is claimed. Calendar import is through the actual
file and independent parser. No private entity, new recognition, elapsed reload/
crash recovery, attendance inference or original-site mutation was introduced.
Local main advances with this acceptance journal. No push or PR is attempted;
#20 stays OPEN/unpublished until its source is available on GitHub. Accepted local
and deployed #18/#20 dependencies permit the ascending #21 implementation loop.


### Issue #21 — eligible assigned live windows before class

Current issue #21 has no comments or external blockers. Its documented #18/#20
prerequisites are independently accepted locally and deployed; source publication
is deferred under the learner's no-push instruction. The original pinned
[eligibility projection](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L135),
[immediate filtering](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L150)
and seven-day live preview were rechecked read-only. The policy remains strict
**event start before deadline**, with a still-running eligible event allowed to
end after that deadline. Identity comes from typed event metadata, never a title
regex or another event schedule.

Catalog CWT objectives and original typed live imports carry a `live-event`
resource with shared verified event identity, safe resource URL and explicit
`associated-class` or `practice-date` deadline policy. Manual on-air tasks expose
optional SST/MST/CWT selection and policy; canonical curriculum facts remain
protected while renamed titles/completion/progress survive projection. Existing
account operations, SQLite ownership, transactional import, backup validation
and export round-trip the resource without a new schema or binding. Old valid
backups remain accepted and catalog projection supplies canonical live identity.
A resource URL can remain a learner's safe preparation destination; links labeled
“official rules” come directly from the shared organizer definition.

Associated class deadlines use the actual dated class start and that meeting's
IANA zone, including exceptions. If only a class date exists, the conservative
fallback is 00:00 at the start of that class date, explicitly labeled with a
prompt to set actual timing. An explicit practice-date policy, or no applicable
dated class, uses the end of the selected practice day in the learner's zone.
A nonexistent date/midnight or absent date yields a request for a deadline,
never a fabricated eligible opportunity. Editing class/date/zone resolves a
fresh deadline from owned current state without rewriting task IDs or practice.

Today, the course plan and retained assigned Studio share exact start/end dates
in the learner's explicit zone plus UTC and active/next/unavailable guidance.
Future unfinished typed live tasks within seven practice dates get a separate
Today preview without adding to today's required goals. Calendar observation
uses one App owner, bounded shared recurrence queries, boundary/one-minute
refresh and visibility/pageshow refresh. Its timer re-arms independently of
whether a repeated/backward wall timestamp changes React state. No calendar
observation changes the practice clock or makes a network poll.

Preparation remains reachable outside a window. Actual assigned Start/Resume
checks the current event and deadline again and is disabled when unavailable;
Pause remains usable on running work. A prepared/manual worked block survives
in-app navigation, cancellation and deadline edits, and Review/save can record
already performed work after the opportunity closes. Starting opens the current
safe preparation resource once through the existing manual timer architecture.
No new audio/player or Runner owner is introduced. The eligibility predicate is
used by actual Studio Start and is available to #22's automatic next-block
selection; that automatic action is not yet present and is not claimed here.

The event's presence, visiting rules, preparing and class attendance produce no
minutes, QSOs, score or completion. Manual practice, actual measured elapsed
facts and learner completion retain independent meanings. Completed-result
queues, exact retry bodies, history and report aggregation use the existing
account-scoped workflow. Private class details never enter the public feed.

Initial validation: typecheck and 215 focused tests passed, then the seven-day
preview brought focused domain coverage to 36 passing cases. The mixed desktop
keyboard/mobile touch browser journey passed in 22.2s with ten empty Axe and
overflow checks across five settled states at 1440/390 widths: editor, upcoming
course view, active Studio, unavailable retained block and failed-upload retry.
It exercises native dropdown selection, the actual official-link popup, manual
elapsed work, canceled review, a real settings operation, retained time through
calendar advancement, a 503 with zero server entries, exact-body retry and
explicit persisted completion with no extra history entry. The Worker probe
uses two synthetic accounts, current canonical edit rejection, invalid replace,
real SQLite-trigger rollback, valid export/reimport, no attendance row and public
feed body equality despite private settings. Pure cases cover exact boundaries,
start-before-due/end-after-due, exceptions, DST/year rollover, date-only fallback,
missing deadline, typed validation, catalog merge and original live imports.

Browser fixture failures were inspected and retained before correction: label
lookup for a visible combobox, Enter submitting the native-select form, an End
key failing selection, the repeated-wall-time refresh bug, an incorrect retry
button name, and an exact-two-seconds expectation that omitted real interaction
milliseconds. Role lookup and letter/Tab selection use the observed controls;
no timeout was increased. Duration assertions now bound actual manual work,
compare retained review display and exact saved/retried facts instead of deleting
real overhead. Required full gates and fresh post-commit independent review and
production acceptance are pending. Emulation does not establish physical-device
or background audio behavior. Reload/crash running-time recovery remains outside
approved scope; no restricted assets or original-site mutation was introduced.


Issue #21 full root gates pass: typecheck, 992 tests in 58 files, production
build and all 67 serialized browser journeys (13.8 minutes). Final focused
validation additionally selects the actual “This week” control before checking
its live opportunity. Independent post-commit review and production acceptance
remain pending. No binding/configuration change or original-site mutation.


Issue #21 initial independent review found two P2 failures: retained manual
blocks used captured event identity after adding/clearing an optional event,
and the sidebar timer bypassed eligibility. Both are corrected centrally.
Current owned optional bindings now determine manual preparation and restrictions
without replacing native audio/Copy/sending/Runner owners or elapsed time.
Both Start/Resume controls share a fresh activation-time eligibility check;
active Pause and already-worked Review/save remain available. The added browser
regression exercises actual add/change/clear edits, retained seconds, active
after-class policy, both control surfaces and a stale activation race through
desktop keyboard/mobile touch. Both focused journeys pass (25.8s). Full
revalidation, focused follow-up commit and independent recheck remain pending.


Issue #21 review corrections pass all required root gates: check, 994 tests
in 58 files, build and all 68 serialized browser journeys (13.9 minutes).
Fourteen assigned-live settled Axe/overflow reports at 1440/390 are empty;
the new binding regression adds two distinct settled states to the original
five. Actual native recording/Copy/Runner regression journeys also pass.
Fresh issue body/comments remain unchanged. Follow-up commit and independent
recheck are next; production acceptance remains pending.


### Issue #21 — independent acceptance and production delivery

Independent post-commit review ACCEPTS implementation
`476d0e8b0916ffcbdce9b20c0e948f9abc08e3f4` and correction
`627fc4f2c8e7128f743451356316d461f91619bd`. Both initial P2 findings
were fixed and independently rechecked: current manual event add/change/clear
bindings and central eligibility on both timer controls, including a stale
activation at exact window end. No substantive finding remains. Native audio
retains its actual element, position and notes through an event edit and resumes
with real media movement; manual event projection never replaces native owners.

Independent recheck: 180 tests in five files (2.68s); three own manual/UI probes
(8.2/1.6/5.6s), one actual native-owner journey (5.5s), and both committed
representative journeys (25.1s including startup). Twenty-six empty Axe/overflow
checks cover thirteen settled states at 1440/390; six own captures were inspected.
The representative journeys include real 503/exact-body retry, history/export,
cancellation and completion without inferred QSOs. All seventeen changed files
match committed bytes; protected primary documents and pinned original remain
intact. An initial native fixture was correctly blocked by CSP; the reviewer
inspected its context/screenshot/trace, then used an intercepted permitted CWA
host without relaxing product policy, timing assertions or timeouts.

Root final check, 994 tests/58 files, build and all 68 serialized browser journeys
(13.9 minutes) pass. Production `92378d54-1a2d-443d-bae5-31ca912ec440`
serves the accepted code after one complete deploy-task retry for D1 error7403;
no migration was required. Fresh home/health, four exact JS/CSS assets and pinned
Runner module match; private entries/account/backup routes return401. Public
calendar GET/HEAD/304/405, nine unique recurring events and independent parser
DST expansion agree with shared schedule; no private class data or Set-Cookie.

Local main records acceptance. Issue #21 remains OPEN/unpublished under the
learner's no-push instruction; no push or original-site mutation occurred.
Automatic next-block selection and consuming this eligibility predicate remain
explicit dependent #22 work. No physical-device/background playback or
reload/crash running-time recovery is claimed.


### Issue #22 — context-aware next practice implementation

Rechecked the current issue body/comments/dependencies and pinned original
`plan.ts:278–327`, `client.ts:625` and `navigation.ts:1`. Dependencies #16,
#18 and #21 are independently accepted and deployed; their unpublished local
commits remain open under the explicit no-push instruction.

The shared `nextPracticePlan` derives Today’s eligible required work from the
existing daily plan and saved evidence: today before earlier dates, started
within a date, stable assignment ties, explicit completion/dismissal, actual
learner timezone, recording availability and current live deadlines. Actual
private class intervals suppress new recommendations. Undated preparation,
future dates and all-complete guidance remain inspectable without automatically
advancing them. Extra review never supplies required progress.

Today prioritizes the retained in-tab owner. Studio and an otherwise unoccupied
Today expose a deliberate next-block action that reuses the existing launch
factory, serialized navigation and save policy. It prepares the selected task’s
own resource/recipe/purpose without autoplay. Eligibility is sampled again after
an asynchronous finish so a class/live boundary or changed plan cannot replace
the owner with newly ineligible work. Saving partial practice remains separate
from completing the exercise. An acknowledged unsaved Runner result is explicitly
View/save result; the stopped engine is not resumable. Scoped owner callbacks
reuse existing result/queue persistence and account/device fences.

App’s existing calendar observer now watches private class boundaries too, and
passes its clock to class cards rather than adding independent observers. The
practice/player/Runner timing owners are unchanged. There is no new private
entity, Worker schema, binding, export format or elapsed-time reload recovery.
Existing authenticated history, reports and exact completed-result retries remain
the authority; public tools remain available without an account.

Eight planner tests pass for ordering, dismissal/completion, preparation, class
phase, missing audio, live boundaries, timezone midnight and progress exclusion.
Three representative browser journeys pass with desktop keyboard/mobile touch:
actual native PCM movement through Today/Week/Report inspection and return,
cancellation, rejected save, exact retry, explicit completion and correct next
manual context; blocked recording/link, live preparation, class interval and
all-complete guidance; and an actual held save crossing the class start boundary
that preserves the originating owner and saves time once. Sixteen settled Axe
and overflow checks are empty; desktop/mobile card captures were inspected.
Existing acknowledged native Runner journeys own completed-result navigation.
Fixture failures were inspected in context, screenshots and traces before fixes;
no timeout/native timing assertions were weakened. Full gates and independent
post-commit review are pending. Physical devices and background/lock-screen
playback were not tested. Original source and protected user work are unchanged.


Issue #22 root gates pass: check, 1,002 tests in 59 files and production build.
The complete 71-case serialized browser run produced 67 passes and four fixture
failures (14.8m). All seven affected Today/live journeys then passed (57.3s),
covering all four corrections. Two task-row checks now select their actual level
4 headings rather than matching the additional level 3 recommendation. Keyboard
activation waits for enabled controls and verifies focus after fixture reload.
The native completion journey now observes a fresh 1.2-second playhead advance
after return rather than reusing an absolute already-heard position. These
strengthen actual interaction/evidence checks; no product behavior, timeout,
privacy, failed-save or timing assertion was weakened. All other 67 flows were
unchanged and passed, including real Runner result/queue/recovery journeys.
Independent post-implementation review remains pending.


Issue #22 independent review found one P2: a saved native Copy extra-review
owner matched the next required task by ID alone, suppressing its direct assigned
launch and labeling retained review as the current assignment. The next card now
compares the captured practice purpose too. Review remains review until a
deliberate next-block action creates an assigned owner through the existing
factory; no saved record or retained Copy round is reattributed.

A new native browser regression passes (8.1s): desktop keyboard extra review,
real generated audio movement, acknowledged automatic save, desktop/mobile
settled guidance, mobile next assigned launch, and a second actual native result.
The first result stays exactly unchanged with review purpose, the second has a
fresh identity and assigned purpose, and the unfinished task remains explicitly
unfinished. Four additional Axe/overflow checks are empty. Required final gates,
full serialized browser coverage and post-fix independent recheck are pending.


Issue #22 correction final gates pass: check, all 1,002 fast tests in 59 files,
production build and all 72 serialized browser journeys (14.5m). All four next
practice flows pass (8.6s, 9.5s, 3.7s, 7.5s), including two actual native Copy
results with distinct review/assigned purpose. Twenty next-action Axe/overflow
reports are empty. Existing account/lifecycle, native listening/Runner, queue,
backup, history/report, completion and public-tool workflows pass unchanged.
The focused correction is ready for independent post-commit recheck; production
deployment and acceptance are not yet claimed.


### Issue #22 — independent acceptance and production delivery

Implementation `175741b9caebeb72f0126b2655c1f97953d8a913` and focused
Copy-purpose correction `6041699e43da6a6c6899ca122e0a9ee7cc876b34` are
independently ACCEPTED after the one P2 was fixed. The reviewer reran its original
failing native Copy probe and extended it through a distinct assigned result:
review facts stayed exactly unchanged (1.67056s); the new assigned result measured
1.842328s, with no duplicate or implicit homework completion. Its three serialized
Copy/manual/real-Runner journeys passed in 27.6s, including canceled review,
503/exact retry and retained ownership. Forty-five focused tests passed; fourteen
distinct Axe/overflow artifacts were empty; six new Copy desktop/mobile captures
were independently viewed. All seventeen implementation files exactly match the
correction commit, and protected primary document hashes remain unchanged.

Root gates pass: check, 1,002 tests in 59 files, build and all 72 serialized browser
journeys (14.5m); twenty settled next-action Axe/overflow artifacts are empty.
Production deployment repeated the complete task once after D1 API error7403;
the retry passed validation/dry-run, found no pending migrations and deployed
version `f0d4577f-8026-4417-83b1-736be3eb9274`. Fresh production entry/health
responses are200; all four JS/CSS assets and the pinned Runner bridge exactly
match built SHA-256 bytes. Entries, account state and lifecycle backup require
authentication (401). The separate public feed still has exact shared content,
nine stable distinct UIDs/sequence1, matching DST recurrence, GET/HEAD200,
conditional304, unsupported-method405 and no Set-Cookie.

Local main records delivery. No push was attempted. GitHub reports the correction
SHA absent (422), so issue #22 stays OPEN pending publication; accepted local and
production behavior permits the ascending #23 loop. No new elapsed-time reload
recovery, physical-device/lock-screen claim or excluded public tool is included.
Restricted curriculum remains linked; original source and user work are unchanged.

### Issue #23 — dated Today pins, implementation and validation

Rechecked the live issue (open, no comments or documented/native dependencies),
approved finding 29 and the read-only original source at
`3106c9b8bf20b63be069f4019467cb565cdd17ec`: `plan.ts:300`,
`client.ts:1941` and `types.ts:109`. The earlier Add to today behavior is a
calendar-date presentation choice, independent of the assignment schedule.

Today and the full plan now expose Add to today/Remove from today for earlier
unfinished work. A separate Added to today group and row badges retain the
original due date and saved progress. Keyboard focus returns to the Today
heading when a row changes groups. Existing native player/Runner/manual launch
factories remain authoritative; adding a pin starts no timer, adds no practice,
and never completes, deletes or reschedules work. Today's assigned work stays
first, followed by deliberately pinned work and ordinary earlier work in the
shared next selector. Pins do not create a required goal on a rest day.

The optional private task field `pinnedForDate` is validated as a real calendar
date and uses the existing semantic account outbox, exact retry receipts and
user-scoped task JSON. New pins require known earlier unfinished work. Null
clears only the pin; historical pins remain valid after completion or later
schedule edits. No new database entity, clock, migration or binding is needed.
Expired pins cease selecting work without destroying the saved dated choice.
The date stays fixed across timezone edits; Today compares it with the current
account's local calendar date. Offline retries retain the original pin date.

Explicitly pinning dismissed work bypasses its dismissal only for presentation.
The stored dismissal remains visible in the full plan; removing the pin hides it
again until ordinary Restore to Today is chosen. Full-plan visibility and the
existing dismiss/restore operations retain their original meanings. Private
backups include pins, old backups default to no pin, repeated merge/replacement
preserve values, and invalid dates or a SQL failure roll back replacements.
Public guest practice has no private pin controls or storage.

Fast coverage lives in `task-pins.test.ts` and the real-SQL Worker suite:
active/expired pins, timezone boundaries, duplicates, original history/report/
goal invariants, assignment priority, invalid dates, known references, ownership,
curriculum projection, exact retry, old/new backups and transactional rollback.
The representative `task-pins.spec.ts` journey mixes desktop keyboard and mobile
touch: pin/unpin, dismissed work, restore, failed save, exact retry after reload,
actual backup download/file selection, import cancellation and merge, timezone
changes and midnight expiry. Distinct settled states fit both widths with empty
Axe reports. The first import-dialog Axe ran during its entrance animation;
context, pixels and trace were inspected and preserved. It now waits for observed
animation completion, with no arbitrary sleep or disabled contrast rules.

Focused verification: 193 tests in four files and check pass; after the visual
feedback adjustment, all ten pin/Today/next browser journeys pass in 1.3 minutes.
The new pin workflow takes 13.0 seconds. Full final gates and independent
post-commit review remain pending; this entry does not claim acceptance or
production delivery. No physical-device verification or elapsed-time recovery
is claimed. Publication/issue closure remain deferred under the no-push order.

Final pre-commit boundary inspection after the full 73-pass run found that a
historical pin on work later rescheduled to today could bias today's selection
or bypass dismissal. The selector now takes active pin identities from the
shared planner's pinned group, preserving today's ordinary started-work order.
A cheap domain regression protects that case. Save notices name the captured
calendar date, remaining accurate if acknowledgement arrives after midnight.
The full plan is keyed to the existing account/device token so a retired
async pin save cannot publish feedback into replacement data. Final gates and
relevant browser checks will run on these corrections before the commit.

Issue #23 final root gates pass on the corrected implementation: typecheck,
all 1,018 tests in 60 files, production build and all 73 serialized browser
journeys (14.7 minutes). The pin journey passes in 12.7 seconds, including the
actual exact retry and date/timezone transitions. All ten pin-screen Axe reports
are empty at desktop/mobile widths, with no overflow; captures were inspected.
The earlier full run also passed 73 journeys before the final boundary correction.
Independent review is the next gate, after the focused implementation commit.

### Issue #23 — independent acceptance and production delivery

Implementation `0242266997241ba2e84cbb0898b8d63da57929de` is independently
ACCEPTED with no substantive findings. Four serialized reviewer browser
journeys pass in 28.9 seconds: the actual backup/import workflow, retained
manual timer and notes with canceled review, midnight expiry followed by
byte-equivalent retry, and refused local storage followed by deliberate retry.
Desktop/mobile keyboard and emulated touch pass; eighteen settled Axe/overflow
reports are empty and ten captures were independently inspected. All 132
focused tests plus three new real-SQL pin journeys and an existing integrity
test pass. All sixteen changed files match committed bytes; protected primary
hashes and signing remain unchanged. The reviewer released the runtime.

Root final gates pass: check, 1,018 tests in 60 files, build and all 73
serialized browser journeys (14.7 minutes). Production deploy repeated the
complete task once after D1 API error7403; the retry passed all gates and
found no pending migrations. Version
`4b7bb2e8-8935-4993-90a6-02cc6c3b9643` is deployed. Fresh production entry
and health responses are200; four JS/CSS assets and the pinned Runner bridge
match built SHA-256 bytes. Entries, account state and lifecycle backup require
authentication (401). The public calendar retains the exact shared body,
nine distinct stable UIDs/sequence1, matching DST recurrence, GET/HEAD200,
conditional304, unsupported-method405 and no Set-Cookie.

Local main records delivery. No push was attempted; GitHub reports the
implementation SHA absent (422). Issue #23 remains OPEN pending publication;
accepted local and production behavior permits the ascending #24 loop. Pins
retain their fixed calendar date across timezone changes and become inactive
after that date without deleting history. No physical-device or elapsed-time
reload/crash recovery is claimed. Restricted curriculum remains linked;
original source and protected user work remain unchanged.

### Issue #24 — bounded familiar review, implementation and validation

Rechecked the current open issue, no comments/native dependencies, documented
#5 dependency and approved finding27. The read-only original at
`3106c9b8bf20b63be069f4019467cb565cdd17ec` supplies `plan.ts:163`, `:236`
and `:327`: a recent-date review pool, resource rotation and current-course
computer recipes. The approved introduction cutoff excludes the original's
pre-introduction fallback to a future Runner/ICR task.

When no required block is eligible and no class is active, the existing next
practice card offers at most three optional familiar reviews. Ordinary material
comes from the three most recent dates with usable introduced material. Runner
and ICR candidates retain their latest reached course source/settings, including
rest days. Every choice explains its introduction date and session/day when
known. Future/undated work, inactive curricula, live work and unresolved audio
are excluded. Public guest tools remain usable; account-derived suggestions
are rendered only for the authenticated learner.

The shared selector deduplicates exact private recording URLs and verified
catalog alternate-speed identities, without guessing filename families. Saved
positive practice rotates least recently used sources; reviews already used
today follow unused choices. Native audio rotates from actual heard URLs, not
unplayed selected recordings. Existing qualified task/legacy aliases retain
source identity, while real owned IDs remain authoritative.

Deliberate review uses the existing task launch, transition/save policy, native
player/Copy and Runner owners. Eligibility is recomputed before and after the
serialized transition; replacement/account/device fences remain authoritative.
The existing explicit review purpose, task provenance and native evidence flow
through queues, history, reports and private backups. Review adds useful daily
time while contributing no required task minutes, passes or completion.
Unsupported external ICR stays external; no false Code Groups adapter is added.
No new entity, store, clock, database migration, binding or configuration is
needed. Existing Worker coverage owns privacy, validated review persistence,
exact retry, immutable purpose and portable transactional restore.

Eleven cheap domain tests cover cutoff, three-date/three-choice bounds, rotation,
actual heard recording identity, current recipes, future exclusion, unsupported
tools, account-local dates/class suppression, source aliases and unchanged
required progress. The representative browser journey uses actual native media,
Copy rounds and Runner terminal acknowledgements: keyboard desktop suggestions,
mobile touch, cancellation, HTTP503 with actual exact retry, rotated choices,
three saved review results and readable private history. Original plan rows
remain byte-equivalent; required progress remains zero. Six distinct settled
states fit both widths with empty Axe reports; four captures were inspected.
The first browser failure was an engine-selector fixture value (`single` versus
API `SingleCall`); context/pixels/trace were inspected and preserved before
correcting the assertion. The native journey passes in15.9s.

Check, all1,029 tests in61 files, build and all eight existing review-provenance
Worker tests pass. The full74 serialized browser run is pending; independent
review must follow the implementation commit. No production or acceptance
claim is made yet. No physical-device or elapsed-time recovery claim is added;
original source and protected user work remain unchanged. Publication and
closure remain deferred under the user's no-push instruction.

Issue #24 complete initial browser regression passes all74 journeys in15.1m,
including its native review workflow in15.5s. Final source recheck confirms
Runner review was always discoverable in the original: the three-choice set
now reserves the latest reached Runner/ICR recipes and fills remaining places
with rotating ordinary material. A cheap domain regression covers a larger
recording pool with older current recipes, preserving both recipes and rotation.
The new optional-review divider now uses the defined theme line color. Final
fast gates and affected interface checks will verify these two corrections;
the complete run above predates them and is not claimed as their verification.

Issue #24 final gates pass on the reserved-recipe/theme corrections: check,
all1,030 tests in61 files and build. All six affected familiar-review,
next-practice and extra-review browser journeys pass in1.1m; the new native
workflow passes in17.7s with captured ICR recipe and actual Runner settings.
All twelve settled familiar-review Axe/overflow reports are empty; corrected
captures were inspected at both widths. The complete initial74-journey run
passed in15.1m before these final pure-selector/style corrections. Fresh issue
body/comments/dependencies are unchanged; closed dependency#5 is reverified
by the real extra-review browser journey and eight Worker provenance/privacy/
backup tests. Independent post-commit review is the next gate.

### Issue #24 — independent acceptance and production delivery

Implementation `bb335722f6d4b6d186ae4a8354db291e3166860b` is independently
ACCEPTED with no substantive findings. Thirty focused tests across three files
pass, including real-SQL review privacy/provenance/restore boundaries. The
reviewer independently reran the actual native recording/Copy/Runner journey
in16.1s: cancellation, HTTP503, exact retry, captured recipes/settings, original
plan equality and zero required credit all pass. Its separately authored
large-pool/external Koch/guest-isolation journey passes in3.9s. Current reached
recipes remain discoverable among many recordings; unsupported Koch launches
its actual external popup and pauses by mobile touch, without Code Groups or
an implicit save. Guests see no private suggestions and private plan GET401.
Sixteen settled Axe/overflow reports are empty at desktop1440/mobile390;
pixels were independently inspected. All nine implementation files match
committed bytes, protected primary hashes/signing remain unchanged, and the
reviewer released the runtime.

Root final gates pass: check, all1,030 tests in61 files and build. The complete
initial74-browser run passed in15.1m; final pure-selector/theme corrections
passed all six affected review/next journeys in1.1m (native review17.7s).
Production deploy passed on its first attempt, found no pending migrations and
deployed version `f8b82048-1aab-4c15-aeac-60b949ae2692`. Fresh production
entry/health responses are200; four JS/CSS assets and the pinned Runner bridge
match built SHA-256 bytes. Entries, account state and lifecycle backup require
authentication (401). The separate public calendar retains exact shared
content, nine stable distinct UIDs/sequence1, matching DST recurrence,
GET/HEAD200, conditional304, unsupported-method405 and no Set-Cookie.

Local main records delivery. No push was attempted; GitHub reports the
implementation SHA absent (422). Issue #24 stays OPEN pending publication;
accepted local and production behavior permits the ascending #25 loop.
Introduction means the source's account-local scheduled practice date has
arrived; the current computer recipes reserve places in a maximum three-choice
set and ordinary material rotates within three recent usable dates. No
physical-device, reload/crash elapsed recovery or new recognition claim is
made. Restricted curriculum remains linked, and original/user work is intact.

### Issue #25 — optional daily word listening, implementation and validation

The current issue body/comments/dependencies and pinned original
`daily-listening.ts`8/36 and `client.ts`667 were rechecked. The original accepts
both its private daily recording and generated word-recognition practice.
The Companion uses its permitted Common QSO words, 30 common English words
and custom-list native player; it explains that the original daily recording
is private and unavailable. No original audio, restricted curriculum, private
resource URL or new recognition subsystem is published. This missing daily
resource is separate from the seven historical vocabulary/catalog gaps.

Today and Studio show a clearly optional ten-minute listening goal, local
date/timezone, saved/current/remaining listening and a milestone. The existing
word-player Repeat list preference permits deliberate continued listening
beyond the milestone and remains independent of assigned-recording replay.
Existing words/settings/transcript/scratchpad and native transport are reused.
The action returns to a retained word owner or starts a fresh optional review
through the existing serialized transition; it never creates a required task,
marks homework complete or links optional time to an assignment.

The existing PracticeClock captures actual applied word-source ownership at
native media start and credits only accepted movement. Pause/buffering/seeks,
replay/rates and source changes retain existing admission rules. A readonly
word subtotal joins the same current-practice projection; no second clock or
elapsed-recovery store is introduced. Public word listening now has the same
focused recall controls as recording listening: starting recall pauses audio,
resuming audio stops recall, and hidden/delayed recall is interrupted. Recall
remains inside total practice time and outside listening-only progress.

Version1 timed evidence optionally retains raw `wordListeningSeconds`, bounded
against total minus recall and disjoint recording time, with actual played
word-source description. Corrections cannot rewrite or exceed these raw facts.
Old omitted evidence remains valid and supplies no inferred goal credit.
Receipt-first stable-ID deduplication counts device/server/current transitions
once; date/class edits retire the current owner without lending goal time.
Historical accounting and class/wrong-date work remain outside this goal.
Existing private SQL/outbox, history, reports and portable backups retain the
subtotal and explicit public review purpose. No entity, binding, configuration
or migration changes require generated Worker types.

Six daily-domain cases protect eight listened plus two recall minutes,
receipt/current deduplication, local date/class exclusion, milestone crossing,
continuation, old omission and arithmetic roundoff. Clock/source, studio save,
strict evidence/report and two real-SQL tests cover disjoint budgets, corrections,
immutable measurements, exact retry, account privacy, export/restore and rejected
transactional replacement without history mutation. The representative browser
journey passes in14.3s: guest access/private401, original-resource explanation,
custom-list setup, actual native looping beyond the milestone, real observed
recall, retained inspection, canceled review, HTTP503/device receipt and byte-exact
server retry, readable saved source facts and unchanged required plan. All ten
settled desktop1440/mobile390 Axe/overflow checks are empty across five states;
four Today/history captures were viewed. Emulation establishes neither physical
lock-screen playback nor unsaved reload/crash elapsed-time recovery.

Initial browser fixtures were corrected from observed failure context, pixels
and retained traces: guest entry must first open the public tool; innerText
comparisons require matching text semantics; installing a fake clock after the
observation interval does not supply valid recall; exact save control names and
actual searchable history replace guessed roles. The final journey uses only
real advancing clocks. Root also corrected stale word-recall help and bounded
projection roundoff before committing. Full regression, implementation commit,
independent review and production delivery remain subsequent gates.

Issue #25 initial full browser run completed73/75 passing in16.1m. It exposed
one useful-Companion regression: public words had lost the existing manual
Start timer. Manual timing is now preserved beside explicit focused recall;
the two modes use the same clock, and manual time adds no word-source credit.
The existing precision/save/cancel/manual-log browser journey now also asserts
zero listening-goal credit and passes3.4s. The new native test captured a rounded
projection before its final pause tail settled; it now reads the raw source
measurement through actual review before recall and requires exactly the same
source afterward. The corrected native journey passes16.6s with unchanged goal,
private source facts, exact retry and original required plan. Both failures were
inspected and retained before correction. Final full-current regression follows;
no implementation commit, independent acceptance or deployment is claimed yet.

Issue #25 final-current gates pass: check, all1,041 tests in62 files and build.
All75 serialized Wrangler/D1 browser journeys pass in15.3m after the manual
regression and settled-source test corrections. The final native-word journey
passes14.8s; manual precision/save coverage passes3.3s and confirms zero listening
credit. Ten new settled desktop/mobile Axe/overflow reports are empty; four final
Today/history captures are retained. Fresh issue25 authority remains OPEN with
no comments/native dependencies; its documented #1/#5/#10 foundations are
reverified by current private evidence, extra-review and actual course replay
workflows rather than skipped by closed status. Protected user documents and
signing are unchanged. The implementation commit precedes independent review;
production acceptance and publication are still separate gates.


Issue #25 independently ACCEPTED at implementation
`90a093b28de551a15a18cb2382caf23d8187925b`, with no substantive findings.
The fresh reviewer inspected all24 changed files, passed361 focused tests and
17 course-replay tests, then independently ran two actual Wrangler/D1 browser
journeys (33.6s): native listening/recall/navigation/cancel/503/exact retry14.9s,
and its own unplayed-material/manual/correction/class-date-edit boundary12.8s.
Six captures were inspected;16 settled desktop1440/mobile390 Axe reports are
empty. Raw evidence survives actual historical edits, while class and date
changes remove goal credit. Browser/runtime lease was released after exit.
Production `2d3b56a4-e1f5-4bb7-a375-8b776047bff0` now serves that exact
implementation. The complete deploy task passed after one observed D1 API7403
retry; no migration was needed. Fresh production health200/private401s, four
asset SHA256 matches, Runner bridge match and public calendar GET/HEAD/304/405,
nine stable UIDs/sequence1 and DST parser agreement pass. Protected primary
work and signing remain unchanged. Local main records this acceptance; no push
was attempted. GitHub commit lookup returned422, so #25 remains OPEN pending
publication. Original private audio remains unavailable; older unmeasured
records receive no invented credit. No physical-device or elapsed reload/crash
recovery claim is made. Required homework stays independent of this activity.


### Issue #26 — native listening speed and volume continuity

Rechecked current issue #26, comments and empty native dependency relationships,
and original pinned word-player:174/word-round:66, word-panel:218 and qso-panel:120
before implementation. Morse-only Words retain their exact ordered/duplicate
items, heard prefix and current item/pause at old timing; both speeds apply to
future items. Post-render native-position checks retry a later boundary if PCM
rendering crossed the first one. A last-item change applies to the next native
loop or deliberate ended replay. Generated QSOs retain the same script/stations
and restart the exact global word occurrence, including repeated tokens and
word/station gaps. Paused stays paused; playing resumes through the same player.
Native rate is retained across replacement. The generic occurrence helper also
accepts authored sentence timelines; the actual Stories mode/corpus is still #30.

The existing PracticeClock settles actual old movement after synchronous WAV
rendering and before replacement. Seeking/remapping supplies no invented time.
Prepared content owns the displayed timeline, source marker and bounded played
configuration evidence; selected unplayed settings are not promoted. Only the
actually playing prefix/tail configuration is recorded. The same native element,
MorsePlayer, version 1 private evidence/outbox, history, reports and portable
backup architecture remain in use. No new entity, Worker binding, configuration,
migration or elapsed-recovery store is introduced. Native and explicit pause,
new material, inspection and disposal revoke stale resume. Previously claimed
Media Session metadata/artwork/transport survive a paused live edit without
stealing another owner; volume does not change material, position or transport.

On native elements supporting JS volume, amplitude uses the native element
without regenerating a track; zero/mute and increased volume stay continuous.
Existing baked WAV volume is retained where the browser reserves volume for
device controls, with visible guidance that app volume applies to a prepared
recording and device controls adjust current playback. This platform constraint
is documented by [Apple's native-media guide](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/Using_HTML5_Audio_Video/Device-SpecificConsiderations/Device-SpecificConsiderations.html).
No new Web Audio routing displaces native playback, and no physical iPhone or
lock-screen behavior is claimed. List, pitch, extra spacing and spoken-mode
changes retain deliberate fresh-round behavior. New recognition/reload recovery
remain excluded. Public access, private account scope and old backups stay intact.

Three new pure timeline cases and five player boundary cases protect duplicate
order/prefix/effective-only edits, exact repeated occurrences/gaps, post-render
veto/settlement, late explicit/native pause/material/disposal, paused platform
transport, volume continuity and actual baked PCM compatibility. Check, all 1,049
tests across 63 files and build pass. The final affected browser set passes four journeys
54.8s: existing applied-configuration/private save/retry/export/history/report
26.4s; native words 11.4s with retained 1.25x rate, exact paused position/metadata,
continuous volume, cancel and saved raw source/global equality; QSO occurrence/
late native acknowledgement/inspection 4.4s; last-item loop/ended replay 8.0s.
Desktop 1440/mobile 390 keyboard/touch states, six settled Axe/overflow summaries
and four retained captures are inspected separately. Emulation is not a device
claim. All 78 final-current browser journeys pass in 15.9 minutes.
Independent review remains the post-commit gate.

Observed failures were inspected through assertions, pixels and retained traces
before correction. Initial fixture errors used a nonexistent QSO label, assumed
Resume below one measured second, and arranged many now-live speed values in the
older applied-only journey, legitimately overflowing its 15-configuration evidence cap.
That journey now pauses while arranging settings; new native journeys own live
editing. A slow preserved PARIS item/pause exceeds a default five-second poll,
so its bound comes from the actual Morse timeline. The new last-item test found
and fixed a real loop bug: native looping emits seeking, so a seek veto prevented
the queued new round. Initial full regression passed 77/78 in 15.9m; its remaining
Axe scan raced review opening animation. Waiting for actual animation completion
preserves every contrast rule; the failed journey then passed in 13.3s. Static review
also caught the old 1x replacement reset; native rate preservation is now verified
in fast and actual browser checks. Final full-current regression follows these
corrections before implementation commit, independent review and production.

Final current-code regression passed all 78 serial browser journeys in 15.9
minutes after those corrections. Six new accessibility/overflow reports are
empty and all four final desktop/mobile captures were inspected. Original
source, protected primary user work and signing configuration remain untouched.

### Issue #26 — explicit rewind correction after independent review

Post-commit independent review found one P2: a playing keyboard word selection
or native scrubber rewind from the last half-second to the first half-second
was mistaken for a native loop. Both real browser probes replaced an 8.192018s
mixed round with an entirely new-speed 3.392018s source, discarding its retained
prefix. The assertions, contexts, pixels and bounded action traces were inspected.

Loop replacement now also requires the native played range to reach the native
recording duration. A rewind cannot establish that tail, while a genuine native
loop can. Every speed replacement prepares a fresh recording, resetting these
ranges. This uses native playback evidence solely to distinguish transport;
PracticeClock remains the accounting owner. It adds no pointer/keyboard guesses,
parallel clock, loop scheduler or private storage. The current [HTML media
standard](https://html.spec.whatwg.org/multipage/media.html#dom-media-played)
defines played ranges from normal monotonic playback; the distinction is verified
through actual browser controls rather than inferred from UI labels alone.

A focused player boundary case covers missing metadata, partial tail, explicit
seek, completed native tail and retired source. The new real-native keyboard/
scrubber regression passes in 4.7s with the mixed source and duration unchanged;
its saved private word time stays above one and below four seconds despite the
near-eight-second position jump. The existing natural-loop/ended replay check
remains part of the affected browser set. Independent corrective-commit recheck
and verified production delivery remain required before accepting this issue.

Corrected-code validation passes check, all 1,050 tests across 63 files and
build. All five affected native/save journeys pass in 1.1 minutes (30.1s
applied/private recovery, 12.0s words, 5.0s QSO, 8.1s genuine loop/ended replay,
4.7s explicit seam rewinds). The complete final-current 79-journey browser
regression also passes; independent corrective-commit recheck follows.

### Issue #26 — independent acceptance and production delivery

Implementation e759a72e22bac093833b81ca64fe37294ff27472 and correction
b1c6cb7c2d223b37b80e56f60f2abc928560ab6c passed fresh independent post-commit
review. The reviewer found the explicit-rewind P2, then independently verified
both keyboard and actual native scrubber corrections with the same 8.192018s
mixed source. Native played endpoints remained below the tail. Its separate
positive loop captured seeking at zero with played [0, 2.585306], followed by
a 1.48s new source continuing playback. No remaining substantive finding exists.

Independent current-code validation passed 170 fast tests across four files and
nine serial browser journeys in 1.3 minutes, including its own mobile repeated-CQ,
touch volume, navigation, injected 503, byte-identical retry/export and natural
loop probes. Ten scoped desktop/mobile accessibility/overflow reports are empty;
six current captures were independently inspected. All ten current delivered
files match committed bytes. Protected primary document hashes and signing
remain intact. Root final check, 1,050 tests/63 files and build passed; all 79
final-current serial browser journeys passed in 16.4 minutes. Native listening
and Runner evidence come from actual media/engine movement.

The complete production deploy passed on its first attempt with no migration.
Version 36f13b1b-ac63-4bba-938e-b363827c7f88 serves the accepted code at
https://cwa.n1rwj.com. Fresh production checks passed health, private 401
responses, four exact asset hashes, unchanged Runner bridge, and the public
calendar's GET/HEAD/304/405, nine stable UIDs and DST recurrence expansion.
Original personal site and protected user work remain unchanged.

No push was attempted. GitHub returned 422 for both local commit lookups, so
#26 remains OPEN pending publication. Accepted local and production behavior
permits the ascending #27 loop under the latest instruction. Unsupported native
JS volume retains baked volume/device-control guidance; no physical-device or
locked-phone claim is made. Actual Stories mode remains #30, with generic
occurrence/sentence-gap mapping covered here. New recognition and unfinished
reload/crash elapsed recovery remain excluded.

### Issue #27 — state-preserving generated listening position controls

Rechecked fresh issue body, comments and empty dependency API, approved scope,
and original pinned word-player.ts:36, word-panel.ts:291 and player.ts:50.
Words, QSOs and free text now select exact global word occurrences without
starting paused audio; playing selection continues in the same native source.
Previous/Next moves item starts while retaining state, and shared Back 10 sec
clamps to zero. Accurate Seek to word labels include occurrence indexes, so
repeated tokens remain distinct. Separately labeled Replay current word and
start playback is deliberate; the existing Play action still resumes normally.
An ended track retains its selected occurrence, and repositioning clears only
the temporary player-complete display. Pure seeking retains a mixed-speed
prefix; the accepted #26 native-tail loop discriminator remains intact.

MorsePlayer settles the existing PracticeClock via a before-seek callback,
before assigning native currentTime. A same-position no-op does not suspend
accounting while waiting for a nonexistent seek event. Metadata applies the
latest pending target; a stale ended flag cannot rewind a valid selected word
when explicitly resumed. Native controls, rate, volume, source, highlighting
and Media Session ownership stay on the same player. Seeking does not promote
an unheard tail configuration. No new clock, private entity, SQL, binding,
configuration, migration, export schema or reload-recovery owner is introduced.
Public tools remain usable without an account; existing account-scoped saves,
queues, old backup validation, history and reports retain ownership.

Two meaningful player cases cover settlement order, no-op/invalid/clamped
inputs, paused/playing retention, duplicate occurrences, pending metadata,
microsecond rounding and ended-selection resume. The three focused player/
timeline/clock files pass 120 tests. Two new native browser journeys pass:
private Words at desktop keyboard/mobile touch through exact seek/step/rewind,
canceled review, deliberate replay and saved raw heard time; public repeated-CQ
and free text through paused selection and explicit replay. The actual metadata
boundary delays source attachment only, then decodes the real Blob and restores
the latest selected occurrence. No media event, elapsed time or played range is
forged. Native ended/reposition/replay also passes. Six settled desktop/mobile
accessibility/overflow reports are empty; four captures have been inspected.

The complete affected set passes twelve journeys in 1.9 minutes: new Words
10.0s/public QSO+Free 6.1s, applied private evidence/retry/export/history/report
26.3s, the four accepted live-retiming/seam journeys, existing preferences/
manual timer/native transcript and both prerecorded-answer widths. Existing
spoken selection now uses explicit replay after the pure seek; no recognition
subsystem expansion is introduced. The Stories frontend/corpus remains #30,
using the same reusable transcript/player controls when introduced. Physical
locked-device behavior remains unverified and elapsed reload/crash recovery
is excluded. Full final regression and fresh post-commit independent review
remain required subsequent gates.

Final current-code regression: all 81 serial browser journeys pass in 16.2
minutes, including real native listening, save recovery and Runner results.
Final six scoped seek accessibility/overflow reports remain empty and all four
final desktop/mobile captures were re-inspected. Required check, 1,052 tests
across 63 files and build pass. Fresh independent review follows the focused
implementation commit; this result does not yet declare that gate accepted.

### Issue #27 accepted review and production delivery

Fresh post-commit independent review ACCEPTS implementation
d4745cb716092e271c7fca669498bfe31242a792 with no substantive scoped findings.
It authored three actual student workflows and adapted two independent mixed
prefix seam probes, then passed seven serial journeys in 41.2 seconds and
172 fast tests across four files. Fourteen scoped accessibility/overflow checks
are empty; six independent captures were viewed. Keyboard/touch seeks, item
steps, relative rewind, intentional replay, actual metadata/end boundaries,
inspection cancellation and late native Play acknowledgement all pass. Private
measured time was 1.723396 seconds despite an 8.192-second seek target; a 503
retry sent identical bodies, export retained evidence, and guest private access
returned 401. All twelve committed files, four original pinned references,
protected primary hashes and signing remain intact. No product fix was required.
The reviewer corrected its guest navigation fixture after inspecting assertion,
context, pixels and bounded trace; all final probes passed.

Root required check, 1,052 tests/63 files and build pass; full final 81 serial
browser journeys pass in 16.2 minutes. The initial deploy passed validation and
dry-run but remote D1 returned API 7403 before publication. A complete task
retry succeeded with no migration. Production version
fa5b7aed-7d0d-41d8-b266-7bb2f253ff3d at https://cwa.n1rwj.com serves four
exact asset hashes and unchanged Runner bridge; home/health 200 and private
entries/account-state/backup 401 pass. Public calendar GET/HEAD/304/405, nine
stable UIDs and DST recurrence expansion match the shared schedule.

No push was attempted. GitHub commit lookup returned 422, so #27 remains OPEN
pending publication under the latest instruction. Accepted local/production
behavior permits the ascending #28 loop. Stories frontend remains #30; physical
locked-device behavior is unverified. New recognition and unfinished elapsed
reload/crash recovery remain excluded. Original personal site is unchanged.

### Issue #28 accepted repeated native rounds

Morse-only Repeat now prepares a fresh validated source round at actual native
end, with independent Shuffle order, duplicate/prosign occurrences and VVV
first for common-QSO words. Shuffle/Repeat edits retain current playback.
Preparation retry retains earned time; pause, inspection and source/tool changes
cancel late continuation. Native rate/volume and actual heard source accounting
remain owned by the existing player/clock. Two independent P2 findings were
fixed: supported native-volume replacement and immediate initial Shuffle/Enter
source ownership. Eleven independently authored probes accept final 48f01ff3;
twelve desktop/mobile accessibility reports are empty. Private heard
9.231473 seconds matches observed 9.231456 seconds, with exact 503 retry,
history/report/export and guest isolation. Full 83 serial browser journeys pass
in 16.7 minutes; check, 1,055 tests/63 files and build pass.

Production ff50292e-4f8f-43b9-be81-10e5a212d1e4 serves exact frontend and
Runner hashes; home/health 200, private APIs 401 and public calendar protocol/
UID/DST checks pass. No migration/config/binding change. No push was attempted;
GitHub main remains accepted #27, and #28 stays OPEN pending publication.
Editable retained custom lists remain #29; Stories #30; broader preferences #31.
Physical locked-device behavior remains unverified. The approved exclusions and
read-only original site are preserved. Full evidence is in the listening ledger.

### Issue #29 accepted private editable words

Implementation `161cf890a669083e1b2446eba22a90e9edbfd0e7` delivers validated
account/Guest device word sources, original-order Edit this list, paused content
restoration, scoped clear/retry and reviewed portable device backups. Both
catalogs remain public and unchanged; raw source is included only in explicit
private device downloads. Existing actual played configurations, private history,
reports and account exports keep descriptive evidence without source text.

Check, 1,063 tests/64 files and build pass. Fourteen affected browser journeys and
six root desktop/mobile accessibility reports pass. The first full regression
passed 84/85 and timed out in a later mobile Runner start; the unchanged isolated
journey passed, then all 85 passed in 17.1 minutes. The cause remains unconfirmed;
assertion/context/pixels/bounded trace are retained and no native time, timeout or
authentication limit was weakened.

The fresh independent post-commit reviewer ACCEPTED the implementation with no
substantive findings: eight authored desktop/mobile/keyboard/touch workflows,
59 focused tests and ten empty accessibility/overflow reports. It verified both
catalog clones, source validation, failed retention/clear retry, unreadable record
protection, Guest/two-account isolation, genuine cross-tab same-token mutation
completion, actual download/file choice/cancel/collision/old-v1 restore and native
shuffled duplicate/prosign cancellation. Saved native seconds 1.624486 match its
independent observation 1.624534 within 48 microseconds. Unplayed edits add no
source facts; exact 503 retries, history/report/export and outsider 401 pass.

Strict production deployment `aa786621-0c95-4832-870d-5a3f247e4453` succeeded after
one full-task retry for Cloudflare D1 API error 7403; no migrations were needed.
The first asset probe mismatched; subsequent headers/bytes and complete recheck
match all four built assets and the unchanged Runner bridge. Home/health return
200, private endpoints 401. The public calendar's exact shared body, nine unique
UIDs, sequence, DST recurrence and GET/HEAD/304/405/no-cookie policy pass.

Only validated readback-confirmed source survives reload; invalid/unacknowledged
drafts remain current-scope in-app work. Physical locked-device behavior remains
unverified. Stories, precise per-mode setups and exact recipes remain #30/#31/#45.
No push was attempted; local main is advanced and #29 remains open pending
GitHub publication. The original site and approved exclusions remain unchanged.

### Issue #30 authored Stories listening

The three fictional public stories from the pinned original catalog are now
reachable through Stories without an account: The trail marker, The quiet band
and A light across the lake. All 5/12/13 sentences preserve original text and
catalog identity; restricted curriculum remains linked separately. Shared
native generation uses one narrator tone, two-second sentence handoffs and no
trailing handoff. No station generation, QSO copy form or on-air contact credit
is attached to Stories.

Stories uses the existing player, exact occurrence timeline, speed retiming,
transcript, pause/seek/cancellation and Media Session title/artwork owners.
Sentence steps and exact repeated-word seeks preserve playing/paused state;
Back 10 sec is relative, and Reset story to beginning explicitly prepares a
paused restart. Inspection/Return retains native position without autoplay.
Independent version 1 Story selection, both speeds, narrator tone and text
visibility survive mode return/reload through the existing device preference
writer. Current storage refusal remains visible while controls stay usable.
Playback summaries and manual-log defaults use the active Story sound setup.
Old shared defaults remain unchanged; broader precise settings are issue #31.

Actually played Story identity/settings join strict shared evidence validation,
private account-scoped SQL, frozen retries, readable history/printable reports
and account export/import. Selected unplayed stories add no source evidence.
Native media movement supplies time; navigation, seeks, reset and reload add
none. Optional Story settings join the existing reviewed device backup/restore/
clear inventory. Old version 1 backups omitting them remain valid; malformed
nested fields fail before installation. No new binding, migration, clock,
player, queue or private script storage was introduced.

Catalog/timing/occurrence/bounds tests, preference migration/roundtrip tests,
strict evidence and Worker real-SQL/idempotence/export/import/isolation tests
pass. Check, all 1,072 tests across 65 files and build pass. Seventeen affected
serial native-listening/device journeys pass in 2.4 minutes. Six Stories
accessibility/overflow reports are empty; desktop 1440 and mobile 390 screenshots
were inspected. The guest journey plays all three actual native tracks, checks
metadata, paused/playing retiming, exact words/sentences, return/reload, storage
feedback, the 20-minute limit and faster recovery. The signed-in journey checks
native time, canceled review, simultaneous 503/local-storage refusal and identical
retry, actual history/report/export UI and outsider 401.

Root source inspection then corrected manual-log initial speeds to the active
Story setup. The first full suite was deliberately interrupted after 15 passes
(3.6 minutes), with one interrupted journey and 71 unrun; this is not a full
validation result. Final Stories guest/private journeys pass again in 20.5
seconds, including mobile manual-log initialization and cancel. The standalone
legacy-import regression caught a missing explicit .ts import extension; it
was corrected without changing the migration command or source records.
Full regression, fresh independent post-commit review and deployment remain
pending; acceptance is not yet declared. Exact public recipes remain #45.
Physical locked-device playback is unverified. New recognition, elapsed-time
reload/crash recovery and real-contact/ADIF tooling remain excluded.

Root final full regression passes all 87 serial browser journeys in 17.3
minutes on final code, including actual Stories and existing Copy/Runner/
account/device workflows. The earlier deliberately interrupted run remains
recorded above. Six final Stories accessibility/overflow reports remain empty.
Fresh independent post-commit review and deployment remain pending.

### Issue #30 independent acceptance and production

Fresh post-implementation review ACCEPTS `3e12fae1` with no substantive findings.
Five independently authored serial desktop/mobile keyboard/touch journeys,
290 focused tests across six files and twelve empty accessibility/overflow
reports pass. All 30 sentences match the pinned public catalog. Actual narrator
PCM measured 624.75 Hz at selected 625 Hz; exact occurrence/relative rewind/
replay/sentence controls, latest Play, cancellation, inspection, true native
ended/replay and retained independent settings pass. Private raw heard time
3.703308 seconds versus independently observed 3.703359 differs by 51 microseconds.
Unplayed selections add no facts. Simultaneous 503/local queue-storage refusal,
identical retries, actual history/report/account export, Guest/two-account draft
isolation, zero-time notes and reviewed actual old/new device files all pass.
Reviewer failure evidence identifies only ignored probe assumptions and the
existing 60-second email cooldown; no implementation/authentication/clock change
was needed. Every reviewer process closed and its exclusive lease was released.

Root check, 1,072 tests/65 files, build and 87 serial browser journeys pass.
Strict `mise run deploy` succeeds on the first attempt, including dry-run and
remote D1 check with no pending migrations. Production version
`6511d995-2bcd-4507-bfa8-220c34f0b099` at https://cwa.n1rwj.com serves four exact
built asset hashes and the unchanged Runner bridge. Home/health return 200;
private entries/account-state/backup return 401 without authentication. Public
calendar matches the shared body and independent DST recurrence expansion:
nine distinct stable UIDs, sequence 1, GET/HEAD 200, conditional 304, other
methods 405 and no cookie issuance.

No push was attempted. Fresh GitHub main remains accepted #27 (`7e4d66b2`);
the #30 implementation lookup returns 422. Issue #30 remains OPEN until accepted
source is published. The local implementation and production behavior have
passed the review gate, permitting ascending issue #31. Exact public recipes
remain #45; physical locked-device behavior is unverified. Approved exclusions
and the read-only original site are preserved. This acceptance journal changes
no runtime, binding or configuration.


### Issue #31 precise independent listening settings

Words, QSO and Stories now retain independent character/effective speeds and
pitch in version 2 device preferences. Words/free keep their compatible base
sound fields; QSO owns a nested setup, and the existing independent Story setup
is preserved. Legacy shared values initialize QSO without losing either speed,
including 5–9 character and 3–4 effective WPM. Word pause, shuffle, repeat and
spoken-answer choices remain word-specific. Public volume stays shared. The
original QSO/Story writer's effective-speed omission is not reproduced.

Recognizable presets retain exact custom selections beside numeric/slider entry
through 60 WPM. Effective speed cannot exceed character speed. Pitch accepts
300–1000 Hz in 1 Hz steps, and extra word pause accepts 0–5 seconds in 0.1-second
steps. Reusable controls keep drag previews local and disclose the active value;
native release/keyboard change applies once. Numeric Enter/blur commits valid
values; invalid drafts leave applied settings untouched, and Escape/pointer
cancellation restores the control. Slider and numeric targets are at least
44 pixels high. Existing live speed retiming preserves native playing/paused
state and occurrence; committed pitch/extra pause starts a fresh paused round.
Native volume remains continuous without timing regeneration.

Preferences use the existing device writer and lifecycle fences. Storage refusal
keeps current controls usable, displays an unsaved notice even when Sound settings
is collapsed, and offers explicit Retry without replacing/pausing native audio.
Old device inventory files remain compatible; new optional mode setups are
strictly validated and restore only through shared-preference opt-in. No clock,
player, database migration, binding or private-data owner is added.

Exact actually played 55/60 WPM facts pass shared validation, private real-SQL
writes, transactional import and account export. Native browser playback reaches
canceled review, identical failed-upload retry, history, report and actual backup
download; outsiders receive 401. Selected unplayed values add no facts. The guest
journey verifies low-speed migration, three distinct setups, custom 51 selection,
55/60 selection, reload, drag preview/release/Escape, invalid entry, precise pitch/
pause, keyboard/touch and preference refusal/retry. Desktop 1440/mobile 390
screenshots were inspected and six accessibility/overflow reports are empty.

Check, all 1,076 tests across 65 files and build pass. The first full regression
was deliberately stopped after a legacy fixture expected 16 pitch arrows to add
400 Hz; the correct 1 Hz control reached 316 Hz. That run has 22 passes, one
failure, one interrupted journey and 65 unrun, not a full validation result.
The fixture now enters its intended 700 Hz through the exact field. Five affected
device/precision journeys pass in 29 seconds, then all 89 serial browser journeys
pass in 17.3 minutes. The final collapsed-warning/explicit-retry refinement
passes both precise journeys again in 19.2 seconds, with check/test/build passing.
Earlier probe failures were inspected through assertions, context, pixels and
bounded traces; they assumed open settings after tool switch, a Resume label,
and modal failure instead of a successful durable local queue. They are retained
in ignored evidence, with no authentication or audio-clock workaround.

Fresh independent post-commit review and production deployment remain pending;
acceptance is not yet declared. Distinct bounded QSO station pitches remain #32,
and exact public recipes remain #45. Physical locked-device playback is
unverified. New recognition, reload/crash elapsed-time recovery and real-contact/
ADIF tools remain excluded. The original site remains read-only.


### Issue #31 independent acceptance and production delivery

Implementation `1b0c3a923b67afcfc78d34ad46f365c278e2208c` is independently
ACCEPTED with no substantive findings. Seven independently authored browser
journeys cover desktop 1440/mobile 390, native touch dragging and keyboard
operation, invalid/canceled drafts, separate mode migration and reload,
preference refusal/explicit retry, failed-save ownership, actual old/new device
files and exact private upload retry. Two real synthetic accounts isolate their
saved entries and exports. Actual QSO/Story native playback reaches guest-device
evidence with exact independent settings. The reviewer ran 265 focused tests;
six accessibility/overflow reports are clear and six screenshots were inspected.

Independently observed native time is 3.535612 seconds; saved raw time is
3.535528 seconds, a difference of 84 microseconds. Emitted PCM measures
616.934202 Hz for selected 617 Hz. The reviewer inspected and corrected probe
assumptions about the export endpoint, the existing one-second save threshold,
and navigation after a successful save. No application correction was required.
All reviewer processes ended and the exclusive port 8791 lease was released.
Root validation remains 1,076 tests/65 files and 89 full browser journeys before
the final collapsed-warning/retry refinement, followed by both precise journeys
on that final refinement and passing check/test/build.

Strict production deployment initially passed check/test/build/dry-run then
failed at the remote D1 check with Cloudflare API 7403. The full strict retry
passed every stage, found no pending migrations, and deployed version
`295f8309-115a-49f5-9603-c01f3d45ebd4` to https://cwa.n1rwj.com. Exact hashes of
four production assets and the Runner bridge match the accepted build; home and
health return 200 and private entries/account/lifecycle endpoints return 401.
Public calendar GET/HEAD/304/405, nine unique UIDs, exact shared body, sequence 1,
DST recurrence and no-cookie checks pass. No binding/configuration changed.

No push was attempted. Fresh GitHub main remains accepted #27 (`7e4d66b2`), so
#31 remains OPEN pending accepted source publication. The local implementation,
independent review and production gate permit ascending issue #32. Distinct
bounded QSO station tones remain #32, exact public recipes #45, and physical
locked-device playback remains unverified. The original site is read-only;
approved exclusions and restricted curriculum links remain intact.


### Issue #32 distinct bounded QSO station pitches

One pitch-pair policy now keeps station 1 at the learner's preferred 300–1000 Hz
pitch and station 2 exactly 50 Hz higher through 950 Hz, or 50 Hz lower above
950 Hz. The five acceptance boundaries produce 300/350, 450/500, 950/1000,
975/925 and 1000/950 Hz. The shared QSO builder derives native track frequencies
from the same frozen summary used for actual played evidence. Every authored
transmission alternates the same station mapping; replay, seek and speed retiming
reuse the existing native transport and same exchange. Words and Stories remain
single-tone modes with their independent preferred pitches.

The UI explains the actual pair and upper-bound direction, and shows the current
station beside a revealed transmission. Hidden transcript/Check your copy uses
Station 1/Station 2 labels, preserving explicit answer reveal. Private evidence,
history/report and exports retain actual tones; old valid equal-pitch facts are
still readable and importable without being rewritten under the new policy.
Real-SQL tests cover new/historical pairs, transactional invalid-pitch rejection,
account isolation and exact export/import. No binding, schema, clock or player
owner is introduced. Original fixed 450/500 Hz behavior and visible-station
reference at pinned 3106c9b8 were rechecked read-only.

Boundary tests exercise every generated scenario and occurrence mapping through
retiming. Rendered PCM tests independently measure both frequency bands at all
five boundaries, soft tone edges and silent two-second handoffs. The affected
browser journeys pass 3/3 in 41.8 seconds: public native upper-bound feedback,
seek/replay/retime with actual emitted PCM, private canceled-review/exact 503 retry
through report/export, and copy-answer privacy. Actual 1000/950 Hz bands remain
after retiming. Desktop 1440/mobile 390 screenshots were inspected; two new
Axe/overflow reports are empty. An initial probe fetched a blob under the app's
content policy; it now observes emitted WAV blobs without bypassing CSP. A later
probe expected Start instead of the correct retained-practice Resume label.
Both failures were inspected through assertions, contexts, pixels and bounded
traces; neither required an application workaround.

Check, all 1,092 tests across 65 files and production build pass. All 90 serial
browser journeys pass in 17.5 minutes; the harness has exited and port 8791 is
free. Current original HEAD c2bef7af and the pin both retain the fixed 450/500 Hz
pair and visible station description. Fresh independent post-commit review and
strict production delivery remain pending. Physical listening and locked-device behavior
remain unverified. Restricted curriculum stays linked and the original site
remains read-only; approved scope/exclusions are preserved.


### Issue #32 independent acceptance and production delivery

Implementation `8feae9144ffa39e5edd50969bec9731e115ff848` is independently
ACCEPTED with no substantive findings. Six independently authored spectral and
continuity probes verify every bounded pair and all four retimed scenarios;
230 focused production tests pass. Two independent serial browser journeys
pass in 24.5 seconds at desktop 1440/mobile 390 with keyboard and touch. Actual
emitted PCM, paused seek, playing retime, replay, answer privacy, canceled review,
identical 503 retry, history/report and actual download/file import all pass.
Two synthetic accounts isolate saved records; anonymous export is 401 and
cross-account edit is 404. Five independent Axe/overflow reports are empty;
eight final captures were visually inspected.

Capture-level observation of trusted native playing intervals totals 2.854423
seconds; saved hearing is 2.854191 seconds, a 232-microsecond difference. Probe
startup, account-label and listener-attachment errors were inspected and fixed
only in ignored reviewer code; no application correction, fake clock or event
was used. All nine changed files match the reviewed commit. Reviewer runtime
processes closed and the exclusive port 8791 lease was explicitly released.
Root validation remains check, all 1,092 tests/65 files, build and all 90 serial
browser journeys in 17.5 minutes, including the three affected journeys.

The strict production task passed check/test/build/dry-run/remote D1/deploy with
no pending migrations and deployed version
`b3e829aa-6607-43be-9435-7d6e02b329fb` to https://cwa.n1rwj.com. Exact hashes of
four production assets and the Runner bridge match the accepted build. Home and
health are 200; private entries/account/lifecycle endpoints are 401. Public
calendar GET/HEAD/304/405, nine unique UIDs, sequence 1, exact shared body, DST
recurrence and no-cookie checks pass. No configuration or binding changed.

No push was attempted. Fresh GitHub main remains accepted #27 (`7e4d66b2`), so
#32 remains OPEN pending accepted source publication. The local implementation,
independent review and production gate permit ascending issue #33. Physical
listening and locked-device behavior remain unverified. Exact public recipes
remain #45. Restricted curriculum remains linked; approved exclusions and the
read-only original site are preserved.


### Issue #33 native performance and structured CWT observations

The common practice form now supports optional Very good/Good/Fair/Poor ratings
for manual, assigned, measured, Copy and Runner practice. A blank rating remains
unrated; accuracy and imported difficulty never select one. Explicit CWT event
selection on on-air practice exposes callsigns/exchanges heard, callsigns/names
worked and report comments, each bounded at 4,000 characters with null/unknown
field rejection. Monitoring needs no contact count; blank stays unknown and 0
remains explicit. The existing generic count is the single count owner.

Versioned `assessment` metadata identifies the learner as the source. Shared
browser/Worker validation checks its exact enum/envelope and source/category;
new assessed generated/recorded practice cannot add contact counts or CWT
observations. Older queued generic count bodies remain exactly uploadable and
always retain their historical classification, without actual contact credit. Native simulator counts are explicitly simulated. Old valid count
facts still import and export unchanged, with non-on-air counts labeled historical
rather than credited as actual contacts. Original rating/difficulty/CWT archives
remain separate and are never automatically promoted into native assessments.

Existing form, Runner review retention and completed-result queue owners handle
new fields. Time correction preserves judgments while raw measurements stay
immutable. History and the generic report show readable observations, learner
provenance, record ID/date and separate CWT report comments. Typed report evidence
excludes private notes; configurable advisor suggestions/drafts remain #36–#40.
No new player, clock, entity, binding, schema or operating/ADIF tool is introduced.
Pinned original types/CWT model/report enum and Worker source, plus current HEAD,
were inspected read-only; original source/category rules inform this public model.

Nine affected serial browser journeys pass in 2.2 minutes: desktop keyboard/mobile
touch manual monitoring/create/edit/cancel/503 retry, unknown/zero count, report,
actual downloaded backup deletion/file restore, guest actual native QSO rating
without private upload or contact fields, declared correction, assigned CWT
queued exact retry and retained real AudioWorklet Runner ratings. Eight new
Axe/overflow reports are empty; desktop 1440/mobile 390 captures were inspected.
Initial native-select probes were inspected through assertions, contexts, pixels
and bounded traces; keyboard typeahead selects the rating without submitting the
form. Failed probes are retained in ignored evidence; no application or timing
workaround was introduced.

Initial focused domain/real-SQL suite passes 249 tests. Complete regression,
post-commit independent review and production deployment are still pending;
acceptance is not yet declared. Physical-device behavior remains unverified.
The original site and protected planning files remain read-only. Restricted
curriculum stays linked; approved exclusions and no-push policy remain intact.

A source-level compatibility check found that an initial strict count guard would
reject older valid queued generic-count bodies. The first full browser run was
explicitly interrupted after 14 passes (one interrupted, 77 unrun; 2.4 minutes),
not counted as complete validation. The guard now applies to new typed assessments;
older exact requests retain their historical counts and have no actual-contact
credit. A real-SQL test submits an unchanged older body twice and checks exact
receipt equality. No old pending body is rewritten or given a new assessment.

The corrected full serial browser suite passes all 92 journeys in 17.6 minutes,
including the final assessment, native Copy/Runner, assigned CWT and old recovery
interfaces. Check, all 1,127 tests across 66 files and build pass after the count
compatibility correction. The full browser process exited successfully and its
port 8791 lease is released. This is browser emulation, not physical-device
verification. Independent post-commit acceptance and production are still pending.

The independent reviewer confirmed R33-1 (P2): an original Runner archive could
be relabeled on-air and gain new CWT observations/actual-contact count wording.
The correction classifies known original Runner/audio/LCWO results, generated
task identities and retained historical recording provenance as synthetic source
facts regardless of the editable activity. New CWT claims and changed assessed
counts are rejected; rating-only edits, original archives and unchanged old
queued bodies remain valid. Genuine historical CWT stays usable without inferred
ratings. Fourteen cheap source cases, an atomic real-SQL edit/import boundary and
the existing desktop/mobile monitoring journey protect this correction.
Focused correction validation passes 203 domain/API tests and both assessment
browser journeys (16 seconds). An initial new-state Axe probe caught the modal
appearance animation; assertion/context/pixels/bounded traces were inspected and
retained, and the probe now awaits actual animation completion with contrast
checks enabled. Complete final regression and independent correction acceptance
remain pending; no deployment is claimed yet.

Final correction check, all 1,143 tests across 66 files and build pass. The final
full browser suite initially passed 91/92 (16.9 minutes): the unchanged course
replay's extra pass remained incomplete, with the UI withholding full-pass credit.
Assertions, context, pixels and bounded action traces were inspected and retained.
That unchanged journey passes in isolation (1.3 minutes), and an unchanged full
retry passes all 92 journeys (17.7 minutes). The earlier cause remains unconfirmed;
no native clock, coverage tolerance, result or player workaround was introduced.
Both final assessment journeys include the archive-source restriction. Browser
processes have exited and port 8791 is free. Independent correction acceptance and
production delivery remain pending.


## Issue #33 accepted delivery — October 2, 2026

Implementation `422714f4d7a9d06006f05b08c21fe021816e3730` and correction
`309e0b0b2b9fe4efcce5c76c211ad2be08eb042c` deliver explicit learner performance
ratings and structured CWT observations through create/edit, retained reviews,
exact failed-save retries, history, report evidence and private backup restore.
Blank counts remain unknown and zero remains explicit. Raw Copy, audio and Runner
measurements remain separate from learner judgments. Archived simulator/recording
provenance cannot acquire new actual on-air claims through activity edits; valid
old exact bodies, archives and genuine original CWT remain compatible.

Post-commit independent review ACCEPTS the final tree and closes R33-1 after five
own desktop keyboard/mobile emulated-touch journeys, 270 focused tests in five
files and 14 clear Axe/overflow reports. It independently exercises actual file
restore, account isolation, direct and queued503 exact retry, cancellation,
archived sources and genuine CWT. Accepted Runner raw time is unchanged at
2.8908843537414963 seconds; guest generated audio uses actual native movement.
No substantive finding remains. Root check, all 1,143 tests/66 files, build and
final complete serial92 browser gate (17.7 minutes) pass. The earlier unchanged
course-replay incomplete-pass failure and successful isolated/full retries remain
recorded above; its cause is unconfirmed and no native-clock/player workaround
was made. Browser emulation does not establish physical-device/lock-screen use.

The complete deploy task stopped before upload on D1 API7403, then passed on one
full retry with no pending migrations. Production version
`57aeb792-3779-4cf1-a075-374f52153f93` at https://cwa.n1rwj.com serves exact built
JS/CSS and public Runner-module hashes. Fresh root/health200, private entries,
account-state and backup401 checks pass. Public calendar GET/HEAD200,
conditional304, POST405, nine unique recurring events and DST expansion match the
shared source exactly, without account cookies. No bindings/config/schema changed.
Local main contains the accepted commits; no push or PR was attempted. Issue #33
remains open pending source publication on GitHub. Original personal-site evidence
and protected planning files remain read-only. External measurements/actual manual
completion timestamps (#34) and optional LCWO linking (#35) remain later work.


## Issue #34 implementation checkpoint — October 2, 2026

Fresh issue body/comments and documented dependencies #1/#15 were rechecked.
Their delivered validators, immutable native results, actual Runner attribution
and backup boundaries remain exercised by domain/real-SQL and browser regressions.
Pinned/current original LCWO form, Worker result validation, result types, manual
completion handler and history source were inspected read-only. Public capture
uses the learner's IANA zone and retains broader existing duration bounds rather
than reproducing original browser-zone/fixed-owner defaults.

Optional letter/figure/custom-Koch groups capture actual effective speed, length
and error percentage. Words capture own trainer speed, maximum length, error
count and score; callsigns omit unrelated fields. Field applicability and limits
are shared between the common form and Worker/import validator. Blank is unknown;
zero is explicit. Source-specific speeds up to200 WPM stay external facts without
being mislabeled native Copy/generic character speed. Manual Runner records mode,
actual duration, optional starting/used speeds, verified points, score and
simulated contacts. It never fabricates an acknowledged engine result or timeline.
Changing trainer explicitly clears entered metrics. Native Copy measurements
cannot be removed in a historical edit to substitute manual evidence.

Optional actual local completion captures its IANA zone/explicit repeated-hour
occurrence, derives start from entered duration and assigns the start's local
practice date. Nonexistent times and future completion show actionable errors;
ambiguous times require an explicit earlier/later choice. Date-only history stays
unknown, and record creation/upload time is separate. Captured zones survive
profile changes and exact retries. Shared civil-time candidate logic preserves
the existing class schedule's earlier-fold contract. Phone timestamp/zone fields
have full width. Review/history/report reuse the existing evidence inspector;
Copy and imported archive readers remain intact. Private portable backup and
Worker account/generation boundaries carry the optional envelopes.

Initial focused domain/real-SQL regression passes349 tests in five files.
Two new serial browser journeys pass17.6 seconds: all five LCWO families through
create/edit/history/report, midnight with a different browser zone, keyboard
selection, mobile touch, direct503 edit retry, manual Runner spring-gap and
explicit fold choice, frozen queued503 exact retry and canceled edit. Eighteen
distinct Axe/overflow reports are clear; desktop/mobile captures were inspected.
Initial fixture failures (Copy seed/date, settings revision header and helper-text
label match) and native-select probe failure were inspected and retained. Native
keyboard typeahead works; the mobile timezone field was widened from an inspected
cramped capture. No production limit, validation or timing workaround was made.

Final complete regressions, post-commit independent acceptance and production
remain pending. No schema/config/binding changed. Original/protected planning
sources remain read-only; no push is authorized. Optional live LCWO linking (#35)
and advisor suggestions/drafts (#36–#40) remain later work. Browser emulation
does not establish physical-device or lock-screen behavior.


The complete UI check also exposed a label-name collision in class logging: the
completion helper contained “Time practiced.” Explicit short control names with
linked descriptions fix that accessibility/query boundary without changing the
existing class test. The first full94 gate was deliberately interrupted after
nine passes/one failure; it is not complete validation. Failure assertion,
context, pixels and bounded trace are retained. Two later extended-test probe
failures (desktop menu absence and return-to-Today navigation) were inspected and
corrected without changing application timing or weakening checks.

Assigned external-tool reviews can also capture LCWO metrics while preserving
immutable measured timer/recall facts. The shared inspector shows both sources.
Manual completion timestamps cannot replace a native timer; manually entered
Runner runtime belongs to Log practice, separate from an assigned measured block.
The existing external continuity journey now checks cancel, actual save/edit,
score zero, raw12-second retention, evidence readability and fresh-owner restart.
Class schedule/new external/source continuity representative checks pass, including
the final isolated extended journey (8.6 seconds). The focused domain/real-SQL
suite passes245 tests after this addition; final full regression is next.


The next full gate was interrupted after fifteen passes and a native Copy fixture
failure. The API correctly refused replacement of a saved attempt's raw facts.
The historical comparison test now arranges distinct attempts with fresh IDs,
including its v1 score fixture. Both retained failure contexts, screenshots and
bounded traces were inspected; a focused retry passes (one journey,8.4 seconds).
The two new external journeys also pass with distinct synthetic network addresses.
All1232 fast tests in67 files, check and build passed before these fixture changes;
the final strict check/test/build and full94 browser gate will now run serially.
Independent post-commit review and production delivery remain pending.


Final root validation passes check, all1232 tests in67 files and production build.
The complete serial browser gate passes all94 journeys in18.4 minutes (actual
process exit0), including Copy historical scoring, all new external forms,
assigned external timer retention, native Runner/audio, privacy and file backups.
The issue body/comments were rechecked immediately before commit and are unchanged.
Independent review and production delivery remain pending; no push was attempted.


## Issue #34 accepted delivery — October 2, 2026

Implementation `fd4cc61aabf34226764bc2a54946675a069824da` is independently
accepted with no substantive findings. The separate reviewer exercised four own
browser journeys: all LCWO families, source switching/cancel, learner-zone
midnight/DST/future errors, direct503 edit retry, exact queued retry after profile
zone change, actual backup download/file merge, readable reports, real native
AudioWorklet Runner and assigned timer protection. Native Runner facts remained
unchanged and manual replacement was rejected400. Assigned timer raw12 seconds
(including2 recall seconds) remained intact with custom/Koch LCWO metrics.
Eighteen settled Axe/overflow checks were clear; four captures were inspected.
The reviewer independently passed350 focused tests in five files and verified
all501 tracked files against the commit. Its initial ignored server-cwd setup
failure was corrected without application changes. Actual processes exited and
the exclusive runtime lease was explicitly released with port8791 free.

Root check/all1232 tests in67 files/build and all94 serial browser journeys pass
(18.4 minutes), with earlier interrupted/failed fixtures retained above. Strict
`mise run deploy` passes every prerequisite, dry run, no-pending D1 migrations and
production upload without a bypass or retry. Production version is
`e5f5a9ef-645e-4604-988b-44cfbe2ffabf` at https://cwa.n1rwj.com. Fresh production
verification confirms entry-point JS/CSS and public Runner module hashes match
the exact build, root/health200, private history/account-state/backup401, and the
nine-event public calendar's exact body/DST recurrence/GET/HEAD200/304/405 contract.
No signed-in production data was created for these checks.

Local main includes the focused implementation; push signing remains enabled.
No push is authorized or attempted. GitHub main still resolves to signed
`7e4d66b22f950a6bc063412ffd68c5ee054f6dd9`, so issue34 remains open pending source
publication despite accepted production delivery. Optional live LCWO sync is
issue35; manual evidence does not claim native acknowledgment or on-air contacts.
No restricted curriculum, original trainer mutation, physical-device verification,
new spoken recognition or crash/reload elapsed recovery is claimed.


## Issue #35 implementation and root evidence — October 2, 2026

Optional LCWO linking is reachable in Account and remains independent of public
practice and native Copy assignments. The learner reviews explicit consent,
provides credentials for one request, sees verified canonical identity (numeric
UID remains unknown for empty exports), category counts and last successful
refresh, and can explicitly refresh or disconnect. Password inputs clear on
submit/cancel/unmount; credentials and PHP cookies never enter private storage,
queues, URLs, exports or error messages. Cancellation reports an uncertain
outcome and reloads retained facts rather than promising rollback.

Current primary service source is `3d0b25b539c18fe24c23601f3b3579428858148f`
at [LCWO's canonical repository](https://git.fkurz.net/dj1yfk/lcwo), discovered
through its official imprint. Authenticated export headers verify canonical
username even for empty arrays; consistent row UID establishes numeric identity.
All four result tables use MySQL TIMESTAMP; current server retrieval is UTC,
including older stored instants. See the [administrator's UTC explanation](https://lcwo.net/forum/3503)
and [TIMESTAMP conversion documentation](https://dev.mysql.com/doc/refman/8.4/en/datetime.html).
Original pinned/current transport, result types, accounting and sync references
were independently rechecked byte-identical; the personal site remains read-only.

The Worker pins LCWO origin, refuses redirects and unsafe session forwarding,
bounds streamed login/export bytes and rows, times out each request, validates
all categories before mutation, and atomically retains source IDs/timestamps and
category measurements under user/revision/generation guards. Empty/missing
upstream rows never delete retained results. Different identities and changed
facts for an existing source ID fail explicitly. Migration 0008 includes quota,
history-revision and deletion-cascade triggers. Reset/replacement clears source
history; export/import retains allowed facts/preferences with an inactive link.

Practice log exposes read-only source completion in the learner's timezone,
character/effective versus maximum achieved speed, stored accuracy versus
displayed errors, per-run scores, lesson/competitive status, known zero and
unknown metrics/duration. Reports include all source families without combining
unrelated scores. An explicit 0–300 second group assumption defaults to disabled.
Only groups can contribute extra estimates. Full saved-history intervals,
matching manual results, same-day blocks with unknown actual timestamps and
historical source IDs suppress duplicate credit; class/zero/unrelated blocks do
not. Derived estimates are read-only and cannot become practice API entries or
assignment completion. Today, chart and log totals label estimated contributions.

Root typecheck and generated bindings pass; the focused suite passes 239 tests.
Two real-Wrangler/D1 browser journeys pass in 15.4 seconds, covering desktop keyboard
consent/link/refresh/inspection, mobile cancel/partial-failure/retry/disconnect,
actual backup download/file merge, source dates, report estimate suppression,
readable statuses and focus restoration. Distinct consent/history/report/status
screens have zero Axe violations or horizontal overflow at 1440 and 390 pixels;
desktop/mobile history captures were inspected. The harness substitutes only
synthetic current-shape LCWO upstream responses; production keeps its real entry
point. This is fixture verification, not an authenticated live-service test or
physical-device verification. Earlier failed probe labels, disabled-control races
and cancellation assumptions were inspected with pixels/context/bounded traces
and retained in ignored evidence. Full root checks, independent review and
production deployment remain pending. No push is authorized or attempted.

Final root inspection moved the optional source inspector below the primary
practice log, with a keyboard/touch button focusing its heading without changing
app navigation. The primary Log practice and native history controls remain first.
Malformed UTF-8 prefixes now cancel the remaining streamed body immediately; an
open-stream transport regression verifies cancellation. The first full browser
run was deliberately interrupted after 30 passing journeys (one interrupted,
65 unrun) to finish these changes. Its actual exit130, native-audio interruption
pixels/context/trace and partial evidence are retained; it is not a full pass.
Focused fast and browser workflows pass after these corrections; the final full
gate, independent review and production delivery remain pending.

The final full attempt passed 95 journeys and failed mobile course replay at
its expected full-pass count (zero rather than one). Assertion, context, pixels
and a bounded trace were inspected and retained. The unchanged isolated mobile
journey then passed in 1.3 minutes; the cause remains unconfirmed. No native
credit threshold, timeout or assertion was weakened. A final complete serial
rerun is required before implementation commit and independent review.

Final root `mise run check`, all 1,312 tests in 70 files and production build
pass. The complete serial browser rerun passes all 96 journeys in 18.1 minutes
(actual exit 0), including the unchanged mobile course-replay journey and both
LCWO workflows. Updated desktop/mobile logbook captures were inspected; the
estimate note now accurately distinguishes source results from logged sessions.
The earlier 95-pass/one-failure attempt remains retained with its unconfirmed
cause. Implementation is ready for the required independent review; deployment
and GitHub source publication remain pending, and no push is authorized.


### Issue #35 independent review correction — exact-quota Disconnect

The fresh post-commit reviewer requested one substantive P2 correction after
reviewing implementation `7c757ff9`: changing stored `true` to `false` added one
byte and rejected Disconnect at exactly the 6 MiB ordinary-data limit. Its own
real Wrangler/D1 reproduction independently summed actual row bytes. History
remained intact, but the connection stayed active. The reviewer otherwise passed
239 focused tests and independently exercised desktop/mobile keyboard/touch,
consent, identity, save/retry, lost committed acknowledgement, actual portable
files/reset, source facts, estimates and privacy. Twelve settled Axe/overflow
checks were clear. This is REQUEST CHANGES, not acceptance.

Private storage now uses same-width 0/1 flags and reads the older boolean format.
API responses and portable backups retain strict boolean semantics. No quota,
source fact, identity, account fence or schema change is needed. Two regression
cases fill actual production-SQL rows to exactly 6 MiB, independently verify byte
accounting, and require successful Disconnect with all 650 practice rows and
source results intact. Both first failed HTTP 400 versus 200 before correction;
both now pass, including older-format compatibility. All 241 focused tests pass.
Final fast checks and affected runtime journeys, follow-up commit and independent
recheck are subsequent gates; deployment remains pending. No push is attempted.

Correction gate passes `mise run check`, all 1,314 tests in 70 files and production
build, followed by both affected serial LCWO runtime journeys in 15.2 seconds
(actual exit 0). The earlier full 96-journey pass remains implementation evidence;
the small private encoding correction changes no frontend or wire shape. The
reviewer will independently recheck the real quota workflow after the focused
follow-up commit before deployment.


## Issue #35 accepted review and production delivery — October 2, 2026

Implementation `7c757ff9ee2e5cc93c34b104ff4f76e034b3f088` and focused
correction `53a3a87705871be63e40934de151490bd012ebe2` are independently
ACCEPTED. The sole P2 exact-quota Disconnect finding is resolved. The reviewer
independently exercised two real local Wrangler/D1 quota journeys in 27.2
seconds: current numeric and older boolean flags, 621 canonical practice rows
and independently summed exact 6,291,456 bytes. Actual mobile withdrawal survives
a deliberately lost committed acknowledgement, retains every row/source fact,
retries safely and rejects disconnected refresh. Current bytes remain identical;
older links shrink three bytes. Actual downloaded backups remain strict boolean
false. Canceled unchecked consent and a second authenticated account preserve
privacy. Four new settled Axe/overflow checks are clear; screenshots inspected.
The reviewer also passes 241 focused tests and an independent strict decoder
check; all 516 tracked files match the corrected commit before/after. Its first
ignored probe loader failure is retained separately, not counted as a pass.
The broader initial independent desktop/mobile workflow review remains applicable.
All reviewer processes exited and port 8791 was explicitly released.

Root corrected gate passes check/all 1,314 tests in 70 files/build and both
serial affected LCWO browser journeys in 15.2 seconds. The implementation's full
96-journey pass in 18.1 minutes precedes the small private encoding correction;
no full rerun of that correction is claimed. Earlier failed/interrupted evidence
and the unconfirmed native course-replay failure remain recorded above.
Strict `mise run deploy` passes every prerequisite, dry run, migration
`0008_lcwo.sql` and production upload without bypass or retry. Production version
`6e9e21c9-1cda-45ac-9a58-fa5f7801fffc` is live at https://cwa.n1rwj.com.
Fresh anonymous checks confirm root/health 200, private history/account-state/
backup/LCWO 401 and exact hashes of all four production JS/CSS assets plus the
public Runner module. No signed-in production data was created.

Local main includes the focused commits; push signing remains enabled. No push
is authorized or attempted. GitHub main still resolves to signed
`7e4d66b22f950a6bc063412ffd68c5ee054f6dd9`; issue #35 remains open pending
source publication despite accepted production delivery. Authenticated live
LCWO service, physical devices and lock-screen behavior are not claimed. Source
fixtures are synthetic, original trainer remains read only, and elapsed-time
crash/reload recovery and new speech recognition remain outside approved scope.
The independent review and production gates permit ascending issue #36 next.


## Issue #36 — private advisor definitions and preparation windows (review pending)

Rechecked current issue body/comments and dependency #18. The closed dependency
is delivered, independently accepted and externally published with verified
signatures; current class-schedule browser coverage still exercises its workflow.
Original report fields, derivation and Worker references match pinned
`3106c9b8` byte for byte at current original HEAD `c2bef7af`. Original owner
identity, form destination and entry IDs are not shipped as defaults.

Learners can configure private ordered field keys, labels, sections, types,
required rules, exact rating choices, inclusive/exclusive numeric bounds, whole
numbers, neutral context mappings and optional HTTPS form/field references.
Whole-definition validation rejects unsafe destinations, duplicates, unknown
account references and incoherent rules. Encoded definitions are capped at
32,000 bytes; migration 0009 stores a nullable account-owned setting separately
from ordinary practice quota, following the existing bounded class settings.
Atomic CAS/exact retry and lifecycle ownership reuse the existing account
architecture. Private backups roundtrip the definition; old omitted settings
preserve an existing definition on merge, clear on replace/reset, and remain
valid without invented data. Numeric zero, optional blanks, literal ratings and
valid calendar dates obey the configured rules.

The selected session/date shows actual preparation dates, course timezone,
meeting exceptions and an inclusive window. All dated session-owned exercises
contribute; Today pins do not change homework dates. Early reports cap at the
chosen date and can produce an explicit empty window. Missing dates use two
prior days through the class date (or chosen date), capped at the report date,
with the fallback explained. Meeting exceptions remain separate from curriculum
preparation dates. No future evidence or performance is inferred.

The existing generic report copy/print and imported original snapshots remain
readable. Configuration errors retain edits; cancellation restores preview
focus. Report-format navigation retains setup work. A failed save retains the
exact operation locally with visible feedback and actual account-sync retry.
Readable conflict comparisons disclose the whole private definition. Preview
answers are explicitly unsaved until #37; evidence suggestions, handoff and
confirmed learned words remain #38–#40. No answers are sent to an external form.

Focused check and 250 domain/actual-SQL/client-queue tests pass. The real local
Wrangler/D1 browser journey passes in 12.9 seconds, including desktop keyboard,
mobile touch, save failure/exact retry, backup download/file selection, literal
values, early/empty windows and retained format navigation. Settled Axe/overflow
checks and inspected desktop/mobile captures are clear. Earlier domain selection
regression, incorrect test account header, JSX build error and accessible select
locator failure remain retained; none is counted as passing evidence. Complete
regression, implementation commit, fresh independent review and deployment are
subsequent gates. Physical devices and production private writes are not claimed.
No push is authorized or attempted; original site remains read only.

Root source inspection caught a saved-rating-to-text transition retaining hidden
old rating choices in the editor projection. The actual editor regression first
fails with the retained “Only rating fields have choices” error; stripping
obsolete choices from the draft projection makes it pass in 13.6 seconds with
check. The complete browser attempt was deliberately interrupted after nine
passes to fix this before review (exit 130, not a passing gate). Retained failure
assertion, context, pixels and trace were inspected; no timeout was relaxed.
A fresh complete gate follows this correction.

The corrected complete gate passes `mise run check`, all 1,369 tests in 72
files, `mise run build`, and all 97 serial browser journeys in 18.3 minutes
(actual exit 0). Four settled report Axe/overflow checks are clear; desktop
and mobile pixels were inspected. The full run also exercises the delivered
closed class-schedule dependency, imported report references, public tools,
native media/Runner, queues, account boundaries and backup/lifecycle workflows.
The existing large-bundle warning remains visible. Binding/configuration files
are unchanged, so no new binding types are required. Fresh issue/source checks
remain unchanged; the original five dirty paths and protected scope-ledger hash
are intact. Focused implementation commit and independent review follow;
deployment and source publication are not yet claimed. No push is attempted.


The independent post-commit reviewer requested one correction (R36-1):
required whole-number fields could accept a one-sided exclusive limit outside
the supported safe-integer answer domain. The focused correction checks the
intersection with that domain, rejects both impossible mirrored extremes, and
keeps adjacent feasible values. New domain and real SQL regressions first fail
against the reviewed implementation; invalid direct settings, semantic account
operations and merge imports now reject atomically without changing the account.
The actual editor retains the invalid value and explains the error, then saves
the corrected adjacent value and accepts its valid answer.

Correction validation passes check, all 1,374 tests in 72 files, build, 255
focused tests and the affected serial real-runtime browser journey in 15.6s.
Two additional settled Axe/overflow checks are clear; mobile pixels were
inspected. The earlier complete 97-browser gate precedes this validator-only
correction; it is not claimed as a rerun. The same independent reviewer must
recheck the committed correction before acceptance and deployment. No push,
source publication or physical-device verification is claimed.


Issue #36 is independently accepted at implementation
`24e50159c4e7d1be1f97fe8e2ec9b1fa825be319` plus focused correction
`1ee19e48559a5acad693a9b58d19c4defe80ad1d`. The independent reviewer
exercised five original desktop/mobile journeys, actual copy/print and private
backup controls, lost committed acknowledgements, conflicts, storage refusal,
privacy and source-window fidelity. Its sole P2 safe-integer finding was fixed
and independently rechecked in two further runtime journeys: six rejected
API writes are atomic and both adjacent edge values save and validate. Fifteen
settled accessibility/overflow scans are clear; all 524 tracked file hashes and
original reference/dirty-path integrity are preserved. No scoped finding remains.

Production version `f5e37000-1fb3-4029-9718-8a7fd63af3ef` now serves that
accepted tree. The complete deployment retry passed check, 1,374 tests, build,
dry run, remote migration 0009 and deployment; the initial D1 authorization
7403 failure is retained separately. Read-only production verification confirms
health/root 200, private history/state/backup/LCWO 401, exact hashes of all four
JS/CSS assets and the public Runner module. No production private data was
written. Source commits remain local, with main updated; no push is authorized
or attempted. The issue stays open pending source publication. Durable reports,
evidence selection, handoff and learned words remain #37–#40.


## Issue #37 — editable private report drafts (independent review pending)

Fresh issue bodies/comments and dependencies #2/#36 were checked. The four
original report panel/derivation/storage/types files remain byte-identical to
pin `3106c9b8bf20b63be069f4019467cb565cdd17ec`; original owner defaults
are not copied. The original five dirty paths and approved-scope ledger remain
unchanged. Closed dependency #2 is exercised by the actual retained-operation,
retry, conflict and lifecycle browser workflows rather than skipped by status.

Native working documents keep a stable identity, frozen validated definition,
class/report date/inclusive window, literal answers, protected edited keys,
source references and timestamps. Grouped fields autosave separately for each
session/account/dataset. Reload and in-app report/configuration navigation
retain the document. Refresh changes only untouched suggestions and refreshes
practice references; relinquishing an override is explicit. Deliberate blanks
remain protected. The optional practice-summary mapping counts distinct saved
independent results/minutes in the window; it excludes class, review and future
results and does not infer scores, proficiency or learned words.

Explicit account save creates an immutable separate copy through the existing
semantic outbox/CAS/exact-receipt architecture. Device-only, waiting to upload,
account-saved and conflict states are visible. Retry preserves the same copy
and operation. Saved/submitted snapshots are read only; reopening creates a
new working identity. Removing a saved draft copy requires confirmation;
submitted history cannot be removed as a draft. Local storage refusal retains
page text with truthful retry/download feedback. A stale second tab cannot
overwrite a newer copy; explicit download-and-reopen preserves both texts.

Migration 0010 adds owner-scoped immutable copies, encoded byte/count quota,
history revision and same-transaction native evidence ownership checks. Worker
validation rejects malformed, foreign and missing evidence before mutation;
SQL rechecks deletion races. Copies roundtrip in private account backups;
working drafts join validated scoped device backups, clear/restore and dataset
fencing. Old omitted report inventories remain compatible. Replace/reset and
failure rollback use the existing lifecycle; referenced result deletion is
blocked until export/removal of saved draft copies preserves reversibility.
JSON member order does not make identical copies conflict; arrays stay ordered.

Preserved original device drafts require an explicit selected-session copy and
compatible configured keys/rules. Raw original drafts remain readable on mapping
errors; submitted references are not automatically resumed. Copies keep a new
native identity plus original ID/private archive hash; ownership is checked
against that account's preserved archive. Repeat copy/import is bounded. The
original archive remains byte-faithful and is included in portable backups.

Focused domain/device/real-SQL tests pass (202), including intentional blanks,
immutable/submitted history, the 200-copy cap, exact retries, foreign-source
rejection, atomic rollback, quota, backup fidelity and stale storage. Four
serial affected real-Wrangler/D1 browser journeys pass in 31.0 seconds: desktop
keyboard/mobile touch, per-session reload, offline sync, refresh/relinquish,
actual backup download/file import, compatible/incompatible original copies,
archive fidelity, storage refusal and second-tab download/reopen recovery.
Settled Axe/overflow checks are clear; desktop/mobile pixels were inspected.
The initial new fixture/name mistakes and disabled-startup keyboard navigation
race are retained as failures; no timeout was relaxed or early pass claimed.
Complete regression, post-commit independent review and deployment are separate
remaining gates. Configuration/bindings are unchanged. Physical devices, live
external submission and production private writes are not claimed. #38 owns
category-specific evidence, #39 exact form handoff/confirmation, and #40 learned
words. No push is authorized or attempted; unpublished issues remain open.


Root inspection found a platform-boundary issue before committing: aggregating
all copies into one SQL JSON value could exceed D1's documented 2,000,000-byte
value/row limit while the account still fit the 6 MiB application quota
([D1 limits](https://developers.cloudflare.com/d1/platform/limits/)). A real SQL
regression first failed with a 2,356,916-byte result row. Account snapshots now
return individual bounded task/report rows in the existing coherent two-query
batch boundary; lifecycle/export/LCWO offsets remain valid. Private export
filters the raw task rows separately. A growing-history regression verifies
all rows stay below the platform limit and all 28 large copies remain readable
and exportable. The reviewed import screen also discloses the immutable report
copy count and duplicate-ID rules. Focused 203 tests and check pass.

The first complete browser attempt was intentionally stopped at exit 130 after
33 passes (6.7 minutes) for this correction; 66 journeys did not run and one was
interrupted. It is not a passing regression gate. The affected real-runtime
journey now imports 29 valid report copies exceeding 2 MB through actual file
selection, inspects import feedback, and verifies local D1 account reads/export.
A fresh complete gate follows the platform correction.


A second root workflow inspection caught an original-derived submitted copy
being mistaken for an already-saved draft after reopening. The new actual
keyboard/mobile journey first fails with “This exact copy is already saved” and
no new saved draft. Filtering reusable copies to draft status fixes it: the
working identity and saved draft are new, the confirmed snapshot is unchanged,
and archive provenance/intentional blanks remain exact. Assertion, error
context, mobile pixels and retained trace were inspected. The affected five
serial runtime journeys pass, including the new submitted-history regression.
The second complete attempt was stopped at exit 130 after 63 passes (11.2
minutes), with one interrupted and 36 not run; it is not a passing gate.
A final complete 101-journey gate follows this correction before commitment.


The corrected complete gate passes `mise run check`, all 1,403 tests in 74
files, `mise run build`, and all 101 serial real-Wrangler/D1 browser journeys
in 18.5 minutes (actual exit 0). This includes all five report journeys, the
large-history D1 boundary and original-derived submitted-copy regression,
closed-dependency offline workflows, private backup/lifecycle, public tools,
Stories, native media and real Runner behavior. Eighteen settled report
accessibility/overflow scans are clear; desktop/mobile captures were inspected.
Fresh issue bodies/comments, original reference/dirty-path integrity and the
protected approved-scope ledger remain unchanged. The existing large-bundle
warning remains visible. No binding/config change or physical-device claim is
made. A focused implementation commit and fresh independent review follow;
production deployment and source publication are not yet claimed.


## Issue #37 independent review correction — responsive definition notice

The fresh post-commit reviewer inspected implementation `3686ffe5` and
independently exercised seven functional real-Wrangler/D1 journeys, 36 focused
domain/device/SQL cases and ten clear settled Axe scans. It verified lost
acknowledgement/exact retry, explicit account conflict reapply, storage refusal,
second-tab recovery, original provenance, submitted history, privacy/reset and
a 2,522,011-byte/200-copy runtime history. All 533 tracked source and 173 built
asset hashes remained unchanged. One substantive P2 finding, F1, prevented
acceptance: the generic single-row alert clipped the definition-change action
and compressed the explanation inside the mobile report dialog at 390/375px.
The independent dedicated RED geometry case and screenshots retain the defect.

The advisor notice now has a scoped stacked layout with a wrapping action;
other alert callers retain their existing layout. The existing report
configuration journey checks both action containment and inner dialog/notice
overflow at 1440, 390, 375 and 320px, including settled accessibility and
retained screenshots. The original working draft and deliberate edits remain
protected until the learner explicitly chooses a new definition. Independent
recheck and production delivery remain required after the focused correction
commit. Physical devices and external submission are not claimed.

Root correction validation passes check, all 1,403 tests/74 files, build and
five serial affected report journeys (38.9 seconds, actual exit 0). Settled
notice checks and inspected pixels include desktop, 390, 375 and 320px. The
complete 101-journey implementation gate remains recorded above; this focused
visual correction changes no auth, persistence or runtime wiring.


## Issue #37 — independently accepted private drafts, deployed

Implementation `3686ffe55911d3a5250975f2f65a2937d29ffb95` and focused
F1 correction `8e888588ebf53f91332266a947c03d8838927c74` are independently
accepted. The same reviewer rechecked the original clipping trigger at 1440,
390, 375 and 320px and verified both desktop keyboard and mobile touch paths:
exact old downloads/account copies remain unchanged, the new working and saved
identities are distinct, another session remains intact, and reload/export
retain the new definition and text. Two functional rechecks pass across focused
runs, with five additional clear settled Axe scans and unchanged 533 tracked
source/173 asset hashes. The original seven functional journeys, 36 focused
checks and ten clear Axe scans remain supporting evidence. The initial RED
case and corrected-review harness failures are retained, not counted as passes.
No substantive #37 finding remains.

The report dialog/notice fits 320px; independent review found unrelated Academy
guide background cards wider than 320px. Whole-page 320px fit is not claimed.
Desktop and 390/375px report operation, cancellation, failed-save feedback,
keyboard/touch and old/new immutable report preservation are verified. Mobile
evidence is browser emulation, not physical-device or lock-screen verification.

The established production task passed check, all 1,403 tests in 74 files, build
and dry-run validation, applied `0010_reports.sql`, and deployed version
`47195f51-2e1b-4063-84c2-9ea6d41d6228` to <https://cwa.n1rwj.com>. The first
remote D1 request failed with transient API code 7403; the complete retry
succeeded. Both logs remain in the ignored evidence directory. Read-only
production verification confirms root/health 200, anonymous private
history/account-state/lifecycle-backup/LCWO 401, exact hashes of all four built
JS/CSS assets, and the public Runner module. No production private data was
written for verification. Configuration/bindings did not change.

Root's complete implementation regression is 101 serial real-Wrangler/D1
journeys (18.5 minutes, actual exit 0). After the scoped visual correction,
check/all tests/build and the five affected report journeys pass (38.9 seconds).
The existing large-bundle warning remains visible. Original source references,
the original site's five pre-existing dirty paths and the approved-scope ledger
remain unchanged. Scoped drafts, backups, exact retries, immutable copies and
explicit original-device copying are delivered; category suggestions #38, form
handoff/confirmation #39 and confirmed learned words #40 remain subsequent
work. No external submission, live LCWO, physical-device check, original-site
mutation, push or PR is claimed. All source commits remain local with main
updated; issue #37 remains open pending source publication as instructed.


## Issue #38 implementation — actual-source suggestions and frozen provenance

Current issue #38 and all six dependency bodies/comments were rechecked. Closed
#1/#7/#15 were verified against retained typed evidence, applied generated
configurations and real Runner workflows rather than skipped by status.
#33/#34/#37 remain open solely because their accepted/deployed source is local
under the explicit no-push instruction. Pinned original report derivation and
field definitions match the read-only current source; fixed owner identity,
form URL and external field IDs are not redistributed.

Learners explicitly choose source mappings independently of field keys. Actual
played catalog recording families/file WPM and latest explicit performance,
structured historical audio/ratings, applied generated configurations, sending
scales, separate native Copy measurements and explicit CWT observations are
available. Arbitrary score prose, unrelated private notes, selected unplayed
files, inferred ratings and learned-word exposure do not create answers.

One eligible Runner result supplies its own points, score, starting WPM, actual
used speeds, duration and simulated contacts: highest verified points, longer
positive elapsed duration up to 900 seconds, newer actual start, stable ID.
Measured zero points stay known. No independent points are summed or scaled.
Mixed speed and incomplete timelines are disclosed with actual recorded speed
change times, run start/end and band conditions. Class-local actual occurrences,
known completion times and inclusive windows exclude class, duplicate, future
and out-of-window results; extra review is reportable but grants no required
assignment credit. Unknown starts keep their declared day and visible limits.

Latest whole LCWO/manual results do not borrow missing older metrics. Only
compatible authenticated code groups matching both character and effective WPM
contribute averaged errors. The API's missing group length and actual adaptive
training speed remain blank; maximum achieved speed is separately mapped.
Estimated LCWO practice credit is labeled as a learner assumption. Native Copy
never fills an LCWO field and retains its scoring/content/timing identity.

Working refresh preserves learner edits and intentional blanks independently
of captured suggestions. Lazy keyboard/touch evidence drilldown shows mapping,
source IDs, actual/declared practice day, retained facts and current owned
results, including changed-source feedback. Immutable account copies retain
answers and source snapshots through exact retry and private export/import.
New saves validate the captured owned source set, reject forged measurements,
and atomically guard source-history changes through
`0011_report_provenance_guard.sql`. Historical imports retain frozen snapshots;
this is source attribution for private records, not cryptographic attestation.

Embedded facts use a disclosed 40,000-byte/256-source detail budget and explicit
excerpts; every source ID remains retained. The existing 2,000-reference and
96,000-byte document limits reject oversized refreshes with recovery feedback
without changing the prior draft. An initial oversized draft can be retried
with an earlier report date or fewer configured fields. Complete saved facts
remain in the owned result/private backup; no omission implies a measurement.

Root validation passes check, all 1,423 tests in 75 files, and build. Seventeen
new domain cases cover ties/eligibility, UTC-offset instants, actual days,
played pairs, whole/zero/unknown results, group compatibility, native Copy,
historical sources, protected edits, bounds and portable structures. Three
new real-SQL cases verify captured owned-source validation, explicit edits/blanks,
immutable export/repeat restore, foreign/malformed rejection, later-result
arrival during frozen retries and rollback of a concurrent evidence change plus its receipt. The
focused real-Wrangler/D1 browser journey passes desktop keyboard and 390px touch,
source drilldown, visible mixed/unknown warnings, canceled/configured mappings,
refresh protection, failed-save/exact retry despite later practice arriving,
LCWO estimate/source drilldown, old/new immutable snapshots and
actual backup download; six settled Axe/overflow scans are clear and pixels
were inspected. Fixture timestamps/IDs/mappings and startup waits were corrected
without weakening validation or relaxing timeouts. Those failed logs remain.

The first complete browser attempt was deliberately interrupted after 19
passes (3.1 minutes), with one interrupted and 82 not run, to correct LCWO
latest-result sorting across valid differing UTC offsets. The new regression
first fails with the older value, then passes using actual instants. The
interrupted suite is not a passing gate. A fresh complete 102-journey regression
runs before the implementation commit. Independent post-commit review,
production deployment and final delivery evidence remain required.

Original HEAD, pinned references, five pre-existing dirty files and the protected
approved-scope ledger are unchanged. Public practice and restricted-resource
links remain intact. No binding/config change, original-site mutation, physical
device/live LCWO verification, external form submission, push or PR is claimed.
#39 owns exact handoff/confirmation and #40 owns confirmed learned words.


A second complete attempt was deliberately interrupted after 31 passes (6.1
minutes), with one interrupted and 70 not run, to correct frozen-copy retries
when more practice arrives. A new actual-SQL case first failed with rejection
of the previously captured immutable copy. Save validation now checks that
copy's owned referenced source set; a later independent result does not rewrite
its captured facts. Explicit refresh selects the newer higher-point result.
Changed contents of an already-referenced mutable source still get actionable
refresh feedback, while saved historical copies and restores remain frozen.
This private source attribution does not certify an exhaustive server dataset
or cryptographically attest learner-entered results. The corrected browser
journey creates the later owned result during a forced save failure and verifies
exact-body retry, mobile explicit refresh/protected edits and immutable history.
It passes in 16.3 seconds, with six clear settled Axe/overflow scans. Check,
all 1,423 tests and build pass. Neither interrupted complete attempt counts as
a passed gate. A final complete 102-journey candidate gate is running.


The corrected complete candidate passes all 102 serial real-Wrangler/D1 browser
journeys in 18.8 minutes (actual exit 0). This includes the distinct report
capture/retry journey, prior report definition/draft workflows, real native
Runner/Copy/listening, Stories, private history/backups/lifecycle, public access
and account/device isolation. The final pre-commit gate passes check, all 1,423
tests in 75 files and build. The two intentionally interrupted complete attempts
remain recorded as non-passes. The existing bundle-size warning remains visible.
Original references, five pre-existing dirty paths, protected approved scope and
push-signing configuration remain unchanged. A focused implementation commit
and fresh independent review follow; deployment is not yet claimed.
