import { useEffect, useState, type RefObject } from 'react';
import { RotateCcw } from 'lucide-react';

export default function RecordingRewindControl({
  audioRef,
  onReplay,
}: {
  audioRef: RefObject<HTMLAudioElement | null>;
  onReplay: () => void;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () =>
      setReady(
        !audio.error &&
          !audio.seeking &&
          Number.isFinite(audio.currentTime) &&
          Number.isFinite(audio.duration) &&
          audio.duration > 0 &&
          audio.duration <= 86400,
      );
    const events = ['loadedmetadata', 'durationchange', 'seeking', 'seeked', 'error', 'emptied'];
    for (const event of events) audio.addEventListener(event, update);
    update();
    return () => {
      for (const event of events) audio.removeEventListener(event, update);
    };
  }, [audioRef]);
  return (
    <button className="button outline" disabled={!ready} onClick={onReplay}>
      <RotateCcw size={14} /> Replay 8 sec
    </button>
  );
}
