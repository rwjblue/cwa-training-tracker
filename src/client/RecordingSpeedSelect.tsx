import { useId, useState } from 'react';
import {
  eligibleRecordingVariants,
  loadRecordingSpeedPreference,
  saveRecordingSpeedPreference,
  type RecordingSpeedPreference,
  type RecordingVariant,
} from './recording-variants';
import './recording-speed.css';

const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** The owner settles playback time and changes the actual media source on selection. */
export default function RecordingSpeedSelect({
  assignedUrl,
  assignedWpm,
  selectedUrl,
  onChange,
}: {
  assignedUrl: string;
  assignedWpm?: number;
  selectedUrl: string;
  onChange: (variant: RecordingVariant) => void;
}) {
  const id = useId();
  const [preference, setPreference] = useState(loadRecordingSpeedPreference);
  const [remembered, setRemembered] = useState(true);
  const choices = eligibleRecordingVariants(assignedUrl, assignedWpm);
  const selected = choices.find((variant) => variant.url === selectedUrl);
  return (
    <div className="recording-speed-settings">
      {choices.length > 1 && (
        <div>
          <label htmlFor={`${id}-speed`}>Recording speed</label>
          <select
            id={`${id}-speed`}
            aria-label="Recording speed"
            aria-describedby={`${id}-current-help`}
            value={selected?.url ?? ''}
            onChange={(event) => {
              const variant = choices.find((item) => item.url === event.target.value);
              if (variant) onChange(variant);
            }}
          >
            {!selected && (
              <option value="" disabled>
                Current recording
              </option>
            )}
            {choices.map((variant) => (
              <option key={variant.url} value={variant.url}>
                {variant.speedWpm} WPM ({variant.speedWpm === assignedWpm ? 'assigned' : 'stretch'})
                {variant.durationSeconds ? ` · ${duration(variant.durationSeconds)} per pass` : ''}
              </option>
            ))}
          </select>
          <p id={`${id}-current-help`}>
            Each speed is a separate official recording. A change starts that recording paused at
            the beginning; your practice time and scratchpad stay with this session.
          </p>
        </div>
      )}
      <div>
        <label htmlFor={`${id}-default`}>Recording speed default</label>
        <select
          id={`${id}-default`}
          aria-label="Recording speed default"
          aria-describedby={`${id}-default-help`}
          value={preference}
          onChange={(event) => {
            const next: RecordingSpeedPreference =
              event.target.value === 'next' ? 'next' : 'assigned';
            setPreference(next);
            setRemembered(saveRecordingSpeedPreference(next));
          }}
        >
          <option value="assigned">Assigned speed</option>
          <option value="next">Next faster official recording</option>
        </select>
        <p id={`${id}-default-help`}>
          Saved on this device for recordings you open next. Your current recording stays unchanged.
        </p>
        {!remembered && (
          <p role="status">
            This browser couldn’t remember the default. Current speed choices still work.
          </p>
        )}
      </div>
    </div>
  );
}
