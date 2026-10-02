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
| Fresh shuffle for every repeated native-audio round | **Partial / P2** | P [word-panel.ts:123](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-panel.ts#L123) prepares a fresh round on ended. C Morse-only [ListeningTrainer.tsx:260](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L260) uses native `loop` on the already-generated shuffled track, repeating the same order. Its *spoken* branch correctly calls `wordPracticeRound` again (`:143`). The visible Shuffle + Repeat combination thus behaves differently depending on spoken mode. |
| Shuffle/repeat toggles during playback without throwing away the current word | **Partial / P2** | P [word-panel.ts:254](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-panel.ts#L254) defers shuffle to next round and changes transport repeat independently; C [ListeningTrainer.tsx:324](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L324) stops/clears on `track`, `repeatList`, or `spokenAnswers` changes and the selection reset effect also handles shuffle. |
| Directly edit the selected built-in into a custom list | **Missing / P2** | P editable textarea is always available ([word-panel.ts:48](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-panel.ts#L48)); editing changes selection to custom (`:277`). C only renders its textarea for explicit custom selection ([ListeningTrainer.tsx:422](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L422)) and initializes it separately; no “copy this list to custom” action. Both allow custom practice, but quickly removing difficult/easy words from the existing list is less direct in C. |
| Custom draft survives closing/reloading the tool | **Missing / P1** | P [storage.ts:12,16](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/storage.ts#L12) persists the word draft, including custom text; [session.ts:46,79](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/session.ts#L46) validates/restores it. C stores only typed preference fields ([practice-preferences.ts:5,47,97](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/practice-preferences.ts#L5)), custom text is React state, and UI explicitly says it lasts only while the studio is open ([ListeningTrainer.tsx:435](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L435)). |
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
| Click a specific word while preserving paused state | **Partial / P2** | P [word-panel.ts:291](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-panel.ts#L291), [word-player.ts](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-player.ts) seek behavior tested at [tests/cw-training-word-practice.test.mjs:589](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/tests/cw-training-word-practice.test.mjs#L589). C [ListeningTrainer.tsx:307,318](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L307) always resumes after seeking; spoken branch starts the chosen word too. The word jump exists, but a paused learner cannot silently reposition. |
| Back 10 seconds | **Missing / P2** | P [player.ts:50](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/player.ts#L50) inserts an explicit rewind action and `word-player` keeps listening credit correct across seek. C has native seek plus previous/next *word/transmission* controls, not relative-time rewind. |
| Change speed while retaining word occurrence, playback state, and heard prefix | **Partial / P1** | P word path [word-panel.ts:218](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-panel.ts#L218) / [word-round.ts:66](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/word-round.ts#L66) finishes current item at old speed, retimes later items. QSO path [qso-panel.ts:120,137,143](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-panel.ts#L120), [qso-round.ts:51](https://github.com/rwjblue/rwjblue.com/blob/3106c9b8bf20b63be069f4019467cb565cdd17ec/src/lib/cw-listening/qso-round.ts#L51) rebuilds at the same word occurrence/station/line, preserving paused/playing; repeated words cannot jump to the wrong occurrence. C dependencies [ListeningTrainer.tsx:251,324](https://github.com/rwjblue/cwa-training-tracker/blob/bc20fdb817a3c42969fafddc2d84c3664d73c10d/src/client/ListeningTrainer.tsx#L251) clear and stop the old track; next prepare starts current *item* (`:255`), so a QSO can restart its whole transmission instead of the exact word. This also happens for volume changes because volume is a track dependency. Frontend owns final remedy/tests. |
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

### Live practice opportunities / calendar — **missing, P2**

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
