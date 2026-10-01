import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  MAX_RECORDING_MARK_LABEL,
  MAX_RECORDING_MARKS,
  MAX_TASK_RECORDING_MARKS,
  recordingMarkTimestamp,
  type RecordingMark,
  type RecordingMarkSet,
} from '../shared/recording-marks';

/** Native position display and annotations. The Studio alone owns transport/time. */
export default function RecordingReviewControls({
  audioRef,
  markSet,
  availableMarks = MAX_TASK_RECORDING_MARKS,
  onSeek,
  onSave,
}: {
  audioRef: RefObject<HTMLAudioElement | null>;
  markSet?: RecordingMarkSet;
  availableMarks?: number;
  onSeek: (position?: number) => number | undefined;
  onSave?: (marks: RecordingMark[]) => Promise<'server' | 'device'>;
}) {
  const [position, setPosition] = useState({ seconds: 0, duration: 0, ready: false });
  const [label, setLabel] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<RecordingMark[] | undefined>();
  const alive = useRef(true);
  const flight = useRef(false);
  useEffect(() => {
    alive.current = true;
    const audio = audioRef.current;
    if (!audio) return;
    const update = () =>
      setPosition({
        seconds: audio.currentTime,
        duration: audio.duration,
        ready:
          !audio.error &&
          !audio.seeking &&
          Number.isFinite(audio.currentTime) &&
          Number.isFinite(audio.duration) &&
          audio.duration > 0 &&
          audio.duration <= 86400,
      });
    const events = [
      'loadedmetadata',
      'durationchange',
      'timeupdate',
      'seeking',
      'seeked',
      'error',
      'emptied',
    ];
    for (const event of events) audio.addEventListener(event, update);
    update();
    return () => {
      alive.current = false;
      for (const event of events) audio.removeEventListener(event, update);
    };
  }, [audioRef]);
  const replay = (position?: number) => {
    const target = onSeek(position);
    if (target !== undefined)
      setNotice(`Replaying from ${recordingMarkTimestamp(target)}. Use Pause practice to stop.`);
  };
  const save = async (marks: RecordingMark[]) => {
    if (!onSave || flight.current) return;
    flight.current = true;
    setBusy(true);
    setError('');
    setNotice('Saving difficult marks…');
    try {
      const destination = await onSave(structuredClone(marks));
      if (!alive.current) return;
      setPending(undefined);
      setLabel('');
      setNotice(
        destination === 'server'
          ? 'Difficult marks saved to your account.'
          : 'Difficult marks saved on this device, waiting to sync. Retry account sync above if needed.',
      );
    } catch (error) {
      if (!alive.current) return;
      setPending(structuredClone(marks));
      setNotice('');
      setError(`Difficult marks could not be saved. ${(error as Error).message}`);
    } finally {
      flight.current = false;
      if (alive.current) setBusy(false);
    }
  };
  const marks = markSet?.marks ?? [];
  const add = () => {
    const audio = audioRef.current;
    if (!audio || !position.ready || marks.length >= MAX_RECORDING_MARKS || availableMarks === 0)
      return;
    const seconds = audio.currentTime;
    if (!Number.isFinite(seconds) || seconds < 0 || seconds >= audio.duration) return;
    void save([
      ...marks,
      {
        id: crypto.randomUUID(),
        positionSeconds: seconds,
        ...(label.trim() ? { label: label.trim() } : {}),
      },
    ]);
  };
  return (
    <section className="recording-review" aria-label="Recording review">
      <p>
        Current position:{' '}
        {position.ready
          ? `${recordingMarkTimestamp(position.seconds)} / ${recordingMarkTimestamp(position.duration)}`
          : 'Recording not ready'}
      </p>
      <button className="button outline" disabled={!position.ready} onClick={() => replay()}>
        Replay 8 sec
      </button>
      {onSave && (
        <>
          <label className="recording-mark-label">
            Difficult mark label (optional)
            <input
              value={label}
              maxLength={MAX_RECORDING_MARK_LABEL}
              disabled={busy || pending !== undefined}
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <button
            className="button outline"
            disabled={
              !position.ready ||
              busy ||
              pending !== undefined ||
              marks.length >= MAX_RECORDING_MARKS ||
              availableMarks === 0 ||
              position.seconds >= position.duration
            }
            onClick={add}
          >
            Mark difficult here
          </button>
          <p className="field-hint">
            Private to this task and exact recording in your account. Marking leaves playback
            unchanged. Replaying a mark starts listening deliberately.
          </p>
        </>
      )}
      {!!marks.length && (
        <ul className="recording-mark-list" aria-label="Difficult recording marks">
          {marks.map((mark) => (
            <li key={mark.id}>
              <button
                className="button outline small"
                disabled={!position.ready || mark.positionSeconds >= position.duration}
                aria-label={`Replay difficult mark at ${recordingMarkTimestamp(mark.positionSeconds)}${mark.label ? ` — ${mark.label}` : ''}`}
                onClick={() => replay(mark.positionSeconds)}
              >
                {recordingMarkTimestamp(mark.positionSeconds)}
                {mark.label ? ` — ${mark.label}` : ''}
              </button>
              {onSave && (
                <button
                  className="text-button"
                  disabled={busy || pending !== undefined}
                  aria-label={`Remove difficult mark at ${recordingMarkTimestamp(mark.positionSeconds)}${mark.label ? ` — ${mark.label}` : ''}`}
                  onClick={() => void save(marks.filter((item) => item.id !== mark.id))}
                >
                  Remove
                </button>
              )}
              {mark.positionSeconds >= position.duration && position.ready && (
                <span>This mark is at or beyond this recording’s current end.</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {marks.length >= MAX_RECORDING_MARKS && (
        <p role="status">
          This recording has {MAX_RECORDING_MARKS} difficult marks. Remove one before adding
          another.
        </p>
      )}
      {availableMarks === 0 && (
        <p role="status">
          This task has {MAX_TASK_RECORDING_MARKS} difficult marks across its files. Remove one
          before adding another.
        </p>
      )}
      {onSave && position.ready && position.seconds >= position.duration && (
        <p className="field-hint">Replay a section before marking a difficult position.</p>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {pending !== undefined && (
        <button className="button outline" disabled={busy} onClick={() => void save(pending)}>
          Retry saving difficult marks
        </button>
      )}
      {pending !== undefined && (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setPending(undefined);
            setError('');
            setNotice('Unsaved mark edit canceled. Saved marks stay unchanged.');
          }}
        >
          Cancel mark edit
        </button>
      )}
    </section>
  );
}
