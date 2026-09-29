import { useMemo } from 'react';

const fallbackZones = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function zoneLabel(zone: string): string {
  if (zone === 'UTC') return 'UTC — Coordinated Universal Time';
  const parts = zone.split('/');
  const city = parts.slice(1).reverse().join(', ').replaceAll('_', ' ') || zone;
  try {
    const name = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longGeneric' })
      .formatToParts(new Date())
      .find((part) => part.type === 'timeZoneName')?.value;
    return name ? `${city} — ${name}` : city;
  } catch {
    return city;
  }
}

export default function TimeZoneSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const options = useMemo(() => {
    const supported =
      typeof Intl.supportedValuesOf === 'function'
        ? Intl.supportedValuesOf('timeZone')
        : fallbackZones;
    return [...new Set([value, detected, 'UTC', ...supported])]
      .map((zone) => ({ zone, label: zoneLabel(zone) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [value, detected]);
  return (
    <div className="field timezone-field">
      <label htmlFor="practice-timezone">Practice timezone</label>
      <select
        id="practice-timezone"
        value={value}
        required
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(({ zone, label }) => (
          <option key={zone} value={zone}>
            {label}
          </option>
        ))}
      </select>
      <span className="field-hint">Your daily goals and class dates follow this timezone.</span>
      {value !== detected && (
        <button type="button" className="text-button" onClick={() => onChange(detected)}>
          Use device timezone: {zoneLabel(detected).split(' — ')[0]}
        </button>
      )}
    </div>
  );
}
