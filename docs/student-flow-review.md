# Student flow usability review

Reviewed 2026-10-03 with independent Today/class, listening, and
Copy/Runner/navigation audits. The review followed student entry points and
existing persistence workflows, including synthetic authenticated data in the
local Worker runtime. The changes prioritize the action needed now, keep related
controls together, and expose secondary details through named disclosures.

| Flow                         | Finding                                                                                                                                                                                                                                  | Change                                                                                                                                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today and class              | Repeated guidance and accounting prose preceded class participation and assignments. In an intermediate course fixture, the first Practice action was at 1,027 px on desktop and 1,174 px on mobile; Join class was at 955 px on mobile. | Class actions lead the plan. Required task actions precede instructions and progress detail. Instructor preparation remains ahead of optional work. Syllabus/session explanations are available under How this plan works.                                          |
| Next practice                | A second full instruction block repeated the exercise list and completion policy.                                                                                                                                                        | Keep task, context and primary action concise; put accounting/advance guidance behind a disclosure.                                                                                                                                                                 |
| Word listening               | Play appeared at 2,259 px on desktop and 2,706 px on mobile in the baseline; the scratchpad was farther down. List editing, options, teaching copy and duplicate day summaries intervened.                                               | Present list selection, playback and scratchpad as one workspace; use adjacent columns on desktop and sequential content on mobile. Move word editing/options and whole-day progress after practice.                                                                |
| Assigned recordings          | Marks, replay policy, pass accounting and speed catalogs separated native audio from its notes.                                                                                                                                          | Keep recording playback and scratchpad together; disclose recording marks/replay and speed options afterward.                                                                                                                                                       |
| Copy practice                | Settings remained above the answer after starting a round. Start was about 1,434 px down in a baseline desktop public flow.                                                                                                              | Keep mode selection and Start visible. Disclose round settings, open required character selection, and collapse settings during an active round.                                                                                                                     |
| Runner                       | Progress and teaching details preceded the actual simulator controls.                                                                                                                                                                    | Put the native simulator before assignment progress and help.                                                                                                                                                                                                       |
| Sending and material reading | Their local workspaces already placed the practice content beside relevant controls; global practice chrome still interrupted entry.                                                                                                     | Apply the shared practice navigation/header reductions; preserve reader state, sending controls and private material workflow.                                                                                                                                      |
| Review and save              | Rich evidence, timing explanations, optional assessments and external trainer metadata appeared before notes and the main fields.                                                                                                        | Show activity/date/time/session and notes first. Keep save actions visible while scrolling. Disclose measured evidence, optional ratings/speeds, exact external timing and time correction; reopen invalid field disclosures before native validation focuses them. |
| Navigation and return        | Four equal-weight inspection controls and next-block guidance preceded the current exercise.                                                                                                                                             | Put inspection controls behind Browse other views and the next-block recommendation after the workspace. Keep pause/return/finish and exact save policies intact.                                                                                                   |
| Progress and live agenda     | Historical dashboards and calendar setup compete with immediate daily/event actions.                                                                                                                                                     | Fold recent progress/history and put upcoming events before calendar setup.                                                                                                                                                                                         |

Baseline measurements are document coordinates from the indicated synthetic
flows, not universal performance scores. Desktop/mobile browser checks cover
keyboard and emulated touch, accessible disclosures, overflow, control proximity,
actual native playback and resulting saved records. Physical device and locked
phone behavior are outside this layout review.

No curriculum, completion, time attribution, evidence, account scoping or backup
format changes are intended. Public practice remains usable without signing in.
Detailed controls remain reachable; advanced review sections with existing
assessment or external data open when editing those records.

Final visual inspection covered 1440 × 1000 and 390 × 844 browser viewports.
In the mobile fixtures, Join class appeared at 531 px, Start next block at
735 px, Copy Start at 567 px, and Runner Run at approximately 618 px. Assigned
recording playback appeared at 653 px; its scratchpad followed 215 px later,
with only recall controls between them. Desktop playback and notes were adjacent
columns, 26 px apart vertically. Save actions remained fully visible at both
widths. Keyboard focus, 44 px Today/class actions, horizontal overflow, and
native playback through a linked save were also checked.

After integrating the newer playback controller and test improvements on
`main`, `mise run check`, `mise run test` (1,466 tests in 80 files), and
`mise run build` passed. The combined complete browser run passed 104 of
105 cases. The remaining course-replay case intermittently rejected an
incomplete coverage interval; its isolated `--workers=1` rerun passed, including
automatic replay, both complete native passes and their exact saved evidence.
All 105 browser cases were validated across those runs. This timing-sensitive
case retains failure-only native event diagnostics. Its precise rejected
interval was not recoverable from the earlier trace. Native readiness checks
now verify the expected source and fully buffered synthetic clip before
reset/start. Pass counts, coverage thresholds and timeouts were preserved.
