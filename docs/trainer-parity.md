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
  audio, transcript highlighting, seeking, and logging are available. Inspecting
  app views pauses and retains the current block without a save; returning keeps
  it paused. Explicit Finish or switching tools automatically saves at least 30
  credited seconds; shorter practice remains available through Review & save.
  Sound controls sit alongside pause, repeat, and shuffle settings.
  The old “77” name is not seven missing vocabulary items. Geographic/seasonal
  coherence and scenario-aware copy checks are current-app improvements.
  [Listening](../src/client/ListeningTrainer.tsx), [content](../src/client/word-content.ts).
- **Morse Runner engine:** the same pinned embedded engine, Single Call/WPX,
  assignment settings, actual engine elapsed time, and independent run results
  are present. In-app inspection retains the same acknowledged result; a running
  engine stops into a partial result before the inspected view opens. Cumulative
  assignment accounting and the successive-run save workflow remain later work.
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
| Scratchpad | Notes can be written during practice, edited when saving, and read in history for native and imported records. In-app inspection retains the current notes; unrelated historical edits cannot clear the current block. [Save/history UI](../src/client/main.tsx). | Listening notes persist locally by account and tool/assignment. Elapsed-time recovery after reload/crash is excluded; the advisor-report learned-word workflow remains separate. |
| Generated listening source summaries | Native accepted playback captures word/list/count, QSO scenario/stations, or free mode together with applied speed, pitch, spacing and relevant shuffle/repeat/answer settings. Up to 15 distinct configurations plus explicit overflow survive review, exact retries, history, reports and account backups. Mixed or overflowed evidence supplies no single session WPM pair. [Model](../src/shared/generated-listening.ts), [journey](../e2e/generated-listening.spec.ts). | Full custom text/scripts remain in memory with the active owner; equal custom label/count/settings deliberately share a descriptive identity. Seamless speed retiming, Stories and public exact recipes remain later issues. Independent review accepted the mobile review-focus correction; signed publication and production verification are recorded in the #7 ledger. |
| Official recording speeds       | Verified native-speed files, device-local Assigned/Next preference, and mixed-speed per-file actual-time metadata are supported. Official files remain at 1x. [Selector](../src/client/RecordingSpeedSelect.tsx), [catalog matching](../src/client/recording-variants.ts).                                                                                                     | Per-task remembered overrides, bookmarks, automatic course replay and advisor-report aggregation remain later issues; observed passes are delivered separately below.                                                                                                                                         |
| Recording coverage and passes | Native 1x movement supplies recording-local coverage and once-only completed passes. Overlap unions, file ownership and measured duration groups remain separate from heard time. Prior saved/current/remaining counts appear in Today, Plan and Studio; per-file facts survive review, history, reports and account/device backups. [Coverage](../src/client/recording-coverage.ts), [progress](../src/shared/plan.ts), [journey](../e2e/listening-passes.spec.ts). | Partial coverage stays in memory during in-app inspection; unfinished elapsed/coverage reload recovery is excluded. Old records remain unmeasured. Explicit imported source counts are labeled separately, and extra review supplies no required-pass credit. Independent validation/review are recorded in the #9 ledger below. |
| Historical data access          | Imported practice exposes scratchpads, ratings, recall, passes, actual recording speeds, and per-run Runner/LCWO/CWT observations. Settings has an authenticated, on-demand reader for original reports, LCWO measurements, materials/revisions, course context, and device report drafts/preferences. [Imported history](../src/client/ImportedHistory.tsx).                  | Original reports and materials are readable snapshots, not native authoring/submission workflows. Device drafts are preserved for reference, not resumed.                                                                                            |
| Native copy lifecycle           | Four public modes preserve exact targets/answers, actual trial speeds, score versions, replay/reveal flags, and separate audio/answer/review time. Account/guest-local drafts restore paused; pending saves retain stable IDs and tabs coordinate ownership. [Clock](../src/client/copy-clock.ts), [storage](../src/client/copy-storage.ts), [API](../src/worker/training.ts). | This recovery applies to CopyTrainer, not all tools. Hidden copy practice pauses; answer/review time idles after 30 seconds. Guest/signed-in desktop/mobile Chromium journeys and accessibility checks pass; physical-device behavior is unverified. |
| Native copy history and reports | Validated per-attempt evidence appears in history and printable reports, survives export/import, and does not sum scores across rounds. [Results](../src/client/CopyResult.tsx), [report details](../src/shared/copy-report.ts).                                                                                                                                               | Native corpora/timing/scoring differ from LCWO. This is not advisor-form authoring or submission.                                                                                                                                                    |
| Published course coverage       | All four published catalogs use official links and factual metadata. Native copy recipes replace supported LCWO launches; source discrepancies are documented. [Coverage and counts](curriculum.md).                                                                                                                                                                           | Beginner/Advanced non-LCWO tools remain linked or use existing workflows. Prototypes are not defaults; automatic progression is absent.                                                                                                              |
| Inspecting and finishing practice | Today, Week, Report and other in-app views pause and retain one scoped block, with a reachable Return action and no autoplay or automatic save. Explicit Finish/tool or assignment switch uses one guarded save/discard decision; listening and public timed practice save at least 30 credited seconds. Copy drafts, Runner results and immutable pending bodies retain their owners. [Navigation](../src/client/practice-navigation.ts), [Studio](../src/client/PracticeStudio.tsx). | Unfinished elapsed-time reload/crash recovery is excluded. A running Runner stops into an acknowledged partial result rather than resuming the live contest. Queued uploads retain their account scope; guest history stays local until explicitly saved after sign-in. Browser and independent acceptance are tracked in the issue #6 ledger below. |
| Lock-screen information         | Official recordings and generated Morse share Media Session artwork and controls. Official titles include the session and selected recording, with actual WPM in the album; generated tracks name the active word list or QSO scenario. [Media Session](../src/client/media-session.ts).                                                                                       | Browser metadata, PNG availability, and ownership are tested; physical iPhone artwork and locked playback still need device verification.                                                                                                            |
| Native spoken repeats               | Both built-in lists use checked-in generated answer clips. Three Morse plays, speech, and pauses form one native WAV with seeking, pause/resume, looping and media-derived credit. Custom spoken lists require published words. [Listening](../src/client/ListeningTrainer.tsx), [audio provenance](spoken-audio.md), [browser regression](../e2e/spoken-answers.spec.ts).                                                                                                             | Real media decoding/progression and desktop/mobile fit are covered; physical iPhone lock-screen verification remains outstanding. A shuffled round loops its current order; New round reshuffles.                                                                                                                                                    |
| Duration and explicit completion | The universal 15-minute fallback is removed. Elapsed time and an optional goal are separate from an assigned exercise's explicit Complete/Reopen action; completion is available without starting audio or creating a practice entry. Unknown manual-entry durations require actual learner input. [Studio](../src/client/PracticeStudio.tsx), [plan model](../src/shared/plan.ts). | Completion is a learner decision, not proof of a full listening pass or attainment of a proficiency target. Practice credit continues to come from saved actual time. |
| Earlier reminders and session links | Today has no completion checkboxes. Dismissal hides earlier unfinished items only, with restoration in the course plan; dates, completion and recorded practice remain intact. All four courses link to the selected session in the official syllabus. [Today](../src/client/TodayPlan.tsx), [course plan](../src/client/Plan.tsx), [curriculum links](../src/shared/curriculum.ts). | Dismissal is not deletion and does not hide a task rescheduled to today or a future date. The Beginner session 2 HTML bookmark is missing, so its link uses the official PDF's page 11. |
| Extra review purpose | Deliberate review retains its task, raw results and captured purpose through save/retry, history, reports and portable backups. Independent review counts once toward useful daily practice and supplies no required assignment credit; class review stays separate. [Purpose](../src/shared/training.ts), [workflow](../e2e/review-purpose.spec.ts). | Familiar-material recommendation rotation and cumulative Runner completion remain separate issues; observed recording passes are delivered below. Independent acceptance and production evidence are tracked in the issue #5 ledger below. |

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
| **R2 · P1/P2** Daily guidance                       | Offer resume/next eligible exercise; rotate familiar review without assignment credit; show the separate optional ten-minute word-listening suggestion. Earlier reminders now support dismissal and restoration independently of completion. Class time, Join class, rest-day goals, and saved/current-time breakdown still need explicit policy. | Personal [planner](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L270); [planning P03–P11/P38](parity/planning.md#curriculum-and-the-daily-queue). |
| **R3 · P1** Remaining typed results                 | Native copy saves validated attempts. Issue #1 adds validated Runner and timer/recording evidence, immutable measurements, explicit corrections, history/report details and account plan checks. Add performance ratings and structured CWT heard/worked observations for other practice. Imported LCWO history remains readable with source identity and overlap-safe estimated group minutes; optional per-account live LCWO linking remains accepted issue #35, separate from native practice.                                                                                                                                                                  | Personal [result fields](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/practice-results-form.ts#L3), [LCWO accounting](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/lcwo-practice.ts#L8); [planning P14/P18/P20–P24](parity/planning.md).                                      |
| **R4 · P1** Advisor reports                         | Keep the generic printable report, then add configurable advisor fields, per-class windows, editable durable drafts, evidence-backed suggestions, refresh preserving edits, exact prefilled-form handoff, and confirmed submitted snapshots. Saved imported report snapshots are readable with original answers/evidence in Settings. New report authoring must use actual individual verified Runner results and practiced recording speeds; do not sum scores or infer learned words from exposure.                                          | Personal [report derivation](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L196), [handoff](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report-panel.ts#L282); [planning P27–P31](parity/planning.md#reports-and-evidence).                                         |
| **R5 · P1** Sending trainer                         | The native scales reader, prescribed sections, PDF reference and timer are present, but capture is absent. Port optional adapter setup/test, keyed MIDI or focus-scoped keyboard input, raw edge timing, cautious decode/target comparison, actual-timing replay, keep/discard takes, and local retention. Keep ordinary key practice available without capture.                                                                                                                                                                                                         | Personal [active panel](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-panel.ts#L68); [sending subsystem](parity/listening.md#sending-practice--large-missing-subsystem-p1).                                                                                                                                                        |
| **R6 · P1/P2** Listening content and continuity     | Add the three authored stories as a real third mode. Preserve exact word occurrence and paused/playing state through speed changes; preserve paused seeking; reshuffle repeated native rounds; allow editing a built-in into custom. Issue #7 now retains bounded actual played configurations; selected-but-unplayed preferences supply no source evidence.                                                                                                                                                                                                                                        | Personal [stories](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/data/cw-listening/stories.ts#L6), [retiming](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-panel.ts#L120); [listening inventory](parity/listening.md#generated-contacts-stories-and-listening-lifecycle).                 |
| **R7 · Implemented; device check pending** Spoken answers | The September 30 follow-up explicitly adds prerecorded native spoken rounds and credits actual playback through the shared media clock. Runtime browser speech is removed. Physical iPhone locked playback remains unverified; compact prebuilt MP3 optimization remains absent.                                                                                                                                                                                                                                                                                                   | [Implementation](../src/client/morse-track.ts), [asset loader](../src/client/word-speech.ts), [verification](testing.md).                                                                                                                                                                                                                                                                             |
| **R8 · P2** Course-audio progress                   | Issue #9 delivers actual coverage and whole passes without seek credit, distinct saved/current/remaining counts, and portable per-file evidence. Task-specific speed choices, difficult timestamps/relative rewind, and deliberate course/daily replay policies remain issues #10–12 and #25.                                                                                                                                                                                                                                               | Personal [audio session](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/audio-session.ts#L41); [audio appendix](parity/audio.md#findings-by-behavior).                                                                                                                                                                                      |
| **R9 · P1/P2** Runner continuity | Issue #6 retains acknowledged results through in-app inspection, stopping a running engine into a partial result. Cumulative assigned minutes/remaining time, completion policy and efficient Save & next run remain later issues. Each result must retain its own measured time, score and stable identity. | Personal [Runner transitions](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/runner-session.ts#L48); [Runner workflow](parity/listening.md#surrounding-workflow--partial). |
| **R10 · P1/P2** Instructor material                 | Add private session-linked text/link/file material, preparation/class/reference classification, original-plus-revision history, and readable practice context. Imported materials and their revision links are readable in Settings; native material authoring and practice integration remain absent. Current custom activities cover only notes/link/date/session.                                                                                                                                                                           | Personal [materials](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L757); [planning P12](parity/planning.md#instructor-materials-and-records).                                                                                                                                                                                   |
| **R11 · P1/P2** Live practice and reminders         | Connect assigned CWT work to eligible event windows before class. Later add private reminder subscriptions and the optional public SST/MST/CWT live agenda, timezone toggle, and event calendar. Generic resource links do not supply scheduling. Reverify official schedules before implementation.                                                                                                                                                                                                                                           | Personal [live-task planning](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L135), [private calendar](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L625); [planning P06/P25/P26](parity/planning.md).                                                                |
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

Implementation validation passes; independent acceptance and publication remain
pending. Original interval union, terminal completion, per-recording results and
required/prior-pass projections were rechecked at the pinned source. Course replay
remains issue #10.

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
beside long recall; old valid omitted/zero-pass evidence remains compatible.

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
