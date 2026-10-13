import { useId } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useAppearance } from './appearance';

const choices = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const;

export default function AppearanceChoices() {
  const { appearance, setAppearance } = useAppearance();
  const helpId = useId();
  return (
    <fieldset className="appearance-choices" aria-describedby={helpId}>
      <legend>Appearance</legend>
      <p id={helpId}>Choose how the Companion looks on this device.</p>
      <div className="appearance-options">
        {choices.map(({ value, label, icon: Icon }) => (
          <button
            type="button"
            key={value}
            aria-pressed={appearance === value}
            onClick={() => setAppearance(value)}
          >
            <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      <p className="appearance-system-help">System follows your device’s light or dark setting.</p>
    </fieldset>
  );
}
