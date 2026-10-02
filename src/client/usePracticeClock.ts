import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { PracticeClock } from './practice-clock';
import type { RecordingSource } from './recording-coverage';

export function usePracticeClock() {
  const clock = useRef(new PracticeClock());
  const media = useRef<HTMLAudioElement | null>(null);
  const recordingOwner = useRef<HTMLAudioElement | null>(null);
  const sourceIds = useRef(new WeakMap<HTMLAudioElement, { url: string; id: string }>());
  const nextSourceId = useRef(0);
  const retiredRecordings = useRef(new WeakSet<HTMLAudioElement>());
  const [state, setState] = useState(() =>
    clock.current.snapshot(performance.now(), !document.hidden),
  );
  const snapshot = () => clock.current.snapshot(performance.now(), !document.hidden);
  const refresh = () => {
    const next = snapshot();
    setState((previous) =>
      Math.floor(previous.seconds) === Math.floor(next.seconds) &&
      Math.floor(previous.recallSeconds) === Math.floor(next.recallSeconds) &&
      Math.floor(previous.wordListeningSeconds ?? 0) ===
        Math.floor(next.wordListeningSeconds ?? 0) &&
      previous.running === next.running &&
      previous.recalling === next.recalling &&
      previous.recallInterruption === next.recallInterruption &&
      previous.recordingRevision === next.recordingRevision
        ? previous
        : next,
    );
    return next;
  };
  const sample = (audio: HTMLAudioElement) => {
    if (!audio.seeking)
      clock.current.sample(audio.currentTime, performance.now(), audio.playbackRate);
  };
  const recordingSource = (audio: HTMLAudioElement): RecordingSource | undefined => {
    if (audio.dataset.recording !== 'true') return;
    const url = audio.currentSrc || audio.src;
    let identity = sourceIds.current.get(audio);
    if (!identity || identity.url !== url) {
      identity = { url, id: `recording-${++nextSourceId.current}` };
      sourceIds.current.set(audio, identity);
    }
    return {
      url,
      sourceId: identity.id,
      durationSeconds: audio.duration,
      ...(audio.dataset.speed ? { speedWpm: Number(audio.dataset.speed) } : {}),
    };
  };
  const finalizeMedia = (audio: HTMLAudioElement, publish = true) => {
    if (recordingOwner.current !== audio || !audio.ended || audio.seeking) return;
    const source = recordingSource(audio);
    if (!source) return;
    clock.current.observeRecording(source);
    if (media.current === audio) sample(audio);
    const outcome = clock.current.finalizeRecording(source, audio.ended);
    if (media.current === audio) {
      media.current = null;
      clock.current.suspendMedia();
    }
    if (publish) refresh();
    return outcome;
  };
  const discardRecording = (audio?: HTMLAudioElement, publish = true) => {
    const owner = recordingOwner.current;
    if (!owner || (audio && owner !== audio)) return;
    finalizeMedia(owner, false);
    if (media.current === owner) {
      sample(owner);
      media.current = null;
      clock.current.suspendMedia();
    }
    clock.current.discardRecording();
    retiredRecordings.current.add(owner);
    recordingOwner.current = null;
    if (publish) refresh();
  };
  const observeRecording = (audio: HTMLAudioElement) => {
    if (recordingOwner.current !== audio) return;
    const source = recordingSource(audio);
    if (!source) return;
    if (media.current === audio) sample(audio);
    clock.current.observeRecording(source);
    if (media.current === audio)
      clock.current.startMedia(
        audio.currentTime,
        performance.now(),
        audio.playbackRate,
        source,
        !document.hidden,
        audio.dataset.wordListening === 'true',
      );
    refresh();
  };
  const pauseMedia = () => {
    if (media.current?.ended) finalizeMedia(media.current, false);
    if (media.current) sample(media.current);
    media.current = null;
    clock.current.suspendMedia();
    refresh();
  };
  const pause = () => {
    if (media.current?.ended) finalizeMedia(media.current, false);
    if (media.current) sample(media.current);
    media.current = null;
    clock.current.pause(performance.now(), !document.hidden);
    return refresh();
  };
  const stopRecall = () => {
    clock.current.stopRecall(performance.now(), !document.hidden);
    return refresh();
  };
  const onMedia = (event: SyntheticEvent) => {
    const audio = event.target;
    if (!(audio instanceof HTMLAudioElement)) return;
    if (retiredRecordings.current.has(audio)) return;
    if (event.type === 'play') {
      // Stop at the request, even if decoding/buffering never reaches playing.
      if (!audio.paused) stopRecall();
      else refresh();
      return;
    }
    if (
      (event.type === 'playing' && !audio.paused) ||
      (event.type === 'seeked' && !audio.paused && audio.readyState >= 3)
    ) {
      if (media.current === audio) sample(audio);
      if (recordingOwner.current && recordingOwner.current !== audio)
        discardRecording(recordingOwner.current, false);
      const source = recordingSource(audio);
      recordingOwner.current = source ? audio : null;
      media.current = audio;
      clock.current.startMedia(
        audio.currentTime,
        performance.now(),
        audio.playbackRate,
        source,
        !document.hidden,
        audio.dataset.wordListening === 'true',
      );
    } else if (event.type === 'seeking' || event.type === 'emptied') {
      if (media.current === audio || recordingOwner.current === audio) {
        // A seek while already paused must also revoke native resume tolerance.
        if (media.current === audio) media.current = null;
        clock.current.suspendMedia(false);
      }
    } else if (event.type === 'ended') {
      // Natural pause may precede ended and clear the active movement anchor.
      // The source/pass owner survives it so the final accepted tail counts once.
      finalizeMedia(audio, false);
    } else if (
      event.type === 'error' &&
      recordingOwner.current === audio &&
      media.current !== audio
    ) {
      // A failed paused owner cannot lend a native resume boundary to later Play.
      clock.current.suspendMedia(false);
    } else if (media.current === audio) {
      if (['pause', 'waiting', 'error'].includes(event.type)) {
        if (audio.ended) finalizeMedia(audio, false);
        pauseMedia();
        if (event.type === 'error') clock.current.suspendMedia(false);
      } else sample(audio);
    }
    refresh();
  };
  useEffect(() => {
    const tick = () => {
      if (media.current?.ended) finalizeMedia(media.current, false);
      else if (media.current && !media.current.paused) sample(media.current);
      refresh();
    };
    const visibilityChanged = () => {
      // snapshot sees hidden before settling; it must not credit this last interval.
      tick();
    };
    const interval = setInterval(tick, 250);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, []);
  return {
    ...state,
    snapshot,
    onMedia,
    pause,
    pauseMedia,
    stopRecall,
    finalizeMedia,
    discardRecording,
    observeRecording,
    startManual(recall = false) {
      if (media.current?.ended) finalizeMedia(media.current, false);
      if (media.current) sample(media.current);
      media.current = null;
      clock.current.startManual(performance.now(), recall, !document.hidden);
      refresh();
    },
    reset() {
      media.current = null;
      recordingOwner.current = null;
      clock.current.reset();
      refresh();
    },
  };
}
