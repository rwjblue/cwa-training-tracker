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
| P28 | Missing / P1      | Advisor report per class: default preparation-date window in course timezone, editable dates, 42 form fields/sections, field validation, device autosaved answers, explicit draft snapshots, refresh from results that preserves deliberate edits including blanks.                                                                                                                            | [P/src/lib/cw-training/report-fields.ts:20](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report-fields.ts#L20); [P/src/lib/cw-training/report.ts:34](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L34), `:79`; [P/src/lib/cw-training/report-panel.ts:50](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report-panel.ts#L50), `:82`, `:228`, `:234`                               | Current report is a computed plain-text modal with no report entity/draft/history ([C/src/client/Plan.tsx:579](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/Plan.tsx#L579)). The personal Google Form URL/field mapping and identity defaults are instructor/owner-specific; generalize as configurable advisor templates, not hardcoded global behavior.                                                                                         |
| P29 | Missing / P1      | Evidence-aware report suggestions: per-file **actually practiced** audio speed/family, latest explicit performance rating, individual measured Runner verified points (highest eligible run, not sum/scaled score), actual run date rather than delayed save date, latest whole LCWO result and averaged matching-speed groups. Audit source IDs and warnings show what supported each answer. | [P/src/lib/cw-training/report.ts:54](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L54), `:112`, `:134`, `:196`; [P/src/lib/cw-training/report-panel.ts:236](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report-panel.ts#L236); tests [P/tests/cw-training-report.test.mjs:142](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-report.test.mjs#L142), `:148`, `:200`, `:234`, `:394` | Generic [C/src/shared/plan.ts:377](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L377) displays fields on each session only, with no category aggregation or evidence model. Embedded engine results now exist in metadata; summaries must use verifiedPoints and original run conditions without inventing reportable measurements.                                                                                                       |
| P30 | Missing / P2      | Explicit learned-word tracking for reports: only learner-confirmed `Learned:` words, case-insensitive dedupe, omitted from later suggestions only after a submitted report, never inferred from exposure. Structured CWT heard/worked details feed appropriate fields and exclude private general notes.                                                                                       | [P/src/lib/cw-training/report.ts:186](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L186), `:196`; [P/src/lib/cw-training/report-panel.ts:233](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report-panel.ts#L233); tests [P/tests/cw-training-report.test.mjs:36](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-report.test.mjs#L36), `:273`                                         | No learned-word or submitted-report tracking in current model. Do not equate generated/check-copy exposure with learned vocabulary.                                                                                                                                                                                                                                                                                                                                                                           |
| P31 | Missing / P1      | Reviewable form handoff: opens a prefilled Google Form without submitting, stores exactly the opened snapshot, explicit confirmation after actual external submission, immutable submitted revision/history, downloadable report JSON, retry-safe sync. Later draft edits cannot mutate the submitted copy.                                                                                    | [P/src/lib/cw-training/report-panel.ts:163](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report-panel.ts#L163), `:282`, `:312`; [P/worker/cw-training.ts:521](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L521); tests [P/tests/cw-training-api.test.mjs:682](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-api.test.mjs#L682), `:709`                                                     | No handoff/submission/revision/report export in current [C/src/client/Plan.tsx:579](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/Plan.tsx#L579). Current full-account JSON backup is distinct from an advisor report artifact.                                                                                                                                                                                                                    |

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
