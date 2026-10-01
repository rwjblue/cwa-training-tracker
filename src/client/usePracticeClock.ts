import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { PracticeClock } from './practice-clock';

export function usePracticeClock() {
  const clock = useRef(new PracticeClock());
  const media = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState(() =>
    clock.current.snapshot(performance.now(), !document.hidden),
  );
  const snapshot = () => clock.current.snapshot(performance.now(), !document.hidden);
  const refresh = () => {
    const next = snapshot();
    setState((previous) =>
      Math.floor(previous.seconds) === Math.floor(next.seconds) &&
      Math.floor(previous.recallSeconds) === Math.floor(next.recallSeconds) &&
      previous.running === next.running &&
      previous.recalling === next.recalling &&
      previous.recallInterruption === next.recallInterruption
        ? previous
        : next,
    );
    return next;
  };
  const sample = (audio: HTMLAudioElement) => {
    if (!audio.seeking)
      clock.current.sample(audio.currentTime, performance.now(), audio.playbackRate);
  };
  const pauseMedia = () => {
    if (media.current) sample(media.current);
    media.current = null;
    clock.current.suspendMedia();
    refresh();
  };
  const pause = () => {
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
      media.current = audio;
      clock.current.startMedia(
        audio.currentTime,
        performance.now(),
        audio.playbackRate,
        audio.dataset.recording === 'true'
          ? {
              url: audio.currentSrc || audio.src,
              ...(audio.dataset.speed ? { speedWpm: Number(audio.dataset.speed) } : {}),
            }
          : undefined,
        !document.hidden,
      );
    } else if (media.current === audio) {
      if (event.type === 'seeking' || event.type === 'emptied') {
        // currentTime already contains the destination; never credit this jump.
        media.current = null;
        clock.current.suspendMedia();
      } else if (['pause', 'ended', 'waiting', 'error'].includes(event.type)) {
        pauseMedia();
      } else sample(audio);
    }
    refresh();
  };
  useEffect(() => {
    const tick = () => {
      if (media.current && !media.current.paused) sample(media.current);
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
    startManual(recall = false) {
      if (media.current) sample(media.current);
      media.current = null;
      clock.current.startManual(performance.now(), recall, !document.hidden);
      refresh();
    },
    reset() {
      media.current = null;
      clock.current.reset();
      refresh();
    },
  };
}
