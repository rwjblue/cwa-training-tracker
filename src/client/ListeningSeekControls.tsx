import { Play, RotateCcw } from 'lucide-react';

/** Position selection and deliberate replay share the existing native player. */
export default function ListeningSeekControls({
  onBack,
  onReplay,
}: {
  onBack: () => void;
  onReplay: () => void;
}) {
  return (
    <>
      <div className="playback-toolbar" role="group" aria-label="Listening position controls">
        <button className="button outline" onClick={onBack}>
          <RotateCcw size={16} /> Back 10 sec
        </button>
        <button
          className="button outline"
          aria-label="Replay current word and start playback"
          onClick={onReplay}
        >
          <Play size={16} /> Replay current word
        </button>
      </div>
      <p className="field-hint">
        Select a word or use Back 10 sec to move your place. Playing stays playing; paused stays
        paused. Replay current word starts playback deliberately.
      </p>
    </>
  );
}
