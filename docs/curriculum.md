# Automatic curriculum plans

The catalogs cover the published **Beginner 4.8, Fundamental 2.0,
Intermediate 2.3, and Advanced 2.1** curricula. They are independent indexes
of exercise metadata, checked on September 29, 2026.
CWops authors and publishes the curriculum. This app is not an official
CWops service, and an advisor's directions take precedence.

## Sources and content boundary

- [CWops student resources](https://cwops.org/cw-academy/cw-academy-student-resources/)
  identifies the published course versions.
- [Intermediate v2.3 curriculum](https://cwa.cwops.org/wp-content/uploads/Practice-Instructions-Intermediate-ver.2.3.htm)
  supplies session/day associations, recording identifiers, activity types,
  and numeric practice requirements.
- [Intermediate practice files](https://cwops.org/intermediate-practice-files/)
  supplies official recording URLs.
- [Daily sending scales](https://cwops.org/wp-content/uploads/2024/08/Everyday-Send-Code-Web.htm)
  remains on the CWops site, as do the complete exercise directions.

`src/shared/curriculum/*.json` contain factual metadata and
links. The labels and brief directions in `src/shared/curriculum.ts` are
original app text. This repository does not contain the curriculum prose,
sending-scale content, recordings, or private training records. Recordings
play directly from their official source; they are not mirrored here.

Version 2.3 corrects two recording references in version 2.2: session 15,
day 1 uses **CWT208-20**, and session 16, day 1 uses **CWT212-25**. Those
were the only exercise-metadata differences found in the comparison.
**WD405-25** still returned HTTP 404 when checked. Its task retains the
official curriculum link and explicitly reports the unavailable recording;
the app does not substitute a different exercise.

## Scheduling and progress

The Intermediate catalog contains 214 exercise records across 16 sessions and 48
preparation days. Automatic plans include 213 required records. The optional
harder-recording review remains in the linked official curriculum.

For each scheduled class, preparation days 1, 2, and 3 fall two days before,
one day before, and on the class date respectively. This preserves the
existing personal tracker's schedule convention. The user's first class
date and meeting weekdays determine the class dates. Closely spaced
meetings can therefore put preparations for two sessions on the same date.

Each occurrence has a stable identity such as
`curriculum:cwa-intermediate-v2.3:s1-d1-t1`. Calendar dates are derived, so
changing the schedule preserves completion and linked practice minutes.
Repeated exercises on different preparation days have separate identities.
Where the source provides no duration, **15 minutes is an app planning
estimate**, not a CWops requirement.

The catalog is shared; private storage holds saved completion and overrides.
Existing `legacy-task:s1-d1-t1` Intermediate imports match the corresponding occurrence
without duplicating it. Imported private notes and completion are preserved;
the current catalog supplies the dated occurrence and launch resource.
Journal entries under either identity count toward the same merged task.
Changing course level hides inactive generated overrides while keeping
them in backups, so reselecting Intermediate restores its completion.
Manual activities and imported legacy records remain available. Legacy IDs
without a curriculum reference match only Intermediate, preventing unrelated
Beginner, Fundamental, or Advanced occurrences from inheriting their progress.

## Native copy recipes

All 20 Intermediate ICR occurrences launch native groups and words. A source
speed such as 10 WPM is now stored as `effectiveWpm`; `characterWpm` is 25.
The default group length is three, with figures, two-character custom groups,
and words up to three characters available as alternatives. The source's
session 13, day 3 speed of 15 WPM is preserved despite the surrounding 18 WPM
work. A task remains a single assignment while its attempts remain distinct.

The [shared ICR guide](https://cwops.org/wp-content/uploads/2025/03/LCWO-ICR-Guidelines.htm)
has reversed word-speed labels in places. Recipes use the effective-speed
meaning explained by its prose, with 25 WPM character formation. These are
adjustable starting points, not an automatic promotion policy. The app does
not impose the guide's error thresholds as assignment completion conditions.

Imported or saved LCWO launch links receive a native launch adapter by URL and
exercise name. Their original links, notes, identities, history, and completion
remain intact. Catalog matches provide verified presets; otherwise the native
trainer uses app defaults, which the learner can edit before starting. Legacy
LCWO scores retain their original source and are not regraded.

## Coverage by course

| Published course                                                                                            | Automatic records | Coverage                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------- | ----------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Beginner 4.8](https://cwa.cwops.org/wp-content/uploads/Beginner-curriculum-ver-4.8.htm)                    |               105 | Copying/sending blocks, later spoken-recognition practice, and on-air preparation. The existing official Morse Code Trainer supplies its content and speech-after workflow. These are linked activities, not a new native beginner engine. |
| [Fundamental 2.0](https://cwops.org/wp-content/uploads/2025/04/CW-Academy-Fundamental-Curriculum-v2.0.htm)  |               248 | Every published Send/Copy block is indexed. There are 98 native copy blocks: 78 groups, 8 words, 8 callsigns, 4 plain text. Other rows link sending, spoken-answer training, news, recordings, and on-air work.                            |
| [Intermediate 2.3](https://cwa.cwops.org/wp-content/uploads/Practice-Instructions-Intermediate-ver.2.3.htm) |      213 required | Existing occurrence IDs and recording/simulator rules are retained; all scheduled LCWO ICR now opens native practice.                                                                                                                      |
| [Advanced 2.1](https://cwops.org/wp-content/uploads/2025/05/CW-Academy-Advanced-Curriculum-v2.1.htm)        |               162 | 114 official head-copy recording occurrences and 48 sending blocks. Optional contest tools are not invented as required daily assignments.                                                                                                 |

Beginner assigns work per session rather than numbered homework days. The app
repeats those blocks across its three preparation days as a scheduling convention;
it does not claim that those numbered days come from the curriculum. Fundamental
session 15 explicitly groups days 1–3; its blocks repeat across those days, while
the three-contact goal appears once. Its open-ended session 16 guidance is one
linked final-day activity. Other unspecified times use the 15-minute planning
estimate. All catalog totals are task occurrences, not required practice minutes.

Advanced recording URLs are taken from the official
[Advanced practice index](https://cwops.org/advanced-practice-files/), never
constructed from guessed filenames. All 114 Advanced and 10 Fundamental recording
URLs returned HTTP 200 with audio content types during this update. Availability
can change; these are maintenance checks, not network-dependent test assertions.

### Fundamental recipe decisions

Repetition counts, 1–3-minute group durations, 2–5-character group lengths,
25 WPM character speed, effective-speed progression, and extra spacing are
separate fields. Explicit 80%/five-attempt conditions are retained as guidance;
completion stays under the learner's control. Later conditional callsign blocks
offer groups as the fallback and explain when to choose it.

Personal weak-character pools cannot be derived from the shared curriculum.
Custom tasks require a learner selection; their initial alphabet or digit pool
is only a selection aid. The linked source supplies the mix of difficult and
familiar characters. No private learner results belong in the shared catalog.

Source conflicts are visible in notes and alternatives: session 4 day 1 names
both one and two minutes (the explicit duration and follow-up instruction give
two); session 6 day 3 names mixed and custom groups, then selects abbreviations
while describing Q codes. Both relevant options remain available. Session 12
day 1 describes a 9 WPM story but links a 10 WPM filename; the source link is
preserved without asserting a speed. Callsign settings not restated by later
sessions start at that session's effective speed as an app preset.

Native words and plain text use separately maintained app collections, not
mirrored LCWO/CWops corpora. The abbreviation length cap where the source gives
none is an app default. Plain-text rows explicitly distinguish native sentences
from the source's proverbs. The optional short-word challenge is left in the
source: its 1–3-letter collection and five-letter goal conflict, so it is not
silently added as required work. Users can configure their own word practice.

## Extending the catalog

The official resource index separately lists Fundamental 2.1, Intermediate
2.24 (labelled 2.4 by the index), and Advanced 2.24 prototypes. None is selected
by these published catalogs. Historical Basic naming does not add a fifth course.

New catalog versions need an explicit identity/progress migration strategy.
Do not silently change existing occurrence identifiers or treat prototype
curricula as the published version. Validate functional metadata and links,
keep complete instructions at the source, and add focused schedule/merge
invariants instead of snapshotting every exercise.
