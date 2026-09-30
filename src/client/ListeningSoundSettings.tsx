import React from 'react';
import type { PracticePreferences } from './practice-preferences';

export default function ListeningSoundSettings({
  preferences,
  onChange: changePreferences,
  remembered,
}: {
  preferences: PracticePreferences;
  onChange: (changes: Partial<PracticePreferences>) => void;
  remembered: boolean;
}) {
  const { characterWpm, effectiveWpm, tone, volume } = preferences;
  return (
    <details className="studio-sound-settings">
      <summary>
        Sound settings · {characterWpm}/{effectiveWpm} WPM · {tone} Hz
      </summary>
      <div className="studio-preferences-heading">
        <h3>Your listening preferences</h3>
        <p>
          {remembered
            ? 'Saved on this device, including when you sign out. Custom text is not saved.'
            : 'Active for this visit. Your browser is not allowing these preferences to be remembered.'}
        </p>
      </div>
      <div className="studio-controls">
        <Range
          label="Character speed"
          value={characterWpm}
          min={5}
          max={50}
          unit="WPM"
          onChange={(v) => changePreferences({ characterWpm: v })}
          hint="The speed of each individual character."
        />
        <Range
          label="Effective speed"
          value={effectiveWpm}
          min={3}
          max={characterWpm}
          unit="WPM"
          onChange={(v) => changePreferences({ effectiveWpm: v })}
          hint="Farnsworth spacing gives you time to hear."
        />
        <Range
          label="Sidetone"
          value={tone}
          min={300}
          max={1000}
          step={25}
          unit="Hz"
          onChange={(v) => changePreferences({ tone: v })}
          hint="Find a comfortable pitch for your ears."
        />
        <Range
          label="Volume"
          value={volume}
          min={0}
          max={100}
          unit="%"
          onChange={(v) => changePreferences({ volume: v })}
          hint={
            volume === 0
              ? 'Muted. Raise the volume when you’re ready to listen.'
              : 'Start softly. Comfort comes first.'
          }
        />
      </div>
    </details>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit: string;
  onChange: (value: number) => void;
  hint: string;
}) {
  const id = React.useId();
  return (
    <div className="range-control">
      <div>
        <label htmlFor={id}>{label}</label>
        <span>
          {value} <small>{unit}</small>
        </span>
      </div>
      <input
        id={id}
        type="range"
        aria-valuetext={`${value} ${unit === '%' ? 'percent' : unit}`}
        aria-describedby={`${id}-hint`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <p id={`${id}-hint`}>{hint}</p>
    </div>
  );
}
