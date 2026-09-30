import type { CopyRecipe } from '../shared/copy-practice';
import './copy-settings.css';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789?/. ,='.replaceAll(' ', '');

export default function CopySettings({
  recipe,
  onChange,
  disabled = false,
}: {
  recipe: CopyRecipe;
  disabled?: boolean;
  onChange: (recipe: CopyRecipe) => void;
}) {
  const change = (patch: Partial<CopyRecipe>) => onChange({ ...recipe, ...patch });
  const sequence = recipe.mode === 'words' || recipe.mode === 'callsigns';
  return (
    <fieldset className="copy-settings" disabled={disabled} aria-label="Copy practice settings">
      <div className="copy-settings-grid copy-settings-primary">
        <label className="field">
          <span className="copy-setting-label">
            {sequence ? 'Minimum character speed' : 'Character speed'}{' '}
            <span className="label-hint">WPM</span>
          </span>
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
          <span className="copy-setting-label">
            {sequence ? 'Starting effective speed' : 'Effective speed'}{' '}
            <span className="label-hint">WPM</span>
          </span>
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

        {recipe.mode === 'groups' && (
          <>
            <label className="field">
              <span className="copy-setting-label">Character set</span>
              <select
                value={recipe.groupKind}
                onChange={(e) => change({ groupKind: e.target.value as CopyRecipe['groupKind'] })}
              >
                <option value="letters">Letters</option>
                <option value="figures">Figures (0–9)</option>
                <option value="mixed">Mixed</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label className="field">
              <span className="copy-setting-label">Characters per group</span>
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
            {disabled && recipe.lengthMode === 'count' ? (
              <div className="field">
                <span className="copy-setting-label">Round length</span>
                <output className="copy-settings-value">{recipe.groupCount} groups</output>
              </div>
            ) : (
              <label className="field">
                <span className="copy-setting-label">Target duration</span>
                <select
                  value={recipe.durationSeconds}
                  onChange={(e) =>
                    change({ lengthMode: 'duration', durationSeconds: Number(e.target.value) })
                  }
                >
                  {[10, 60, 120, 180, 300, 600].map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {seconds < 60
                        ? `${seconds} seconds`
                        : `${seconds / 60} ${seconds === 60 ? 'minute' : 'minutes'}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}
        {recipe.mode === 'words' && (
          <>
            <label className="field">
              <span className="copy-setting-label">Word collection</span>
              <select
                value={recipe.wordCollection}
                onChange={(e) =>
                  change({ wordCollection: e.target.value as CopyRecipe['wordCollection'] })
                }
              >
                <option value="english">English</option>
                <option value="short">Short (1–3)</option>
                <option value="abbreviations">CW abbrev.</option>
                <option value="qcodes">Q codes</option>
              </select>
            </label>
            <label className="field">
              <span className="copy-setting-label">Maximum word length</span>
              <input
                type="number"
                min="1"
                max="15"
                value={recipe.maxWordLength}
                onChange={(e) => change({ maxWordLength: Number(e.target.value) })}
              />
            </label>
          </>
        )}
        {recipe.mode === 'callsigns' && (
          <>
            <label className="field">
              <span className="copy-setting-label">Callsigns</span>
              <select
                value={recipe.callFilter}
                onChange={(e) => change({ callFilter: e.target.value as CopyRecipe['callFilter'] })}
              >
                <option value="all">All calls</option>
                <option value="short">Short calls</option>
                <option value="simple">Short, no /</option>
              </select>
            </label>
          </>
        )}
      </div>
      {recipe.mode === 'groups' && recipe.groupKind === 'mixed' && (
        <p className="copy-settings-hint">
          Mixed groups include letters, numbers, and punctuation.
        </p>
      )}
      {recipe.mode === 'groups' && recipe.groupKind === 'custom' && (
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
      {recipe.mode === 'plaintext' && (
        <p className="copy-help">
          Copy an original practice sentence. Spaces and punctuation count; repeated spaces and
          letter case do not. Each attempt selects a random sentence.
        </p>
      )}
      {sequence && (
        <div className="copy-primary-options">
          <label className="checkbox-label">
            <input
              type="checkbox"
              aria-label="Adaptive speed: increase 1 WPM after a correct answer, decrease after an error"
              checked={recipe.adaptive}
              onChange={(e) => change({ adaptive: e.target.checked })}
            />{' '}
            Adaptive speed
          </label>
          <span className="copy-settings-hint">
            {recipe.mode === 'words'
              ? '25 words per round, including shorter words.'
              : '25 generated practice calls per round.'}
            {recipe.adaptive && ' Speed changes by 1 WPM after each answer.'}
          </span>
        </div>
      )}
      <details className="copy-extra-settings">
        <summary>Sound and options</summary>
        <div className="copy-settings-grid copy-settings-secondary">
          <label className="field copy-tone-mode">
            <span className="copy-setting-label">Tone</span>
            <select
              value={recipe.toneMode ?? 'fixed'}
              onChange={(e) => change({ toneMode: e.target.value as CopyRecipe['toneMode'] })}
            >
              <option value="random">Random (500–900 Hz)</option>
              <option value="fixed">Fixed</option>
            </select>
          </label>
          {recipe.toneMode !== 'random' && (
            <label className="field">
              <span className="copy-setting-label">
                Tone frequency <span className="label-hint">Hz</span>
              </span>
              <input
                type="number"
                min="200"
                max="1200"
                step="10"
                value={recipe.toneHz}
                onChange={(e) => change({ toneHz: Number(e.target.value) })}
              />
            </label>
          )}
          <label className="field">
            <span className="copy-setting-label">Extra word spacing</span>
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
            <span className="copy-setting-label">
              Start delay <span className="label-hint">seconds</span>
            </span>
            <input
              type="number"
              min="0"
              max="20"
              value={recipe.startDelaySeconds}
              onChange={(e) => change({ startDelaySeconds: Number(e.target.value) })}
            />
          </label>
          {sequence && (
            <>
              <label className="field">
                <span className="copy-setting-label">
                  Maximum effective speed <span className="label-hint">WPM</span>
                </span>
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={recipe.maxSpeed}
                  onChange={(e) => change({ maxSpeed: Number(e.target.value) })}
                />
              </label>
            </>
          )}
        </div>

        {sequence && (
          <div className="copy-options">
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
      </details>
    </fieldset>
  );
}
