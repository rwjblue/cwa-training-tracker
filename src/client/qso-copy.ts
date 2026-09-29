import type { QsoStation } from './qso-content';

export type QsoCopyStation = 'caller' | 'answering';
export type QsoCopyKind =
  | 'callsign'
  | 'name'
  | 'qth'
  | 'rst'
  | 'rig'
  | 'power'
  | 'antenna'
  | 'weather'
  | 'temperature'
  | 'state';

export interface QsoCopyField {
  id: string;
  station: QsoCopyStation;
  kind: QsoCopyKind;
  label: string;
  expected: string;
}
export type QsoCopySelection = Record<QsoCopyStation, readonly QsoCopyKind[]>;
export const QSO_COPY_STATIONS = [
  { id: 'caller', label: 'Station calling CQ' },
  { id: 'answering', label: 'Station answering' },
] as const;

const LABELS: Record<QsoCopyKind, string> = {
  callsign: 'Callsign',
  name: 'Name',
  qth: 'QTH (city and state)',
  rst: 'RST sent to the other station',
  rig: 'Rig',
  power: 'Power (watts)',
  antenna: 'Antenna',
  weather: 'Weather',
  temperature: 'Temperature (°F)',
  state: 'State',
};

/** Only a template's transmitted fields become questions, using its original profiles. */
export function createQsoCopyFields(
  a: QsoStation,
  b: QsoStation,
  selection: QsoCopySelection,
): QsoCopyField[] {
  return QSO_COPY_STATIONS.flatMap(({ id: station }) => {
    const profile = station === 'caller' ? a : b;
    const values: Record<QsoCopyKind, string> = {
      callsign: profile.call,
      name: profile.name,
      qth: `${profile.city} ${profile.state}`,
      rst: profile.report,
      rig: profile.rig,
      power: `${profile.watts} W`,
      antenna: profile.antenna,
      weather: profile.weatherCondition,
      temperature: `${profile.temperatureF} F`,
      state: profile.state,
    };
    return selection[station].map((kind) => ({
      id: `${station}-${kind}`,
      station,
      kind,
      label: LABELS[kind],
      expected: values[kind],
    }));
  });
}

// Full state names are accepted only in location answers, never inside callsigns.
const STATE_NAMES: Record<string, string> = {
  ARIZONA: 'AZ',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  FLORIDA: 'FL',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  IOWA: 'IA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM',
  'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC',
  OHIO: 'OH',
  PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI',
  TEXAS: 'TX',
  WASHINGTON: 'WA',
  WISCONSIN: 'WI',
};
const upper = (value: string) => value.normalize('NFKC').trim().toUpperCase();
const words = (value: string) =>
  upper(value)
    .replace(/[.,;:!?()[\]{}'’"\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function location(value: string): string {
  const text = words(value);
  for (const [name, abbreviation] of Object.entries(STATE_NAMES)) {
    if (text === name) return abbreviation;
    if (text.endsWith(` ${name}`)) return `${text.slice(0, -name.length)}${abbreviation}`;
  }
  return text;
}

function normalize(kind: QsoCopyKind, value: string): string | undefined {
  if (value.length > 200) return undefined;
  const text = upper(value);
  switch (kind) {
    case 'callsign':
      // Spacing/case and sentence punctuation are harmless; suffixes, digits,
      // slashes, or a mistyped character must never be guessed away.
      return text.replace(/\s+/g, '').replace(/[.,]+$/, '');
    case 'qth':
    case 'state':
      return location(value);
    case 'rst':
      return text
        .replace(/^RST\s*/, '')
        .replace(/\s+/g, '')
        .replace(/[.,]+$/, '');
    case 'rig':
      return text.replace(/[\s-]+/g, '').replace(/[.,]+$/, '');
    case 'power': {
      const match = text.replace(/[.,]+$/, '').match(/^(\d+(?:\.\d+)?)\s*(?:W|WATTS?)?$/);
      return match ? String(Number(match[1])) : undefined;
    }
    case 'temperature': {
      const match = text
        .replace(/[.,]+$/, '')
        .match(/^(-?\d+(?:\.\d+)?)\s*(?:°\s*|DEGREES?\s*)?(?:F|FAHRENHEIT)?$/);
      return match ? String(Number(match[1])) : undefined;
    }
    case 'antenna':
      if (/-\s*\d/.test(text)) return undefined;
      return words(value)
        .replace(/\bUP\b/g, ' ')
        .replace(/(\d)\s*(?:FEET|FOOT|FT)\b/g, '$1 FT')
        .replace(/\s+/g, ' ')
        .trim();
    case 'weather': {
      const condition = words(value);
      const aliases: Record<string, string> = {
        RAINY: 'RAIN',
        SNOWY: 'SNOW',
        CLOUDS: 'CLOUDY',
        WIND: 'WINDY',
        SUN: 'SUNNY',
      };
      return aliases[condition] ?? condition;
    }
    default:
      return words(value);
  }
}

export type QsoCopyStatus = 'correct' | 'incorrect' | 'unanswered';
export interface QsoCopyResult {
  fields: (QsoCopyField & { answer: string; status: QsoCopyStatus })[];
  correct: number;
  answered: number;
  total: number;
}

/** Deterministic checking; unknown answer keys cannot add points. */
export function checkQsoCopy(
  fields: readonly QsoCopyField[],
  answers: Readonly<Record<string, string>>,
): QsoCopyResult {
  const checked = fields.map((field) => {
    const answer = typeof answers[field.id] === 'string' ? answers[field.id] : '';
    const actual = normalize(field.kind, answer);
    const expected = normalize(field.kind, field.expected);
    const status: QsoCopyStatus = !answer.trim()
      ? 'unanswered'
      : actual !== undefined && expected !== undefined && actual === expected
        ? 'correct'
        : 'incorrect';
    return { ...field, answer, status };
  });
  return {
    fields: checked,
    correct: checked.filter((field) => field.status === 'correct').length,
    answered: checked.filter((field) => field.status !== 'unanswered').length,
    total: checked.length,
  };
}
