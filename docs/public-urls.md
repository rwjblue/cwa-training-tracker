# Public URL behavior

Public pages and selections are addressable without signing in. Copy the browser
address or use **Copy practice link** in a public practice workspace. Tool cards,
main navigation, and curriculum session/exercise links support native copy-link
and opening another tab.

| Area                            | URL state                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Overview, Summary, tool library | `#overview`, `#summary`, `#tools`                                                                                                                      |
| Each practice tool              | `#practice/words`, `/qso`, `/stories`, `/copy`, `/sending`, `/free`, `/runner`                                                                         |
| Word listening                  | Built-in list, exact order and occurrence pitches, speed, gap, independent Morse/voice volumes, shuffle/repeat/spoken-answer and text visibility settings                               |
| QSO practice                    | Scenario, versioned station recipe including fictional seasonal weather, exact station pitches, speed, text visibility and Listen/Check your copy view |
| Stories                         | Stable story identity, narrator pitch, speed and text visibility                                                                                       |
| Free practice                   | Generated set, content mode/length and sound settings; typed custom text is omitted                                                                    |
| Copy practice                   | Validated public round recipe; responses, scores, attempt identity and adaptive progress are omitted                                                   |
| Sending practice                | Selected scale section                                                                                                                                 |
| Morse Runner                    | Mode, speed, duration, activity and conditions; randomized engine contacts and results are omitted                                                     |
| Academy guide                   | `#course?level=advanced&session=8`                                                                                                                     |
| Curriculum exercise             | `#practice/lesson/{level}/{catalog-exercise-id}`                                                                                                       |
| Official recording              | `#practice/recording/pota208_15`; recording identities resolve only against the published catalog                                                      |
| Lesson setup                    | Copy recipe, Runner controls or Sending section on the public lesson route                                                                             |
| Lesson recording variant        | Public lesson URL with `recording=` for an eligible catalog variant                                                                                    |
| Live practice                   | `#events`, with `time=utc` for UTC display; event times remain current                                                                                 |
| Personal views                  | Generic `#logbook`, `#course`, `#settings`; private records and selections stay scoped to their user                                                   |

The version 1 listening recipes use explicit catalog indexes and actual pitches.
They reproduce the same material and timing setup, including after opening with
different device preferences. Their catalog ordering and generator interpretation
must remain compatible; golden compatibility checks protect these inputs. Volume
is a listening setting, but actual output still depends on the receiver's device.

Opening a shared link starts paused, without importing the sender's time, notes,
answers, owner, private assignment or progress. Official curriculum and audio
remain at their original public source. The app links to full official instructions.
Private instructor materials do not get public content routes.

Custom word lists and typed scripts stay private. Custom word links explicitly
open Common QSO words with the shared sound settings and explain that fallback.
Copy shares a setup for a new round; Runner shares a setup for a new simulation.
Neither claims to reproduce a previous response history or engine run. A matching
unassigned Copy draft can resume locally; unrelated or assigned drafts require an
explicit choice and are never encoded in the URL.

Navigation adds history entries. Public settings and generated content replace
the current entry, so Back navigates between views. Browsing retains and pauses
the current practice owner; selecting another tool or shared recipe still uses
the finish/save guard. Legacy `#practice` resumes a retained owner, or opens the
tool library when no owner exists. Invalid public catalog routes open the library;
damaged exact listening recipes display a recovery explanation.

Pure tests own validation, recipe fidelity, privacy exclusions and compatibility.
Browser tests own guest reopening, automatic URL updates, native links,
device-default precedence and guarded Back/Forward behavior at desktop/mobile
widths. See [testing.md](testing.md).
