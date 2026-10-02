import React from 'react';
import PreciseRange from './PreciseRange';
import type { PracticePreferences } from './practice-preferences';

export default function ListeningSoundSettings({
  preferences,
  onChange: changePreferences,
  remembered,
  onRetry,
}: {
  preferences: PracticePreferences;
  onChange: (changes: Partial<PracticePreferences>) => void;
  remembered: boolean;
  onRetry: () => void;
}) {
  const { characterWpm, effectiveWpm, tone, volume } = preferences;
  return (
    <details className="studio-sound-settings">
      <summary>
        Sound settings · {characterWpm}/{effectiveWpm} WPM · {tone} Hz
        {!remembered && <span> · Not saved on this device</span>}
      </summary>
      <div className="studio-preferences-heading">
        <h3>Your listening preferences</h3>
        <p>Words, QSO, and Stories remember separate speeds and pitch. Volume is shared.</p>
        <p>
          {remembered
            ? 'Sound defaults are saved on this device, including when you sign out. Word sources use the separate account or Guest device scope.'
            : 'Active for this visit. Your browser is not allowing these preferences to be remembered.'}
        </p>
      </div>
      {!remembered && (
        <button type="button" className="button outline" onClick={onRetry}>
          Retry saving listening preferences
        </button>
      )}
      <div className="studio-preferences-heading studio-speed-presets">
        <label>
          Character speed preset
          <select
            value={characterWpm}
            onChange={(event) => changePreferences({ characterWpm: Number(event.target.value) })}
          >
            {[...new Set([12, 15, 18, 20, 23, 25, 28, 30, 35, 40, 50, 55, 60, characterWpm])]
              .sort((a, b) => a - b)
              .map((speed) => (
                <option key={speed} value={speed}>
                  {speed} WPM
                </option>
              ))}
          </select>
        </label>
        <button
          type="button"
          className="button outline"
          onClick={() => changePreferences({ effectiveWpm: characterWpm })}
        >
          Use normal spacing
        </button>
      </div>
      <div className="studio-controls">
        <PreciseRange
          key={`${preferences.tool}-character`}
          label="Character speed"
          value={characterWpm}
          min={5}
          max={60}
          unit="WPM"
          onChange={(v) => changePreferences({ characterWpm: v })}
          hint="The speed of each individual character, from 5 to 60 WPM."
        />
        <PreciseRange
          key={`${preferences.tool}-effective`}
          label="Effective speed"
          value={effectiveWpm}
          min={3}
          max={characterWpm}
          unit="WPM"
          onChange={(v) => changePreferences({ effectiveWpm: v })}
          hint="Farnsworth spacing: 3 WPM through character speed."
        />
        <PreciseRange
          key={`${preferences.tool}-tone`}
          label="Sidetone"
          value={tone}
          min={300}
          max={1000}
          step={1}
          unit="Hz"
          onChange={(v) => changePreferences({ tone: v })}
          hint="Find a comfortable pitch from 300 to 1000 Hz, in 1 Hz steps."
        />
        <PreciseRange
          continuous
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
