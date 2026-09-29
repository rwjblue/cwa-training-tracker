# Automatic curriculum plans

The first catalog supports **CW Academy Intermediate, version 2.3**. It is
an independent index of exercise metadata, checked on September 29, 2026.
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

`src/shared/curriculum/intermediate-v2.3.json` contains factual metadata and
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

The catalog contains 214 exercise records across 16 sessions and 48
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
Existing `legacy-task:s1-d1-t1` imports match the corresponding occurrence
without duplicating it. Imported private notes and completion are preserved;
the current catalog supplies the dated occurrence and launch resource.
Journal entries under either identity count toward the same merged task.
Changing course level hides inactive generated overrides while keeping
them in backups, so reselecting Intermediate restores its completion.
Manual activities and imported legacy records remain available.

## Extending the catalog

Only Intermediate has an automatic catalog today. Other levels continue
to support manual activities and links to official material.

The published [Advanced v2.1 course](https://cwops.org/wp-content/uploads/2025/05/CW-Academy-Advanced-Curriculum-v2.1.htm)
also has 16 sessions with three preparation days, making it the closest
structural fit. It needs a separately checked recording catalog, including
prefix, suffix, and POTA files. The [Fundamental v2.0 course](https://cwops.org/wp-content/uploads/2025/04/CW-Academy-Fundamental-Curriculum-v2.0.htm)
has multiple sending/copy blocks and character/effective-speed settings;
its last sessions also use different day groupings. The [Beginner v4.8 course](https://cwa.cwops.org/wp-content/uploads/Beginner-curriculum-ver-4.8.htm)
needs its own review before mapping exercises to practice tools.

New catalog versions need an explicit identity/progress migration strategy.
Do not silently change existing occurrence identifiers or treat prototype
curricula as the published version. Validate functional metadata and links,
keep complete instructions at the source, and add focused schedule/merge
invariants instead of snapshotting every exercise.
