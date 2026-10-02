# Recorded audio, shared player, timer, and scratchpad parity audit

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

**Addressed:** native Play and app Play both start media-derived accounting;
pauses, seeks and buffering do not accrue idle time; targets no longer cap playback;
assigned recordings have a separate recall timer; scratchpad is saved, editable and
visible in history; verified official speed files can be selected with a device-local
Assigned/Next preference and actual per-file usage metadata. Official recordings stay
at native 1x playback. Assigned-audio unmount cleanup and the scratchpad-only guard
before switching to Runner are fixed.

**Lock-screen metadata follow-up:** official recordings now publish the session,
selected catalog title, actual WPM, and CWA Morse artwork. Generated tracks use
the same artwork and shared [Media Session controller](../../src/client/media-session.ts).
Only actual playback claims ownership; old player cleanup cannot remove the next
player's metadata or controls. Source changes and leaving practice release the old
session. The 192/512 PNGs are raster exports of `public/favicon.svg`. Browser
journeys cover official speed switches, generated-track titles, artwork decoding,
pause state, and teardown. This does not establish physical iPhone appearance.

**Prerecorded spoken follow-up (2026-09-30):** both public word lists now have
checked-in generated WAV answers. Three Morse plays, speech and all pauses are
spliced into one native track; native looping, seeking, pause/resume and actual
media-derived time work together. Browser speech and the hidden-page stop are
removed. Custom spoken words require published clips. Tests use real recordings;
physical iPhone lock-screen verification and prebuilt MP3 optimization remain
outstanding. See [provenance](../spoken-audio.md).

**Current continuity:** scoped scratchpad notes, retained content and completed-result
queues use the delivered device persistence and backup workflows. In-app inspection
pauses and retains the block; canceled review and failed saves preserve its owner.
Active elapsed-time recovery after reload/crash is excluded by the approved scope.

**Review controls delivered (#12):** Replay 8 seconds and bounded private difficult
marks use exact native-file identity, the existing task outbox and immutable saved
recording snapshots. Failed mark drafts survive file switches and inspection.
All published linked files are supported; unknown timing remains unmeasured.

**Still missing or partial:** full generated-player retiming continuity and remaining
advisor-report integration. Later issue ledgers record their delivery; baseline
findings below preserve the original audit.
No physical locked-iOS verification is claimed.

Updated source: [clock](../../src/client/practice-clock.ts),
[media event hook](../../src/client/usePracticeClock.ts),
[Studio](../../src/client/PracticeStudio.tsx),
[speed selection](../../src/client/RecordingSpeedSelect.tsx),
[catalog matching](../../src/client/recording-variants.ts),
[save/history UI](../../src/client/main.tsx).

Reviewed 2026-09-29. Read-only comparison of the personal site with the tracker,
followed by an isolated official-recording catalog/selector implementation.
Baseline gaps below describe the tracker before the accompanying changes;
the update ledger above distinguishes the implemented fixes from remaining work. No personal-site files were changed and no private audio or
curriculum content was copied.

## Reviewed source coverage

### Personal source reviewed

Entry wiring:

- [src/pages/radio/cw-training.astro:3](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/pages/radio/cw-training.astro#L3), `:177`, `:218`, `:278`, `:350`, `:451`:
  official recording UI, shared generated player, scratchpad, preferences, finish.
- [src/components/CwListeningPlayer.astro:1](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/components/CwListeningPlayer.astro#L1): thin host wrapper; actual behavior
  comes from the shared `cw-listening` modules, not this Astro component.
- [src/lib/cw-training/client.ts:1](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L1): imports/adapter. Relevant sections reviewed:
  device load/persist 117–225; speed selectors 421–447; active rendering 825–977;
  timer 1231–1284; starting/switching/saving blocks 1286–1551; native audio events
  1598–1780; recall/replay/bookmark actions 2051–2077; speed changes/scratchpad
  2236–2286; final saved attempt 2291–2399; visibility/reload 2591–2644.

Official audio/time/state:

- [src/lib/cw-training/audio-variants.ts:1](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/audio-variants.ts#L1) (entire module).
- [src/lib/cw-training/audio-session.ts:1](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/audio-session.ts#L1) (entire module).
- [src/lib/cw-training/practice-time.ts:1](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/practice-time.ts#L1) (entire module).
- [src/lib/cw-training/storage.ts:12](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/storage.ts#L12) (state schema and serialized IndexedDB writes).
- [src/lib/cw-training/daily-listening.ts:1](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/daily-listening.ts#L1) (entire module).
- [src/lib/cw-training/guidance.ts:1](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/guidance.ts#L1) (entire module).
- [src/data/cw-training/audio-variants.json:1](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/data/cw-training/audio-variants.json#L1) (catalog shape, groups, metadata).
- [scripts/cw-training/audio-variants.mjs:1](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/scripts/cw-training/audio-variants.mjs#L1) (official heading-group parser and
  measured-duration catalog generation).
- [src/lib/cw-training/history.ts:17](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/history.ts#L17), `:70` (scratchpad history rendering).
- [src/lib/cw-training/report.ts:185](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L185), `:239`, `:259` (explicit learned words and
  per-recording report suggestions).
- [worker/cw-training.ts:222](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L222), `:254`, `:270`, `:678`, `:718` (saved fields and
  private original daily recording boundary; not a full worker security audit).

Shared generated-player implementation followed from the training entry point:

- [src/lib/cw-training/listening-adapter.ts:1](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/listening-adapter.ts#L1) (entire module).
- [src/lib/cw-training/word-player.ts:1](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/word-player.ts#L1) (re-export of shared player).
- [src/lib/cw-listening/player.ts:1](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/player.ts#L1) (entire module).
- [src/lib/cw-listening/word-player.ts:1](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-player.ts#L1) (entire module).
- [src/lib/cw-listening/qso-panel.ts:50](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-panel.ts#L50), `:120` (highlighting, transport, retiming).
- [src/lib/cw-listening/word-panel.ts:160](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-panel.ts#L160), `:165`, `:218` (fixed-recording choice,
  generated fallback, spoken clips, and live speed edits).
- [src/lib/cw-listening/word-assets.ts:1](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-assets.ts#L1) (entire module).

Related test cases inspected for intended contracts:

- [tests/cw-training-audio-variants.test.mjs:15](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-audio-variants.test.mjs#L15), `:79`, `:94`, `:125`, `:135`,
  `:145`, `:165`, `:176`.
- [tests/cw-training-audio-session.test.mjs:24](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-audio-session.test.mjs#L24), `:34`, `:51`, `:65`, `:95`,
  `:116`, `:130`, `:158`, `:175`, `:202`.
- [tests/cw-training-time.test.mjs:9](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-time.test.mjs#L9), `:15`, `:27`, `:34`, `:41`, `:51`, `:60`,
  `:66`, `:74`, `:83`.
- [tests/cw-training-guidance.test.mjs:11](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-guidance.test.mjs#L11), `:31`, `:42`, `:66`, `:80`.

### Tracker source reviewed

- [src/client/PracticeStudio.tsx](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/PracticeStudio.tsx): assigned recording branch, playback controls,
  timer/manual logging, saved-version reset, launch changes, navigation warning.
- [src/client/ListeningTrainer.tsx](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx): native/foreground-spoken playback, text seek,
  setting changes, QSO replay, audio mount/disposal.
- [src/client/morse-player.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/morse-player.ts): native events, seek/loop, Media Session, disposal.
- [src/client/main.tsx](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/main.tsx): navigation guards, entry dialog, metadata preservation,
  saved callbacks, and logbook row.
- [src/shared/plan.ts:7](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L7), `:109`; [src/shared/curriculum.ts:43](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/curriculum.ts#L43):
  assigned recording requirements and current material mapping.
- [src/shared/training.ts:21](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L21), `:371`, `:554`: session fields, metadata validation,
  original imported attempt retained under metadata.
- [src/client/audio.test.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/audio.test.ts); [e2e/practice.spec.ts:74](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/e2e/practice.spec.ts#L74), `:126`.
- Updated implementation reviewed separately: [src/client/practice-clock.ts](../../src/client/practice-clock.ts),
  [src/client/usePracticeClock.ts](../../src/client/usePracticeClock.ts), and current clock/scratchpad integration.

## Findings by behavior

### P1 — official recording speed choices: #11 workflow implemented; review pending

Personal [audio-variants.ts:15](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/audio-variants.ts#L15) identifies the exact official recording group by
URL, not a guessed filename. `:20` selects assigned or next verified faster speed;
explicit overrides must be at least the prescribed WPM. A maximum-speed assignment
does not wrap to a slower file. `:41` projects the playback resource while retaining
task identity, prescribed speed, requirements, and source instructions.

Personal [client.ts:433](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L433) shows speed choices in task lists and the active player,
including assigned/stretch labels and measured per-pass durations. Global default
is stored on the device ([storage.ts:68](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/storage.ts#L68)); per-task overrides are stored separately.
Changing the default applies to future blocks ([client.ts:2236](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L2236)). Changing active
speed first settles old audio and a just-finished pass, pauses, archives usage, and
starts the new file paused at zero ([client.ts:2242](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L2242)). Scratchpad and cumulative
time/passes survive. Partial coverage does not cross files ([audio-session.ts:63](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/audio-session.ts#L63)).

Baseline tracker [PracticeStudio.tsx:457](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/PracticeStudio.tsx#L457) streamed only `activity.url`; no speed
selector, default, per-task override, or mixed-speed history existed. The isolated selector was not mounted when this baseline note was written; it is
now integrated as described in the update ledger above.

Now implemented: [recording-variants.ts](../../src/client/recording-variants.ts), [RecordingSpeedSelect.tsx](../../src/client/RecordingSpeedSelect.tsx),
`recording-speed.css`, [recording-catalog.json](../../src/client/recording-catalog.json), and five focused tests. Default is
device-local assigned/next; current selection is controlled by the parent. Exact
scoped task choices now persist across visits through the independently accepted
#11 workflow below.

### P1 — playback-derived time: baseline missing; now addressed

Personal [client.ts:1608](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L1608), `:1615`, `:1666` makes either native Play or app Play
automatically credit actual media movement. Time is not inferred from an adjacent
stopwatch. Seeking establishes a new baseline (`:1623`), buffering earns no time
(`:1639`), and progress credits only plausible positive movement bounded by wall
time (`:1676`). Replayed material earns the time actually heard again.

Baseline tracker [PracticeStudio.tsx:474](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/PracticeStudio.tsx#L474) only toggled a visual playing flag from
native events. Only explicit Start practice / Start timer started its stopwatch
(`:126`, `:153`, `:285`). Native Play, clickable word seeks, and Replay QSO could
play with zero credited time. Conversely native Pause, buffering, or recording end
left an explicitly started stopwatch running. It capped at the selected target,
possibly stopping a long recording; the personal target is a planning guide.

The new `PracticeClock` and `usePracticeClock` remove this baseline problem:
capture handlers include playing, timeupdate, seek, pause/end/wait/error, emptied,
and ratechange. Clock uses positive media delta divided by the previous playback
rate with a wall-clock plausibility limit. Explicit pause/logging samples before
pausing or changing the source. Targets no longer cap listening.

### P1 — scratchpad: missing in baseline; now saved and visible in history

Personal optional scratchpad is [cw-training.astro:278](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/pages/radio/cw-training.astro#L278), max 10,000 characters,
with exercise-specific guidance from [guidance.ts:11](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/guidance.ts#L11). Every input updates active
block state and immediately queues a serialized local IndexedDB save
([client.ts:2282](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L2282), [storage.ts:117](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/storage.ts#L117)). It survives reload, pause/return, and speed
changes; it is not described as synced until the block is finished and saved.
Device-storage failure is disclosed ([client.ts:209](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L209)). Reload resumes paused
([client.ts:2632](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L2632)). Cross-account local state is rejected ([client.ts:221](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L221)).

Saving constructs an attempt with independent `scratchpad` and `note` fields
([client.ts:2379](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L2379)), then clears the active draft and queues the record. Validation
allows 10k scratchpad characters, rejects null characters (`:2317`), and backend
validates it ([worker/cw-training.ts:270](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L270)). History renders escaped multiline text
under “Recall & scratchpad” ([history.ts:70](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/history.ts#L70)). Only explicit `Learned:` lines feed
report learned words; other prose stays outside the report ([report.ts:185](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/report.ts#L185)).

Baseline tracker had only notes in the save dialog. Legacy import preserves the
original scratchpad in opaque `metadata.legacyAttempt` ([training.ts:563](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L563)) but does
not surface it. The implementation now carries an editable studio scratchpad ->
`metadata.scratchpad` -> save dialog -> dedicated history details. It deliberately
does not implement unfinished-draft persistence yet and clearly tells users to
save before leaving/reloading. The new implementation therefore remains partial
parity, not autosaved/recoverable scratchpad parity.

### P2 — completed passes and partial listening: delivered by #9; deliberate replay added in #10

Personal [client.ts:1683](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L1683) merges coverage intervals; a pass counts only when coverage
reaches duration minus one second (`:1705`). Skipping to the end does not complete
a pass; partial listening still earns time. Coverage resets for each new pass and
recording. Earlier saved passes, this block's passes, and target passes are distinct.
Assignments can be explicitly marked complete when repetition no longer helps;
completion and listening time are separate concepts ([client.ts:1540](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L1540)).

Course recording automatic replay defaults off, is remembered on the device, and
continues only while completed whole passes are below this block's target
([daily-listening.ts:16](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/daily-listening.ts#L16), `:50`; [client.ts:1746](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L1746)). Tracker shows prescribed min/max
passes at the baseline. Issue #9 adds actual coverage/pass evidence; the course
recording replay policy is added by #10 with device opt-in, observed full-pass
continuation, owned saved/current target counts and explicit cancellation.

### P2 — explicit recall timer: baseline missing; now implemented

Personal [client.ts:2051](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L2051) starts recall by pausing audio; active time includes recall
but records recall seconds separately. Ordinary pauses and breaks do not count.
Playing audio stops recall. [practice-time.ts:14](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/practice-time.ts#L14) excludes audio-playing time,
hidden pages, negative/invalid ticks, and delayed ticks of four seconds or more.
This avoids crediting sleep or a suspended page as focused recall. Finish allows
recall correction within total practice time ([client.ts:2311](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L2311)).

Issue #8 adds a single guarded settlement used by observation, Pause, review,
inspection and every mode transition. Hidden, invalid, backward and >=4-second
recall samples add no time and pause recall; earlier observed credit remains.
A visible notice explains the omission and correction, and only deliberate
resume establishes a fresh anchor. Direct Start recall physically pauses the
recording; paired recall/listening controls sit beside its native player.
App, native and Media Session Play stop recall before requesting or
starting playback; buffering/rejected Play supplies no listening time. Late
media suspension and canceled Play cannot erase a newly started recall mode.

The existing versioned correction workflow retains measured total/recall and
recording subtotals. Corrected recall is included in corrected total, with typed
finite/nonnegative bounds and retained recording time enforced in UI, Worker,
private history/report and transactional backups. Ordinary manual/external
timing intentionally continues off-page until paused, with explicit copy; in-app
inspection pauses the block. Native background listening keeps its existing
media-derived accounting. See the canonical #8 ledger for validation/review.
New and historical recording review opens at its title/raw evidence; keyboard
Save and cancellation remain reachable. Check, all 624 tests and build pass,
as do the full 58 browser journeys and nine final interface rechecks. Fresh
independent review passes eleven workflow probes and 200 focused tests, with
23 accessibility/geometry states and 24 inspected images. No substantive finding
remains. Signed publication matches the accepted tree, production is verified
and #8 is closed. No elapsed-time reload/crash recovery or physical-device claim
is added.

### P2 — difficult marks and short replay: delivered in issue #12

Personal [cw-training.astro:184](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/pages/radio/cw-training.astro#L184) offers Replay 8 sec, Mark difficult here, and saved
timestamp buttons. [client.ts:2069](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L2069) rewinds eight seconds and plays; `:2073` saves
the current timestamp. Marks appear in saved notes and stay associated with their
recording during speed switches ([audio-session.ts:81](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/audio-session.ts#L81)). The baseline Tracker had native scrubbing only. Issue #12 now adds Replay 8 sec,
private named timestamps, exact-file task revisits and immutable saved annotations;
see the delivery ledger below. Generated QSO now has Replay QSO and previous/next
transmission, but no shared Back 10 sec button from personal [cw-listening/player.ts:48](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/player.ts#L48).

### P2 — actual recording speed metadata / 1x transport enforcement: partial

Personal official audio forces native playbackRate back to 1 ([client.ts:1656](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L1656)) so
catalog WPM remains accurate; users change files through the speed selector.
`audioAttemptResults` ([audio-session.ts:41](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/audio-session.ts#L41)) preserves exact verified URL, actual
WPM, time and passes for all recordings used, merging repeated visits by URL.
Unknown URLs never gain a guessed speed. Assigned speed remains separately stated.

Baseline tracker saved one assigned WPM and URL ([PracticeStudio.tsx:195](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/PracticeStudio.tsx#L195)). New
clock adds per-URL measured seconds/speed, and the integrated selector now enforces 1x for official files. This avoids
mislabeling catalog WPM when recording speeds change.

### P2 — unfinished session recovery/offline saves: missing

Personal [storage.ts:21](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/storage.ts#L21), `:84` stores active source, position, time, scratchpad,
coverage, passes, marks, and queued finished attempts. [client.ts:1433](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L1433) flushes
shared player time and atomically queues the attempt/clears the local draft before
later sync. Switching activity saves generated listening practice automatically;
course blocks go through finish/review. Original `practiceTimeSummary` prevents
saved+draft double counting and excludes class/other-day data.

Tracker keeps live time and scratchpad in React only, uses explicit review/save,
and warns before leaving. Metadata remains private and exportable once saved.
This is intentionally different and still needs work for durable offline parity.

### P2 — generated-player live speed and seek semantics: partial

Shared personal [word-player.ts:36](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-player.ts#L36) settles time before seeking and preserves
playing/paused state. `:174` retimes future words while letting the current word
finish at its old speed. [qso-panel.ts:120](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-panel.ts#L120) rebuilds at a changed speed while
preserving the current word's corresponding position and previous play state.

Tracker native WAV, text highlighting, clickable words, Media Session, and playback
cleanup are present. [ListeningTrainer.tsx:307](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L307) resumes when a word is clicked,
even if previously paused. Setting changes clear the track (`:324`) and resume
from the current transmission's beginning rather than its current word. These are
remaining parity differences, not defects in the new accounting algorithm.

### P2 — prerecorded spoken answers/background word practice: partial

Personal [cw-listening/word-assets.ts:17](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-assets.ts#L17) loads checked-in spoken word WAV clips
(four requests at a time, decoded/cache keyed by content hash). `:34` selects a
prebuilt MP3 when word hash and sound settings exactly match, otherwise generates a
full native recording. [word-panel.ts:183](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-panel.ts#L183) composes Morse and spoken answer PCM in
one native track. No SpeechSynthesis timing is needed in the background.

Tracker Morse-only rounds use complete native recordings, but spoken answers still
use foreground `SpeechSynthesis` and JS scheduling ([ListeningTrainer.tsx:106](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L106)).
This is explicitly disclosed and stops when hidden. New media-clock capture sees
Morse audio elements, not SpeechSynthesis or its intervening JS gaps; it therefore
does not yet credit the same complete spoken round as the personal player.

### P2 — original daily 77-word recording: not ported; permission boundary remains

Personal [daily-listening.ts:9](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/daily-listening.ts#L9) streams a compatible copy via private account route
`/api/cw-training/audio/bob-77-words` ([worker/cw-training.ts:678](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/worker/cw-training.ts#L678), `:718`). A new
session always begins at zero. Its independent repeat default is on, continues
beyond the ten-minute suggestion, and its supplied word list may differ from the
recording ([cw-training.astro:210](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/pages/radio/cw-training.astro#L210)). It records actual listening separately from
recall ([daily-listening.ts:36](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/daily-listening.ts#L36)). Do not copy that private original recording into
a public repo without an appropriate reuse basis. Tracker generated word lists
are not equivalent to having this recording. Daily suggestion/history accounting
is covered further in the planning appendix.

### Present baseline functionality

- Native HTMLAudioElement for official recordings and complete generated Morse
  tracks; ordinary browser play/pause/seek controls and official external fallback.
- Generated transcript highlights follow native media position; clickable word
  seek and device Media Session actions are implemented.
- Generated audio teardown/Blob URL revocation is explicit in [morse-player.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/morse-player.ts).
- Exact fractional minutes can be saved; manual entry remains possible.
- Session metadata survives export/import and editing; legacy data is retained.
- Physical iOS lock-screen behavior has not been demonstrated by desktop browser
  tests; do not label it real-device verified.

## Catalog verification performed during this audit

Official source: [Intermediate practice files](https://cwops.org/intermediate-practice-files/) (live fetched during the audit).
All 1,478 prior URLs were compared to current official index links. Six old long
QSO207 URLs were missing and returned 404. The current index supplies six exact
replacement URLs under `/wp-content/uploads/2026/09/`; each replacement returned
audio/mpeg and was measured with ffprobe. New durations differ from old ones.
The tracker catalog retains 260 groups/1,478 verified indexed links, preserving
old duration metadata only for unchanged exact URLs. Representative WD101,
long QSO203, SS101, CWT201 and short QSO207 HEAD checks returned audio successfully.
This was not a fresh HEAD probe of every 1,478 unchanged files.

Explicit six old-to-new QSO207 aliases are documented literals in
[recording-variants.ts](../../src/client/recording-variants.ts); no fuzzy/filename URL matching exists. Catalog publishes
only group IDs, titles, URLs, speeds, durations and verification provenance, with
no audio files, assignment text, personal data, or restricted materials. Trimmed
metadata is about 194KB JSON / 18.5KB gzip. Scoped five-test suite and typecheck pass.

## Implementation review and resolved regressions

Reviewed `PracticeClock`, `usePracticeClock`, section capture handlers,
`PracticeStudio` final save/reset/launch flow, and `SessionModal`/history metadata
wiring alongside three focused clock tests and the affected browser journeys.

Regressions identified and resolved:

1. **Assigned audio unmount cleanup**: PracticeStudio cleanup disposes the free
   MorsePlayer only. Removing an assigned audio DOM element does not stop it;
   hook cleanup only clears tick/listener. A callback ref or retained mounted audio
   cleanup must pause native recording when it is detached, including a pending
   playback request. Otherwise confirmed navigation can leave audio playing with
   no clock. Generated players already dispose correctly.
2. **Scratchpad-only switch to Runner**: chooseRunner's guard checked only time or
   running status. It allowed a scratchpad-only draft to become hidden; a successful
   runner save increments savedVersion and clears that hidden scratchpad. Guard
   scratchpad length too or separate draft/reset identities. Navigation warning
   should mention notes as well as time.

Capture handling of ended/pause samples currentTime before clearing the media
anchor; explicit final save calls timer.pause before player.pause and reads the
fresh snapshot. Seeking clears the baseline without crediting the destination;
seeked resumes it only for playing/ready media. Waiting stops the media clock;
the following playing event restarts it. These primary paths look sound in code.

Follow-up source check confirmed `attachRecording` callback-ref cleanup that
pauses the previous assigned element before detaching it, and the Runner switch
guard now includes scratchpad length. The two functional findings above are
addressed in the current source. This was source verification, not a new browser
run by this reviewer. Browser/native event behavior is covered by the
focused test runs; real locked-iOS behavior still needs its separate device check.

### Issue #7 — attribution beside actual media time

Generated tracks now carry a frozen descriptive configuration paired with the
actual prepared WAV. Only the current owner's accepted native playing state adds
it to the Studio's bounded source collector. Preparation, selection, failed Play,
inspection and replay of an already recorded configuration cannot invent another
source. Actual credited seconds continue to use native movement in the existing
clock; summaries do not invent per-configuration elapsed subtotals. Official URL/
speed/time evidence remains a separate source model.

QSO scripts and word occurrences retain their in-memory owners during review,
replay, retiming and in-app inspection. This is source fidelity, not delivery of
seamless occurrence-preserving speed changes or elapsed-time crash recovery.
The [execution journal](execution-progress-2026-09-30.md) records browser evidence
and the accepted independent review, signed publication and production checks.
Issue #7 is closed. Physical device/lock-screen
verification is not implied by browser emulation.

### Issue #9 — actual recording passes and task progress

[RecordingCoverage](../../src/client/recording-coverage.ts) keeps an exact interval
union per in-memory source owner. Completed facts use each observed finite
duration and exact URL; speed-file changes cannot share partial coverage. Native
ended/pause ordering settles once, and completed facts survive fresh replay.
Actual time remains the existing media clock's measurement. Native pause/resume
position lag can leave a bounded gap: only a known suspension authorizes that
boundary, never explicit seeking; the gap adds no heard seconds or coverage.
At least duration minus the smaller of one second and 5% must actually be covered.
Each authorized boundary is at most the smaller of 0.25 second and 5%, and all
missing material shares the total budget. A known resume's first observation can
also settle ahead: coverage clips to its plausible tail, and the uncredited head
shares that same boundary and total budget. This one-use allowance does not widen
ordinary or later sample admission. Explicit seeks, failed matching paused owners
and source/duration/rate changes cannot retain it. Very short sources remain
protected from the original one-second denominator edge case.

Today, Plan and the assigned Studio show saved/current/minimum-remaining passes.
Extra review retains its own measured facts without required credit. Explicit
completion remains available independently. Old records display unmeasured
passes; imported explicit source totals are identified rather than estimated.
Review, exact save retries, historical edits, generic reports and transactional
account/device backups preserve typed per-file facts and raw measurement identity.
Unknown/missing duration, unsupported rates and exhausted duration-group bounds
retain heard time and readable limitations. Partial coverage is not portable.

Independent review reproduced malformed tiny-duration claims accepted through
absolute millisecond padding. Positive pass facts now require positive per-file
and available listening time, with only relative floating-point roundoff. Raw and
corrected aggregate bounds scale by the total operand so short actual listening
beside long recall remains valid. Old omitted/zero-pass v1 timing preserves the
original raw subtraction and corrected addition order, including valid rounded
boundary values; that compatibility cannot supply positive completed facts.

The latest review corrections pass check, all 775 tests in 44 files, build and
all 60 serialized browser journeys in 8.5 minutes. The native rapid-pause/Space
resume workflow passes at desktop and mobile widths, retaining the actual heard
time assertion, cancellation, failed-save retry, history, report and real backup
controls. Focused coverage/clock tests pass 133 cases; twelve Worker recording
cases include old corrected-boundary POST/PUT/export/merge/replace. Independent
acceptance passed after both substantive corrections. Production is verified;
GitHub publication is deferred under the learner’s no-push instruction in the
[execution journal](execution-progress-2026-09-30.md). Browser fixtures generate
short synthetic WAVs and answer byte-range requests correctly; they never fetch
restricted audio. Physical iPhone/lock-screen verification is not claimed.


### Issue #10 — deliberate course continuation

The visible device-local course replay checkbox starts off and remains separate
from generated Repeat list and future optional daily listening. One existing
clock terminal outcome is consumed before requesting native replay. Only actual
whole completion with an unmet required minimum continues; prior saved counts
and this block's current facts apply. Incomplete, unmeasured, extra-review and
minimum-met playback stop with retained evidence and explicit end-of-pass choices.
Suggested duration never stops listening.

The existing source/request/navigation/device ownership fences cancel pending
replay for Pause, recall, inspection, reset, source change and Media Session
transport. The existing paused Media Session owner retains Pause/Stop through
pending continuation, with fresh ownership claims still requiring actual playing. Pending Play has a reachable Pause control, stale resolutions cannot
start retired audio or clear new recall, and stale pause callbacks do not overwrite
resumed state. Preference-off preserves already audible playback. Failed Play
retains the completed pass and offers manual retry/recall/finish. Failed preference
storage explains its current-session limit and offers retry. The optional public
boolean joins strict device inventory, backup and opt-in restore; no source/task
identity becomes a shared preference or private measurement.

Final check, all 800 tests in 45 files, build and 63 serialized browser journeys
pass. Original independent replay review and final combined keyboard/touch recheck
accept the implementation with no substantive finding left open. The latter
preserves user session-attribution work and the focused Runner/fixture corrections.
Actual saved D4/two-pass evidence contains 8.0 / 7.999999999999998 seconds at the
independent desktop/mobile boundaries. Production version
`ca935f6a-2302-4575-85d2-245aeb8108ba` serves exact built/public-module hashes;
health/public access and private rejection pass. Detailed refs/review and the
no-push publication limit remain in the execution journal. Browser fixtures use
short synthetic Range WAVs and actual native movement; no physical-device,
lock-screen or elapsed reload-recovery claim is made.


### Issue #9 follow-up — retain honest native gap boundaries in regression

The native-pass journey first asserts that inspection retains its paused exact
position and prior heard coverage. It then deliberately re-hears half a second
of overlap before finishing, keeping the start above zero so lost earlier
coverage cannot pass. App/native pause-resume coverage and saved per-file/raw
pass facts remain unchanged.

A separate clock regression reproduces the observed 3.6-second recording resume
from 1.726185 to 1.984 seconds. The unobserved 0.257815-second gap exceeds the
0.18-second admitted boundary: only 3.342185 seconds were observed, so completion
and pass count remain zero. Production clock behavior is unchanged. The failed
full-run native events remain evidence rather than an asserted successful pass.
Both corrected desktop/mobile journeys pass (1.0 minute); 98 clock tests pass.
Check, all 800 tests and build pass; final combined regression and independent
post-commit recheck remain in the execution journal.


### Issue #11 — remembered exact native files per task

Separate scoped keys retain original assignment context and exact verified
selected URLs. New task visits resolve a valid override before shared Assigned/Next;
a different task using the same audio and another account/Guest never inherit it.
Known explicit catalog replacements normalize safely; removed, malformed,
wrong-group, below-assigned or changed-context choices visibly use the current
default and discard stale retention with fenced/readback cleanup or retry.

The player shows remembered/prescribed/current WPM distinctly. Explicit file
changes pause at zero and preserve the existing clock's heard-time/source/pass
facts and notes; selected-but-unplayed files never enter saved evidence. Reset
and global changes affect future launches without changing current playback.
Same-file remembering is explicit; save/reset/default failures have reachable
retry. Today/Plan preview a future choice instead of relabeling history.

The private optional device-backup store supports strict bounded/unique catalog
validation, same-scope capture, current-wins collision feedback, repeatable
transactional restore/rollback and exact scoped clear/lifecycle retirement.
Old v1 files without this store remain compatible; shared restoration remains
opt-in. No elapsed/coverage recovery, new Worker preference entity or restricted
content is introduced. Check, 829 tests/46 files, build and all 65 serialized
browser journeys pass. Independent post-commit review accepts both desktop/mobile
keyboard/touch student workflows, 167 focused checks and truthful failure/retry,
private backup and played-file reporting, with no substantive finding. Production
is deployed and exact asset/private access checks pass; latest no-push instruction
leaves the commits local and #11 open. Exact evidence is in the execution journal.


## Issue #12 implementation ledger

The source actions at pinned `client.ts:2069–2077` and timestamp rendering at
`:1224–1228` were rechecked. Companion implements deliberate native Replay 8 sec,
clamp at zero, settlement before seek, and deliberate timestamp playback. It keeps
existing actual hearing/coverage accounting and 1x native transport. Annotation
state uses private plan task edits and existing account sync rather than a second
queue or timer. Each exact file keeps bounded task/URL/WPM timestamps and optional
labels; current speed switches cannot display/apply another file's timestamps.
Mark-only saves do not invent a timed entry. Saved actual-file evidence freezes
useful annotations for private history, reports, export/import and retry; selected
unplayed files stay out of that evidence. Existing account lifecycle fences and
revision conflicts govern these private fields.

Implementation: [review controls](../../src/client/RecordingReviewControls.tsx),
[Studio transport](../../src/client/PracticeStudio.tsx),
[validation](../../src/shared/recording-marks.ts),
[save snapshot](../../src/client/studio-session.ts), and
[learner journey](../../e2e/recording-marks.spec.ts). The marks are account task
annotations; generated Back 10 sec is #27 and reload/crash time recovery remains
excluded. Validation/review/deployment evidence will be appended once verified.

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

A small typed [guidance helper](../../src/shared/listening-guidance.ts) maps words,
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


### Issue #12 follow-up — date the synthetic mark task in its account timezone

The complete #16 regression crossed midnight UTC while the synthetic account
remained in America/New_York. Both existing difficult-mark journeys correctly
showed the API-created assignment as tomorrow's work, then failed to locate
Today’s Listen & practice button. Retained snapshots and traces establish that
fixture mismatch before any playback/marks action. The fixture now reads its
actual account timezone and uses the shared date helper for its due date.
Production date rules, audio clock, assertions and timeouts remain unchanged.
Keep this test-only correction in a focused #12 follow-up commit; independent
combined recheck and production delivery are tracked with the #16 gate.

Required check, 923 tests/50 files and build pass. Both exact affected mark
journeys pass in the focused four-case gate (8.6/14.1 seconds), then in the final
79-journey full regression (8.3/14.0 seconds; full gate 16.3 minutes). No failure
is erased or counted as passing. Independent post-commit combined recheck
remains required before accepted delivery.


The focused account-date fixture correction
`568890f694f31286e45c23d6bfb4404c54713cd0` is independently ACCEPTED with
issue #16. The reviewer arranged actual Pacific/Honolulu dates one day behind
UTC and independently exercised both desktop/mobile marks journeys: private
mark-only save adds no history; relative replay saves 1.859746/1.929771 actual
heard seconds, zero passes, exact source/mark and the account practice date.
This challenges the original date split without changing native clocks.
Two specifically named marks Axe reports are empty and both screenshots were
inspected (included in the combined eight-check review inventory).

The final complete 79-journey gate passes in 16.3 minutes; check, all 923 tests
and build pass. The combined accepted production deployment is version
`cce343ac-d4fa-4c78-a704-df84ca331c94`. Production asset/health/private-boundary
checks pass. This is a fixture-only correction; product scheduling, media credit,
assertions and production timeouts are unchanged. Its two earlier failed traces
remain retained. No push was attempted; #12 remains OPEN pending publication.
