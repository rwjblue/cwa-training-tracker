# Listening, public practice, sending, and Morse Runner parity audit

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

The clock/scratchpad/official-speed changes are now implemented; the generated
listening, sending-input and Runner workflow gaps below remain unless explicitly
marked present. Native media now starts/stops practice credit automatically and
never stops at the selected target. Saved scratchpads are editable and visible in
history, while unfinished scripts, custom lists, time and notes still have no durable
recovery. Runner's scratchpad-only switch guard and official-audio detach cleanup are
fixed. See the [canonical inventory](../trainer-parity.md) for these cross-cutting updates.

Issue #7 implements actually played generated-listening summaries using the
original 15-distinct-configuration bound plus an explicit overflow flag. Accepted
native playback captures the applied track's source/settings; mere selection,
preparation and failed Play add no evidence. Frozen word-round identity prevents
new preferences from labeling old audio. QSO replay/retiming retains exact local
content and Copy answers; only scenario replacement/New QSO generates another
contact. Word-only preference changes no longer regenerate a contact.

Review/history/reports and account export/import retain these private descriptive
summaries through the existing timed evidence/queue. Mixed/unknown/overflowed
source pairs clear both single session speeds. Generated review focuses its
heading so the played evidence is visible before the form, including on mobile;
Save remains reachable by keyboard and touch. Full scripts/custom words remain
local in-memory content, and equal custom label/count/settings deduplicate without
a text/hash identity. Seamless transport retiming, Stories, fresh repeat shuffles,
public exact recipes and reload/crash elapsed recovery are not delivered here.
See [current model](../../src/shared/generated-listening.ts),
[journey](../../e2e/generated-listening.spec.ts), and the
[execution/review journal](execution-progress-2026-09-30.md). Independent review
accepted the mobile opening-focus correction, signed commits are published and
production is verified; #7 is closed.

On 2026-09-30, a subsequent explicit spoken-audio request replaced device speech
with checked-in generated answers, composing each complete round into one native
WAV. All built-in words have clips; custom spoken lists require those words.
Real browser playback covers progression, loop seams, seek/pause controls and
hidden-page handling at desktop/mobile widths. Physical iPhone verification and
prebuilt compact MP3 optimization remain outstanding. A shuffled round loops its
current order; New round creates a fresh shuffle. See [provenance](../spoken-audio.md).

On 2026-09-30, sending gained a native scales reader with selectable prescribed
sections, adjustable text size, and Bob Carter WR7Q’s PDF link. Start no longer
opens a tab for scales. The public studio also offers all three sections, and
section changes retain elapsed time. Native rows use mechanical character
patterns, a conventional pangram and original guidance; the original instruction
prose remains at its source. This addresses readable material grouping below;
optional adapter input, capture, replay and retained takes remain absent.

A same-day review from a CW learner’s perspective removes the duplicate sending
timer panel, keeps one compact control bar above the full-width reader, and adds
a guest homepage shortcut. Prosigns are explained in context and shown explicitly
in the drill targets. This improves ordinary practice on a key; it adds no input
capture or automatic assessment.

Read-only source audit, 2026-09-29. No personal data was opened, modified, exported, or imported. No implementation changes or tests were run for this audit. This is the detailed appendix to the canonical parity inventory; recorded-course audio, scratchpad/timer internals, LCWO, reports, course planning, and backend/export semantics are covered in the audio and planning appendices.

Status: **present** means an active reachable equivalent; **partial** means a meaningful subset or different lifecycle; **missing** means no active equivalent found. P1 means a substantial training capability or work-loss gap; P2 means useful parity after those; P3 means a small refinement or deliberate product choice. These are parity priorities, not security severity.

## Actual entry points, including wrapper traps

The personal public listening tool is active, not a collection of unused helpers. [P/src/pages/radio/cw-listening.astro:3,16,42](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/pages/radio/cw-listening.astro#L3) imports `CwListeningPlayer`, mounts it, and calls `initCwListening` on load/Astro navigation. [P/src/components/CwListeningPlayer.astro:6](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/components/CwListeningPlayer.astro#L6) supplies the host. [P/src/lib/cw-listening/client.ts:90](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/client.ts#L90) mounts the shared player, and [player.ts:19,47,57](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/player.ts#L19) selects word or QSO/story panels and creates all three mode buttons.

The authenticated personal trainer uses **that same player**: [P/src/pages/radio/cw-training.astro:218](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/pages/radio/cw-training.astro#L218) mounts its host; [P/src/lib/cw-training/client.ts:796](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L796) dynamically imports `../cw-listening/player` and calls `mountListeningPlayer`; [listening-adapter.ts:8,16](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/listening-adapter.ts#L8) translates active blocks/preferences. A new private word visit deliberately starts Common QSO words while preserving audio settings ([listening-adapter.ts:18](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/listening-adapter.ts#L18)); an unfinished block retains its existing draft. Private wrapper [word-practice.ts:7](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/word-practice.ts#L7) / [qso-practice.ts:6](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/qso-practice.ts#L6) converts listening into stable-ID optional attempts with actual seconds, no claimed lesson completion, and settings notes.

**Do not count duplicate implementations:** personal `cw-training/{word-panel,qso-panel,word-round,qso-round,word-player,word-wav,word-assets,qso-generator}.ts:1` are reexports from `cw-listening`. `cw-training/{word-practice,qso-practice}.ts:4` reexport shared content but additionally implement private block/attempt adapters. The public `cw-qso` walkthrough is a separate active feature, not another name for `cw-listening` generated contacts.

Current active UI routes are [C/src/client/main.tsx:63,422](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/main.tsx#L63); PracticeStudio owns the public Words/QSO/Free/Morse Runner choices, renders `ListeningTrainer`, and uses the same studio for signed-in logging. Its copy-check UI is active in [C/src/client/ListeningTrainer.tsx:398,564](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L398), not a dead scoring helper.

## Generated word practice

| Capability | Status / priority | Exact evidence and difference |
| --- | --- | --- |
| Complete 70 Common QSO words + 30 common English words | **Present** | P [src/data/cw-listening/words.ts](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/data/cw-listening/words.ts), [src/lib/cw-listening/word-practice.ts:2](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-practice.ts#L2); C [src/client/word-content.ts:4,12](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/word-content.ts#L4). Catalog strings match. The legacy “77” label did not mean 77 unique words: personal migration deduplicates the old built-in only ([word-practice.ts:73](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-practice.ts#L73)); preserve deliberate custom repeats. C catalog/unit test [listening-content.test.ts:14](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/listening-content.test.ts#L14) verifies counts/contents. |
| Custom lists, deliberate repeated words, punctuation/prosigns, 1–200 words, max 40 characters per word | **Present, with differences / P3** | P [word-practice.ts:30](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-practice.ts#L30); C [word-content.ts:22](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/word-content.ts#L22). P accepts up to 10,000 input characters, C textarea max 8,200 ([ListeningTrainer.tsx:423](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L423)), but 200 × 40 ordinary words fits both. C validates against its explicit Morse/prosign table ([audio.ts:57,67](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/audio.ts#L57)); P delegates actual encoding to pinned Morse Pro with prosigns ([cw-listening/morse.ts:10,23](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/morse.ts#L10)). Do not promise every arbitrary bracketed token in P's permissive syntax is playable without engine validation. |
| Keep VVV first when shuffling QSO vocabulary | **Present** | P [word-panel.ts:160](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-panel.ts#L160), [word-round.ts:21](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-round.ts#L21); C [word-content.ts:37](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/word-content.ts#L37). Existing C test covers it. |
| Fresh shuffle for every repeated native-audio round | **Implemented for Morse-only Words / #28** | P [word-panel.ts:123](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-panel.ts#L123) prepares a fresh round on ended. C [ListeningTrainer.tsx](../../src/client/ListeningTrainer.tsx) now generates each round from the latest validated source and Shuffle preference, installs from committed content, preserves duplicate/prosign occurrences and keeps common-QSO VVV first. [wordListeningTrack](../../src/client/listening-configuration.ts) reuses bounded native audio. Existing spoken-answer behavior remains unchanged; see the #28 ledger below. |
| Shuffle/repeat toggles during playback without throwing away the current word | **Implemented for Morse-only Words / #28** | P [word-panel.ts:254](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-panel.ts#L254) defers shuffle to next round and changes repeat independently. C retains the installed source, word, native position and playing/paused state. Shuffle chooses the next round; Repeat controls continuation after the current round. Pause, inspection, replacement and disposal cancel pending continuation. Existing spoken-answer policy is retained. |
| Directly edit the selected built-in into a custom list | **Implemented / #29** | P editable textarea is always available ([word-panel.ts:48](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-panel.ts#L48)); editing changes selection to custom (`:277`). C only renders its textarea for explicit custom selection ([ListeningTrainer.tsx:422](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L422)) and initializes it separately; no “copy this list to custom” action. Both allow custom practice, but quickly removing difficult/easy words from the existing list is less direct in C. Baseline references describe the audit checkout. Current #29 adds Edit this list for both supplied catalogs, cloning original source order without changing shared words or adopting shuffled playback order. Independent review accepted and production deployment verified; see the #29 acceptance ledger below. |
| Custom draft survives closing/reloading the tool | **Implemented for validated source / #29** | P [storage.ts:12,16](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/storage.ts#L12) persists the word draft, including custom text; [session.ts:46,79](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/session.ts#L46) validates/restores it. C stores only typed preference fields ([practice-preferences.ts:5,47,97](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/practice-preferences.ts#L5)), custom text is React state, and UI explicitly says it lasts only while the studio is open ([ListeningTrainer.tsx:435](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L435)). Baseline references describe the audit checkout. Current #29 retains validated raw custom text and list selection in account/Guest device scope. In-app draft navigation, paused reload, invalid/empty fallback, storage/clear retry and reviewed device backups are verified. Unacknowledged or invalid drafts survive current-scope in-app navigation only. Independent review accepted and production deployment verified; see the #29 acceptance ledger below. |
| Three Morse repetitions followed by spoken answer | **Partial / P1** | Both expose the option and honor three repetitions. P [word-round.ts:41,48,84](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-round.ts#L41) stitches measured Morse, pauses, and published speech PCM into one native WAV. [word-assets.ts:17](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-assets.ts#L17) loads pronunciation clips with bounded concurrency/cache and rejects unsupported custom words clearly. C [ListeningTrainer.tsx:158,170,178](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L158) uses device-local English `speechSynthesis`, dependent on installed/local voice availability, and explicitly stops when hidden (`:333`). P can keep spoken rounds on native background/lock-screen playback; C cannot. C supports arbitrary custom words when a suitable local voice exists, whereas P supports only published speech vocabulary: a tradeoff, not total inferiority. |
| Published compact/spoken MP3 fast path | **Missing / P2** | P [word-assets.ts:34,42](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-assets.ts#L34) picks prebuilt matching word recordings by exact text hash/WPM/Farnsworth/pitch/gap/spoken settings, otherwise generates native WAV; four indexed assets covered in [tests/cw-training-word-assets.test.mjs:32](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-word-assets.test.mjs#L32). C always generates Morse WAV and uses local speech separately; no equivalent word asset index/fetch path. This affects startup/download/repeat reliability rather than the vocabulary itself. |
| Fine word pause and pitch controls | **Partial / P3** | P [word-panel.ts:44,45](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-panel.ts#L44): pitch 300–1000 step 10 Hz; pause 0–5 step 0.1 s. C [practice-preferences.ts:57,76](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/practice-preferences.ts#L57) normalizes pause at 0.5 s and pitch at 25 Hz; actual pause menu [ListeningTrainer.tsx:449](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L449) offers 0, .5, 1, 2, 3, 4, 5 (no 1.5/2.5/etc). |
| High-speed exact listening and preset control | **Partial / P2** | P [speed-control.ts:1,15,18,48](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/speed-control.ts#L1): presets 12/15/18/20/23/25/28/30/35/40, exact input 10–60, effective >=5; previews drag then applies on release. C [practice-preferences.ts:47,71](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/practice-preferences.ts#L47) clamps character to 5–50/effective >=3; shared studio sliders have no exact-number field or named preset stops. Lower speeds are a C addition; 51–60 WPM are a real missing range. P default word recognition is 40/40 WPM at 450 Hz ([word-practice.ts:28](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-practice.ts#L28)); C starts 20/10 at 600 Hz ([practice-preferences.ts:31](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/practice-preferences.ts#L31)). Default change is a product choice, not a defect. |
| Bounded history of all actually played configurations | **Delivered by issue #7** | P [word-practice.ts:51,60](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-practice.ts#L51) records distinct played list/count/WPM/effective/pause/pitch/shuffle/spoken/repeat configurations, max 15 plus overflow note, into the saved attempt. C [PracticeStudio.tsx:143](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/PracticeStudio.tsx#L143) at the audit baseline saved selection and final speeds without actual configuration history. Issue #7 now retains strict actual played summaries, exact in-memory content and shared review/history/report/private backup evidence; see the delivery ledger above. |

## Generated contacts, stories, and listening lifecycle

| Capability | Status / priority | Exact evidence and difference |
| --- | --- | --- |
| Four original QSO templates | **Present** | P [qso-generator.ts:55](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-generator.ts#L55) and C [qso-content.ts:161](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/qso-content.ts#L161): short contact, rigs/antennas/weather, POTA, asking for repeats. Both use bounded illustrative pools, distinct stations/names, coherent rig power, stable script during replay, and avoid both previous calls on New QSO (P `:107`; C `:225`, [ListeningTrainer.tsx:541](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L541)). These are fabricated practice profiles; calls may coincide with real operators. |
| Geographic and seasonal coherence | **Enhanced in C** | P [qso-generator.ts:15,31](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-generator.ts#L15) draws independent locations and a fixed six-entry weather pool. C [qso-content.ts:69,114,235](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/qso-content.ts#L69) matches illustrative call districts/locations and regional seasonal temperature/conditions. [listening-content.test.ts:44](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/listening-content.test.ts#L44) checks the stronger invariants. Do not regress this while porting old recipes. |
| Two station voices, two-second handoffs | **Present, small partial / P3** | P [qso-practice.ts:7](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-practice.ts#L7), [qso-round.ts:20](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-round.ts#L20) alternates fixed 450/500 Hz, adds exactly two seconds between transmissions, no trailing handoff. C [ListeningTrainer.tsx:235](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L235) uses preferred sidetone and +50 capped at 1000; at the maximum preference, both stations become 1000 Hz, losing audible distinction. Keep a distinct pair near the bound if parity is desired. |
| Three authored stories | **Missing / P1** | P [src/data/cw-listening/stories.ts:6,16,33](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/data/cw-listening/stories.ts#L6): short trail story, medium quiet-band story, longer lake/light story. [qso-practice.ts:5](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-practice.ts#L5) combines them with templates; [player.ts:57](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/player.ts#L57) has an active Stories tab. Stories use one narrator pitch/sentence progress, not invented station alternation ([qso-round.ts:22](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-round.ts#L22)). C `PracticePreferences.tool` permits only words/qso/free, QSO catalog has four contacts, and no story content/module is wired. |
| Native continuous WAV, pause/resume, seek bar, current-word highlight, full transcript, reveal toggle | **Present** | P [word-player.ts](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-player.ts), [qso-panel.ts:105](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-panel.ts#L105), [qso-round.ts:39](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-round.ts#L39); C [morse-track.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/morse-track.ts), [morse-player.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/morse-player.ts), [MorseTranscript.tsx](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/MorseTranscript.tsx), [ListeningTrainer.tsx:554,583](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L554). Separate frontend report owns detailed playback/timer verification. |
| Click a specific word while preserving paused state | **Implemented Words/QSO/Free** | P [word-panel.ts:291](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-panel.ts#L291), [word-player.ts](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-player.ts) seek behavior tested at [tests/cw-training-word-practice.test.mjs:589](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-word-practice.test.mjs#L589). C issue #27 now uses exact global occurrences and pure paused/playing seeks, including pre-metadata and ended selections. Previous/Next retains state; separately labeled Replay current word starts deliberately. Shared player/clock behavior and actual private saved credit are verified below. Stories integrates this reusable workflow in #30. |
| Back 10 seconds | **Implemented Words/QSO/Free** | P [player.ts:50](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/player.ts#L50) inserts an explicit rewind action and `word-player` keeps listening credit correct across seek. C issue #27 adds shared Back 10 sec, clamped to zero with paused/playing state retained. Heard movement settles before changing position; no jump credit is earned. Dedicated Replay current word is distinct, while Media Session uses the same position API. |
| Change speed while retaining word occurrence, playback state, and heard prefix | **Implemented for Words/QSOs; device check pending** | Issue #26 preserves ordered native word-prefix timing, retimes future items, remaps exact QSO occurrences through word/station gaps, and retains playing/paused state and native rate. Replacement settles the actual old source after rendering, guards stale resume and keeps previously claimed Media Session transport. Supported native volume changes retain source/position; browsers reserving native volume for device controls retain baked volume for preparation and disclose device controls. Source: pinned [word-player.ts:174](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-player.ts#L174), [word-round.ts:66](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-round.ts#L66), [qso-panel.ts:120](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-panel.ts#L120). Shared occurrence mapping covers authored sentence gaps; Stories themselves remain issue #30. See the #26 ledger for exact gates and limits. |
| Independent Words/QSOs/Stories preferences | **Partial / P2** | P [session.ts:6,9,79](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/session.ts#L6), [storage.ts:16,17](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/storage.ts#L16) stores each mode's character speed/selection independently. C [practice-preferences.ts:5](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/practice-preferences.ts#L5) stores one global audio configuration shared among Words/QSO/Free. Selecting a different mode does not restore a mode-specific speed. Caveat: P's preference writer omits `fwpm` for QSOs/Stories at [storage.ts:17](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/storage.ts#L17), so it does not fully retain effective speed when creating a fresh mode/session; its active session does retain the draft. Do not copy that omission. |
| Public session durability, exact script, elapsed total, ended-session screen | **Missing / P1** | P [client.ts:30,77,95,107,111](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/client.ts#L30), [storage.ts:3,20](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/storage.ts#L3), [session.ts:93](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/session.ts#L93) stores ID/startedAt/actual accumulated time/draft/generated QSO/ended flag, checkpoints every 3s and lifecycle events, restores paused at the beginning, keeps total across public mode changes, End session -> total -> Start another session. C remembers controls only, with QSO/custom/audio position/run state in component state; reload regenerates the QSO. C has explicit private-review logging and unsaved warnings, but that does not recover discarded state. |
| Shareable exact listening selection | **Missing / P2** | P [cw-listening.astro:17](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/pages/radio/cw-listening.astro#L17), [client.ts:44,64](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/client.ts#L44), [session.ts:115,166](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/session.ts#L115): Copy link with clipboard fallback; public mode/list/scenario/story/WPM/Farnsworth/text visibility only. P [qso-generator.ts:130](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-generator.ts#L130) encodes versioned bounded pool indices so recipient gets exactly the same contact; explicit invalid/conflicting recipe errors, old-script exact reconstruction check `:153`, no custom text/history/position/time included. C has no query parsing, recipe field, link control or shared-contact decoder. A future port must preserve v1 compatibility or explicitly version new seasonal profiles. |
| Shared public/private listening defaults and separate private tracking | **Partial / P2** | P public storage is shared with trainer through [listening-adapter.ts:16](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/listening-adapter.ts#L16); private [client.ts:779,796](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L779) finishes/saves the prior block on activity change, tracks actual totals, keeps private IndexedDB separate. C same studio/preferences works for guests and signed-in users, but retaining an active session, mode-change attribution and played-settings history are not equivalent. See the audio and planning appendices for exact save semantics. |
| Copy-check grading without revealing answers | **Enhanced in C** | C [qso-content.ts:151](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/qso-content.ts#L151), [qso-copy.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/qso-copy.ts), [QsoCopy.tsx](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/QsoCopy.tsx), [ListeningTrainer.tsx:398,564](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L398): scenario-specific fields from the actual generated stations; RST **sent** explicit; extra rig/weather fields; no transcript/season answer leaks until Show answers; editing clears old grading; strict tolerant complete-field normalization. P generated listening has reveal/transcript only. This is not a substitute for the personal real-contact walkthrough below. |

## Standalone public tools: distinct features, not duplicate page names

### Interactive real-contact QSO guide — **missing, P1/P2**

Active P page [src/pages/radio/cw-qso.astro](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/pages/radio/cw-qso.astro) loads [src/lib/cw-qso-client.ts](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-qso-client.ts); core rendering/log/ADIF logic is [src/lib/cw-qso.ts](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-qso.ts). Nothing in C [main.tsx:63,422](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/main.tsx#L63), generated [qso-content.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/qso-content.ts), or [QsoCopy.tsx](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/QsoCopy.tsx) provides these operations. C practice log is a practice-session journal, not a station contact log.

- **Calling CQ vs answering CQ**, ten alternating You send/They send steps, role-aware hints and personalized substitutions: [cw-qso.ts:137,150,458](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-qso.ts#L137), [cw-qso-client.ts:22,142,162](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-qso-client.ts#L22); role buttons [cw-qso.astro:35](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/pages/radio/cw-qso.astro#L35).
- **Remember own-station fields, band/frequency and role** on device; auto GM/GA/GE greeting from local hour; synchronize inline receiving inputs with the profile form: [cw-qso.ts:121,264](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-qso.ts#L121), [cw-qso-client.ts:51,266,330](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-qso-client.ts#L51). Other station details are intentionally not retained as defaults.
- **Optional fuller ragchew exchange** for rig/power/antenna/weather/age/job/years licensed: [cw-qso.ts:3,150](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-qso.ts#L3); generated ragchew listening is not editable own-station prompts.
- **Clear other station** preserves own details; first received call starts UTC contact timing: [cw-qso-client.ts:187,299](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-qso-client.ts#L187).
- **Local real QSO log**, validates own/their calls, UTC date/time on/off, mode CW, reports/name/QTH/operator/own-QTH/band/frequency/comment; save clears received station and comment but retains own defaults; individual delete and confirmed clear: [cw-qso.ts:60,90,541,557](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-qso.ts#L60), [cw-qso-client.ts:67,130,207,311](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-qso-client.ts#L67).
- **ADIF download** with properly length-tagged optional fields/header/EOR: [cw-qso.ts:583,588,611](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-qso.ts#L583); browser download/revoke [cw-qso-client.ts:250](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-qso-client.ts#L250).
- **Missed-copy / repeat prompts**, slower/QSB/QRN/QRM/mistake/QRT prompts, procedural sign/abbreviation reference and official/external references: [cw-qso.astro:308,328,350,363,391](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/pages/radio/cw-qso.astro#L308). A linked fillable PDF at `:403` is an external resource; do not assume redistribution permission.

Focused existing tests: [P/tests/cw-qso.test.mjs:45,52,58,74,82,121](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-qso.test.mjs#L45) cover role fallback, auto greeting, escaped personalized transmissions, role swap, UTC log shape and ADIF. Scope this as an optional public “On-air helper” so it does not complicate daily lesson practice.

### Live practice opportunities / calendar — **accepted and deployed #20**

Active P page [src/pages/radio/cw-practice.astro:296](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/pages/radio/cw-practice.astro#L296) initializes [src/lib/cw-practice-client.ts](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-practice-client.ts). P [src/lib/cw-practice.ts:34,109,131](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-practice.ts#L34) models SST/MST/CWT recurring opportunities and live state. C has generic resource links ([src/shared/training.ts:121](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/training.ts#L121), [main.tsx:1488](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/main.tsx#L1488)) and course exercises; no equivalent live schedule/calendar module or public dashboard was found.

- **Live now / next event**, countdown to end or start, next separate opportunity, weekly agenda: [cw-practice-client.ts:179,209](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-practice-client.ts#L179).
- **Local vs UTC timezone switch**, remembered, updates every 30 seconds: [cw-practice-client.ts:11,23,223,230,286](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-practice-client.ts#L11).
- **Subscribe/copy calendar URL**, webcal link and clipboard fallback: [cw-practice-client.ts:265,275](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-practice-client.ts#L265). Generated calendar has nine stable weekly UTC events/UIDs/version/sequence/link, standards escaping/folding: [cw-practice.ts:29,176](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-practice.ts#L29); endpoint covered by [tests/cw-practice.test.mjs:91,119](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-practice.test.mjs#L91).
- **Activity dialogs** explain exchange, frequency, speed guidance and official links; CWT member/nonmember/CWA exchanges ([cw-practice.astro:224,232](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/pages/radio/cw-practice.astro#L224)).
- **NNN next occurrence** in America/Chicago with DST handling, plus Giving Back roster link/guidance: [cw-practice-resources.ts:1,37,68](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-practice-resources.ts#L1); [cw-practice.astro:247,273](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/pages/radio/cw-practice.astro#L247). These are code features, not this audit re-verifying the current external event schedule. Recheck official sources before porting displayed schedules/rules.

Tests [P/tests/cw-practice.test.mjs:13,27,40,50,58,73,91,102,119](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-practice.test.mjs#L13) cover schedule count, exchanges, currently live inclusion, ended rollover, Central DST, stable feed, cache/conditional/method handling.

## Sending practice — **large missing subsystem, P1**

C has assigned sending **material link + section list + timer**, not embedded input capture: [src/client/PracticeStudio.tsx:262,488,494](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/PracticeStudio.tsx#L262); [src/shared/plan.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts) sending recipe. That is useful basic practice, but it is not the personal sending trainer.

The personal active path is [P/src/lib/cw-training/client.ts:1012,1021](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L1012) lazily loading and mounting [sending-panel.ts](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-panel.ts); settings/draft/takes checkpoint locally (`:1028`). [sending-panel.ts:68](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-panel.ts#L68) exposes optional “Record my sending” / “Continue without recording.” This is not dead or documentation-only code.

| Personal capability missing in C | Evidence / important boundaries |
| --- | --- |
| Explicit adapter setup and input test before capture | [sending-panel.ts:71,79,83,153](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-panel.ts#L71); input must test before record. “Continue without” lets ordinary key practice continue without permissions/hardware. |
| Vail-compatible Web MIDI keyed output | [sending-input.ts:78](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-input.ts#L78) requests MIDI with `sysex:false` only on explicit connect; `:90` selects one uniquely paired input/output; `:108` accepts channel 1 note 0 down/up; `:113` rejects raw dit/dah notes 1/2; `:155` switches adapter keyed-output mode; cleanup `:129` restores expected MIDI output and closes only owned ports. |
| Adapter keyboard fallback | [sending-input.ts:174](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-input.ts#L174): focus-scoped Ctrl-left/right, excludes other fields, ignores repeats, overlapping Ctrl keys are one mark; no global key capture. Unavailable MIDI/Safari/iOS gets the fallback explanation ([sending-panel.ts:153](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-panel.ts#L153)). |
| Measured raw timing capture, not re-encoding decoded text | [sending-session.ts:33,103,117](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-session.ts#L33): signed millisecond mark/gap edges, submillisecond event timing, rejects duplicates/out-of-order edges, omits leading silence, never invents an up-edge on interrupted held key. Ten-minute / 12,000-edge limits; stuck-key interruption after five seconds ([sending-panel.ts:193](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-panel.ts#L193)). |
| Free/warm-up or explicit target comparison | [sending-panel.ts:72,74,75](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-panel.ts#L72): user-selected/pasted <=2,000-character target; reference/decode WPM 5–60 is not hardware keyer configuration; no silently grading an instruction paragraph. |
| Decode + cautious comparison + opt-in live decode | [sending-engine.ts:25](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-engine.ts#L25), [sending-session.ts:86](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-session.ts#L86), [sending-panel.ts:76,123,196](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-panel.ts#L76): configured-WPM Morse Pro decode including prosigns, actual text and Morse; “matches / possible mismatch / not compared,” not false precision as a numeric sending-accuracy score; raw timing survives decoder failure. |
| Replay actual sending and clean reference separately | [sending-panel.ts:28](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-panel.ts#L28), [sending-engine.ts:98,103,119](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-engine.ts#L98): separate/cancellable AudioContext at 550 Hz, replay measured raw edges including imperfect spacing; reference is independently encoded at chosen speed. Plays cannot auto-complete a task or accrue fresh capture credit. |
| Keep/discard/removal of individual takes | [sending-panel.ts:85,177](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-panel.ts#L85), [sending-session.ts:182,193](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-session.ts#L182): explicit keep/discard review, up to ten takes per active block; runtime settings locked while active/unreviewed. |
| Safe focus/disconnect/page interruption and checkpoint restore | [sending-input.ts:120,122,174](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-input.ts#L120), [sending-panel.ts:203](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-panel.ts#L203), [sending-session.ts:164](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-session.ts#L164): stop safely on blur/visibility/disconnect; preserve completed measured edges and mark interrupted; reload does not manufacture offline practice time. |
| Device-local retained recordings across blocks | [sending-recordings.ts:17,35,45](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-recordings.ts#L17) validates/deduplicates latest ten across all attempts; excludes unfinished capture, returns detached values; single removal does not delete practice attempt. Main client history links `:735,752`, replay `:1049`, remove `:1061`, optional finish retention `:2390`. |
| Separate raw local takes from optional synced text summary | [sending-session.ts:200](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-session.ts#L200) produces bounded count/time/decoder/expected-text summary; raw timing retained in device store, not normal API report. The planning appendix covers reset/export details. |
| Readable sending material grouping | [sending-reading.ts:8,29,39,46,58](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-reading.ts#L8): warm-up/drill/exercise extraction, punctuation/prosign grouping, repeated phrases/five-character groups, safe escaped custom text. Wired in main [client.ts:957](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L957). C only links official material/list of sections; do not publicly redistribute the private source curriculum to achieve equivalent rendering. |

**Not personal features; do not invent as parity gaps:** microphone/sidetone audio recording and a browser-generated iambic/raw-paddle keyer. Personal inputs are MIDI keyed output or keyboard adapter; raw paddle notes explicitly rejected ([sending-input.ts:113](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/sending-input.ts#L113)), and [tests/cw-training-sending-session.test.mjs:164](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-sending-session.test.mjs#L164) rejects `input: "microphone"`. Vendor Web Morse Runner's internal `keyer.js` is its simulated station keyer, not this hardware sending trainer. Microphone support would be new product work.

Sending test coverage read: input permissions/port ambiguity/disconnect/focus/stuck edges; raw irregular timing decode/replay and cancellation; session limits/interruption/validation/comparison semantics; retained-recording cap/dedup/immutability; safe material grouping. Specific sources: [P/tests/cw-training-sending-input.test.mjs:69,116,170,216,250,291](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-sending-input.test.mjs#L69); [sending-session.test.mjs:47,71,87,100,135,164,181](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-sending-session.test.mjs#L47); [sending-engine.test.mjs:17,31,100,123,141](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-sending-engine.test.mjs#L17); [sending-recordings.test.mjs:16,33,46,97](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-sending-recordings.test.mjs#L16); [sending-reading.test.mjs:7,17,37,49](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-sending-reading.test.mjs#L7) (all prefixed `cw-training-`). No hardware or microphone behavior was exercised during this audit.

## Morse Runner

### Engine and integration — **present**

Both repos pin Web Morse Runner revision `847e9089ef379a065d1cf6807c09f0724bbe072e`, Unlicense (`public/vendor/web-morse-runner/UPSTREAM.json`). Comparing both vendor trees found 53 byte-identical files, no files exclusive to either repo, and differences limited to provenance manifest, synthetic calls data, index/theme/bootstrap, namespaced config/call loader and the bridge's source-path comment. `integration/bridge.js` is otherwise byte-identical. This is real engine parity, not an iframe pointing to somebody else's site.

Active C [PracticeStudio.tsx:61,381](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/PracticeStudio.tsx#L61) chooses public or assignment settings and mounts `MorseRunnerStudio`. Shared typed `morse-runner` recipe ([shared/plan.ts:15,72](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L15)) is a stronger boundary than P heuristics in [morse-runner.ts:12](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/morse-runner.ts#L12) / [runner-bridge.ts:95](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/runner-bridge.ts#L95).

Present in both: Single Call/WPX; pre-run speed/duration/activity/QRM/QRN/QSB/flutter/lids; real AudioWorklet engine; keyboard and on-screen F-key controls; synthetic call pool; in-frame log/transcript/export features inherited from same runtime; explicit Run before time credit; actual-start setting snapshot; live WPM history; engine-confirmed monotonic time; QSO count/verified points/verified score/NR/NIL; partial stop/error results; trusted frame source/origin/run ID/sequence checks; hidden-page stop; separate fresh run identities and stale-message rejection. C refs [MorseRunnerStudio.tsx:113,122,182,258,292](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/MorseRunnerStudio.tsx#L113); [shared/runner.ts:110](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/runner.ts#L110) onward; vendor `integration/bridge.js`. C scoped browser test [e2e/morse-runner.spec.ts:4](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/e2e/morse-runner.spec.ts#L4) uses the real engine; unit [shared/runner.test.ts:41,80,122,139](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/runner.test.ts#L41) covers protocol, lifecycle, bounded history and vendor reproducibility.

C additions: public guest runner, accessible form/received-exchange labels, launch controls moved above simulator, readiness disabled Run, static scoped frame policy. Vendor `integration/main.js:5,28` wraps creation of dynamic fields so labels survive mode changes. These are enhancements, not missing parity.

### Surrounding workflow — **partial**

| Difference | Priority | Evidence |
| --- | --- | --- |
| Recovery of acknowledged terminal run                           | **Present · #15** | Accepted terminal results (completed/stopped/interrupted, at least one acknowledged engine second) retain a stable ID, start timezone/date, terminal creation and exact measured settings/summary/speed timeline in a separate scoped device store. Logbook recovery, canceled-review edits, frozen POST retry, guest isolation, original account generation and optional version 1 device backup are reachable. The original active-run checkpoints are read-only evidence; running-clock reload/crash estimates and live-contest resumption are excluded by approved scope. [Producer](../../src/client/runner-session.ts), [store](../../src/client/runner-results.ts), [journey](../../e2e/runner-recovery.spec.ts).                                                                                                                                                                                                                       |
| Save old run and immediately start next as one local transition | **P2** | P [runner-session.ts:69](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/runner-session.ts#L69), main [client.ts:1068,1083](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/client.ts#L1068) creates previous attempt + next block together, preventing old result loss/double counting; C [MorseRunnerStudio.tsx:166,182](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/MorseRunnerStudio.tsx#L166) requires Review & save through modal, then Start new run; unsaved restart explicitly offers discard. Safe but less efficient for serial daily runs. |
| Cumulative assigned minutes and next-run remaining duration | **P1/P2** | P [runner-session.ts:48](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/runner-session.ts#L48) excludes class/review, sums saved+current eligible seconds; `:111` carries last actual WPM, reduces next duration to rounded remaining time, and switches later practice to extra review when threshold met. C already shows linked saved minutes ([shared/plan.ts:285,308](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/plan.ts#L285)), but status remains explicit task.done (`:327`); current [MorseRunnerStudio.tsx:176](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/MorseRunnerStudio.tsx#L176) carries WPM but reuses full chosen duration and has no cumulative assignment panel. Coordinate final planning/completion decision with daily-use audit. |
| Individual-run provenance/result retention | **Present** | P [runner-session.ts:16](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-training/runner-session.ts#L16) returns typed run result with actual start/end, starting settings/speeds/status/source/revision; C [MorseRunnerStudio.tsx:185,194](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/MorseRunnerStudio.tsx#L185) stores full runner state minus event sequence + revision and task ID in session metadata, automatically summarizes it in notes. There is no need to port a second bridge/engine to fix surrounding UX. Manual external-run structured entry/report plots are covered separately by report/backend audit. |

## Documentation reconciliation

- [P/docs/cw-listening.md](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/docs/cw-listening.md) matches active shared module wiring: stories, background native stitched speech, session persistence, exact shared recipes and common public/private UI are implemented. Its page name is not a clue to dismiss it as external or legacy code.
- One concrete source/documentation limitation: P supports effective speed in QSO/story playback, drafts, URL recipes, and restoration, but [cw-listening/storage.ts:17](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/storage.ts#L17) fails to copy `draft.qso.fwpm` into per-mode remembered preferences. A fresh QSO/story draft can lose Farnsworth spacing even though the active serialized session preserves it. C does persist effective speed in its global preferences. Port mode-specific preferences with both speeds and a round-trip test, rather than cloning this omission.
- Old `cw-training` wrapper filenames look substantial in inventories but most are one-line reexports. Audit the `cw-listening` implementation once, plus private adapters, rather than reporting two word/QSO engines.
- Historical “Bob's 77-word reference” and “77 most common words” are compatibility labels ([word-practice.ts:76](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-practice.ts#L76)), not missing extra vocabulary; both current catalogs contain the correct 70 unique entries.
- Legacy `audioSource: recording` is migrated away ([word-practice.ts:68](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-practice.ts#L68)); personal currently chooses static MP3 automatically by exact eligible settings. Do not add an old source selector to claim parity.
- [P/docs/cw-training.md](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/docs/cw-training.md) sending details are backed by the active lazy mount, but “recording” means measured keyed timing; neither the docs nor code should be paraphrased as microphone audio capture.
- C README/architecture accurately distinguish native Morse background audio from foreground-only local spoken answers ([README.md:12](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/README.md#L12), [docs/architecture.md:116](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/docs/architecture.md#L116)). They do not claim story/share/sending-input support. Basic external sending assignment support is truthfully stated ([README.md:41](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/README.md#L41)).

## Recommended coherent order

1. Durable active listening/simulator drafts and exact generated scripts; preserve actual settings attribution and avoid losing a half-finished session. Keep guest state local and account data private.
2. Port original Stories as a third listening mode, then speed/reposition continuity and consistent fresh-round shuffle. Reuse the current native player, stronger QSO profile generation, and copy-check feature.
3. Choose a deliberate spoken-audio policy: published original vocabulary clips stitched into native audio for dependable background playback; retain local TTS as an explicit custom-list fallback if desired.
4. Add optional sending capture as one contained feature, including safe adapter setup, raw timing/decoder/replay, keep/discard and local retention. Do not promise microphone or browser paddle keying as parity.
5. Improve successive runner runs with cumulative target/remaining duration and Save & next run; retain each run's independent engine result.
6. Add shareable listening recipes and optional public On-air helper/Practice opportunities tools without expanding the daily Today workflow into a navigation-heavy portal.

## Source-file coverage

Read active entrypoints and imports, source behavior, and relevant tests; this is not based only on UI labels or docs. Detailed native course-audio/timer code belongs to the frontend audit, not this report.

**Personal public/shared listening:** [src/pages/radio/cw-listening.astro](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/pages/radio/cw-listening.astro), [src/components/CwListeningPlayer.astro](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/components/CwListeningPlayer.astro); all `src/lib/cw-listening/` modules (`client`, `player`, `session`, `storage`, `speed-control`, `word-practice`, `word-panel`, `word-round`, `word-player`, `word-wav`, `word-assets`, `qso-practice`, `qso-panel`, `qso-round`, `qso-generator`, `qso-types`, `morse`, `media-artwork`); `src/data/cw-listening/{words,stories}.ts`; [docs/cw-listening.md](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/docs/cw-listening.md). Confirmed private `cw-training` reexports, listening adapter, block/attempt helpers and active `client.ts` mount/checkpoint paths. Tests inspected: [cw-listening.test.mjs](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-listening.test.mjs), [cw-training-word-practice.test.mjs](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-word-practice.test.mjs), [cw-training-word-assets.test.mjs](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-word-assets.test.mjs), [cw-training-qso-practice.test.mjs](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-qso-practice.test.mjs).

**Personal standalone public tools:** `src/pages/radio/{cw-practice,cw-qso}.astro`; `src/lib/{cw-practice,cw-practice-client,cw-practice-resources,cw-qso,cw-qso-client}.ts`; `tests/{cw-practice,cw-qso}.test.mjs`. Calendar endpoint behavior checked through imports/tests; no live external schedule verification performed.

**Personal sending:** `src/lib/cw-training/{sending-panel,sending-input,sending-engine,sending-session,sending-recordings,sending-reading}.ts`; associated `client.ts` start/checkpoint/replay/history/retention paths, device-store types, sending sections in [docs/cw-training.md](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/docs/cw-training.md); all five `cw-training-sending-*.test.mjs` modules.

**Personal runner:** `src/lib/cw-training/{morse-runner,runner-bridge,runner-session}.ts`; `client.ts` frame/start/stop/restart/result/reload paths and storage runner shape; vendor `UPSTREAM.json`, entrypoint, integration bridge/main, runtime parity comparison; `tests/{cw-training-morse-runner,cw-training-runner-bridge,cw-training-runner-session,web-morse-runner-vendor}.test.mjs`.

**Current equivalents:** `src/client/{main,PracticeStudio,ListeningTrainer,MorseTranscript,MorseRunnerStudio,QsoCopy}.tsx`; [word-content.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/word-content.ts), [qso-content.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/qso-content.ts), [qso-copy.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/qso-copy.ts), [practice-preferences.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/practice-preferences.ts), [audio.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/audio.ts), native player/track interfaces; `src/shared/{plan,runner,training}.ts`; current vendor source/bootstrap/theme/manifest comparison; `src/client/{listening-content,qso-copy}.test.ts`, [src/shared/runner.test.ts](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/shared/runner.test.ts), `e2e/{practice,morse-runner,qso-copy}.spec.ts`; README and architecture/curriculum/testing/runner docs. No account exports, IndexedDB contents, local personal recordings, or private imported curriculum data were read.


### Issue #6 follow-up — safe embedded Runner initialization

Runner startup now leaves outer keyboard focus and scroll with the learner.
Only synchronous initial `View.onLoad` suppresses its `setFocus` call; restoration
in `finally` preserves normal deliberate Run and exchange field navigation.
The local integration bootstrap owns this adaptation; pinned upstream/generated
files and the single measured engine/bridge remain unchanged.

A retained combined-build trace and independent static review establish the
original P2 issue: late iframe initialization scrolled to Call between tool-button
positioning and click dispatch. Deterministic held-bootstrap checks now retain
outer focus/scroll at desktop and mobile widths; the actual engine journey proves
Run still focuses Call and records/saves its own result. The mobile touch switch
and Axe/geometry pass. This introduces no auto-run or elapsed recovery. Final
combined regression and independent correction acceptance remain tracked in the
execution journal; no physical-device claim is made.


### Issue #7 follow-up — distinguish local receipt from uploaded evidence

The generated-listening journey now checks the actual server receipt before
exporting a saved result. An intentional QSO 503 proves durable local retention,
visible queued failure feedback and explicit retry of two byte-identical frozen
requests. Only a successful receipt permits server export/report assertions.
The word-save path likewise retries a retained queue if the local proxy loses
the connection. Production save and evidence behavior is unchanged.

The previous full-run trace showed a closed review with a locally durable result
and a ProxyWorker network loss, so immediate server export was an invalid test
boundary. Both corrected synthetic native desktop/mobile journeys pass in
40.3 seconds; exact played configuration/script/history/report checks remain.
Check, all 800 tests and build pass; final combined regression and independent
post-commit recheck are recorded in the execution journal.


The #6 startup correction (`60e60480`) and #7 receipt fixture (`e605a833`) pass
the final combined 63-journey regression. Independent post-commit desktop/mobile
held bootstrap proves exact outer focus/scroll retention and deliberate real
Run/Call/AudioWorklet/Stop; no substantive finding remains. The apparent Skip-link
full-page paint is absent from actual viewport and computed focus/geometry. Six
fresh combined Axe summaries are empty. The accepted production bootstrap hash
serves in version `ca935f6a-2302-4575-85d2-245aeb8108ba`; original-source/upstream
files remain unchanged. These focused local correction commits are unpublished
under the no-push instruction, even though their reviewed behavior is deployed.

Issue #15 post-commit correction: refused durable writes retain canceled notes
and the first submitted body in a bounded account/device-token-fenced open-page
cache, including full or unrelated damaged inventory. This cannot claim durable
retention, a local receipt or reload/live-engine recovery. Review displays the
exact frozen queued notes/context when an older editable terminal draft coexists.
Zero-time load failure can restart without removing a nonexistent result; actual
acknowledged-result discard remains protected. Reset/replacement summaries count
finished Runner results, including retained recovery. Submitted terminal/queue
contradictions are rejected in-file and against either existing store before
restore mutation; old optional inventory/lifecycle records remain compatible.

Root correction checks pass 917 tests/49 files and production build; the final
full browser gate passes 77 journeys in 15.7 minutes. Actual AudioWorklet journeys
verify both widths, storage refusal, cancellation and identical retry after a
lost committed response. Ten named settled Runner Axe reports are empty.
The earlier full gate's single sign-in failure has a retained HTTP429 trace;
synthetic fixture network isolation fixes it without changing limits/timeouts.
Independent correction recheck and deployment remain pending.


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


### Issue #20 — public live agenda/calendar delivered behavior

Guest and account navigation now reach current/next/future SST/MST/CWT windows
with dates/ends, official rules, explicit Local/UTC zone and retained shared choice.
A single pure UTC definition, verified October 2, 2026 against all three current
organizers, also generates the public recurring calendar and later private #21
eligibility queries. Studio inspection pauses/retains the existing block. Clipboard
denial leaves a focused selectable URL; real calendar download is parser-imported.
Nine logical UIDs survive time revision with deliberate sequence/version changes;
UTF-8 folding, GET/HEAD/conditional/cache/method/privacy boundaries are tested.
No public account/class query, result credit, restricted redistribution or original
site mutation. Shared choice joins optional device inventory/opt-in restore.
Initial focused/browser checks pass; independent post-commit acceptance and
production gate remain pending. See [canonical #20 ledger](../trainer-parity.md#issue-20--verified-public-sstmstcwt-agenda-and-recurring-calendar)
for organizer links, validation and limits. Private reminders, eligibility and
submission remain their own issues; unrelated guides/contact ADIF are excluded.

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

### Issue #25 — actual daily word-source listening

The permitted generated-word player now feeds an optional daily600-second goal
using actual native movement captured by the existing PracticeClock. Applied
word ownership, rather than selected controls or descriptive configurations,
supplies an optional raw timed-evidence subtotal. Recall uses existing observed
foreground timing and is excluded from the goal while retained in total practice.
Repeat list continues deliberately beyond600 seconds independently of assigned
recording replay. Old unmeasured evidence is not promoted. Strict disjoint source
budgets/corrections, stable-ID receipt retirement, class/date exclusion, private
SQL/portable backup and readable history/report facts are covered by fast tests.
The representative desktop/mobile native journey passes14.3s including recall,
cancellation, HTTP503 and exact retry with no required-task mutation. Ten settled
Axe/overflow checks are empty, and four captures were inspected. Original daily
recording remains private/unavailable; Common QSO/30 English/custom words are the
permitted replacement. No new recognition, elapsed reload recovery or physical
lock-screen claim. Canonical #25 inventory/planning ledger records full gates,
independent review and eventual production acceptance separately.

Initial full #25 browser checks found the preserved public-word manual timer
had been hidden by focused recall. It is restored alongside explicit recall
controls: manual total time and observed recall remain distinct, and neither
supplies word-listening goal credit. Its existing precision/save journey passes
3.4s with a new zero-listening assertion. The native journey passes16.6s after
comparing settled raw source measurements across recall, rather than a premature
rounded projection. Final full regression and independent review remain gates.

Final #25 check/all1,041 tests62files/build and all75 serialized browser journeys
pass15.3m; native words14.8s/manual3.3s verify separate source/recall/manual budgets.
Ten new desktop/mobile Axe summaries are empty. Independent post-commit review
and production acceptance follow; no physical-device claim is made.


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

### Issue #28 native repeated word rounds

Original pinned word-panel.ts lines 123, 165 and 254 and word-round.ts line 21
establish fresh rounds on native end, future-round Shuffle and independent
Repeat, including duplicate occurrences and the common-QSO VVV opening.
Morse-only Words now prepares each repeating round from the latest validated
source/preferences rather than looping an already-generated recording.
A shuffled round draws a fresh order without requiring random outputs to
necessarily differ. Unshuffled repeat keeps the complete source order.

Changing Shuffle or Repeat while playing or paused retains the current source,
word, position, rate and transport state. Pending continuation is consumed once
from committed React content before native installation. Turning Repeat off
before that commit prepares the next source paused. Pause, inspection, source/
tool replacement and disposal cancel pending continuation and late native Play
acknowledgements. Bounded preparation failure preserves earned time and exposes
an accessible Next round error with deliberate Retry next round; ordinary native
play errors retain the existing Play retry. No new player, clock or asynchronous
fetch pipeline is introduced. Existing spoken-answer behavior remains intact.

Actual heard movement and applied configuration summaries continue through the
existing account-scoped save/queue, history, export/import and report boundaries.
Selected-but-unheard next material contributes no time or source evidence.
No new SQL/entity, binding, migration, export schema or configuration is needed.
Public tools remain account-free. Editable built-ins remain #29, Stories #30
and retained content/preferences #31. Physical locked-device playback remains
unverified; new recognition and elapsed reload/crash recovery are excluded.

Two cheap deterministic cases cover source validation, duplicate/prosign
occurrences, immutable prior rounds, VVV, actual applied Shuffle summaries,
spacing and bounded duration rejection. Required check, 1,054 tests across
63 files and build pass. The affected eleven serial native browser journeys
pass in 2.1 minutes, including both new repeat/cancellation journeys, private
503 exact retry/export/history/report, seek/retime seams and prerecorded speech.
Four scoped desktop/mobile accessibility/overflow reports are empty and four
captures were inspected. Keyboard/touch Repeat/Shuffle, preparation failure,
late acknowledgement, source/inspection cancellation and ordered/shuffled native
continuation are exercised. Private raw heard time 10.066430 seconds agrees
with directly observed native playing movement 10.066481 seconds within 20ms.
No media event, currentTime, played range or elapsed time is fabricated.

Initial browser evidence found an outer Studio preference handler stopping
Shuffle/Repeat; its continuity policy was corrected. Two encoded-duration/upper
bound assertions were corrected to compare real native movement, excluding
pause/resume gaps and seek destinations; the product clock was unchanged.
A later unshuffled continuation was observed paused at zero once. Diagnostic
runs did not reproduce its cause; installation ownership was tightened to the
committed content boundary and all final affected journeys pass. Failure context,
pixels and bounded traces are retained in ignored local evidence. Full final
regression and fresh post-commit independent review remain subsequent gates.

Final regression before the feedback-only correction passes all 83 serial browser
journeys in 16.5 minutes. A focused native probe then exposed a stale outer Studio
alert after successful next-round retry; assertion, context, pixels and bounded
trace were inspected and retained. A deliberate retry callback now clears that
host-owned feedback without changing the player or time owners. The failing
journey passes in 9.4 seconds, followed by all eleven affected native journeys
in 2.0 minutes on final code. Required check, 1,054 tests/63 files and build pass.
Four final scoped accessibility/overflow reports remain empty and all four
current captures were inspected. Latest private raw heard time is 10.068418
seconds against directly observed 10.068388 seconds. Fresh post-commit review
remains required; this entry does not yet declare independent acceptance.

Fresh post-commit review found one P2 native-volume regression: changing native
volume from 0.4 to 0.3 survived mid-round controls but reset to selected 0.4 on
fresh automatic replacement. Native rate 1.5 already survived. The fix retains
actual supported native volume for an installed-track replacement, including
retry and repeat; initial preparation and unsupported-device baked volume keep
the selected fallback. Explicit settings-panel volume changes still use the
existing native-volume effect. No player, clock or source-evidence owner changes.
The existing guest journey now checks volume 0.3/rate 1.5 through deliberate
retry and actual automatic continuation; it passes in 8.9 seconds. All eleven
affected native journeys pass in 2.0 minutes. Check, 1,054 tests/63 files and
build pass. Reviewer recheck and its unclassified initial keyboard-launch probe
remain required; independent acceptance is not declared yet.

The same independent reviewer then confirmed a separate P2 initial keyboard
race: immediately pressing Enter on Start after changing Shuffle could install
stale material and have the pending source reset clear it before playback.
Play now queues the latest validated source through the existing committed-round
owner when initial content differs. A matching explicit pending round survives
the older source effect; automatic continuation still obeys cancellation.
Settled initial Play preserves its preview order and synchronous transport.
Custom source identity remains in the ephemeral round only and never enters
played summaries, API bodies or private saved evidence.

One cheap test protects that source-identity/privacy boundary, duplicate/prosign
normalization and built-in omission. The existing guest browser journey now
changes Shuffle twice and immediately presses Enter without waiting for a
reflected catalog, then exercises native preparation retry, volume/rate
continuity and source cancellation. The isolated journey passes in 9.2 seconds;
all eleven affected serial native journeys pass in 2.0 minutes. Required check,
1,055 tests across 63 files and build pass. The reviewer must independently
recheck both corrections on the committed revision before acceptance.

Fresh independent post-commit review ACCEPTS final keyboard correction
48f01ff3 after independently rechecking both P2 findings on original repros.
Eleven independently authored probes pass: repeated source generation, actual
native endings, cancellation owners, retry feedback, rapid initial/custom Enter,
selected panel override and baked-volume fallback. Unsupported native volume is
a labeled simulation; actual generated PCM preserves gain on both sources.
Twelve settled desktop/mobile accessibility/overflow reports are empty; captures
were inspected. Private raw heard time 9.231473 seconds matches observed
9.231456 seconds; exact 503 retry/history/report/export, guest isolation and
sourceText omission pass. Nine cumulative committed files, original pinned
references, protected document hashes and signing policy remain intact.
Reviewer released every process and its exclusive runtime lease. No unresolved
substantive finding remains. Root final regression/deployment recorded below.

Root final full regression passes all 83 serial browser journeys in 16.7
minutes on the independently accepted code. The strict deploy task passes check,
1,055 tests/63 files, build and dry-run; remote D1 has no pending migration.
Production version ff50292e-4f8f-43b9-be81-10e5a212d1e4 at
https://cwa.n1rwj.com serves four exact asset hashes and the unchanged Runner
bridge. Home/health 200, private entries/account-state/backup 401 and public
calendar GET/HEAD/304/405, nine stable UIDs and DST recurrence expansion pass.

No push was attempted. Fresh GitHub main remains accepted #27; all three #28
local implementation/follow-up lookups return 422. Fresh issue body/comments
and dependency arrays are unchanged. Issue #28 remains OPEN until publication.
Accepted local/production delivery permits the ascending #29 loop. Physical
locked-device playback is unverified; new recognition and elapsed reload/crash
recovery remain excluded. The original personal site is unchanged.

### Issue #29 private editable word sources

The pinned original storage/word-practice/word-panel source establishes retained
custom words, duplicate/prosign entries and editing built-ins into a custom
source. Companion now offers Edit this list, cloning original catalog order
without modifying shared words or copying a shuffled rendering. Source parsing
consistently bounds 8,200 raw characters, 1–200 entries and 40 characters per
word, preserves supported prosigns/punctuation and rejects control characters
before whitespace normalization. Normal spaces, tabs and new lines separate words.

Validated text and selection are retained in a version 1 account/Guest device
record. Generic shared custom selection never selects another scope's source.
The scoped React source owner outlives individual player/practice blocks: tool
changes, Finish/reopen and in-app inspection retain pending drafts and storage
feedback. Account/device-token/mutation boundaries reset the owner before child
commit; restored content is paused, with no elapsed clock or automatic audio.
Invalid/empty editing states keep last valid saved words accessible through
Use saved words. Readback failure exposes deliberate Retry saving words; clear
failure retains current words. Clear saved words resets only this source scope.

Private words join the explicit device inventory, download, strict portable
validation, reviewed restore, lifecycle rollback and scoped clear. Older version 1
backups omitting the optional source remain compatible. A newer current source
wins a collision with visible explanation; explicit word-source clear permits
restoring an older backup. Repeated restore is idempotent. No new Worker entity,
SQL, binding, config or public recipe; no custom text is implicitly uploaded.
Actual played source summaries continue through existing private history/report/
export boundaries without including source text.

Eight cheap tests protect parser/storage bounds, raw occurrence fidelity, private
keys, unknown/damaged records, readback, stale lifecycle owners, old backup
compatibility, source collision and transaction rollback after source installation.
Check, 1,063 tests across 64 files and build pass. Fourteen affected serial
listening/device browser journeys pass in 2.0 minutes. Two new source journeys
exercise actual clone/edit/switch/reopen/reload, private account isolation, native
duplicate/prosign playback, storage/clear refusal and keyboard/touch retry,
actual backup download/file selection, cancellation and explicit source restore.
Six settled desktop/mobile accessibility/overflow reports are empty and editor
pixels were inspected.

The first account fixture attempted a second email code within the existing
60-second address cooldown. Its assertion, context, pixels, bounded trace and
429 response were inspected and retained. The fixture now verifies first-account
reload retention, second-account isolation and clear preserving the first source,
then returns to Guest. Production limits were not changed; no fake native time
or event was introduced. The first full run passed 84/85 and timed out while
starting a later mobile Runner extra-review run; its assertion, context, pixels
and bounded trace were inspected and retained. The unchanged exact mobile
journey passed in isolation (38.4 seconds), then all 85 serial browser journeys
passed in 17.1 minutes. The first failure's cause remains unconfirmed; no timeout,
authentication limit or native timing was weakened. Fresh post-commit independent
review and deployment remain pending. Physical locked-device behavior remains
unverified. Invalid/unretained editing drafts are not reload recovery; only
validated acknowledged source text survives a reload. Failed storage stays
visible and retryable in the current scope. Stories remain #30; broader precise
mode preferences #31. The original site and approved exclusions are preserved.

### Issue #29 acceptance and production

Fresh independent post-commit review ACCEPTS `161cf890` with no substantive
findings: eight own browser journeys, 59 focused tests and ten empty desktop/mobile
accessibility reports. Real native shuffled duplicate/prosign playback and late
Play/source cancellation pass. Saved word seconds 1.624486 versus independently
observed 1.624534 differ by 48 microseconds. Selected unplayed content adds no
facts. Identical 503 retries, readable private history/report/export, source-text
omission, outsider 401, Guest/two-account isolation, genuine cross-tab same-token
recovery, retained failed-write drafts and reviewed device backup controls pass.
All reviewer processes closed and its runtime/source lease was released.

Root check, 1,063 tests/64 files, build and final 85 serial browser journeys pass.
The earlier full-run Runner failure and unchanged isolated/full retry evidence
remain recorded above with unconfirmed cause. Production version
`aa786621-0c95-4832-870d-5a3f247e4453` follows the strict deploy task. Its first D1
check returned API 7403; the full-task retry succeeded, with no migrations.
The initial asset hash mismatch was retained; subsequent diagnostic headers and
complete recheck match four built assets and unchanged Runner bridge. Public
home/health, private 401 and exact recurring calendar GET/HEAD/304/405/DST/UID/
no-cookie checks pass. See the inventory's #29 acceptance ledger for limits.

No push was attempted; accepted source remains local main and #29 stays OPEN
until GitHub publication. Only validated readback source survives reload;
physical locked-device behavior is unverified. Stories remain #30 and broader
precise preferences #31. This journal changes no runtime or original-site file.

### Issue #30 authored Stories workflow

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
