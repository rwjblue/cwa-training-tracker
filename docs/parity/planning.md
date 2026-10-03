# Planning, records, external integrations, and reports parity audit

> This appendix preserves the source-audit findings at the **baseline**, including
> gaps fixed in the accompanying change. The [canonical inventory](../trainer-parity.md)
> states current status and priorities; do not treat every baseline “missing” as still missing.
>
> Personal baseline: [3106c9b8](https://github.com/rwjblue/rwjblue.com/tree/3106c9b8bf20b63be069f4019467cb565cdd17ec).
> Tracker baseline: [bc20fdb8](https://github.com/rwjblue/cwa-training-tracker/tree/bc20fdb817a3c42969fafddc2d84c3664d73c10d).
> P/Personal references mean the first repository; C/Tracker references mean the second.
> Pinned evidence links describe these snapshots. Relative source links describe the
> updated implementation. Short filename/line references are qualified by the surrounding
> repository and source-coverage section. This is a source audit, not a claim of device testing.

## Changes since the baseline

P14/P18/P33 are **partly addressed**: scratchpad text now has a dedicated editable
save field and history details for native and imported records. Imported attempt
details expose original performance/difficulty, recall, passes, per-file speeds,
and individual Runner/LCWO/CWT observations without combining runs. Settings now
loads the authenticated source archive on demand and renders saved advisor reports
with answers/evidence, LCWO measurements, instructor materials/revision links,
course assignments/resources/meetings, and browser report drafts/preferences.
These are readable historical snapshots; advisor report authoring/submission and
material editing remain unfinished. Native copy now provides its own validated
typed results. P15/P16 remain open for tools other than native copy: their
unfinished time and notes still need durable drafts and offline saves.
Recorded playback now accrues actual media time, has a separate recall timer, and
supports official speed variants with per-file time/speed metadata. The baseline
source links below remain useful evidence for the other planning/report gaps.

See [PracticeStudio](../../src/client/PracticeStudio.tsx),
[practice clock](../../src/client/practice-clock.ts),
[recording variants](../../src/client/recording-variants.ts), and
[save/history UI](../../src/client/main.tsx) for the updated implementation.

The subsequent historical-import work also addresses P34/P35: code-group speed
maps to effective WPM, pure dismissal records stay out of the practice log, and
Runner completion includes cumulative eligible seconds. Uncovered imported LCWO
group results receive explicitly estimated one-minute entries; source measurements
retain zero/missing values and stable identity. A course-timezone cutoff applies
to practice and completion while the original source remains complete in the
private archive. Settings states that boundary. See
[import conversion](../../src/shared/training.ts),
[completion](../../src/shared/plan.ts), and
[historical reader](../../src/client/ImportedHistory.tsx). The synthetic
[browser journey](../../e2e/imported-history.spec.ts) checks import through the file
chooser, report/result/device-draft readability, safe source links and text,
private export fidelity, accessibility, and mobile width. Original baseline
findings below are retained as historical evidence.

The native copy implementation subsequently addresses the LCWO launch dependency
in P21 and the native subset of P14/P15/P16/P18/P24/P27: four public copy modes,
validated exact attempts, account/guest-scoped paused recovery, tab ownership,
retryable saves, result details, whole-attempt printable-report evidence and
export/import. No live LCWO synchronization is required or planned for this
workflow. Existing imported LCWO measurements remain unchanged. P28–P31 advisor
form authoring, draft refresh, handoff and confirmed submitted revisions remain
separate; imported forms are reference snapshots. See
[CopyTrainer](../../src/client/CopyTrainer.tsx),
[copy storage](../../src/client/copy-storage.ts),
[copy report](../../src/shared/copy-report.ts), and
[implementation scope](../lcwo-native-trainers-proposal.md).

P01 now also includes published Beginner, Fundamental and Advanced catalogs.
[Curriculum coverage](../curriculum.md) documents app scheduling conventions,
98 Fundamental native blocks, the 20 corrected Intermediate ICR presets, and
non-LCWO boundaries. Source/domain tests and the native copy desktop/mobile
browser journeys pass, including guest sign-in, history/report evidence, and
retrying an uncertain save. Physical-device behavior remains unverified. The baseline table below
retains its original source findings, including the old external-sync design.

Read-only source audit, 2026-09-29. No personal records, private exports, production accounts, or source data were accessed. No browser/build/tests were run for this audit. Status describes implemented source behavior, not a live deployment claim. The app is being changed concurrently; the new practice clock is reviewed separately below this inventory.

Priorities: **P1** = important to daily use or trustworthy records; **P2** = valuable parity, but can follow the core workflow; **P3** = optional or requires product choice. “Partial” means a usable equivalent exists but omits specified behavior. Player mechanics, audio/speed variants, generated word/QSO trainers, sending trainer, and Morse Runner engine controls are covered by the other appendices; this audit covers their connection to plans and saved records.

## Findings

### Curriculum and the daily queue

| ID  | Status / priority | Feature and exact behavior                                                                                                                                                                                                                                                                                                                                                | Personal evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Current evidence / gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01 | Present           | Required Intermediate session/day exercises populate automatically; repeated exercises are separate dated occurrences. Current app supports learner-selected start date/weekdays/timezone, stable IDs, and rescheduling without losing completion.                                                                                                                        | [P/src/lib/cw-training/plan.ts:270](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L270); [P/worker/cw-training.ts:21](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L21) fixed imported course ID                                                                                                                                                                                          | [C/src/shared/curriculum.ts:23](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/curriculum.ts#L23), `:109`, `:139`; [C/src/shared/training.ts:405](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L405); [C/src/worker/plan.ts:65](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/worker/plan.ts#L65). Current catalog is explicitly Intermediate v2.3, with 213 required tasks, rather than personal v2.2. This is an intentional corrected version, not a missing feature. Other selectable levels do not yet have generated exercise catalogs; personal source also contains only its imported Intermediate course.             |
| P02 | Present           | Today shows exact-date assignments first, keeps future dated work out of Today, separates earlier unfinished work and completed work, links practice minutes to the correct assignment, excludes class time, and keeps manual activities available.                                                                                                                       | [P/src/lib/cw-training/plan.ts:270](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L270); [P/src/lib/cw-training/client.ts:574](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L574)                                                                                                                                                                                                 | [C/src/shared/plan.ts:266](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L266); [C/src/client/TodayPlan.tsx:68](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/TodayPlan.tsx#L68), `:305`; [C/src/client/Plan.tsx:64](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/Plan.tsx#L64). Current explicit completion remains separate from time logged.                                                                                                                                                                                                                                                                            |
| P03 | Partial / P1      | A concrete “next” recommendation: resume an interrupted block, otherwise start today's next eligible assignment, then instructor preparation or optional review. This reduces daily selection overhead. Personal queue keeps same-session previous preparation behind today's work and prioritizes started work within a date.                                            | [P/src/lib/cw-training/plan.ts:291](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L291), `:327`; [P/src/lib/cw-training/client.ts:628](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L628)                                                                                                                                                                                         | Task-level Practice actions exist ([C/src/client/TodayPlan.tsx:362](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/TodayPlan.tsx#L362)), but main “Practice now” opens the general studio ([C/src/client/main.tsx:596](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/main.tsx#L596), `:360`, `:889`). There is no persisted active block to resume and no next-eligible-task recommendation. Current Earlier work is separate rather than same-session work entering the required queue automatically; that may be a worthwhile intentional simplification.                                                                                                                                     |
| P04 | Missing / P1      | Add an earlier exercise to Today without starting it; remove the pin; dismiss an old reminder without falsely completing the work. Pins last for a date and do not rewrite the original assignment.                                                                                                                                                                       | [P/src/lib/cw-training/plan.ts:300](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L300); [P/src/lib/cw-training/client.ts:492](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L492), `:678`, `:1922`; [P/worker/cw-training.ts:515](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L515)                                | [C/src/shared/plan.ts:266](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L266) has earlier/completed groups only. There is no carried/dismissed state in [C/src/shared/training.ts:8](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L8) or [C/src/shared/plan.ts:139](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L139). Generated tasks cannot be deleted ([C/src/worker/plan.ts:127](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/worker/plan.ts#L127)), so completion is currently the only persistent way to clear an earlier generated row. |
| P05 | Partial / P2      | Time-aware class phases: practice before the class deadline, “Time for class” during an actual start/end interval, Join class link, and rest/upcoming/course-finished states. No required 60-minute quota on dates without an assignment.                                                                                                                                 | [P/src/lib/cw-training/types.ts](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/types.ts) meeting/preferences model; [P/src/lib/cw-training/plan.ts:278](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L278); [P/src/lib/cw-training/client.ts:574](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L574), `:631`, `:2164` | [C/src/shared/training.ts:8](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L8), `:405` store dates/weekdays only, no meeting times, deadline, exception dates, or join URL. Plan reports a finished calendar ([C/src/client/Plan.tsx:181](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/Plan.tsx#L181)), but Overview applies the goal every calendar day ([C/src/client/main.tsx:745](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/main.tsx#L745)). Decide explicitly whether streak/goal should mean every day or scheduled practice days.                                                                           |
| P06 | Missing / P1      | Live CWT tasks know eligible event windows before their class deadline, show the next local start time, surface upcoming live work up to seven days early, and block a “start now” recommendation when no event is running.                                                                                                                                               | [P/src/lib/cw-training/plan.ts:135](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L135), `:322`; [P/src/lib/cw-training/client.ts:492](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L492), `:655`, `:737`; [P/src/lib/cw-practice.ts:109](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-practice.ts#L109)                       | [C/src/shared/curriculum.ts:101](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/curriculum.ts#L101) supplies an external CWT URL and original summary. Current task launch is generic external practice, with no event-window/deadline model or calendar preview. Official schedule links are present; local schedule-aware planning is not.                                                                                                                                                                                                                                                                                                                                                                                                               |
| P07 | Partial / P2      | Unavailable recordings are treated as blocked work, with a reason and resource check instead of being recommended as playable.                                                                                                                                                                                                                                            | [P/src/lib/cw-training/plan.ts:105](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L105), `:154`; [P/src/lib/cw-training/client.ts:655](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L655)                                                                                                                                                                                         | Current curriculum represents unavailable audio and the Today row explains it ([C/src/client/TodayPlan.tsx:338](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/TodayPlan.tsx#L338)); Practice is still available and goes to fallback guidance ([C/src/client/PracticeStudio.tsx:238](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/PracticeStudio.tsx#L238)). Metadata/links are substantially present; separating blocked work from the next playable action is missing.                                                                                                                                                                                                                      |
| P08 | Missing / P2      | Optional review recommendations rotate a small pool from the most recent three eligible practice dates, deduplicate repeated recordings by resource, and prefer not-yet-reviewed material. They retain source identity but do not complete the assigned exercise. Current-level Runner and LCWO review are separately discoverable, including before first scheduled use. | [P/src/lib/cw-training/plan.ts:170](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L170), `:236`, `:250`; [P/src/lib/cw-training/client.ts:631](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L631)                                                                                                                                                                                 | Current public Studio offers tools, but [C/src/shared/plan.ts:266](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L266) has no review recommendation, rotation, current-level recipe selection, or native review context. Legacy review attempts are correctly excluded from assigned minutes (`:305`), but new review is not a first-class activity model.                                                                                                                                                                                                                                                                                                                                                                                        |
| P09 | Missing / P2      | Optional word recognition has its own daily 10-minute listening-only suggestion. It adds saved plus current generated/original-word listening, deduplicates IDs, subtracts recall time, and never marks a curriculum task complete.                                                                                                                                       | [P/src/lib/cw-training/daily-listening.ts:36](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/daily-listening.ts#L36); [P/src/lib/cw-training/client.ts:665](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L665), `:1198`; [P/worker/cw-training.ts:486](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L486)                    | Current word training can be timed and logged, but no dedicated daily word-listening counter/suggestion appears in [C/src/client/TodayPlan.tsx](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/TodayPlan.tsx) or [C/src/shared/training.ts:430](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L430). The original private audio itself is not appropriate to publish without rights; the generated-word experience can supply this accounting.                                                                                                                                                                                                                                      |
| P10 | Partial / P2      | Assignment progress is derived from attempts: active seconds, actual pass counts, interrupted status, and completion are separate. Morse Runner adds saved partial runs toward its assigned total even when older records say completed:false; other simulators preserve uninterrupted-run requirements.                                                                  | [P/src/lib/cw-training/plan.ts:77](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L77); [P/tests/cw-training-plan.test.mjs](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-plan.test.mjs); [P/tests/cw-training-history.test.mjs:178](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-history.test.mjs#L178)                              | [C/src/shared/plan.ts:266](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L266) derives total/today linked minutes and ready/started/done, but done is solely saved task state. No cumulative Runner milestone, pass history, or interrupted attempt status in Today. Current manual completion separation is deliberate; auto-completion should be an explicit product choice, not silently copied. Imported Runner completion needs special fidelity consideration (P35).                                                                                                                                                                                                                                                                        |
| P11 | Partial / P2      | Course overview and history can be inspected without affecting current practice, with browser Back/Forward retaining view and active context.                                                                                                                                                                                                                             | [P/src/lib/cw-training/navigation.ts:8](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/navigation.ts#L8); [P/src/lib/cw-training/client.ts:765](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L765)                                                                                                                                                                                         | Current hash navigation and unsaved-leave guard exist ([C/src/client/main.tsx:324](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/main.tsx#L324), `:360`). Leaving Studio discards its mounted in-memory attempt after confirmation; the personal app keeps active state while changing views. Recovery/resume is P15.                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P38 | Partial / P2      | Daily goal displays saved practice plus the unsaved current block separately, with deduplication during sync and no class/other-day inflation.                                                                                                                                                                                                                            | [P/src/lib/cw-training/practice-time.ts:36](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/practice-time.ts#L36); [P/src/lib/cw-training/client.ts:1180](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L1180)                                                                                                                                                                               | Current daily summary totals saved entries ([C/src/shared/training.ts:430](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L430)); Studio shows its unsaved time separately. Today cannot include or resume that active block because it is mounted-local state. Implement with the same persisted attempt model as P15 rather than a second timer.                                                                                                                                                                                                                                                                                                                                                                                             |

**Not a visible parity gap:** [P/src/lib/cw-training/plan.ts:8](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L8) and `:337` contain tested activity-mode and 3/5/10/15-minute fitting logic, but personal `client.ts:169` and `:568` call the planner with `null, "anything"`. Do not advertise these dormant library options as current personal UI features. The calendar's 10/15-minute reminder duration is active and separate.

### Instructor materials and records

| ID  | Status / priority | Feature and exact behavior                                                                                                                                                                                                                                                                                                                                   | Personal evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Current evidence / gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P12 | Missing / P1      | Private instructor materials collection: paste text, import a bounded text file, save a URL, associate a class session, classify preparation/class/reference/not-sure, open and practice it, and preserve original plus revision history. Preparation appears in Today before optional extra work; class material is usable separately from practice credit. | [P/src/lib/cw-training/types.ts:97](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/types.ts#L97); [P/src/lib/cw-training/client.ts:392](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L392), `:603`, `:757`, `:2495`, `:2515`; [P/worker/cw-training.ts:474](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L474)                                                                                                                                                                     | Current private custom activities support notes, links, session, and date ([C/src/client/Plan.tsx](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/Plan.tsx), [C/src/shared/plan.ts:139](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L139)), but there is no materials entity, usage classification, text-file reader, revisions, or material practice context. Imported materials remain only in the raw legacy archive. This should remain private per user, not bundled course content.                                                                                                                                                                |
| P13 | Present           | Manual logging plus private record editing/deletion, kind/date/minutes/session/speeds/accuracy/notes, class-time distinction, and on-air QSO count including zero. Manual logging does not require completing an assignment.                                                                                                                                 | [P/src/lib/cw-training/client.ts:2401](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L2401); [P/src/lib/cw-training/qso-count.ts:2](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/qso-count.ts#L2); [P/src/lib/cw-training/other-practice.ts:3](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/other-practice.ts#L3)                                                                                                                                                                   | [C/src/client/main.tsx:1764](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/main.tsx#L1764); [C/src/shared/training.ts:330](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L330); [C/src/worker/training.ts:49](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/worker/training.ts#L49). Editing/deleting records and searchable/filterable logbook are useful current improvements over the personal append-only attempt history.                                                                                                                                                                    |
| P14 | Partial / P1      | Rich manual finish form: actual completion timestamp, assignment/material/other selection, pass credit and completion independently, performance rating distinct from difficulty, scratchpad, exact LCWO drill metrics, structured CWT observations, and external simulator verified points/settings.                                                        | [P/src/lib/cw-training/client.ts:1831](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L1831), `:2401`, `:2477`; [P/src/lib/cw-training/practice-results-form.ts:3](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/practice-results-form.ts#L3); [P/src/lib/cw-training/report-types.ts:2](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report-types.ts#L2)                                                                                                                             | Current generic form ([C/src/client/main.tsx:1764](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/main.tsx#L1764)) lacks these structured fields and actual start/end timestamps. Generic accuracy is not a replacement for a performance assessment or LCWO error-count semantics. Current embedded Runner creates structured metadata, but manually conducted/external runs cannot enter equivalent reportable measurements.                                                                                                                                                                                                                                                                                                |
| P15 | Missing / P1      | Persist and resume an unfinished block across reload/crash/navigation, with active elapsed time, task/resource, scratchpad and exercise state. Persist pending practice/material/report changes and report drafts before network sync.                                                                                                                       | [P/src/lib/cw-training/storage.ts:21](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/storage.ts#L21), `:52`, `:85`; [P/src/lib/cw-training/client.ts:117](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L117), `:207`                                                                                                                                                                                                                                                                                                                             | Current [C/src/client/PracticeStudio.tsx](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/PracticeStudio.tsx) keeps attempt state in React; [C/src/client/main.tsx:223](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/main.tsx#L223) keeps launch/save state in memory. [C/src/client/practice-preferences.ts:88](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/practice-preferences.ts#L88) persists tool settings only. A beforeunload/leave guard (`main.tsx:324`) helps normal navigation but cannot restore work after a crash/reload. New practice-clock work changes accounting, not persistence. |
| P16 | Missing / P1      | Local-first offline queue with explicit “saved on this device / waiting to sync / saved in account” statuses, automatic retry on reconnect, acknowledged-ID draining, materials-before-dependent-attempts ordering, and preservation after auth expiry.                                                                                                      | [P/src/lib/cw-training/client.ts:188](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L188), `:220`, `:240`, `:275`, `:2613`; [P/src/lib/cw-training/storage.ts:85](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/storage.ts#L85)                                                                                                                                                                                                                                                                                                                  | [C/src/client/api.ts:14](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/api.ts#L14) performs direct requests; current private state fetch/save has no IndexedDB queue, online-retry listener, or durable save status. Failed network saves leave the modal in the current page but do not create a recoverable offline record. Future cache must be keyed by authenticated user and cleared/isolated on sign-out.                                                                                                                                                                                                                                                                                                             |
| P17 | Missing / P2      | Same-device single-writer protection and cross-device preference conflict handling. Personal navigator.locks prevents two tabs overwriting the same cached block; mismatched account cache is refused until export/clear; preferences use updatedAt conflict rules, while immutable record IDs make retries safe.                                            | [P/src/lib/cw-training/client.ts:91](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L91), `:220`; [P/worker/cw-training.ts:471](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L471), `:539`; [P/tests/cw-training-api.test.mjs:196](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-api.test.mjs#L196), `:454`, `:541`                                                                                                                                                                   | No local active-state cache means no current cache corruption, but implementing P15/P16 needs this. Current mutable PUT records/profile have no expected-version conflict detection ([C/src/worker/training.ts:49](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/worker/training.ts#L49)); concurrent edits can overwrite newer values. Current POST duplicate IDs conflict instead of acknowledging an identical retry. Do not remove intentional record editing just to copy append-only storage.                                                                                                                                                                                                                                 |
| P18 | Partial / P1      | Useful saved history per independent run: source exercise/material name, local time of day, short durations in seconds, review/class/completion meaning, actual QSO count, pass count, recall duration, performance, and expandable exact results/notes/scratchpad. Device-only sending replay is explicitly distinguished from synced text.                 | [P/src/lib/cw-training/history.ts:22](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/history.ts#L22), `:49`; [P/src/lib/cw-training/client.ts:744](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L744); tests [P/tests/cw-training-history.test.mjs:96](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-history.test.mjs#L96), `:151`                                                                                                                                                      | [C/src/client/main.tsx:1100](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/main.tsx#L1100) SessionRow shows generic kind/session/class, notes or speeds, date/minutes. `:1154` provides search/kind filters and edit/delete, but there is no structured result inspector or metadata viewer. Runner/current media metadata and legacy structured observations can survive exports while still being practically invisible here. Sending replay specifics are in the other audit.                                                                                                                                                                                                                                             |
| P19 | Partial / P2      | Stable self-directed categories distinguish word recognition, ICR, POTA, CWT, other on-air, and general practice; their time contributes to the goal without passing/completing curriculum work. Blank QSO count stays unknown and zero stays zero.                                                                                                          | [P/src/lib/cw-training/other-practice.ts:3](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/other-practice.ts#L3); [P/src/lib/cw-training/qso-count.ts:2](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/qso-count.ts#L2); [P/worker/cw-training.ts:495](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L495)                                                                                                                                                                                     | Current broad kinds and optional plannedTaskId correctly keep unlinked time separate ([C/src/shared/training.ts:5](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L5); [C/src/shared/plan.ts:266](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L266)), with QSO count preserved (`training.ts:358`). POTA/CWT/general contacts collapse into on-air and there is no stable subtype for downstream reports. Basic contact-count logging is present, not missing.                                                                                                                                                                               |
| P20 | Missing / P1      | Structured CWT result capture distinguishes heard callsigns/exchanges from worked callsigns/names, comments and optional QSO count. These fields feed advisor report suggestions without treating private freeform notes as report material.                                                                                                                 | [P/src/lib/cw-training/cwt-result.ts:4](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/cwt-result.ts#L4); [P/src/lib/cw-training/client.ts:2401](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L2401); [P/src/lib/cw-training/report.ts:196](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L196); tests [P/tests/cw-training-report.test.mjs:36](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-report.test.mjs#L36) | Current on-air notes plus qsoCount ([C/src/client/main.tsx:1913](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/main.tsx#L1913)) cannot represent these distinctions. Imported `cwtResult` survives in legacy metadata only ([C/src/shared/training.ts:550](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L550)).                                                                                                                                                                                                                                                                                                                                      |

### LCWO and external practice

| ID  | Status / priority | Feature and exact behavior                                                                                                                                                                                                                                                                                                                                                  | Personal evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Current evidence / gap                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P21 | Present           | Official LCWO, Morse Code World, CWops resources/CWT and other public practice links remain available; assigned ICR opens the external site.                                                                                                                                                                                                                                | [P/src/lib/cw-training/client.ts:930](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L930)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | [C/src/shared/training.ts:121](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L121); [C/src/shared/curriculum.ts:37](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/curriculum.ts#L37). The current public resources list is useful without an account.                                                                                     |
| P22 | Missing / P1      | LCWO result sync/import parses callsign, word, code-group (letters/figures/custom), and Koch histories, preserving source IDs/timestamps, scores, accuracy, actual character/effective/maximum speeds and missing values. Sync is idempotent, retains existing history on failures/upstream deletions, and does not manufacture practice attempts or curriculum completion. | [P/worker/lcwo.ts:88](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/lcwo.ts#L88), `:200`; [P/worker/cw-training.ts:434](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L434), `:566`; [P/src/lib/cw-training/client.ts:346](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L346), `:358`; tests [P/tests/cw-training-api.test.mjs:784](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-api.test.mjs#L784), `:836`                                                              | No LCWO API/import entities/endpoints/UI in current [C/src/worker/index.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/worker/index.ts) or shared model. Personal site uses one owner's deployment secrets; multi-user version needs an explicit per-user connection/credential-storage design or user-provided export import, not copied shared credentials.                                                        |
| P23 | Missing / P1      | LCWO “Finish” uses completed code-group runs during the active block to suggest measured practice. Daily/report totals add one estimated minute per unique uncovered group run, with overlap detection against manually logged ICR intervals and no double count. Words/callsigns lack reliable duration and still require manual time.                                     | [P/src/lib/cw-training/lcwo-practice.ts:8](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/lcwo-practice.ts#L8), `:30`; [P/src/lib/cw-training/client.ts:338](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L338); [P/src/lib/cw-training/plan.ts:286](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L286); tests [P/tests/cw-training-lcwo-practice.test.mjs:18](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-lcwo-practice.test.mjs#L18), `:47`, `:80` | Current generic ICR external stopwatch/manual log has no imported-run measurement or interval model. [C/src/shared/training.ts:430](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L430) only totals saved sessions. Imported personal daily totals can therefore differ until LCWO run estimates have a supported representation. These are explicitly estimates, not exact measured audio duration. |
| P24 | Missing / P1      | Manual LCWO result entry supports trainer-specific semantics: group kind/length, training speed, maximum copied speed, maximum word length, score, errors count vs errors percentage. Report logic chooses whole latest results and does not mix missing values with an older run.                                                                                          | [P/src/lib/cw-training/practice-results-form.ts:3](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/practice-results-form.ts#L3), `:15`; [P/src/lib/cw-training/report.ts:196](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L196); tests [P/tests/cw-training-report.test.mjs:251](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-report.test.mjs#L251), `:329`                                                                                                                                                               | Current speed/accuracy fields are insufficient ([C/src/client/main.tsx:1764](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/main.tsx#L1764)). Parent can implement this independently before authenticated external sync.                                                                                                                                                                                         |
| P25 | Missing / P2      | Optional practice reminder calendar subscription: user local reminder time, 10/15-minute duration, secret capability URL, rotate/revoke, DST-correct times, and only dates plus an app link—no notes or private results.                                                                                                                                                    | [P/worker/cw-training.ts:625](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L625); [P/src/lib/cw-training/client.ts:2112](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L2112), `:2164`; tests [P/tests/cw-training-api.test.mjs:566](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-api.test.mjs#L566), `:587`                                                                                                                                                                                                           | Current course dates are shown in app ([C/src/client/Plan.tsx:170](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/Plan.tsx#L170)) but no subscription endpoint/preferences/UI. This is a practice reminder feed, not a calendar of class meeting events.                                                                                                                                                          |
| P26 | Missing / P3      | Public on-air event companion has upcoming SST/MST/CWT sessions, currently-on-air state and a subscribable event calendar; the private planner imports CWT windows from this same schedule. Additional practice-resource page contains a local-time NNN next-start helper.                                                                                                  | [P/src/lib/cw-practice.ts:34](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-practice.ts#L34), `:109`, `:131`, `:176`; [P/src/lib/cw-practice-resources.ts:68](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-practice-resources.ts#L68); [P/src/pages/radio/cw-practice.astro](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/pages/radio/cw-practice.astro)                                                                                                                                                                                                           | Current Resources has official CWT link only ([C/src/shared/training.ts:157](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L157)). This is adjacent public-site functionality, not all essential tracker parity. Prioritize the actual assigned CWT availability connection (P06); verify official current schedules before porting any schedule constants.                                          |

### Reports and evidence

| ID  | Status / priority | Feature and exact behavior                                                                                                                                                                                                                                                                                                                                                                     | Personal evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Current evidence / gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P27 | Partial / P1      | Basic private date-range practice report, separate practice/class totals, sessions/speeds/accuracy/QSO counts/notes, copy/print.                                                                                                                                                                                                                                                               | Personal structured report described below                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Present [C/src/shared/plan.ts:377](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L377); [C/src/client/Plan.tsx:579](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/Plan.tsx#L579). Good generic report, but it is not the personal advisor-report workflow. It prints freeform notes, so an advisor-specific export should intentionally decide which personal text is included. |
| P28 | Partial / P1 | Advisor report per class: default preparation-date window in course timezone, editable dates, 42 form fields/sections, field validation, device autosaved answers, explicit draft snapshots, refresh from results that preserves deliberate edits including blanks.                                                                                                                            | [P/src/lib/cw-training/report-fields.ts:20](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report-fields.ts#L20); [P/src/lib/cw-training/report.ts:34](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L34), `:79`; [P/src/lib/cw-training/report-panel.ts:50](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report-panel.ts#L50), `:82`, `:228`, `:234`                               | Issue #36 delivers learner-owned field definitions, neutral context mappings, strict literal validation, private atomic persistence/export/import and visible inclusive preparation windows in the course timezone. Early dates cap evidence without inventing future days; missing preparation dates use an explained deterministic fallback. Generic copy/print and imported snapshots remain available. Issue #37 adds stable per-session device drafts, grouped editable answers, protected edits and intentional blanks, refresh/relinquish, immutable account snapshots, retry/conflict recovery and validated portable backups. Compatible original device drafts can be explicitly copied with retained archive provenance; category suggestions, handoff and submission remain #38–#40. Original identity, form URL and entry IDs are never public defaults. |
| P29 | Partial / P1 | Evidence-aware report suggestions: per-file **actually practiced** audio speed/family, latest explicit performance rating, individual measured Runner verified points (highest eligible run, not sum/scaled score), actual run date rather than delayed save date, latest whole LCWO result and averaged matching-speed groups. Audit source IDs and warnings show what supported each answer. | [P/src/lib/cw-training/report.ts:54](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L54), `:112`, `:134`, `:196`; [P/src/lib/cw-training/report-panel.ts:236](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report-panel.ts#L236); tests [P/tests/cw-training-report.test.mjs:142](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-report.test.mjs#L142), `:148`, `:200`, `:234`, `:394` | Issue #38 implements explicit learner mappings and frozen source/answer provenance in the configured class-local window. Played catalog variants and explicit ratings, the highest single eligible Runner result (positive elapsed up to 900 seconds, points never summed/scaled), whole latest external LCWO/manual facts and matching character/effective-speed group errors are traceable to owned results. Native Copy retains separate compatible mappings/scoring; missing group length/adaptive speed remain unknown. Extra review is reportable without required credit. Owner-scoped captured-source validation, atomic history-revision guards and portable immutable snapshots are implemented; independent review passed and production is deployed; exact handoff/confirmation follows in #39. |
| P30 | Missing / P2      | Explicit learned-word tracking for reports: only learner-confirmed `Learned:` words, case-insensitive dedupe, omitted from later suggestions only after a submitted report, never inferred from exposure. Structured CWT heard/worked details feed appropriate fields and exclude private general notes.                                                                                       | [P/src/lib/cw-training/report.ts:186](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L186), `:196`; [P/src/lib/cw-training/report-panel.ts:233](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report-panel.ts#L233); tests [P/tests/cw-training-report.test.mjs:36](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-report.test.mjs#L36), `:273`                                         | Learned-word recognition/suppression remains #40. Native confirmed submission history is locally implemented in #39 with its review/deploy gates pending. Do not equate generated/check-copy exposure with learned vocabulary.                                                                                                                                                                                                                                                                                                                                                                           |
| P31 | Locally implemented / gates pending | Reviewable form handoff: opens a prefilled Google Form without submitting, stores exactly the opened snapshot, explicit confirmation after actual external submission, immutable submitted revision/history, downloadable report JSON, retry-safe sync. Later draft edits cannot mutate the submitted copy.                                                                                    | [P/src/lib/cw-training/report-panel.ts:163](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report-panel.ts#L163), `:282`, `:312`; [P/worker/cw-training.ts:521](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L521); tests [P/tests/cw-training-api.test.mjs:682](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-api.test.mjs#L682), `:709`                                                     | Issue #39 preserves exact reviewed private handoffs before opening/copying/printing. Safe responder prefill uses frozen mappings/answers; explicit confirmation reserves one submitted ID/timestamp, immutable history/JSON and linked corrections. Scoped durable FIFO retries and validated parent-ordered merge/replace preserve captured evidence and old imported references. The complete browser gate passed; fresh independent review and deployment remain pending. |

### Backups, migrations, and API fidelity

| ID  | Status / priority                 | Feature and exact behavior                                                                                                                                                                                                         | Personal evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Current evidence / gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P32 | Present / intentional improvement | Validated account export; transactional repeatable merge/replace; user reset/reimport; per-account profile/plan/session isolation; complete raw legacy archive retained privately. Personal source is never mutated.               | [P/src/lib/cw-training/client.ts:2191](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L2191); [P/worker/cw-training.ts:471](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L471)                                                                                                                                                                                               | [C/src/worker/training.ts:106](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/worker/training.ts#L106), `:143`, `:256`; [C/src/shared/training.ts:502](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L502); [C/src/client/main.tsx:2394](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/main.tsx#L2394). Tests prove replacement rollback and concurrent import behavior ([C/src/worker/api.test.ts:415](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/worker/api.test.ts#L415), `:456`, `:479`, `:499`). |
| P33 | Partial / P1                      | Full original data retained, but native usability differs. Personal export contains synced snapshot plus pending records, active block, report drafts/handoff, local preferences and replay-related state.                         | [P/src/lib/cw-training/storage.ts:52](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/storage.ts#L52); [P/src/lib/cw-training/client.ts:2191](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L2191)                                                                                                                                                                               | [C/src/shared/training.ts:502](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L502) natively converts attempts and curriculum tasks, merges pending attempts, and preserves entire input in legacy.data. Materials, report snapshots, LCWO history, carried/dismissed state, active block, drafts and instructor meeting-time/join settings have **no native migration/use path**. They are retained, not fully migrated. Current server backup cannot include unsaved client work.                                                                                                                                                                                         |
| P34 | Import bug / P1                   | LCWO group `speedWpm` means **effective WPM**, not character WPM.                                                                                                                                                                  | [P/src/lib/cw-training/practice-results-form.ts:15](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/practice-results-form.ts#L15); report speed semantics [P/src/lib/cw-training/report.ts:196](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L196)                                                                                                                              | [C/src/shared/training.ts:566](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L566) assigns `lcwo.speedWpm ?? runner.wpm ?? task.speedWpm` to session.characterWpm. Preserve LCWO trainer semantics and map effective/character separately when known; do not invent missing speed. Original legacy metric survives, so correction can be deterministic.                                                                                                                                                                                                                                                                                                                    |
| P35 | Import fidelity / P2              | Personal completion can derive from aggregate partial Runner seconds even with no completed:true record. Dismissal records are queue bookkeeping, not zero-minute practice history.                                                | [P/src/lib/cw-training/plan.ts:77](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L77); [P/src/lib/cw-training/history.ts:13](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/history.ts#L13); tests [P/tests/cw-training-history.test.mjs:81](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-history.test.mjs#L81), `:178` | [C/src/shared/plan.ts:431](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L431) only imports explicit completion. [C/src/shared/training.ts:535](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L535) converts all attempts into sessions, including zero-minute `[Left missed]` records; current history renders them. Correctly distinguishing bookkeeping, legitimate zero-minute observations, and derived milestones needs focused fixtures. Do not drop meaningful zero-valued QSOs/results.                                                                                                        |
| P36 | Partial / P2                      | Device export and local-only clear are separate operations; clearing a cache does not erase synced account history, and user is offered export first.                                                                              | [P/src/lib/cw-training/client.ts:2191](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L2191), `:2210`                                                                                                                                                                                                                                                                                                                                      | Current backup/reset is server account data ([C/src/worker/training.ts:106](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/worker/training.ts#L106), `:256`). There is currently little local data beyond tool preferences, so no local-clear parity requirement until recovery/offline work is added. Keep future local clear distinct from destructive account reset.                                                                                                                                                                                                                                                                                                                        |
| P37 | Intentional difference            | Personal site authenticates a configured owner through Cloudflare Access and a fixed course; public app offers independent private accounts with 5-minute browser-bound single-use email codes, passkeys, and user-scoped storage. | [P/worker/cw-training.ts:21](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L21), `:52`; tests [P/tests/cw-training-api.test.mjs:124](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-api.test.mjs#L124)                                                                                                                                                                                    | [C/src/worker/index.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/worker/index.ts); [C/src/worker/api.test.ts:178](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/worker/api.test.ts#L178), `:379`. Do not port owner defaults, deployment LCWO credentials, personal instructor form, private recordings/scales/course paragraphs, or public copies of instructor material. Shared curriculum factual metadata plus official links is deliberate.                                                                                                                                                                                     |

## Suggested implementation sequence

1. **Make records dependable and visible:** persist current attempt/draft plus retry-safe save state; create one result-details renderer for modern and imported records; fix LCWO migration semantics and bookkeeping filtering.
2. **Finish the everyday path:** resume/start next eligible work; carry/dismiss semantics; optional 10-minute word recognition counter; CWT availability; explicit review mode with familiar-material recommendations.
3. **Structured results and reporting:** typed performance/LCWO/CWT results, then advisor template/draft/source evidence/submission snapshots. Add LCWO export import first if per-user live credentials would delay this.
4. **Private materials and reminders:** material revisions and class context, class time/join URL, then calendar subscription and expanded public event companion.

These are implementation groups, not a mandate for dozens of independent features/tests. A single typed attempt/result model, source-aware history renderer, and report evidence layer should support several rows together.

## Source and test coverage

Personal runtime graph inspected: `client.ts` including all Today/Week/material/report/manual-log/settings/export/sync actions; `plan.ts`; `types.ts`; `storage.ts`; `history.ts`; `daily-listening.ts`; `practice-time.ts`; `navigation.ts`; `guidance.ts`; `other-practice.ts`; `qso-count.ts`; `cwt-result.ts`; `practice-results-form.ts`; `report.ts`; `report-panel.ts`; `report-types.ts`; `report-fields.ts`; `lcwo-types.ts`; `lcwo-practice.ts`; `worker/cw-training.ts`; `worker/lcwo.ts`; shared `cw-practice.ts`, `cw-practice-resources.ts` and public CW-practice page. Importer/course provenance was traced during the prior curriculum implementation; no restricted/private source content was opened for this audit.

Personal tests inspected as behavioral evidence: `tests/cw-training-plan.test.mjs` (date phases, carry/dismiss, review rotation, live windows, class exclusion, dormant fitting helpers); `cw-training-history.test.mjs`; `cw-training-other-practice.test.mjs`; `cw-training-time.test.mjs`; `cw-training-navigation.test.mjs`; `cw-training-daily-listening.test.mjs`; `cw-training-lcwo-practice.test.mjs`; `cw-training-lcwo.test.mjs`; `cw-training-report.test.mjs`; `cw-training-cwt.test.mjs`; `cw-training-api.test.mjs`; import tests for retained private data/metadata. These were read, not re-run. Tests corroborate wired runtime behavior; dormant plan filtering was explicitly excluded from claimed UI gaps.

Current equivalents inspected: `src/shared/{training,plan,curriculum}.ts`; `src/client/{main,TodayPlan,Plan,PracticeStudio}.tsx`; `src/client/{api,practice-launch,practice-preferences}.ts`; `src/worker/{index,training,plan}.ts`; `docs/{import,curriculum}.md`; `src/shared/{training,plan,curriculum}.test.ts`; `src/worker/api.test.ts`; existing relevant plan/today browser journeys. Additional clock review is separate and ongoing.

No parity conclusion in this document implies that private audio, instructor text, full course paragraphs/scales, owner credentials, or personal data should be republished. Current archive retention means several “missing” rows are **missing workflows**, not data loss.

## Follow-up: new practice clock source review

Reviewed [C/src/client/practice-clock.ts](../../src/client/practice-clock.ts), [C/src/client/usePracticeClock.ts](../../src/client/usePracticeClock.ts), [src/client/PracticeStudio.tsx](../../src/client/PracticeStudio.tsx) capture/save wiring, relevant `main.tsx` save behavior, and the focused clock tests. This source review supplements the passing focused browser and unit checks.

No blocking correctness findings. Actual media-position deltas determine credit; native Play is captured; pauses, waits, errors, explicit seeks and unobserved large jumps avoid idle/seek credit; playback-rate changes use the preceding sample's rate; resumed media commits and ends manual/recall timing; foreground recall pauses when hidden while external manual practice intentionally continues. The target does not cap elapsed time. Save now reads a fresh clock snapshot, so final recording totals and recall metadata are not lost through React's coarser rendered state. The interval's closed-over functions use stable refs and state setters safely.

Known nonblocking edges: seeking/native-loop boundaries may lose a fraction of a second, and saved elapsed is floored to whole seconds. Generated tool/list/speed changes can still accumulate into one block labeled with only the final generated settings; this predates the new clock and belongs to result fidelity (P18/P29), not a media-clock regression. Source recording variants now retain their own measured URL/speed/time metadata. Unfinished reload recovery and full-pass/coverage/bookmarks remain explicitly separate parity work.

## September 30 accepted issue ledger

Issue #1 adds shared versioned Runner and timer/recording evidence, validates
finite measurements, ordered Runner timestamps/speeds, score bounds, recording
identity and recall within total time. Known recording timing uses the exact URL
catalog; unknown files acquire no invented character timing. Worker saves and
portable imports derive measured fields and check account plan references.
Learner time corrections retain the immutable raw measurements and a reason;
review, history and printable reports show both. Deleted-task links in new account
exports become historical provenance, retaining the ID without assignment credit.

Evidence: `src/shared/practice-evidence.ts`, `src/shared/practice-evidence.test.ts`,
`src/worker/training.ts`, `src/worker/api.test.ts`, and
`e2e/practice-evidence.spec.ts`. Historical archives retain their original schema
and recall-inclusive audio accounting. Structured new CWT/LCWO entry and played
configuration summaries remain the later accepted issues; client results are not
independent proof of proficiency, simulator scores or on-air activity. Validation,
independent review and publication status are tracked in
`execution-progress-2026-09-30.md`.

Compatibility recheck: new backups retain version 1 and declare optional
`evidenceVersion: 1`. Unmarked older backups convert missing exercise links to
historical provenance, with an import receipt count; marked backups require
current account plan references. Earlier raw timer totals differing from saved
duration retain the saved duration as a historical correction. Contradictory
recording/recall totals remain explicit historical accounting, with raw fields
archived rather than invented corrections. Near-limit old timed metadata uses
`evidenceMode: historical` and remains unchanged within the metadata budget.
Unavailable task IDs use a validated top-level `historicalPlannedTaskId`, keeping
their provenance outside the capped metadata payload, including near-limit old
manual/timed backups and replacement imports.
History, review and reports explain this accounting; it is not current native
evidence. Current writes enforce the size limit after all normalization. Exact
owned retries acknowledge a saved record even after task deletion; Runner review
retains a stable run-owned session identity, timestamp and date when reopened.

### Issue #2 — completed-result and mutable account synchronization

The original [device state](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/storage.ts#L21)
and [synchronization](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L188)
were rechecked as evidence. Companion now queues manual/finished Runner results
with the same immutable account-scoped ID/body mechanism as copy and listening.
A local receipt requires durable readback. History shows pending results and
failed uploads; reconnect/auth retry preserves exact identities and evidence.
Confirmed results continue through account export/import and printable reports.

`account-outbox.ts` and `useAccountData.ts` own bounded cached confirmed snapshots
and semantic profile/plan operations; Plan no longer maintains a separate fetched
task array. Create/edit/delete, explicit complete/reopen and Today dismissal all
project immediately after a durable receipt. Pending, failed and conflicted states
remain visible. Dirty editors freeze their opening baseline/revision and patch
only changed fields. Curriculum source facts remain protected. The Worker wraps
conditional revision guard, mutations and compact idempotency receipt in one D1
transaction. Existing direct mutable APIs require the current revision too.

`X-CWA-Account` prevents stale account tabs from writing their queued results into
a different authenticated account. Scope changes suspend real requests and fence
late acknowledgements; cross-tab cache selection clears other private projections.
Per-ID records prevent stale queue-array writes from dropping newer work. Explicit
conflict comparison offers keep-online or a fresh semantic reapplication against
the displayed online revision; reconnect does not silently overwrite newer data.
Dependent result uploads wait for pending plan changes. Server-owned retired task
IDs let delayed results retain historical placement after a queued deletion or
course change without granting active assignment credit; unknown/foreign task IDs
remain rejected. Device retry bodies and measured source facts remain unchanged.

Validation: shared/client/real-SQL Worker cases cover exact uncertain retry,
conditional and concurrent revisions, invalid/cross-account operations, immutable
curriculum facts, quota rollback, storage readback failure and delayed acknowledgements.
`e2e/offline-sync.spec.ts` uses actual engine time plus disconnected requests and
real controls at desktop/mobile widths; a second tab verifies dirty-draft conflict
resolution. Publication/review evidence is in the execution progress journal.
Full device export/restore/clear and reset/replacement ordering remain #3/#4.
Cached identity is labeled device data and grants no server authority; the app
shell still needs to load. No active elapsed-time reload/crash recovery is claimed.

Independent review identified and corrected four issue #2 boundaries: failed
selection writes invalidate the previous account's offline fallback with a visible
storage notice; preference fields disable during their short save receipt window;
merge imports retire removed owned task links transactionally; and new linked
result placement shares the conditional SQL write boundary. Placement contention
rechecks the unchanged frozen result, with retryable failure if it persists.
Earlier saved progress remains intact when a course is reselected. These changes
use the existing outboxes, revision guard and evidence model. Independent recheck
and publication status remain in the execution journal.

### Issue #3 — device backup, restore and local-only clear

P33 now has a native, versioned selected-scope device file distinct from server
account export. Its explicit inventory covers completed retry bodies/origins,
semantic plan/settings operations/order, offline account context, existing copy
recovery/preferences and scoped scratchpads. Shared defaults are labeled
separately and restored only by choice. Strict bounded validation rejects an
incompatible version, wrong scope, malformed work and changed immutable identities
before writing. Repeated restore retains IDs and retry evidence; it does not
rebase account edits or grant authentication. Original archived report/material
snapshots still do not become native authoring workflows through this feature.

P36 now has a reachable export-first local-clear confirmation, cancellation and
storage failure/recovery feedback. The original
[device clear](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L2210)
was rechecked as read-only evidence. Companion adds durable per-scope busy/ready
ownership, actual upload cancellation and guarded receipts/cleanup so another tab
or late acknowledgement cannot recreate deleted local work. Confirmed history,
other accounts and shared preferences remain separate. Previously sent writes
may already have committed; the UI lists uncertain request identities and directs
the learner to confirmed account history. This is local device lifecycle
protection, not issue #4's server dataset reset/replacement boundary.

See [device inventory](../../src/client/device-backup.ts),
[ownership fence](../../src/client/device-scope.ts),
[controls](../../src/client/DeviceData.tsx), and
[browser workflow](../../e2e/device-data.spec.ts). Future report/list/sending
stores must join the same inventory. Approved scope excludes new elapsed-time
reload/crash recovery for active non-copy practice; existing copy recovery stays.

The independent review required strict string enums throughout restored work,
rollback memory independent of a valid export, current-token retry state surviving
ready observers, visible modal focus containment and retirement of the old Copy
lease. These corrections preserve the original IDs and measurements. A separately
reproduced disconnected Guest reopen uses the displayed Guest scope without
changing account selection; private account mismatches still reject before writes.
Correction validation and the independent recheck remain in the execution journal.
The recheck closed those six findings and reproduced notification overlap with
mobile device file controls. The shared dialog layer now sits above page notices;
actual Download/Choose gestures remain usable while a notice is present.

### Issue #4 — reset and replacement lifecycle

P32/P33/P36 now share an account lifecycle boundary for destructive server changes.
The original read-only device clear remains evidence for pausing owners and
retaining a recovery export; the Companion regression was established with
synthetic delayed writes rather than destructive production data.

Frozen reset/replacement identities, canonical file hashes, durable outcome
receipts and atomic generation guards prevent old queued or delayed SQL from
repopulating new history. Exact destructive retries acknowledge the same outcome;
safe cancellation races application on its reserved identity. Portable files do
not carry runtime authority. A bounded cancellation reservation is established
before destructive admission so a full payload quota cannot strand an admitted
request without space to stop it.

The review identifies the owner, pending counts and exact replacement file, and
offers server plus complete device downloads with explicit recovery/discard
policy. Unknown outcomes remain paused across navigation/reopen with reachable
check, exact retry and safe-stop controls. Applied cleanup failures retry local
finalization; canceled requests recover original bodies/order and volatile state.
Cancellation after a remote dataset change retires old work and describes the
current log. A second open page reloads current history after the account boundary;
ordinary local device clear does not repopulate its cleared cache/history.
Changed remote generations fence owners before cache/history publication and
require a deliberate device recovery disposition. Other accounts, Guest work and
shared defaults remain separate. Existing public practice and evidence stay intact.

Independent review reproduced unreadable mobile recovery columns and a newer
server-only result absent from the selected Keep files. Recovery feedback now uses
a full-width stack. The downloaded server file is bound to a coherent server
snapshot and a separate history mutation counter; the actual destructive SQL
rejects later unlinked entry changes as well as semantic changes. Safe stop and
newer observed authority invalidate the old download permission. Portable files
retain data/evidence without granting runtime authority. Corrections passed complete
local validation and independent desktop/mobile, keyboard/touch, file-recovery and
SQL rechecks; both substantive findings are resolved.

See [protocol](../../src/shared/account-lifecycle.ts),
[Worker](../../src/worker/account-lifecycle.ts),
[coordinator](../../src/client/account-lifecycle.ts), and
[actual UI verification](../../e2e/account-lifecycle.spec.ts). Validation and the
required fresh independent gate are in the execution journal. All 463 fast checks
and 47 serialized browser journeys passed locally. The independent reviewer
accepted 16 new and seven committed browser journeys, 28 inspected captures and
fresh client/Worker/SQL checks. Signed publication, migration 6 and production
verification are complete, and issue #4 is closed.

### Issue #5 — extra review and required assignment evidence

P08/P10 now share an explicit captured purpose boundary: deliberate review stays
linked to the source exercise and contributes useful daily/report practice once,
while required task credit excludes it before direct/alias matching. Ordinary
unflagged historical work keeps ordinary meaning; original review flags are
strictly validated and preserved without guessing from completion or labels.
This delivers native review context rather than the separate P08 recommendation
pool/rotation, which remains issue #24. Pass tracking and cumulative Runner
completion remain their separate issues.

Today and Whole course/Show completed make review reachable for incomplete and
completed exercises. Studio, reviewed save, history and reports explain its
purpose; explicit Complete/Reopen does not reclassify the captured block. Timed,
manual, Runner and Copy producers share attribution and retain raw evidence in
exact retries and portable files. Restored Copy context stays authoritative until
a deliberate new round; a same-task opposite-purpose request is explained visibly.
Worker purpose immutability and owned/retired links protect note editing and
cross-account saves/imports. No schema/binding change is needed.
The class/practice checkbox now controls the review explanation as well as its
existing placement: class review remains outside the daily practice goal, and
immutable retries retain the captured placement.

See [source exclusion](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/plan.ts#L79),
[shared accounting](../../src/shared/plan.ts),
[validation](../../src/shared/training.ts), and
[actual workflow](../../e2e/review-purpose.spec.ts).
Root typecheck, 496 tests across 37 files, build and all 49 serialized browser
journeys passed before the implementation commit. Independent review passed five
student workflows and 202 focused checks, and required the class-placement copy
correction. Correction check, all 496 tests, build and all 49 browser journeys
pass. Independent recheck accepted four fresh desktop/mobile workflows covering
class save/edit and unavailable-storage exact retry. Both signed commits preserve
the reviewed trees; production root/health, anonymous privacy and asset-hash
verification pass. Issue #5 is closed, with publication/deployment evidence in
the execution journal. No broader parity, elapsed-time recovery or physical-device
claim is made.

### Issue #6 — current block across in-app views

P11 and the accepted in-app subset of P15 now share one mounted current owner.
Today, Week and Report inspection pauses the current block without a history
entry, reset or replacement. Return reveals the same task/tool, captured
assigned/review purpose, identity, time, source subtotals, notes, selected native
recording/position and exact generated script. A visible current-block return
action also appears outside Practice, and the existing Report modal can return
directly to that owner. Playback and timers remain paused until explicitly
started. The baseline table above remains historical evidence.

One keyed navigation flight separates inspection from deliberate Finish,
assignment/tool replacement and discard. It pauses before showing another view,
joins the same pending intent, refuses competing intents and checks ownership
again after asynchronous settlement. Hidden controls become inert immediately,
including while awaiting the running Runner's bounded stop acknowledgement.
Runner retains its acknowledged partial/terminal result rather than pretending
the live contest can resume. Copy retains its existing draft and lease; finished
queues continue using their immutable bodies without hidden focus or playback.

Explicit Finish/switch retains the existing listening/public timed save policy
for at least 30 credited seconds and the separate manual/Runner save/discard
decision. Cancellation keeps the paused block. A reviewed save carries its
originating launch and measured identity; editing another historical timer/Morse
entry cannot clear current notes/time. Scratchpad cleanup requires the captured
originating launch too; separately logging that assignment from Today preserves
the paused block's stored notes. Manual Finish truthfully distinguishes discarded
unsaved time from the scratchpad retained on device. Account selection, sign-out,
device clear,
restore and destructive lifecycle changes dispose the old owner and prevent a
late navigation/save callback from reviving it in another scope.
Refreshing the same account on reconnect retains the block. Copy/Runner receipts
do not clear the listening owner's notes. Deferred view focus respects a newer
learner focus; a restored device draft opens paused through the explicit fresh
Start action after the retired owner has been disposed.

This delivery does not add P38's saved/current daily-total breakdown or the
eligible-next recommendation workflow. Existing time/result evidence,
export/import and durable completed queues stay unchanged. Elapsed-time recovery
after reload/crash is excluded; no non-copy elapsed draft or new Worker schema
is added. Actual settings history, pass coverage, cumulative Runner and advisor
draft/submission work remain separate issues.

See [original view-only navigation](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/navigation.ts#L6),
[original active-block switching](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L506),
[current coordinator](../../src/client/practice-navigation.ts),
[mounted host](../../src/client/main.tsx),
[Studio](../../src/client/PracticeStudio.tsx), and
[Runner stop flight](../../src/client/runner-stop-flight.ts).
Typecheck, all 512 tests across 40 files, production build and all 54 serialized
browser journeys pass, including desktop keyboard/mobile touch continuity and
exact retry boundaries. Initial independent review reproduced both the ownerless
same-assignment scratchpad cleanup and misleading manual Finish copy at both
widths. Both corrections are independently accepted; all 18 distinct acceptance
cases pass (17 plus one reviewer-only selector recheck). Signed publication,
production verification and #6 closure are recorded in the
[execution journal](execution-progress-2026-09-30.md). No reload/crash or
physical-device continuity claim is made.

### Issue #7 — generated-listening evidence in records and reports

The baseline final-selected-settings gap in P18/P29 is addressed by bounded
actual played configurations inside timed raw evidence. Shared validation and
formatting carry published identities/custom descriptions, speeds, pitch/spacing,
word shuffle/repeat/answer settings and actual generated station calls into save
review, expandable history and the printable report. Mixed configurations supply
no final-selected single speed. Existing scoped stable-ID queues, corrections,
owned-task checks and transactional v1 export/import retain the same facts.
Generated review starts at its focused heading and played evidence; keyboard
navigation still reaches Save without clipping the initial evidence viewport.

Private custom text/contact scripts remain with the running Studio rather than
server records or public assets. No per-source elapsed allocation or proficiency
is invented. Actual media time remains the existing clock's responsibility.
Source, SQL and desktop/mobile validation and independent acceptance are tracked
in the [execution journal](execution-progress-2026-09-30.md). The independent #7
gate passed after the review-focus correction; signed commits are published,
production is verified and #7 is closed.

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


### Issue #18 — private class time and joining workflow

The learner configures ordinary wall times and individual 1–16 session exceptions
in an explicit IANA meeting timezone, previews local starts/ends and sees upcoming,
active and finished classes in Today/Academy guide. Exceptions preserve curriculum
dates and session identities. DST gaps reject, folds choose the earlier occurrence,
overnight ends are explicit, and coherent 1-minute–24-hour intervals cannot overlap.
Changing the display timezone does not reinterpret saved meeting wall times.
Private Join class accepts HTTP/S without userinfo and retains required access
parameters. Guest/public UI receives no personal join detail. Class logs use the
existing private log, retain Class history and remain outside independent goals
and required assignment progress. Calendar display does not measure attendance.

Migration 0007 adds nullable owner-row schedule JSON. Versioned optional profile
projection reuses scoped settings CAS/outbox/exact retry and transactional private
import/export/reset/lifecycle. Old date-only records remain untimed; original
imported schedules/join references remain readable, without automatic conversion.
Five actual-SQL tests protect ownership, rollback, exact receipts and old/native
backup/reset compatibility. New pure tests cover DST/overnight boundaries, timezones,
validation, stable course dates and early calendar years. One representative mixed
keyboard/touch browser journey passes configuration, failed save/retry, Join popup,
class phases, cancellation, class history and a real private backup download.
Six distinct settled screens pass geometry and Axe at 1440/390 pixels (twelve empty
reports); inspected screenshots are Chromium emulation. Check, all 950 tests/52
files and build pass. The full serialized browser gate passes all 64 journeys in 13.1 minutes.
Post-commit independent acceptance and production delivery remain pending. See the canonical issue #18 ledger for exact
source pins, implementation ownership and retained fixture failures.

The shared conflict panel shows human-readable online/local meeting times,
exceptions, timezone and exact join link rather than opaque object text. The
representative journey exercises a real stale-revision conflict and Keep online
version. Existing imported-history coverage opens both original meeting
timestamps and the exact original join link and asserts no native time conversion.
These focused journeys pass in 18/5.5 seconds. The deliberately interrupted
14-pass full run is not counted as complete; its trace remains retained.

Normalized join-link length is bounded after percent-encoding to keep accepted
URLs within private storage limits. Its regression plus subsequent check, all
950 tests/52 files, build and focused schedule browser journey pass. The full gate
precedes that isolated validation-boundary correction; interface and native media
wiring are unchanged. No binding/config type regeneration is required.


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


### Issue #19 — P05/P38 daily goal and disjoint-time delivery

The exact-date assignment rule now makes required daily goal zero on rest dates,
without discarding the existing optional personal target. Completed assignments
still establish their original required date. Earlier unfinished and undated
future session preparation do not silently create required dates. Saved positive
independent dates retain their previous streak meaning; legacy estimates retain
original provenance and accounting.

Today/Overview and Studio share a readonly saved/current/combined projection from
the existing clock and acknowledged engine owners. Stable IDs transfer once to
saved device/server receipts, including edited zero/class receipts. Class is
separate; recall is included within total. Retained terminal Runner results stay
current pending review and are deduplicated against the live owner and receipt.
Zero, invalid, future and other-day data add no credit. Guest summaries use their
actual scoped device work, never the sample log. Scope/device/launch fencing and
existing save/backup/lifecycle ownership remain intact.

A common learner-calendar refresh handles midnight and visibility while paused.
New blocks freeze start-zone attribution, including optional validated zone in
existing Copy drafts/private device inventory; old omitted drafts and exact
pending bodies remain compatible. Across midnight the retained prior-day block
is explicitly outside today's totals. Saving keeps its date. No new goal policy
field, backend entity, schema or binding; no unfinished elapsed reload/crash
recovery. P15's earlier historical persistence recommendation is superseded by the
approved scope. Existing Copy and finished-result recovery remain supported.

See [implementation ledger](../trainer-parity.md#issue-19--requiredrest-goals-and-shared-daily-practice-time),
[shared summary](../../src/shared/practice-time.ts),
[changed manual journey](../../e2e/practice-time.spec.ts), and native assertions in
existing Copy/Runner journeys. Initial browser setup failures and final gates are
retained in ignored progress notes; independent acceptance/production evidence
will be appended after the required post-commit review. Physical-device behavior
is unverified, original evidence remains read-only, and no push is permitted.


Issue #19 implementation gate: check, 967 fast tests/53 files and build pass;
all 65 serialized browser journeys pass in 13.4 minutes. Focused summary/storage
83 cases and actual native Copy/Runner checks pass, with eight empty settled
Axe reports across the changed daily-summary states. The obsolete goal-ring
selector was corrected to exact shared totals; its original failure trace is
retained and the final complete gate is clean. Post-commit independent review
and production delivery remain pending; see the canonical validation ledger.


Issue #19 independently ACCEPTED: four own browser journeys, sixteen empty Axe
and overflow checks, 51 focused tests and ten own boundary groups pass with actual
native Copy/Runner/listening measurements. No substantive finding or product
follow-up is required. Production `40d406d3-dede-49c0-b5c5-03e908e084d1`
serves implementation `bca5901b744f72d6e4d1f095907d29d1ae01fc3f`; exact
assets/private401 checks pass after one D1 7403 full-task retry. Local main records
delivery; #19 remains OPEN/unpublished, with no push or original-site mutation.
See canonical acceptance ledger for complete counts, failed probes and limits.


### Issue #20 — P26 public agenda and calendar implementation

The accepted SST/MST/CWT public agenda/calendar is implemented using one shared
UTC schedule, freshly verified against all three organizers October 2, 2026.
Current windows remain active until exact end; next and bounded future windows,
explicit IANA Local/UTC display, retained preference and clipboard-denied manual
copy are reachable without an account. Studio inspection pauses/retains practice.
Nine stable recurring UIDs, deliberate sequence/version, UTF-8 folding and actual
parser recurrence expansion agree with shared queries across DST/year rollover.
Public GET/HEAD/cache/conditional/405 routing queries no auth, class or D1 data.
Shared display preference joins optional strict device inventory and opt-in restore;
old backups stay compatible. No schema/binding/config change or attendance credit.
Initial check/focused58cases/runtime journey8.8s and ten clean responsive Axe checks
pass; full gates, post-commit independent review and deployment remain pending.
See [canonical #20 ledger](../trainer-parity.md#issue-20--verified-public-sstmstcwt-agenda-and-recurring-calendar)
for official sources, concrete behavior and honest limits. P06 private CWT deadline
eligibility remains #21; P25 private subscriptions #46. Historical unrelated public
NNN/Giving Back/resource/contact recommendations are superseded by approved scope.

Final root gates: check, 983 tests/57 files, build and all 66 serialized browser
journeys (13.6 minutes) pass. Two short-height sidebar regressions were corrected
and confirmed by seven focused checks and the full suite. Independent review and
production acceptance remain pending. The canonical ledger retains the failed
run evidence and exact limits.


Issue #20 independently ACCEPTED with no substantive findings: nine own fast
probes, three own browser journeys (25.2s), ten empty Axe/overflow checks and seven
inspected captures. Native pause/return preserves actual media/notes without save
or autoplay. Production `2fe8a9b4-ed9d-45ce-9cfa-4b97633a0aef` serves
`44296a12334fddfc8a3d63970c02847832404e3d`; exact assets/private401s and
public GET/HEAD/304/405/unique recurring parser agreement pass after one D1 7403
complete-task retry. The canonical ledger preserves counts, probe failure and
calendar/physical-device limits. Local main records acceptance; #20 stays OPEN
under no-push. Private CWT eligibility is #21, reminders #46; no original mutation.


### Issue #21 — P06 assigned live eligibility implementation

Typed live event/class-or-practice-date policies reuse the verified public UTC
schedule. Actual dated class starts, conservative date-only fallback and explicit
practice-day ends determine strict start-before-due windows. Today/course/Studio
show exact local/UTC starts and ends, active/next/unavailable guidance and official
rules. Future seven-day live previews create no today's goal; actual unavailable
Start/Resume is gated while preparation, retained work, manual logging and
completion remain reachable. The shared availability predicate is ready for
#22's next-block selector, whose absent action is not claimed as delivered here.
Owned metadata validates/export/imports with real SQL rollback and account privacy;
public calendars query no private class state. See the [canonical #21 ledger](../trainer-parity.md#issue-21--eligible-assigned-live-windows-before-class)
for exact fallback, source, evidence, fixture corrections and remaining limits.
Initial 215 focused cases/typecheck and representative browser journey (22.2s,
ten clean responsive Axe/overflow checks, keyboard/mobile cancellation and 503
exact retry) pass; new seven-day preview domain coverage also passes. Final full
gates, post-commit independent review, deployment and source publication remain
pending. Approved exclusions and the original read-only policy remain intact.


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


Issue #21 independently ACCEPTED after both P2 corrections. Current optional
event bindings and both fresh timer activation guards pass own add/clear/stale
click repros; actual native audio owner/position/notes survive edits. Independent
180tests/four own browser probes/two representative journeys/26emptyAxe across
13states/six inspected captures and all17committed-byte checks pass. Root
994tests58files/build/check/full68browser13.9m pass. Production
`92378d54-1a2d-443d-bae5-31ca912ec440` serves accepted476d0e8b+627fc4f2
after one D17403 full-task retry; exact assets/private401/public-feed parser
checks pass. See canonical acceptance ledger for evidence, inspected CSP fixture
failure and limits. Local main records delivery; #21 stays OPEN under no push.
Automatic next action remains dependent22. Original and user work unchanged.


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


## Issue #35 — optional account-scoped LCWO source history (review pending)

Rechecked current issue body/comments/dependencies and pinned/current original
transport, category types, sync and full-block estimate accounting. Current
canonical LCWO source still has a maintainable request-only login/export path;
authenticated canonical filename headers and consistent UID verify identity,
including empty-account username with an unknown numeric UID. Current TIMESTAMP
retrieval uses UTC; original source timestamp remains preserved verbatim.

Consent/link/explicit refresh/disconnect now reaches the scoped Worker and atomic
D1 storage. All four categories validate before commit; source-ID conflicts,
identity changes, malformed/oversized/partial exports, timeout and quota errors
retain rows and last-success. Revision/generation guards fence disconnect/reset
races. No passwords/cookies are persisted or exported. Read-only history/reports
preserve exact source facts and meanings; explicit disabled-by-default bounded
group assumptions suppress full-history overlaps, unknown same-day blocks and
historical source-ID duplicates. No guessed words/callsigns/Koch duration or
assignment completion. Export/merge/replace/reset preserve private lifecycle
semantics; restored links stay disconnected, including merge into a linked account.

Focused check/types and 239 domain/transport/real-SQL tests pass; two serial
real-runtime browser workflows cover desktop/mobile, keyboard/touch, consent,
source inspector, report overlap, cancellation/partial failure/retry/disconnect,
focus and actual portable file download/merge. Axe/overflow screens and inspected
captures are retained. Source upstream is synthetic; no real credentials, source
site mutation, physical device, new speech recognition or crash/reload elapsed
recovery is claimed. Full checks, implementation commit, required independent
review, deployment and final issue comment remain pending. Main remains #34's
accepted journal; no push will be attempted.

Root full check/all 1,312 fast tests in 70 files/build pass. The full browser
attempt passed 95 and failed one mobile native course-replay count; the unchanged
isolated journey passes. Retained evidence and unconfirmed cause are documented
in the parity inventory. No native workaround; complete serial rerun pending.

Final root gate passes check/all 1,312 tests in 70 files/build and all 96 serial
browser journeys in 18.1 minutes (actual exit 0). The unchanged mobile replay
journey passes in the complete rerun. Earlier failures/interruption remain
retained and honestly documented. Implementation commit and independent review
follow this gate; production delivery remains pending. No push is authorized.


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


## Issue #38 — independent acceptance and production delivery

Implementation `7d319f425a0824b038e4b80d6c53c004ee822fd1` passed fresh
post-commit independent review with no substantive findings. Three own
real-Wrangler/D1 journeys exercised desktop keyboard frozen exact-body retry
with later practice arriving, changed referenced-source rejection/recovery,
immutable backups, mobile touch whole latest LCWO unknowns, separate Copy/group
facts, mapping cancellation, bounded source detail disclosure and initial/refresh
96,000-byte failure recovery preserving the prior draft. Four settled Axe and
layout checks were clear. Seventeen domain and three actual-SQL Worker cases
passed independently. The reviewer verified all 541 tracked and 173 dist hashes,
original HEAD/pin/reference bytes and five pre-existing dirty hashes unchanged,
then terminated its runtime and explicitly released the lease. Earlier review
fixture/control/detail assertions remain documented as failed attempts; no
failed combined attempt is called a complete passing gate.

`mise run deploy` passed check, all 1,423 tests in 75 files, build and dry run,
applied `0011_report_provenance_guard.sql`, and deployed production version
`3df00515-e994-4594-a986-fb3d4abddad8`. Read-only verification found root and
health 200, private entries/account state/lifecycle backup/LCWO 401 anonymously,
and exact hashes for all four built JavaScript/CSS assets and the public Runner
integration module. Root's complete 102 serial browser journeys passed in 18.8
minutes; its two intentionally interrupted attempts remain non-passing evidence.

Local main records accepted delivery. No push or PR was attempted; source is
unpublished and #38 stays open pending publication. Evidence is private source
attribution, not exhaustive server certification or cryptographic attestation.
Omitted embedded details are disclosed while owned source IDs/private backup
facts remain available. Browser widths/touch are emulated; physical-device,
live LCWO, external-form submission and production private-write verification
are not claimed. Exact handoff/confirmation #39 and learned words #40 follow.


## Issue #39 implementation — preserved handoff and explicit confirmation

Current #39 body/comments and dependencies #2/#36/#37 were rechecked. Closed #2
retains the delivered scoped durable account outbox, receipt/CAS/FIFO projection
and meaningful failure recovery; the current fast outbox/Worker gates and affected
browser journeys verify those boundaries rather than skipping on issue state.
#36/#37 remain open only for unpublished source under the no-push instruction.
Current original report panel/Worker references are byte-identical to pinned
`3106c9b8bf20b63be069f4019467cb565cdd17ec`; the original remains read-only.

Prepare reviewed handoff validates required answers with field-level errors and
focuses the first invalid field. Its independent immutable ID freezes definition,
class/date/window, exact literal answers/edited blanks, configured external
mapping and private evidence/provenance before any native open/copy/print action
is exposed. Existing account outbox storage is verified before releasing that
capture. A queued capture stays usable while waiting to upload; refused essential
storage exposes no new external action and retains the editable draft with retry.
HTTPS responder GET links replace stale mapped query values, including blanks;
all fields require external IDs before opening. Missing/long mappings retain
captured copy/print/JSON alternatives. Local/IP/submission endpoints and credential
URLs are rejected. No fixed advisor/form/entry IDs are defaults and no external
submission or instructor message is automated. The printable text-node iframe
contains only the captured report; OS printer behavior is not claimed.

Each handoff reserves one submitted ID. Explicit acceptance checkbox/operation
creates the exact preserved copy with confirmation timestamp, never the current
working draft. The checkbox belongs to the selected handoff. Draft edits/session
switches/reload do not change frozen copies. Waiting/failed/account-saved statuses
and exact retry bodies reuse existing account ownership/generation boundaries.
Confirmations use already validated captured provenance rather than rebuilding
later source facts. Immutable history shows class/date/confirmation/source IDs,
answers and evidence; handoff and submitted JSON downloads preserve exact contents.
An explicit correction creates a new linked working draft and later separate
handoff/submission. Original imported submissions remain historical references,
with the existing explicit separate-draft reopen action retained.

Typed account operations and strict bounded portable report fields reuse the
200-copy/96,000-byte per-document/private account quota and existing immutable
SQL rows. Migration `0012_report_handoffs.sql` reserves submission identities and
requires owned handoff/correction parents inside the write transaction. Shared
relationships require exact captured values, safe reserved IDs and acyclic owned
correction links. Validated private merge/replace imports insert parents first,
even for reversed input; broken/forged/foreign relationships reject atomically.
Exact acknowledgement retries create one stable immutable record. No Worker
binding/config changed; type generation is not required.

Root check, all 1,432 tests in 76 files and build pass. Five new domain cases,
one distinct handoff/confirmation FIFO-outbox case and three actual-SQL Worker
cases cover exact values/mappings, required/unsafe/long inputs, explicit confirm,
foreign/missing/forged references, reserved IDs, linked corrections, reverse
merge/replace portability, later real assessment edits, future timestamps and
receipt rollback. Six affected real-Wrangler/D1 browser journeys pass in 32.1
seconds, including original submitted-reference reopen, two-tab/storage recovery
and the two new handoff flows. New desktop keyboard/mobile touch checks exercise
synthetic actual popup URL, clipboard content, separate print document, validation
focus, required fields, cancellation, draft/session changes, offline confirmation,
reload/exact retry, history/linked corrections and actual JSON/private backup
file selection. Six new settled Axe/overflow scans are clear; pixels inspected.
The initial future browser clock and wrong synthetic source ID/long-URL boundary
fixtures were corrected; failed logs remain and no validator/timeout was relaxed.

The complete serial browser gate, focused implementation commit/main update,
fresh independent post-commit review and production delivery remain required.
No source push/PR, original-site mutation, production private write, live external
form/LCWO interaction or physical-device verification is claimed. Learned-word
recognition/suppression remains #40; no new vocabulary exposure inference occurs.


The first complete #39 browser attempt was intentionally interrupted (exit 130)
after 17 completed passes; its remaining journeys are not claimed as passed.
During review preparation, root identified an original-archive correction edge:
account-copy deduplication compared exact answers/provenance but omitted the
new revision link. A targeted real-Wrangler/D1 browser regression first failed
with four records instead of five and visible “already saved” feedback after
an unchanged-answer native correction. Deduplication now includes `revisionOf`.
The same mobile regression passes (8.9 seconds complete launcher exit 0), retains
the older draft/submitted entities exactly, and saves a distinct linked draft.
The earlier targeted attempt used a future clock and was rejected before this
boundary; its corrected-clock red assertion/trace/pixels are retained. No field
validator or timeout was relaxed. Fresh check/all-tests/build and the full
104-journey regression follow before implementation commit and independent review.


A second complete attempt was intentionally interrupted (exit 130) after 16
completed passes to cover device recovery validation. A cheap regression first
proved that an account snapshot accepted a native confirmation without its
handoff. Snapshot validation now reuses exact parent/relationship checks before
cached/device restore; valid reverse-ordered snapshots remain supported. Six
domain cases plus device/outbox recovery (85 focused tests) pass, and all six
affected browser journeys pass again in 32.1 seconds. Both interrupted full
attempts remain non-passes.

Another actual-SQL regression exposed an offline capture boundary: after a
reviewed handoff is durably saved locally, a later mutable assessment edit must
not prevent upload of the exact already-handed-off copy and its confirmation.
New handoffs therefore store bounded, validated historical private captures with
owned source/archive references and atomic reference/CAS/history guards; like
portable frozen history, they do not assert that mutable source facts still
match today. Ordinary new account draft saves retain #38 current-source checks.
Confirmation always equals its immutable owned handoff. This is private source
attribution rather than server certification of past observations. The SQL red
400 response now becomes 200 with exact retained facts, while foreign references
and stale new draft saves still reject. A separate actual mobile UI journey
passes (9.8 seconds complete launcher exit 0): handoff 503, actual assessment
change, reload/draft refresh to the new rating, old captured rating/answers
unchanged, offline explicit confirmation, FIFO exact-body retry and one owned
handoff/submitted pair. Two additional settled Axe/overflow scans are clear.
Six domain, one distinct outbox and four new SQL cases now own these boundaries.
Fresh full pre-commit and complete 105 serial browser gates follow.

### Issue #39 final implementation validation

The final complete browser launcher exited 0: 105 serial journeys passed in
19.0 minutes against isolated real Wrangler/D1. This includes three new
handoff/confirmation journeys, the original-source correction regression and
existing account/private backup, native audio, Runner and navigation workflows.
Desktop keyboard and mobile touch captures were inspected; eight new settled
Axe/overflow checks are clear. These are emulated synthetic workflows, not
physical-device, live LCWO or real external-form acceptance evidence.

Final pre-commit passed check, all 1,434 tests across 76 files and production
build. Six new domain tests, one durable-outbox case and four actual-SQL Worker
cases protect exact captured identity/answers, owner relationships, immutable
confirmation, imports, rollback and offline historical-source upload. The two
earlier interrupted complete runs (exit 130) remain non-passing attempts.
No Worker bindings/configuration changed. The existing bundle-size advisory
remains. Original HEAD, pinned references, five protected dirty files, approved
scope ledger, primary checkout HEAD and push-signing policy are unchanged.
Implementation commit and local main advancement follow; independent review and
production deployment are still pending. No push or issue closure is authorized.
