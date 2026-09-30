# Native copy trainers: LCWO research and proposal

Research date: **September 29, 2026**. Status: **native trainers implemented**.
The research and original delivery estimates below explain the design, not
unfinished scope.

## Implementation status

The four native modes are implemented in [CopyTrainer](../src/client/CopyTrainer.tsx)
and the shared [copy domain](../src/shared/copy-practice.ts). Groups support
letters, figures, mixed/custom pools, fixed/random group lengths, duration,
both speeds, extra spacing, tone and countdown. Group-count configuration is
retired from new practice; historical count-based attempts still validate, replay,
and retain their original settings. Word and callsign rounds have 25 trials, fixed/adaptive speed, replay, optional skip, and per-trial results;
callsigns add filtering, speed ceiling, stop-on-error and blind feedback. Plain
text uses short authored sentences. These are native equivalents with versioned
scoring, timing and content, not identical LCWO corpora or scores.

New practice defaults to a random 500–900 Hz tone per group, word, or callsign.
This matches LCWO's documented source behavior for
[groups](https://github.com/dj1yfk/lcwo/blob/3d0b25b539c18fe24c23601f3b3579428858148f/inc/functions.php#L176-L187),
[words](https://github.com/dj1yfk/lcwo/blob/3d0b25b539c18fe24c23601f3b3579428858148f/inc/wordtraining.php#L504-L510)
and [callsigns](https://github.com/dj1yfk/lcwo/blob/3d0b25b539c18fe24c23601f3b3579428858148f/inc/callsigns.php#L130-L134),
with the first group randomized too. Pitches are repeatable from the saved attempt
and do not affect content generation, so replay, recovery and review keep the
same pitches. Fixed tones remain optional.
Plain text uses one random pitch for the entire recording; this intentionally
extends LCWO's setting, which its
[plain-text player ignores](https://github.com/dj1yfk/lcwo/blob/3d0b25b539c18fe24c23601f3b3579428858148f/inc/playerfunctions.php#L29-L34). Previously saved
fixed-tone results and pending saves retain their original evidence.

Attempts save exact targets, answers, settings, per-trial speeds, replay/reveal
flags, and audio/answer/review time. [Local drafts](../src/client/copy-storage.ts)
restore paused, isolate accounts from guests, coordinate tabs, and retain a
pending save for retry. Answer/review timing pauses after 30 seconds without
interaction; the current copy UI also pauses audio when hidden. Private saves
are validated and equivalent retries are acknowledged without overwriting a
changed record. [History](../src/client/CopyResult.tsx),
[whole-attempt report details](../src/shared/copy-report.ts), and account
export/import retain the evidence. General audio and Runner recovery remain
separate parity work.

Grading now saves the round automatically and keeps the feedback visible, with
an immediate next-round action. Word/call entry is a single line with per-trial
progress; typing `.` replays the current word. Notes stay optional. Guest results
remain in the device's logbook, and signed-in uploads use an account-scoped queue
for unchanged retries. Post-grade replay does not change the already-saved timing.
Listening navigation likewise saves sessions with at least 30 credited seconds;
shorter sessions keep notes without creating a log entry. Closing/reloading an
unfinished non-copy session still uses the existing warning, not full recovery.

[Published curriculum catalogs](curriculum.md) now cover Beginner v4.8,
Fundamental v2.0, Intermediate v2.3 and Advanced v2.1. All 20 Intermediate ICR
assignments launch native group/word choices with corrected speed semantics;
98 Fundamental blocks use all four modes. Beginner and Advanced keep their
published non-LCWO activities, official links and recording metadata. No prototype
is selected silently. Generic historical ICR links and supported LCWO trainer
links adapt at launch without rewriting source records; unrelated LCWO tools
remain external. No LCWO account connection, fetch, or live synchronization is
needed for this workflow.

Generation/scoring, clocks, curriculum, report selection and API validation have
focused unit/API coverage. An independent agent reviewed guest and signed-in
flows at 1280px and 390px, using real Chromium media playback and local Wrangler/D1.
The [native browser journeys](../e2e/copy-practice.spec.ts) cover all modes,
paused reload recovery, mobile sign-in, history/report evidence, an uncertain
save retry, downloads including notes, and Fundamental preset/character selection.
Inspected states pass accessibility checks. Browser regressions also cover
immediate Start focus, the persistent answer field, adjacent comparison columns,
omitted groups, and recovered assignment choices.
Physical iPhone, Safari and lock-screen behavior have not been verified.

Remaining differences include LCWO's broader/multilingual dictionaries, real
callsign database and proverb collections, Koch/MorseMachine/QTC/TX modes, REAL
timing, cut numbers/framing, long 30-minute runs, exact legacy scoring,
automatic curriculum progression and the configurable advisor-form workflow.
Current native groups allow 10–600-second targets. Repetition and advancement
instructions are visible guidance; completing a round does not automatically
complete an assignment. The original planning sections below remain useful for
those boundaries and for acceptance review.

## Recommendation

The implemented scope includes native **Code Groups**, **Word Copy**,
**Callsign Copy** and **Plain Text Copy**, connected to the course assignments.
Those four modes cover the LCWO activities found across the currently published
CW Academy curricula. Keep the existing unscored word-listening tool available.

The generation and audio are tractable, and much of the audio infrastructure is
already here. The substantial work is the complete attempt lifecycle: hidden
answers, typed copy, grading, adaptive speed, meaningful time accounting, recovery,
individual results, and correct assignment presets. A second audio service or a
hosted copy of the whole LCWO application is unnecessary for this design.

This makes the assigned LCWO practice possible inside the companion. It does
not, by itself, implement every CW Academy activity: official recordings, sending,
MorseCode.World exercises, contest simulators, class meetings, and on-air work
have their own workflows.

## Evidence and limits

- Read the [official LCWO source][lcwo] at commit
  `3d0b25b539c18fe24c23601f3b3579428858148f` (August 26, 2026), including generators,
  scoring, dictionaries, settings, and browser audio. A [GitHub mirror][mirror]
  exists; use the official pinned source for implementation references.
- Inspected live Code Groups, Word Training, Callsign Training, Plain Text, and
  CW Settings using LCWO's publicly advertised demonstration account. No personal
  account or practice history was used, and no scored live attempts were submitted.
  Source analysis establishes grading behavior; a deployed-server revision match
  has not been proved.
- Reviewed all four published course documents, shared ICR guidance, and separately
  listed prototypes from the [official student resource index][resources].
- Audited this checkout against [trainer parity](trainer-parity.md),
  [curriculum coverage](curriculum.md), and [testing policy](testing.md).
  Existing local import/history work was present during the audit.

Only factual settings and original summaries belong here. Complete CWops
directions, recordings, scales, and restricted content remain at their sources.

## What LCWO actually provides

| Mode                                     | Exercise and controls                                                                                                                                                    | Result / interaction                                                                     | Proposed priority                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Code Groups                              | Letters, figures, mixed, or selected characters; duration; fixed/random group length; character/effective speeds; extra spacing; tone; start delay; optional framing     | Continuous audio, textarea copy, group feedback and error percentages                    | First release                                                            |
| Word Training                            | 25 individual words; collection/language, maximum length, Koch character restriction; starting speed, minimum character speed; fixed/adaptive; optional five-second skip | Type each answer; replay; exact-word correctness, points, highest correctly copied speed | First release                                                            |
| Callsign Training                        | 25 calls; starting/minimum-character/maximum speeds; fixed/adaptive; long/slash filters; stop-on-error and blind options                                                 | Per-call answer, replay, points, highest correctly copied speed                          | Second release; required by Fundamental                                  |
| Plain Text                               | Random sentence/proverb from a selected collection; character/effective speeds; character simplification                                                                 | Continuous copy, comparison/error feedback, new sentence                                 | Second release; required by Fundamental                                  |
| Koch lessons                             | Progressive character set and weighted generation, with copy checks and statistics                                                                                       | Character-learning curriculum                                                            | Optional; LCWO's Koch order is not CW Academy's order                    |
| MorseMachine                             | Character recognition with adaptive emphasis on difficult characters                                                                                                     | Immediate single-character answers                                                       | Optional; useful remediation, not required for the first four-mode scope |
| Text to CW / practice downloads          | User text and generated material, playback and downloadable audio                                                                                                        | Listening rather than a scored copy attempt                                              | Existing custom playback covers part; download is optional               |
| QTC / TX training                        | Contest message practice / sending practice                                                                                                                              | Separate specialized workflows                                                           | Later, if requested                                                      |
| Statistics / highscores / groups / forum | History, charts, rankings, community                                                                                                                                     | Account/community functions                                                              | Private history matters; public rankings and community cloning do not    |

The [live site][lcwo-about] and the individual source files
([groups][groups], [words][words], [callsigns][callsigns], [plain text][plaintext])
support this inventory. Course coverage below determines what to build first.

### Code Groups

The main length control is **duration, 1–30 minutes**, rather than an explicit
number of groups. LCWO chooses enough whole groups to approximate the requested
duration. Fixed group length lives in CW Settings; random length is 2–7. That is
distinct from how many groups are played. Our UI can offer both duration and group
count, with one selected as the stopping rule.

Figures are digits. Mixed also includes punctuation. Custom mode uses a character
selection, not arbitrary text. LCWO additionally supports cut-number variants,
random tone, a `VVV =` / `<AR>` frame, and REAL rather than PARIS speed. Those
options are useful for a complete feature inventory but are not all prerequisites
for Intermediate. Extra word spacing, custom pools, and short groups are essential
for Fundamental. See [group controls and generation][groups] and
[shared generators][functions].

Random group lengths are weighted toward lengths 4–5, rather than uniformly
distributed. The source also has a longer-run duration quirk: its last choice
between candidate group counts compares their duration with 60 seconds even when
another duration was requested. Neither behavior should be inherited accidentally.

In PARIS mode, word speed is a standard timing measure; digits and different
letters have different durations. A one-minute target is consequently not a
promise of exactly N five-character groups. The native generator should measure
the rendered timeline, choose the nearest complete group boundary, and preserve
actual duration. Do not cut off a character to enforce an exact minute.

**Scoring is more nuanced than one Levenshtein call.** The source calculates a
group-by-group comparison and, for sufficiently short transmissions, a second
whole-string Levenshtein comparison. Each error percentage uses transmitted
non-space character count as denominator, truncates to one decimal place, and
caps at 100. Saved accuracy is:

```text
LCWO saved accuracy = 100 − min(group error %, whole-string error %)
```

The whole-string comparison includes normalized spaces, but its denominator
excludes spaces. It is only attempted when the source transmission has fewer than
255 bytes; otherwise that candidate error rate becomes 100%. Extra input groups
also expose legacy behavior in the positional group comparison. Case and
whitespace normalization, player commands, and some accepted character aliases
need explicit fixtures. See [the result calculation][group-score] and
[comparison implementation][comparison].

### Words and callsigns

Word Training is a sequence of **25 answer-and-feedback trials**, not one long
recording of 25 words. Maximum word length is inclusive, unlike the companion's
existing exact-length word generator. Collections include English, English
1–3-letter words, CW abbreviations, and Q codes, as well as other languages.

LCWO's two speed labels are easy to misread. At a current test speed of 10 and
minimum character speed of 25, it sends at **25 character / 10 effective WPM**.
Once the test speed rises above the minimum character speed, the two coincide.
Correct answers increase the test speed by 1 WPM in adaptive mode; wrong answers
decrease it, with a 5 WPM floor. Fixed mode preserves it.

Word correctness is an exact comparison after source-defined normalization;
there is no partial Levenshtein credit. LCWO handles case, some whitespace,
diacritics, and Kana normalization. Points depend on speed and length. A notable
implementation detail is that adaptive speed increases **before** points are
added:

```text
Correct adaptive word sent at 20 WPM, 4 letters: (20 + 1) × 4 = 84 points
Correct fixed-speed word sent at 20 WPM, 4 letters: 20 × 4 = 80 points
Wrong word: 0 points
```

The reported maximum is the highest test/effective speed successfully copied,
measured before that increment; character speed may still be higher. Replaying
does not impose a points penalty. Score alone therefore
does not reveal correctness percentage or first-listen performance. Store all
three separately. See [word grading][word-score] and [word playback][word-play].

Callsign Training shares that broad interaction and speed/length scoring, adding
a maximum speed and its own exact uppercase comparison. Its long-call filter
rejects runs of at least two digits or four letters; it is not simply a
total-length cap. Slash
exclusion is a separate filter choice. An international callsign corpus and its
distribution matter for difficulty; the companion's simple fictional generator
is not automatically equivalent. See [callsign grading and filters][callsigns].

Selection rules also affect difficulty. Words are sampled without replacement
when the eligible pool is large enough, with repeats to fill undersized pools;
multiple collections receive approximately equal shares. Callsigns are sampled
with replacement. Native generation should record the collection/version and
sampling policy rather than treating all random lists as equivalent.

### Plain-text scoring

Plain Text compares a normalized sentence using Levenshtein distance. Its
denominator includes spaces, unlike Code Groups. The source compares only the
first 255 characters and truncates the resulting accuracy to one decimal place:

```text
accuracy = max(0, trunc(1000 − 1000 × distance / sentLength) / 10)
```

For one error out of three characters, that produces 66.6% accuracy; Code Groups'
subtract-a-truncated-error calculation produces 66.7%. Preserve these distinctions
in imported evidence, even if native trainers adopt a consistent display-rounding
policy. Native sentence grading should cover the full text with an explicit
punctuation/spacing policy. [Plain-text grading][plaintext]

### Audio timing

The current companion uses PARIS-derived Farnsworth spacing. LCWO's bundled
jscwlib uses an empirical stretch expression. At 25 character / 10 effective WPM,
their inter-character gaps are approximately **712.42 ms here versus 728.22 ms in
LCWO**. Thus identical displayed settings do not produce identical audio timing.
See [our timeline](../src/client/audio.ts) and [jscwlib timing][timing].

Keep one engine. Extend its timing options only if needed; retain a versioned
`timingProfile` on each attempt. Extra word spacing needs an explicit definition:
LCWO expresses it as additional multiples of the normal word gap, while the
existing listening UI's pause controls are not automatically the same unit.
Tone changes, cut numbers, and framing must be represented separately from the
expected answer. Prefixes, suffixes, and countdowns must not become copy errors.

## Requirements across all curricula

The published versions below are distinct from the prototypes listed afterward.

| Course                            | Required LCWO coverage                                                                                          | Important settings and progression                                                                                                                                                                                                                                                | Other work needed for a complete in-site course                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [Beginner v4.8][beginner]         | No LCWO references in its main curriculum; shared guidance offers optional ICR after the character introduction | Main receiving starts at 18 character / 6 effective WPM; curriculum-ordered characters, words, prosigns and personal QSO substitutions                                                                                                                                            | MorseCode.World-style character introduction, speech-after recognition, sending, and personal QSO practice        |
| [Fundamental v2.0][fundamental]   | **Groups, Words, Callsigns, Plain Text**                                                                        | Groups at 25 character WPM, effective 6→11, lengths 2→5; selected weak characters, variable extra spacing, 1–3-minute runs. Word collections and short-word challenges; calls at about 8 effective / 25 minimum character WPM, with limits and filters; English/American proverbs | Separate course catalog; daily sending, recordings, self-review and on-air practice                               |
| [Intermediate v2.3][intermediate] | **Groups and Words** through ICR guidance; callsigns are supplemental                                           | 20 scheduled ICR exercises, starting effective speed 10→20; guidance starts letters/figures length 3, custom length 2, words maximum 3, usually 25 character WPM                                                                                                                  | Existing catalog is usable; sending, official recordings, Runner and CWT remain separate activities               |
| [Advanced v2.1][advanced]         | No LCWO references in the published main curriculum; supplemental guidance includes groups, words, calls        | Supplemental ICR starts effective 20, progresses toward 30, with some optional work to 35; word minimum character speed 30                                                                                                                                                        | New catalog, head-copy recordings including POTA/prefixes/suffixes, sending, and optional contest/on-air practice |

Fundamental references are particularly important: Plain Text appears at S5D2,
S9D2, and S10D2; Words at S6D3, S7D2, S8D2, S9D2, and S10D2; Callsigns at S7D1,
S7D3, S8D1, and later conditional practice. The document's printed pages 21 and
26–38 locate these initial uses. Later exercises sometimes use an 80% threshold
or a five-attempt stopping rule. These should be per-exercise rules rather than a
universal promotion threshold. [Fundamental curriculum][fundamental]

The [shared LCWO ICR guide v1.6][icr] recommends one-minute PARIS group runs,
repeated practice, and progression around 90% group accuracy. Intermediate word progression
uses fewer than three errors. It emphasizes remembering a group before entering
it; the interface should allow copy-behind instead of demanding immediate
character entry. Difficulty tracking should be separate for letters, figures,
custom groups, and words. The guide does not establish a universal averaging
window, so an app recommendation based on recent runs must identify its own rule.

### Corrected Intermediate recipe model

The previous catalog put ICR's requested starting speed into `characterWpm`, but
those assignments refer to **starting effective speed**. The native recipes now
separate it from the intended 25 WPM character speed. This prevents a nominal
10 WPM assignment from using the wrong character formation.

| Starting effective WPM | Intermediate session/day occurrences       |
| ---------------------- | ------------------------------------------ |
| 10                     | S1D1, S1D3, S2D2                           |
| 13                     | S3D1, S3D3, S4D2, S5D1, S5D3, S6D2         |
| 15                     | S7D1, S7D3, S8D2, S9D1, S9D3, S10D2, S13D3 |
| 18                     | S11D1, S11D2, S13D1                        |
| 20                     | S15D3                                      |

This mapping is checked against [the published source][intermediate] and
[the local catalog](../src/shared/curriculum/intermediate-v2.3.json). S13D3 really
does return to 15 in the published source; flag it rather than silently changing
it. Existing occurrence IDs and historical records should survive recipe fixes.
The local 15-minute target for unspecified-duration exercises is an **app planning
estimate**, not a universal CWops ICR requirement.

### Source discrepancies and prototypes

The shared ICR guide reverses Word Training's Speed / Minimum Character Speed
values in places relative to its prose, and its Intermediate figures progression
contains a 10→7 step. Use explicit character/effective labels and validated,
advisor-adjustable presets; record which discrepancies were resolved and why.
Do not silently translate contradictory directions into authoritative course
requirements. [ICR guidance][icr]

Fundamental has collection conflicts too: S6D3 selects CW abbreviations while
describing Q-only content, and its optional challenge mentions five-letter words
with a 1–3-letter collection selected. Keep an explicit preset-resolution note;
do not promise unavailable longer words or silently substitute a collection.
[Fundamental curriculum][fundamental]

The official index also lists [Fundamental prototype 2.1][fundamental-proto],
[Intermediate prototype 2.24][intermediate-proto], and
[Advanced prototype 2.24][advanced-proto]. The index labels the Intermediate
prototype 2.4 while the document itself says 2.24. Fundamental's prototype extends
the effective-speed target to 12; it still uses all four modes. These should be
opt-in versioned catalogs. Historical “Basic” naming should map deliberately to
the relevant older course, not create a fifth current curriculum.

## Native product behavior

### First release: Intermediate groups and words

An ICR assignment opens a native practice screen with **Code Groups / Words**,
source link, starting preset, and remembered personal settings. Describe preset
values as starting points; adaptive practice and advisor changes can depart from
them. Keep course defaults and personal preferences separate.

Code Groups needs:

1. Letters / figures / mixed / custom selectors, with a visible character grid.
   Offer “practice these mistakes” after review, with an editable selection.
2. Group length, duration (default one minute), optional explicit group count,
   character speed, effective speed, tone, extra group spacing, and start delay.
3. Hidden expected text, a keyboard-friendly multiline copy field, and native
   playback. Enter can separate groups; it must not accidentally submit the test.
   Replay preserves typed work. Reveal is deliberate and recorded.
4. A submitted result showing expected/copy alignment, insertions, omissions,
   substitutions, errors and denominator, percentage, settings, and actual time.
5. Save and next fresh run, with cumulative assignment minutes and separate
   explicit assignment completion. Preserve each result as one attempt.

Word Copy needs:

1. A 25-word round, English/short-English/abbreviation/Q-code collection choices,
   maximum length, starting effective speed, minimum character speed, fixed or
   adaptive speed, and tone. Collections can be staged as rights-cleared content
   is available; don't imply the current 30-word list is LCWO's dictionary.
2. One word at a time; response, Enter-to-submit, replay, skip, and immediate
   feedback. Optional timeout must start after audio actually ends, restart on
   replay, and pause when the attempt is interrupted.
3. Per-trial actual speeds, response, correctness, replay count, and response
   seconds. Show correct/25, points, highest correctly copied speed, and time as
   distinct results. An incorrect or replayed trial is still useful practice.
4. Review missed words at their actual trial speeds; review does not rewrite the
   original assessment. A fresh round gets a new attempt identity.

Keep the present tool named **Word listening**, and name the new scored tool
**Word copy**. Shared vocabulary and audio do not make the workflows interchangeable.

### Scoring recommendation

Use a documented, versioned native score. For groups, calculate whole-sequence
Levenshtein distance after case normalization and whitespace collapse/trim;
preserve single group separators in the comparison, exclude them from the
transmitted-character denominator, and explain spacing errors in the result.
Count extra groups, support long attempts, show the raw distance, and cap displayed
error percentage at 100. Do not remove unsupported input characters while grading.

For words/callsigns, expose exact item correctness and a clearly labelled
LCWO-style speed/length score, including the post-increment convention if that
metric is offered. Preserve sent speed, next speed, and maximum successful speed
separately. Comparable points also require comparable dictionaries and settings.

This intentionally avoids presenting LCWO's group-scoring edge cases as the new
default. Native group percentages can differ from LCWO's saved accuracy. Keep
imported LCWO results labelled by source. If exact numerical continuity is needed,
add a separate pinned LCWO comparison profile with golden fixtures for its two
scorers, rounding, aliases, and 255-byte behavior. Do not claim exact LCWO parity
for the default native scorer or current timing engine.

### Time accounting and recovery

The previous external LCWO path had a manual elapsed timer, but could not
observe what happened in the other site. The native design distinguishes:

| Measurement                   | Rule                                                                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Audio seconds                 | Actual media movement through the generated exercise, including intentional gaps and replay; exclude pause, buffering, seeking jumps and pre-start countdown |
| Answer seconds                | Active foreground answering after playback, excluding overlap with audio; pause on explicit pause, hidden page, or a documented inactivity boundary          |
| Review/recall seconds         | Separate explicit mode if the learner wants to count focused review                                                                                          |
| Credited practice             | Non-overlapping union of the accepted intervals; keep the breakdown visible                                                                                  |
| Planned duration / completion | Assignment target and completion remain separate from measured practice                                                                                      |

The inactivity policy is a product choice, not proof of cognitive effort. A
visible response timer with an idle-pause/resume prompt is preferable to silently
counting an open answer screen. Background audio could count when actual media
advances; the current copy UI instead pauses when hidden. Background response
time cannot count. Preserve fractional seconds and
aggregate before minute rounding so many short runs do not lose or inflate time.

Persist the target, answer, trial index, settings, audio position, timer state,
and pending result locally after meaningful changes. Restore **paused**, with
Resume. Keep authenticated drafts scoped by user and anonymous practice separate;
prevent two tabs from crediting the same attempt. Queue a finished save using a
stable ID and show unsaved/retrying/saved state. A lost response after a successful
save must not create a second record or discard the draft.

Public drills should work without login. Account sign-in adds private history and
assignment credit. Store text and compact results, never generated WAVs.

## Fit to this repository

| Existing component                                                                                                 | Reuse                                                             | Necessary change                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [audio.ts](../src/client/audio.ts)                                                                                 | Morse alphabet, timing, existing content generators               | Duration-based/custom-pool groups, inclusive word-length filtering, independent answer normalization, optional versioned timing |
| [morse-track.ts](../src/client/morse-track.ts), [morse-player.ts](../src/client/morse-player.ts)                   | Native WAV playback, actual position, pause/resume, Media Session | One word/call track at each trial's speed; attempt-controlled replay and completion                                             |
| [practice-clock.ts](../src/client/practice-clock.ts), [usePracticeClock.ts](../src/client/usePracticeClock.ts)     | Actual playback accounting                                        | Response/review intervals and overlap rules                                                                                     |
| [PracticeStudio.tsx](../src/client/PracticeStudio.tsx), [ListeningTrainer.tsx](../src/client/ListeningTrainer.tsx) | Entry points and listening tools                                  | A focused CopyTrainer workflow, without expanding one component into all trainer logic                                          |
| [curriculum.ts](../src/shared/curriculum.ts), [plan.ts](../src/shared/plan.ts)                                     | Stable assignment identity and linking                            | Typed native recipes, corrected ICR speed semantics, additional versioned course catalogs                                       |
| [shared training.ts](../src/shared/training.ts), [Worker training.ts](../src/worker/training.ts)                   | User-scoped persistence and export                                | Validate native attempt results, equivalent-save retry handling, bounded evidence                                               |
| [main.tsx](../src/client/main.tsx)                                                                                 | Saving, history, reports                                          | General native result inspector and report selection of whole attempts                                                          |

A shared pure domain module should own recipe validation, generation, scoring,
and adaptive transitions. A client controller should own the attempt lifecycle:
configure → ready → playing/answering → submitted → reviewed/saved, with explicit
paused, interrupted, and abandoned states. Freeze the recipe at start. Render
adaptive words individually using the existing engine; it currently assigns one
speed pair per track.

The result schema should contain a schema/scoring/timing version; native/imported
source; attempt and assignment IDs; exact target and submitted answer; dictionary
version; actual settings; per-trial outcomes and speeds; replay/reveal/interruption
flags; time components; start/end timestamps; notes; and completion status. Keep
missing values distinct from zero. Do not squeeze word points, error percentage,
and self-ratings into one generic `accuracy` field.

The existing JSON-backed records can hold a compact typed result without an
immediate new D1 table. Worker validation should bound item counts/text lengths,
validate arithmetic or recompute deterministic scores, and retain existing
ownership rules. Current limits include 200 KB metadata per record and 6 MiB per
account; full audio and verbose event streams do not belong there. The current
save API now acknowledges an equivalent retry for the same authenticated account
while retaining 409 for a conflicting record. [Architecture](architecture.md)

Current generated audio is capped at 20 minutes and uses a full PCM WAV in
memory. Do not raise that limit merely to match LCWO's 30-minute dropdown; ship
short curricular runs first and use chunking if long practice is later needed.
Existing preferences also cap UI speeds at 50 WPM, below LCWO's optional ranges.
Course presets fit inside that, but full high-speed parity would require more.

## Source reuse and content

LCWO's [README][readme] specifies **AGPL-3.0**; this repository uses MIT.
[jscwlib][jscwlib] is separately MIT licensed. Directly importing LCWO application
code is a licensing decision, and its contributed dictionaries/proverb corpora
need provenance review before redistribution. The repository includes SQL content
data, so corpus analysis is possible without scraping users or private history.

At the reviewed commit, the [bundled word data][word-data] has 8,097 general
English entries and a distinct 158-entry short-English collection. Limiting the
general collection to three letters yields 397 entries, so it is not the same
exercise. CW abbreviations and Q codes have 157 and 27 entries respectively.
The [callsign array][call-data] has 40,791 distinct calls, and
[plain-text data][text-data] includes 619 English and 169 American proverbs.
These are source-dump counts, not a claim about today's live database. The
companion's existing small listening lists cannot supply equivalent diversity.

Recommend implementing the documented training behavior in our TypeScript domain
and reusing our existing audio. Do not paste AGPL application code into MIT files
or assume that a source-visible word/proverb corpus is unrestricted. If direct
reuse is chosen, resolve applicable license obligations and notices explicitly.
Start with reviewed existing vocabulary, add one-letter words for inclusive short
lists, and expand with suitable English/Q-code/abbreviation material. Prefer
authored or clearly licensed sentences for plain text; version all collections.
Different collections mean different difficulty, even with matching score math.

Initial collections must use the engine's supported ASCII characters and explicit
prosign tokens. Reject unsupported targets before playback; the existing
`cleanMorseText` silently removes unsupported characters. Additional alphabets
need encoding support and validated content before being offered.

## Original delivery plan and acceptance criteria

These were planning estimates for an engineer familiar with this repo, not measured
commitments or remaining effort. Core four-mode implementation and published
catalog integration have landed in this checkout; broader parity stays separate.

| Milestone                                  | Deliverable                                                                                        | Acceptance gate                                                                                                                    | Rough effort        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| 1. Native Code Groups and shared attempts  | Generation, copy/grading, actual time, local recovery, save/history, public access                 | A one-minute custom/figures exercise can be played, copied, reviewed, reloaded safely, saved once and exported with exact evidence | 3–5 engineer-days   |
| 2. Word Copy and Intermediate integration  | 25 trials, fixed/adaptive speed, replay/skip, word results; full ICR recipes and repeated-run flow | Complete an assigned Intermediate ICR session without leaving the site; inspect its speeds, score, time and linked minutes         | 3–5 additional days |
| 3. Remaining curricular LCWO modes         | Callsigns, plain text, weak-character practice, collections, Fundamental recipes/catalog           | Representative Fundamental groups, words, callsigns and proverb assignments all work end to end                                    | 4–7 additional days |
| 4. Wider course coverage / optional parity | Beginner and Advanced catalogs, separate non-LCWO gaps, extra alphabets/options/compatibility      | Scope each course against its own sources and the existing parity ledger                                                           | Estimate separately |

Milestones 1–2 make the present Intermediate use case practical in roughly
**6–10 engineer-days**. The four-mode curriculum scope plus Fundamental integration
is roughly **10–17 engineer-days total**, assuming content can be cleared without
delay. The first milestone's recovery/results work also advances existing parity
items R1/R3; it is not merely a code-group generator estimate.

Validation should follow [the existing testing strategy](testing.md):

- Pure tests for allowed character pools, duration bounds, whole-group endings,
  maximum word lengths, corpus availability, scoring alignments, normalization,
  adaptive speed/point trajectories and timing profiles. Include missing/extra
  groups, extra unsupported input, >255-byte text, repeats and all-wrong rounds.
- Clock/state tests for replay, pause/buffering, seeks, answer/audio overlap,
  hidden pages, reload restoration, settings changes, partial attempts and
  fractional-time aggregation.
- Worker tests for malformed result rejection, private ownership, duplicate-save
  acknowledgement, storage limits, and export/import fidelity.
- Representative browser journeys for groups and words using actual native audio:
  configure → hear → type → grade → save → inspect assignment/history. Add calls
  and text when those modes land. Check Enter behavior, mobile keyboard/autocorrect,
  desktop/mobile layout, accessible controls and non-color-only error feedback.
- One real interruption/offline-save journey. Physical iPhone lock-screen checks
  remain separate from browser emulation; adaptive answer entry requires foreground
  interaction. Do not claim physical-device verification from simulated widths.

Run `mise run check`, `mise run test`, and `mise run build` before implementation
commits. Update [trainer-parity.md](trainer-parity.md) as behavior lands, preserving
the distinction between native curriculum support, exact LCWO compatibility, and
the still-separate whole-course workflows.

[lcwo]: https://git.fkurz.net/dj1yfk/lcwo
[mirror]: https://github.com/dj1yfk/lcwo
[lcwo-about]: https://lcwo.net/about
[readme]: https://git.fkurz.net/dj1yfk/lcwo/src/commit/3d0b25b539c18fe24c23601f3b3579428858148f/README.md
[groups]: https://git.fkurz.net/dj1yfk/lcwo/src/commit/3d0b25b539c18fe24c23601f3b3579428858148f/inc/groups.php
[group-score]: https://git.fkurz.net/dj1yfk/lcwo/src/commit/3d0b25b539c18fe24c23601f3b3579428858148f/inc/groups.php#L132-L254
[functions]: https://git.fkurz.net/dj1yfk/lcwo/src/commit/3d0b25b539c18fe24c23601f3b3579428858148f/inc/functions.php
[comparison]: https://git.fkurz.net/dj1yfk/lcwo/src/commit/3d0b25b539c18fe24c23601f3b3579428858148f/inc/functions.php#L293-L426
[words]: https://git.fkurz.net/dj1yfk/lcwo/src/commit/3d0b25b539c18fe24c23601f3b3579428858148f/inc/wordtraining.php
[word-score]: https://git.fkurz.net/dj1yfk/lcwo/src/commit/3d0b25b539c18fe24c23601f3b3579428858148f/inc/wordtraining.php#L420-L528
[word-play]: https://git.fkurz.net/dj1yfk/lcwo/src/commit/3d0b25b539c18fe24c23601f3b3579428858148f/inc/wordtraining.php#L536-L610
[callsigns]: https://git.fkurz.net/dj1yfk/lcwo/src/commit/3d0b25b539c18fe24c23601f3b3579428858148f/inc/callsigns.php
[plaintext]: https://git.fkurz.net/dj1yfk/lcwo/src/commit/3d0b25b539c18fe24c23601f3b3579428858148f/inc/plaintext.php
[timing]: https://git.fkurz.net/dj1yfk/lcwo/src/commit/3d0b25b539c18fe24c23601f3b3579428858148f/js/jscwlib.js#L1040-L1058
[jscwlib]: https://fkurz.net/ham/jscwlib.html
[word-data]: https://git.fkurz.net/dj1yfk/lcwo/src/commit/3d0b25b539c18fe24c23601f3b3579428858148f/db/lcwo_words.sql
[text-data]: https://git.fkurz.net/dj1yfk/lcwo/src/commit/3d0b25b539c18fe24c23601f3b3579428858148f/db/lcwo_plaintext.sql
[call-data]: https://git.fkurz.net/dj1yfk/lcwo/src/commit/3d0b25b539c18fe24c23601f3b3579428858148f/inc/calldb.php
[resources]: https://cwops.org/cw-academy/cw-academy-student-resources/
[beginner]: https://cwa.cwops.org/wp-content/uploads/Beginner-curriculum-ver-4.8.htm
[fundamental]: https://cwops.org/wp-content/uploads/2025/04/CW-Academy-Fundamental-Curriculum-v2.0.htm
[intermediate]: https://cwa.cwops.org/wp-content/uploads/Practice-Instructions-Intermediate-ver.2.3.htm
[advanced]: https://cwops.org/wp-content/uploads/2025/05/CW-Academy-Advanced-Curriculum-v2.1.htm
[icr]: https://cwops.org/wp-content/uploads/2025/03/LCWO-ICR-Guidelines.htm
[fundamental-proto]: https://cwa.cwops.org/wp-content/uploads/Fundamental_2.1_Prototype.htm
[intermediate-proto]: https://cwa.cwops.org/wp-content/uploads/Intermediate_Prototype-ver2.24.htm
[advanced-proto]: https://cwa.cwops.org/wp-content/uploads/Advanced-Curriculum-Proto-v2.24.htm
