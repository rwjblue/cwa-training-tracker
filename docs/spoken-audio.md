# Prerecorded English answers

## Whole-phrase, sentence and story answers

Sentences & stories has a separate pack of 128 whole-passage English recordings.
The public catalog includes 72 short phrases: the original three eight-phrase
collections plus three new sixteen-phrase collections with distinct identities.
Previously shared collection text and order remain intact. The same pack covers
all 24 sentences and both short and original stories, deduplicating shared lines.

On October 13, 2026, all 128 Kokoro passage recordings were replaced with
ElevenLabs output using the existing word pack's Bella
(`hpp4J3VqNfWAUOO0d1Us`) / Eleven v4 (`eleven_v4`) settings: English,
stability 0.75 and similarity 0.75. The replacement covered 3,040 characters
of authored text in 128 requests; response receipts reported 1,213 metered
characters. The word recordings and their index remain unchanged.
Playback needs neither an on-device model nor browser speech synthesis.
`data/cw-training/passage-speech.json` records the desired generation inputs;
the static index retains the fingerprints and hashes of the actual shipped clips.

```sh
mise run generate-passage-speech -- --provider elevenlabs --dry-run
mise run generate-passage-speech -- --provider elevenlabs
mise run generate-passage-speech -- --provider elevenlabs --dry-run
```

The task updates the manifest from the versioned public catalog, reads the
approved public generator settings from `data/cw-training/word-speech.json`,
and uses the existing bounded PCM generator. Mise loads `ELEVENLABS_API_KEY`
from the ignored local `.env` or inherited environment. ElevenLabs generation
uses Python's standard library and needs no uv, ffmpeg or downloaded model.
Only the authored manifest, index and resulting WAVs ship. Normal builds and
playback make no synthesis requests. The existing word WAVs remain unchanged.

The replacement's initial dry run reported 128 pending clips and 128 ElevenLabs
requests; the final dry run reported zero pending clips and zero requests.
Generation completed without API failures or `--force`. Changed input
fingerprints trigger replacement, and received raw responses survive interrupted
output under ignored `.tmp/cw-speech/elevenlabs/`. Rerunning completes unchanged
or received work without repeating paid requests. Do not automatically retry
an ambiguous API failure; inspect provider usage first. Explicit rate-limit retries are
bounded by the existing generator.

All 128 replacement WAVs were checked against their index hashes and expected
normalized mono 22050 Hz 16-bit PCM format. Seven representative short phrases
and longer story sentences were played through local audio output; pronunciation
quality was not assessed by ear in the automated session. Typecheck, regression
tests, the production build and the three browser journeys below passed.

After future generation, rerun the dry run and require zero pending clips and
requests. Audition short phrases and representative story sentences, then
validate:

```sh
mise run check
mise run test
mise run build
mise run test-browser -- \
  e2e/phrase-listening.spec.ts \
  e2e/hands-free-passages.spec.ts \
  e2e/spoken-answers.spec.ts
```

Never commit the private key or response cache. An API-key permission or
unavailable voice/model error needs resolution before generation
continues; retain the existing recordings until valid replacements are produced.

Hands-free playback assembles the selected collection into one bounded native
WAV: whole chunk in Morse, recall pause, another whole-chunk repeat, recall pause,
prerecorded English answer, recall pause, next chunk. Three Morse repetitions
are also available; recall pauses range from one to five seconds. Speed, repeat
or pause changes prepare a fresh recording. Morse and voice gains are independent;
gain edits preserve position and playback state. The twenty-minute recording
limit still applies. Every transition within the prepared collection is encoded
in audio, so progression needs no browser timer or later clip fetch. Start Play
before locking the device. Playback ends after the collection; there is no
automatic file replacement at the end.

Manual chunk practice keeps Replay and Next together. Next starts the new chunk
and hides its text; Previous and catalog selection prepare a paused hidden chunk.
Reveal applies only to that chunk and stays revealed during its replay. Shared
links and backups retain the public hands-free configuration and voice volume;
links reopen paused and omit current position and per-chunk reveals. Old links
without hands-free settings retain their original playback mode, overriding a
newer hands-free device default. Played evidence records the actual repeats and
recall pauses and remains compatible with earlier saved summaries.

Automated checks cover shipped PCM/hash integrity, whole-chunk repetition and
seek alignment, rendered speech and silence, bounded recordings, download retry,
shared-link precedence, portable settings, saved played evidence, and desktop and
mobile controls. The browser journey disables speech synthesis and goes offline
after preparing audio, then crosses a real spoken-answer/next-phrase boundary
without changing the native source. This verifies browser playback, not physical
OS background behavior. A locked iPhone/Android check remains necessary: cross
both Morse repetitions, the answer and the next phrase, use lock-screen
pause/resume, and confirm the visible phrase after unlocking.

## Word answer pack

The public vocabulary has 99 unique answer clips: 70 common QSO words and
30 common English words share AS. These are original ElevenLabs-generated
answers, checked into the repository and served as static assets. They are not
CWops recordings or curriculum audio. No personal training data is included.

`data/cw-training/word-speech.json` records each pronunciation and the generator:
Eleven v4 (`eleven_v4`), Bella (`hpp4J3VqNfWAUOO0d1Us`), English, stability 0.75
and similarity 0.75. Bella was selected from the current public catalog for
Standard American pronunciation, crisp diction, deliberate pacing and
educational use. Abbreviations have authored pronunciations: ANT says “antenna,”
AGN says “again,” WX says “weather” and DE says “this is.” The catalog date is
October 6, 2026.

YAGI uses the inline IPA pronunciation `/ˈjɑːɡi/` to target “YAH-gee” with a
hard g. On October 9, 2026, this replaced the two-word respelling “yah ghee.”
Eleven v4 accepts slash-delimited IPA directly in the authored text; see
[pronunciation guidance](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices#ipa-with-eleven-v4).
Only its answer clip was regenerated; the original Kokoro comparison is retained.

Only the offline generation task reads `ELEVENLABS_API_KEY`; browsers and the
Worker never call ElevenLabs or receive the key. The public index retains input
fingerprints and approved clip hashes. Saved files provide exact reproduction;
repeating the same synthesis request does not guarantee identical audio.

The original pack used Kokoro v1.0, af_heart, en-us, speed 1. Twelve original
clips remain in `public/audio/cw-training/words/comparison/kokoro/` for review.
Open [the comparison page](../public/audio/cw-training/words/compare.html) through
a local preview at `/audio/cw-training/words/compare.html`. Each word has old and
new native players and a **Play old then new** button. All clips start paused;
starting another clip stops the previous comparison.

Generate from the repository root with `ELEVENLABS_API_KEY` available in the
environment. Mise loads the ignored `.env` file. ElevenLabs generation uses
Python 3.11 or newer's standard library; it needs no local model, uv, ffmpeg or
npm package.

```sh
rtk proxy mise run generate-word-speech -- --provider elevenlabs --dry-run
rtk proxy mise run generate-word-speech -- --provider elevenlabs
rtk proxy mise run generate-word-speech -- --word WX --force
rtk proxy mise run test-word-speech-generator
```

Generation requests raw `pcm_22050`, trims synthesis padding with 30 ms leading
and 80 ms trailing margins, normalizes the voice peak to 0.8, and writes mono
22050 Hz 16-bit PCM WAVs. The task validates every path before making a request
and skips unchanged clips. Received raw responses and receipts stay in ignored
`.tmp/cw-speech/elevenlabs/`; a rerun can finish processing them without paying
for another request. Files and the index are replaced atomically after each
completed clip. Dry run reports pending clips and request counts without API
calls or file changes. **`--force` bypasses the response cache and incurs fresh
generation charges.** Only explicit rate-limit rejections are retried, at most
twice; ambiguous failures require inspecting usage before rerunning.

Normal builds and playback need only the checked-in WAVs and index. Playback
adds no ElevenLabs generation charges. Publishing and reuse follow
[ElevenLabs' output terms](https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform);
paid-plan outputs retain indefinite commercial use, while free-plan outputs
have noncommercial and attribution requirements. Existing default voices are
[scheduled to retire](https://elevenlabs.io/docs/help-center/product/voices/my-voices/what-are-default-voices)
on December 31, 2026. That does not change saved WAVs; future regeneration may
need a new voice and reviewed pack. The generator also retains Kokoro support
for manifests using `engine: "kokoro-onnx"` (uv and ffmpeg required).

The client loads unique answers four at a time and caches decoded PCM by content
hash. Unsupported custom words fail before fetching. Failed downloads can be
retried with Play. A loading status appears while clips are fetched; wait until
it disappears before pressing Play so native playback begins in the tap gesture.
Changing lists invalidates pending loads and removes the previous source.

Each word’s three Morse repetitions, Farnsworth/extra pauses, answer samples,
and final pause are rendered before playback into one bounded native WAV.
Morse and voice have independent volume sliders, both defaulting to 40%. Morse
is rendered with a 0.2 gain; the published voice clips (roughly 0.8 peak) receive
a 0.25 gain so their default peak matches Morse. Both gains are baked into the
WAV for iOS, and native/device volume acts as an overall volume control. Changing
either app slider preserves native position and playing/paused state.
The native audio element owns progression, pause/resume and seeking within each
round. At completion, Repeat prepares a fresh round using the current Shuffle
preference in both Morse-only and spoken-answer modes. Common QSO words always
start with VVV, and only the remaining words shuffle. With Shuffle off, source
order is preserved. Shuffle and Repeat edits retain the current word and source;
they take effect at the next round boundary. New round also generates a fresh
round. Actual media movement counts listening time, including answer and pause
segments. Rounds exceeding 20 minutes are rejected.

Offline generator tests cover API failures, bounded retries, cache recovery,
unchanged/dry runs, validated paths and PCM conversion without paid requests.
Automated tests check shipped clip hashes and format, timeline/WAV boundaries,
volume, failure/retry, real browser progression and repeated rounds with device speech
unavailable, and desktop/mobile fit. A physical iPhone test is still needed
before claiming verified playback while locked: cross all three repetitions,
the spoken answer, next word, and automatic round transition; then use lock-screen
pause/resume and confirm the visible word follows the audio after unlocking.
