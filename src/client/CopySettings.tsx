import type { CopyRecipe } from '../shared/copy-practice';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789?/. ,='.replaceAll(' ', '');

export default function CopySettings({
  recipe,
  onChange,
}: {
  recipe: CopyRecipe;
  onChange: (recipe: CopyRecipe) => void;
}) {
  const change = (patch: Partial<CopyRecipe>) => onChange({ ...recipe, ...patch });
  const sequence = recipe.mode === 'words' || recipe.mode === 'callsigns';
  return (
    <div className="copy-settings">
      <div className="copy-settings-grid">
        <label className="field">
          {sequence ? 'Minimum character speed' : 'Character speed'}{' '}
          <span className="label-hint">WPM</span>
          <input
            type="number"
            min="5"
            max="100"
            value={recipe.characterWpm}
            onChange={(e) =>
              change({
                characterWpm: Number(e.target.value),
                ...(!sequence && Number(e.target.value) < recipe.effectiveWpm
                  ? { effectiveWpm: Number(e.target.value) }
                  : {}),
              })
            }
          />
        </label>
        <label className="field">
          {sequence ? 'Starting effective speed' : 'Effective speed'}{' '}
          <span className="label-hint">WPM</span>
          <input
            type="number"
            min={sequence ? 5 : 1}
            max={sequence ? 100 : recipe.characterWpm}
            value={recipe.effectiveWpm}
            onChange={(e) =>
              change({
                effectiveWpm: Number(e.target.value),
                ...(sequence && Number(e.target.value) > recipe.maxSpeed
                  ? { maxSpeed: Number(e.target.value) }
                  : {}),
              })
            }
          />
        </label>
        <label className="field">
          Tone <span className="label-hint">Hz</span>
          <input
            type="number"
            min="200"
            max="1200"
            step="10"
            value={recipe.toneHz}
            onChange={(e) => change({ toneHz: Number(e.target.value) })}
          />
        </label>
      </div>
      {recipe.mode === 'groups' && (
        <>
          <div className="copy-settings-grid">
            <label className="field">
              Character set
              <select
                value={recipe.groupKind}
                onChange={(e) => change({ groupKind: e.target.value as CopyRecipe['groupKind'] })}
              >
                <option value="letters">Letters</option>
                <option value="figures">Figures (numbers)</option>
                <option value="mixed">Mixed, including punctuation</option>
                <option value="custom">Custom characters</option>
              </select>
            </label>
            <label className="field">
              Characters per group
              <select
                value={recipe.groupLength}
                onChange={(e) =>
                  change({
                    groupLength: e.target.value === 'random' ? 'random' : Number(e.target.value),
                  })
                }
              >
                {Array.from({ length: 10 }, (_, n) => (
                  <option key={n} value={n + 1}>
                    {n + 1}
                  </option>
                ))}
                <option value="random">Random (2–7)</option>
              </select>
            </label>
            <label className="field">
              Practice length
              <select
                value={recipe.lengthMode}
                onChange={(e) => change({ lengthMode: e.target.value as CopyRecipe['lengthMode'] })}
              >
                <option value="duration">By duration</option>
                <option value="count">By group count</option>
              </select>
            </label>
            {recipe.lengthMode === 'duration' ? (
              <label className="field">
                Target duration
                <select
                  value={recipe.durationSeconds}
                  onChange={(e) => change({ durationSeconds: Number(e.target.value) })}
                >
                  {[60, 120, 180, 300, 600].map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds / 60} {seconds === 60 ? 'minute' : 'minutes'}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field">
                Number of groups
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={recipe.groupCount}
                  onChange={(e) => change({ groupCount: Number(e.target.value) })}
                />
              </label>
            )}
          </div>
          {recipe.groupKind === 'custom' && (
            <fieldset className="copy-character-set">
              <legend>Choose the characters to practice</legend>
              <p>Include the characters you want to strengthen. Select at least one.</p>
              <div className="copy-character-grid">
                {[...alphabet].map((character) => (
                  <label key={character}>
                    <input
                      type="checkbox"
                      checked={recipe.customCharacters.includes(character)}
                      aria-label={`Character ${character}`}
                      onChange={(e) =>
                        change({
                          customCharacters: e.target.checked
                            ? recipe.customCharacters + character
                            : recipe.customCharacters.replaceAll(character, ''),
                        })
                      }
                    />
                    <span>{character}</span>
                  </label>
                ))}
              </div>
              <div className="copy-inline-actions">
                <button
                  type="button"
                  className="text-button"
                  onClick={() => change({ customCharacters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' })}
                >
                  Select letters
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => change({ customCharacters: '0123456789' })}
                >
                  Select figures
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => change({ customCharacters: '' })}
                >
                  Clear selection
                </button>
              </div>
            </fieldset>
          )}
        </>
      )}
      {recipe.mode === 'words' && (
        <div className="copy-settings-grid">
          <label className="field">
            Word collection
            <select
              value={recipe.wordCollection}
              onChange={(e) =>
                change({ wordCollection: e.target.value as CopyRecipe['wordCollection'] })
              }
            >
              <option value="english">Common English words</option>
              <option value="short">Short English words (1–3 letters)</option>
              <option value="abbreviations">CW abbreviations</option>
              <option value="qcodes">Q codes</option>
            </select>
          </label>
          <label className="field">
            Maximum word length
            <input
              type="number"
              min="1"
              max="15"
              value={recipe.maxWordLength}
              onChange={(e) => change({ maxWordLength: Number(e.target.value) })}
            />
            <span className="field-hint">Includes shorter words. Each round has 25 words.</span>
          </label>
        </div>
      )}
      {recipe.mode === 'callsigns' && (
        <div className="copy-settings-grid">
          <label className="field">
            Callsigns
            <select
              value={recipe.callFilter}
              onChange={(e) => change({ callFilter: e.target.value as CopyRecipe['callFilter'] })}
            >
              <option value="all">All generated calls</option>
              <option value="short">No long calls</option>
              <option value="simple">No long or portable calls</option>
            </select>
            <span className="field-hint">
              25 generated practice calls; these do not identify operators.
            </span>
          </label>
        </div>
      )}
      {recipe.mode === 'plaintext' && (
        <p className="copy-help">
          Copy an original practice sentence. Spaces and punctuation count; repeated spaces and
          letter case do not. Each attempt selects a random sentence.
        </p>
      )}
      {sequence && (
        <div className="copy-settings-grid">
          <label className="field">
            Maximum effective speed <span className="label-hint">WPM</span>
            <input
              type="number"
              min="5"
              max="100"
              value={recipe.maxSpeed}
              onChange={(e) => change({ maxSpeed: Number(e.target.value) })}
            />
          </label>
        </div>
      )}
      {sequence && (
        <div className="copy-options">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={recipe.adaptive}
              onChange={(e) => change({ adaptive: e.target.checked })}
            />{' '}
            Adaptive speed: increase 1 WPM after a correct answer, decrease after an error
          </label>
          {recipe.mode === 'words' && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={recipe.autoSkipSeconds > 0}
                onChange={(e) => change({ autoSkipSeconds: e.target.checked ? 5 : 0 })}
              />{' '}
              Skip unanswered words 5 seconds after playback
            </label>
          )}
          {recipe.mode === 'callsigns' && (
            <>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={recipe.stopOnError}
                  onChange={(e) => change({ stopOnError: e.target.checked })}
                />{' '}
                Pause after an incorrect call
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={recipe.blind}
                  onChange={(e) => change({ blind: e.target.checked })}
                />{' '}
                Hide call feedback until the round is complete
              </label>
            </>
          )}
        </div>
      )}
      <details className="copy-extra-settings">
        <summary>Spacing and start delay</summary>
        <div className="copy-settings-grid">
          <label className="field">
            Extra word spacing
            <input
              type="number"
              min="0"
              max="40"
              step="0.5"
              value={recipe.extraWordSpacing}
              onChange={(e) => change({ extraWordSpacing: Number(e.target.value) })}
            />
            <span className="field-hint">Additional multiples of the normal word gap.</span>
          </label>
          <label className="field">
            Start delay <span className="label-hint">seconds</span>
            <input
              type="number"
              min="0"
              max="20"
              value={recipe.startDelaySeconds}
              onChange={(e) => change({ startDelaySeconds: Number(e.target.value) })}
            />
          </label>
        </div>
      </details>
    </div>
  );
}
