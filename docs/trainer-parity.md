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
  inspection retains practice. Independent acceptance/deployment remain pending
  until their ledger is recorded. [Schedule](../src/shared/cw-events.ts).
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
- **Word and QSO listening:** the same 70 unique common QSO words and 30 common
  English words, custom lists, four generated contact scenarios, native Morse
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
| Generated listening source summaries | Native accepted playback captures word/list/count, QSO scenario/stations, or free mode together with applied speed, pitch, spacing and relevant shuffle/repeat/answer settings. Up to 15 distinct configurations plus explicit overflow survive review, exact retries, history, reports and account backups. Mixed or overflowed evidence supplies no single session WPM pair. [Model](../src/shared/generated-listening.ts), [journey](../e2e/generated-listening.spec.ts). | Full custom text/scripts remain in memory with the active owner; equal custom label/count/settings deliberately share a descriptive identity. Seamless speed retiming, Stories and public exact recipes remain later issues. Independent review accepted the mobile review-focus correction; signed publication and production verification are recorded in the #7 ledger. |
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
| **R2 · P1/P2** Daily guidance                       | Offer resume/next eligible exercise; rotate familiar review without assignment credit; show the separate optional ten-minute word-listening suggestion. Earlier reminders now support dismissal and restoration independently of completion. Issue #18 adds private timed meetings, exceptions and Join class; class logs remain separate from independent credit. Issue #19 adds exact-date required/rest goals, a preserved optional personal target, and shared saved/current/combined time from the existing owners. Resume/next, review rotation and optional daily listening remain later issues. | Personal [planner](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L270); [planning P03–P11/P38](parity/planning.md#curriculum-and-the-daily-queue). |
| **R3 · P1** Remaining typed results                 | Native copy saves validated attempts. Issue #1 adds validated Runner and timer/recording evidence, immutable measurements, explicit corrections, history/report details and account plan checks. Add performance ratings and structured CWT heard/worked observations for other practice. Imported LCWO history remains readable with source identity and overlap-safe estimated group minutes; optional per-account live LCWO linking remains accepted issue #35, separate from native practice.                                                                                                                                                                  | Personal [result fields](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/practice-results-form.ts#L3), [LCWO accounting](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/lcwo-practice.ts#L8); [planning P14/P18/P20–P24](parity/planning.md).                                      |
| **R4 · P1** Advisor reports                         | Keep the generic printable report, then add configurable advisor fields, per-class windows, editable durable drafts, evidence-backed suggestions, refresh preserving edits, exact prefilled-form handoff, and confirmed submitted snapshots. Saved imported report snapshots are readable with original answers/evidence in Settings. New report authoring must use actual individual verified Runner results and practiced recording speeds; do not sum scores or infer learned words from exposure.                                          | Personal [report derivation](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L196), [handoff](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report-panel.ts#L282); [planning P27–P31](parity/planning.md#reports-and-evidence).                                         |
| **R5 · P1** Sending trainer                         | The native scales reader, prescribed sections, PDF reference and timer are present, but capture is absent. Port optional adapter setup/test, keyed MIDI or focus-scoped keyboard input, raw edge timing, cautious decode/target comparison, actual-timing replay, keep/discard takes, and local retention. Keep ordinary key practice available without capture.                                                                                                                                                                                                         | Personal [active panel](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-panel.ts#L68); [sending subsystem](parity/listening.md#sending-practice--large-missing-subsystem-p1).                                                                                                                                                        |
| **R6 · P1/P2** Listening content and continuity     | Add the three authored stories as a real third mode. Preserve exact word occurrence and paused/playing state through speed changes; preserve paused seeking; reshuffle repeated native rounds; allow editing a built-in into custom. Issue #7 now retains bounded actual played configurations; selected-but-unplayed preferences supply no source evidence.                                                                                                                                                                                                                                        | Personal [stories](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/data/cw-listening/stories.ts#L6), [retiming](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-panel.ts#L120); [listening inventory](parity/listening.md#generated-contacts-stories-and-listening-lifecycle).                 |
| **R7 · Implemented; device check pending** Spoken answers | The September 30 follow-up explicitly adds prerecorded native spoken rounds and credits actual playback through the shared media clock. Runtime browser speech is removed. Physical iPhone locked playback remains unverified; compact prebuilt MP3 optimization remains absent.                                                                                                                                                                                                                                                                                                   | [Implementation](../src/client/morse-track.ts), [asset loader](../src/client/word-speech.ts), [verification](testing.md).                                                                                                                                                                                                                                                                             |
| **R8 · P2** Course-audio progress                   | Issue #9 delivers actual coverage and whole passes without seek credit, distinct saved/current/remaining counts, and portable per-file evidence. Task-specific choices are independently accepted in #11; Issue #12 adds bounded private difficult timestamps and relative Replay 8 sec with deliberate native playback; optional daily listening remains #25. Course replay is delivered in #10.                                                                                                                                                                                                                                               | Personal [audio session](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/audio-session.ts#L41); [audio appendix](parity/audio.md#findings-by-behavior).                                                                                                                                                                                      |
| **R9 · P1/P2** Runner continuity                          | Issue #15 retains acknowledged terminal results on the device before review, with stable run ID, accepted-start timezone/date, terminal creation time and distinct frozen review timestamp. Mixed-speed results omit generic WPM and expose recorded engine speed segments and bounded-history omissions. Logbook recovery, canceled review edits, exact retry and optional device backup inventory reuse the shared save/account/device boundaries. Issue #16 adds shared saved/current/combined/remaining time and an explicit completion policy, independently accepted and deployed. Issue #17 adds receipt-gated Save & next, retained settings/context and a fresh paused owner, including recovered Logbook continuation; no running-clock reload/crash estimate or live-engine resumption. | Personal [Runner transitions](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/runner-session.ts#L48); [Runner workflow](parity/listening.md#surrounding-workflow--partial).                                                                                                                                                                  |
| **R10 · P1/P2** Instructor material                 | Add private session-linked text/link/file material, preparation/class/reference classification, original-plus-revision history, and readable practice context. Imported materials and their revision links are readable in Settings; native material authoring and practice integration remain absent. Current custom activities cover only notes/link/date/session.                                                                                                                                                                           | Personal [materials](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L757); [planning P12](parity/planning.md#instructor-materials-and-records).                                                                                                                                                                                   |
| **R11 · P1/P2** Live practice and reminders         | Public SST/MST/CWT agenda, Local/UTC preference and recurring feed are implemented in #20 with current organizer verification; independent review/deployment gate is pending. Assigned CWT eligibility before class remains #21 and private reminder subscriptions #46. Public schedule does not infer participation or query private data.                                                                                                                                                                                                                                           | Personal [live-task planning](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L135), [private calendar](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L625); [planning P06/P25/P26](parity/planning.md).                                                                |
| **R12 · P2** Exact public listening recipes                  | Bounded, versioned public listening recipes that reproduce the exact exercise remain accepted issue #45. Real-contact operating guidance, contact logs, ADIF export and unrelated public practice tools are excluded from this execution.                                                                                                                                                                                                                                        | Personal [real QSO helper](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-qso.ts#L137), [share recipes](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/session.ts#L115); [public-tool inventory](parity/listening.md#standalone-public-tools-distinct-features-not-duplicate-page-names). |
| **R13 · P1/P2** Migration fidelity                  | Historical imports now expose original scratchpads and structured results, map LCWO group speed correctly, omit pure dismissal bookkeeping, derive Runner completion, and add overlap-safe one-minute LCWO group estimates. A timezone-aware cutoff limits practice/completion while retaining the full source archive. Settings makes reports, LCWO, materials and device drafts readable. Native report/material editing and recoverable device work remain separate migrations; readable preserved records are not complete feature parity. | Tracker baseline [converter](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L502), [completion import](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L425); [planning P33–P36](parity/planning.md#backups-migrations-and-api-fidelity).                      |
| **R14 · P2/P3** Preference refinements              | Per-mode settings, exact/preset 51–60 WPM support, finer pause/tone choices, and two distinct QSO pitches at the upper tone bound remain different. The personal per-mode writer itself omits QSO/story effective speed; port the intended behavior with both speeds.                                                                                                                                                                                                                                                                          | Personal [speed control](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/speed-control.ts#L1); [word inventory](parity/listening.md#generated-word-practice), [known source omission](parity/listening.md#documentation-reconciliation).                                                                                                    |

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
