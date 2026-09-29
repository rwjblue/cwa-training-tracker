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

For a historical merge that leaves today's practice and your current account
preferences alone:

```sh
mise run import-legacy data/private/source.json --before 2026-09-29 --keep-profile --output data/private/history-before-2026-09-29.json
```

`--before` is exclusive and uses the source course's IANA timezone, not UTC or
the upload date. Filtering happens before assignment completion is calculated.
The exact cutoff is saved with the archive. The full original source remains
available in exports, including records outside the practice cutoff. Course
assignments and schedule metadata remain intact for future lessons.
`--keep-profile` omits the imported profile, preserving the signed-in account's
identity, schedule, goals, timezone, and privacy choices. Without it, a converted
native backup applies its profile, including blank identity fields.

Export the destination account first, review the converted dates and totals,
then select **Merge** in Settings. Stable IDs make repeating the same merge safe.
Merge preserves existing entries and task edits, so it does not repair records
created by an older converter; reconcile those against an account backup before
using replacement. Replacement would also remove today's records.

## Reading directly from the personal database

An operator with authorized Cloudflare access can take a read-only snapshot of
the legacy D1 database. Match the source Worker's snapshot fields: shared course
and daily-listening metadata, plus attempts, materials, preferences, reports,
LCWO results, and LCWO sync time filtered by both the confirmed owner ID and
course ID. The legacy owner is a Cloudflare Access subject, not an email address
or callsign. Do not migrate calendar tokens, authentication credentials, or
temporary import tables. Save exports only in ignored private storage.

Database rows are authoritative for synced records. The browser export can also
contain pending saves, local report drafts, settings, and an unfinished block.
Compare IDs and original payloads before combining a current database snapshot
with device fields from an older browser export; keep both originals. Do not
sync or change the source site just to export it. Local drafts and unfinished
blocks are preserved as reference, not promoted into completed practice.

After import, export the destination again and reconcile IDs, per-day minutes,
completion, report and LCWO counts, and unchanged pre-existing records. The
before/after account exports make recovery possible without touching the source.

The converter performs no network requests. It creates a private file with owner
read/write permissions and refuses to overwrite an existing file. Inside the
repository, output must be under ignored `data/private/`, `.private/`, or `.tmp/`. Import the
resulting file through Settings in the signed-in app.

## What is imported

- Saved attempts become practice entries, including incomplete saved attempts.
  Pending saved attempts are merged by their original ID.
- Pure missed-work dismissal markers stay in the source archive without creating
  empty practice rows. Legitimate zero-valued observations remain in history.
- Entry IDs are stable (`legacy:<original-id>`). Merge imports skip existing
  IDs, preserving any edits you made here. Choose replacement to load corrected
  source records instead.
- Dates use the old course's timezone. Exact active seconds become fractional
  minutes; recall seconds are already part of active seconds and are not added
  a second time.
- Class sessions retain their context and are excluded from independent-practice
  totals. Listening, sending, ICR, simulators, and on-air practice retain their
  category where the original task identifies it.
- Scratchpads stay separate from end-of-session notes. Imported result details
  show original task context, ratings, recall, passes, recording measurements,
  Runner results, LCWO observations, and CWT details in the practice log.
- LCWO group speed is effective speed. Actual recording measurements take
  precedence over prescribed task speed. Mixed speeds remain in the details
  instead of being presented as one practiced speed.
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
- Runner assignments also retain completion earned from cumulative eligible
  practice time; review and class attempts do not earn assignment credit.
- The entire original export remains in the private legacy archive and in future
  exports, including course assignments, materials, reports, and LCWO history.
  A subsequent legacy import replaces the archived source with the latest full
  export; keep older original files if you need historical source backups.
  Settings **Imported history** provides readable saved advisor report revisions,
  LCWO measurements, private materials, and original course/device settings.
  These are historical reference views; they do not enable advisor submission,
  live LCWO sync, calendar subscriptions, or unfinished-session recovery.
- LCWO group runs use the original trainer's explicitly labeled one-minute
  estimate only when a saved ICR/LCWO practice block does not already cover the
  result timestamp. These stable estimated entries give no assignment credit.
  Callsign, word, and Koch measurements remain reference results without extra
  practice minutes. The complete LCWO measurements remain independently readable.
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
