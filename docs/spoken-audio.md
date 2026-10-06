# Prerecorded word answers

The public vocabulary has 99 unique answer clips: 70 common QSO words and
30 common English words share AS. These are original generated speech, reused
byte-for-byte from the personal trainer’s public assets; they are not CWops
recordings or curriculum audio. No personal training data is included.

`data/cw-training/word-speech.json` records each pronunciation and the generator:
Kokoro v1.0 via kokoro-onnx 0.6.1, voice af_heart, en-us, speed 1. Abbreviations
have authored pronunciations (for example WX says “weather”). The generator
pins model and voice-file SHA-256 digests; uv.lock pins Python dependencies.
Model files remain in ignored `.tmp/cw-speech/` and are never served to browsers.
The public index retains input fingerprints and clip hashes.

With uv and ffmpeg installed, regenerate from the repository root:

```sh
rtk proxy mise run generate-word-speech
rtk proxy mise run generate-word-speech -- --word WX --force
```

Generation performs local inference, trims padding, normalizes the voice peak
to 0.8, and writes mono 22050 Hz 16-bit PCM WAVs. The task skips unchanged clips.
Only these compact answer assets (about 3 MB total) and their index are shipped;
normal builds require no inference runtime.

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

Automated tests check shipped clip hashes and format, timeline/WAV boundaries,
volume, failure/retry, real browser progression and repeated rounds with device speech
unavailable, and desktop/mobile fit. A physical iPhone test is still needed
before claiming verified playback while locked: cross all three repetitions,
the spoken answer, next word, and automatic round transition; then use lock-screen
pause/resume and confirm the visible word follows the audio after unlocking.
