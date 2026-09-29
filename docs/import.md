# Importing personal practice history

The tracker accepts its own version 1 JSON exports and the browser export from
the private tracker on rwjblue.com / n1rwj.com. Import while signed in so records
belong to your account. No data is read from or written to the old site by this
application.

## Export from the old tracker

Open the old tracker's Preferences view and choose its data export action. Keep
that original JSON file as a backup. The file contains the snapshot, any pending
saved practice, course settings, materials, reports, and possibly an unfinished
practice block. It may contain private notes and instructor material: do not
commit it to this public repository.

In this tracker, open Settings and import the exported JSON. A separate conversion
step is optional. For a local, reviewable converted file:

```sh
mise run import-legacy ~/Downloads/cw-training-2026-09-28.json --output data/private/training-import.json
```

The converter performs no network requests. It creates a private file with owner
read/write permissions and refuses to overwrite an existing file. Inside the
repository, output must be under ignored `data/private/`, `.private/`, or `.tmp/`. Import the
resulting file through Settings in the signed-in app.

## What is imported

- Saved attempts become practice entries, including incomplete saved attempts.
  Pending saved attempts are merged by their original ID.
- Entry IDs are stable (`legacy:<original-id>`). Merge imports skip existing
  IDs, preserving any edits you made here. Choose replacement to load corrected
  source records instead.
- Dates use the old course's timezone. Exact active seconds become fractional
  minutes; recall seconds are already part of active seconds and are not added
  a second time.
- Class sessions retain their context and are excluded from independent-practice
  totals. Listening, sending, ICR, simulators, and on-air practice retain their
  category where the original task identifies it.
- Course level, goal, timezone, first meeting, and meeting weekdays populate the
  imported profile. Display name and callsign are not guessed.
- Each attempt's full original record remains in its private metadata. This
  includes scratchpads, completion, passes, scores, and structured results that
  do not yet have an equivalent field in the new interface.
- Private assignment tasks become editable exercises in the Academy guide,
  with original instructions, source links, class session, and practice dates.
  Explicit completed practice marks an exercise done; review and class attempts
  do not. A missing time estimate defaults to 15 suggested minutes; it is not an
  assignment requirement. Completing an exercise never adds practice minutes.
- The entire original export remains in the private legacy archive and in future
  exports, including course assignments, materials, reports, and LCWO history.
  A subsequent legacy import replaces the archived source with the latest full
  export; keep older original files if you need historical source backups.
  These are preserved for later migration; the new app does not yet expose every
  old feature. Unmapped LCWO records do not create additional practice minutes.
- An unfinished active block is archived but is not counted as completed or saved
  practice. Finish and export it in the old tracker if you want those minutes
  included as a saved entry.

Malformed records fail conversion with an error rather than silently dropping
history. Current limits are 20,000 practice entries, 2,000 planned exercises,
10,000 characters of entry notes, an 8 MiB import request, and a 6 MiB account
data budget. The local converter can read up to 32 MiB, but the app's upload and
account limits still apply. Keep the original file if a limit is encountered.

## Reset and repeat

Export the new tracker first if you have added practice since importing. The
Settings reset action removes your training history, plan, profile settings,
and archived import data;
it is separate from authentication and passkeys. Then reimport your original
backup. Merge preserves existing entries and exercises; replacement rebuilds
them from the import. Resetting first is useful when changing conversion rules
and wanting a clean comparison. Resetting
this tracker never resets the original n1rwj.com tracker.

## Curriculum and attribution

This is an independent companion, not an official CWops service. The public
roadmap uses original planning prompts. Official assignments and recordings
remain linked from the [CW Academy student resources page](https://cwops.org/cw-academy/cw-academy-student-resources/).
No official syllabus, instructor attachments, personal progress, or recordings
are copied into the public repository. Your advisor's assignments take
precedence over the general planning prompts here.
