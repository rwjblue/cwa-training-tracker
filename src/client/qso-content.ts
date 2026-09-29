/** Original practice scenarios adapted from the personal-site listening tools. */
export interface PracticeQso {
  id: string;
  title: string;
  stations: [string, string];
  lines: string[];
  /** An invented setting shared by both stations, never a live weather report. */
  season?: QsoSeason;
  /** Answers from this exact generated exchange, restricted to details it sends. */
  copyFields: QsoCopyField[];
}
/** Illustrative calls only; these profiles do not describe the calls' real owners. */
export const QSO_CALLSIGNS = [
  'W1DPN',
  'K2MVR',
  'N3LHT',
  'W4JCF',
  'K5BZS',
  'N6RDM',
  'W7PGL',
  'K8VTR',
  'N9FKS',
  'W0HBN',
  'AA1LR',
  'AB2DX',
  'AC3MW',
  'AD4JN',
  'AE5RP',
  'AF6TV',
  'AG7DS',
  'AI8KC',
  'AJ9WF',
  'AK0BM',
  'KB1TQS',
  'KC2VHL',
  'KD3RNP',
  'KE4WBG',
  'KF5ZMT',
  'KG6BPC',
  'KI7NVR',
  'KJ8DLS',
  'KK9FHT',
  'KN0JRW',
] as const;
export const QSO_NAMES = [
  'BOB',
  'ANN',
  'SAM',
  'LIZ',
  'JIM',
  'JO',
  'MAYA',
  'BEN',
  'ROSE',
  'TOM',
  'ELLA',
  'LEE',
  'DAVE',
  'SUE',
  'CHRIS',
  'PAT',
  'NORA',
  'ERIC',
  'KATE',
  'MIGUEL',
] as const;
/**
 * Districts give these fictional profiles a familiar locality convention. They
 * are not a rule about callsign portability or a claim about a call's owner.
 * Area reference: https://www.arrl.org/section-abbreviations
 */
export const QSO_LOCATIONS = [
  { city: 'BOSTON', state: 'MA', district: 1, climate: 'northern' },
  { city: 'ALBANY', state: 'NY', district: 2, climate: 'northern' },
  { city: 'RALEIGH', state: 'NC', district: 4, climate: 'southern' },
  { city: 'BOISE', state: 'ID', district: 7, climate: 'northern' },
  { city: 'AUSTIN', state: 'TX', district: 5, climate: 'warm' },
  { city: 'DAYTON', state: 'OH', district: 8, climate: 'northern' },
  { city: 'PORTLAND', state: 'ME', district: 1, climate: 'northern' },
  { city: 'MADISON', state: 'WI', district: 9, climate: 'northern' },
  { city: 'TUCSON', state: 'AZ', district: 7, climate: 'desert' },
  { city: 'SPOKANE', state: 'WA', district: 7, climate: 'northern' },
  { city: 'DES MOINES', state: 'IA', district: 0, climate: 'northern' },
  { city: 'SANTA FE', state: 'NM', district: 5, climate: 'highland' },
  { city: 'PROVIDENCE', state: 'RI', district: 1, climate: 'northern' },
  { city: 'LANCASTER', state: 'PA', district: 3, climate: 'northern' },
  { city: 'TRENTON', state: 'NJ', district: 2, climate: 'northern' },
  { city: 'BALTIMORE', state: 'MD', district: 3, climate: 'southern' },
  { city: 'TAMPA', state: 'FL', district: 4, climate: 'warm' },
  { city: 'SACRAMENTO', state: 'CA', district: 6, climate: 'pacific' },
  { city: 'SAN DIEGO', state: 'CA', district: 6, climate: 'pacific' },
  { city: 'LANSING', state: 'MI', district: 8, climate: 'northern' },
  { city: 'CHAMPAIGN', state: 'IL', district: 9, climate: 'northern' },
  { city: 'DENVER', state: 'CO', district: 0, climate: 'highland' },
] as const;
/** Keep power choices with the rig, rather than assigning arbitrary power to it. */
export const QSO_RADIOS = [
  { rig: 'KX3', watts: [5, 10] },
  { rig: 'IC7300', watts: [5, 25, 50, 100] },
  { rig: 'FT891', watts: [10, 25, 50, 100] },
  { rig: 'K2', watts: [5, 10] },
  { rig: 'QCX', watts: [3, 5] },
  { rig: 'FT817', watts: [2, 5] },
] as const;
export const QSO_ANTENNAS = [
  'DIPOLE UP 30 FT',
  'DIPOLE UP 40 FT',
  'VERTICAL',
  'EFHW UP 25 FT',
  'LOOP',
  'END FED WIRE',
] as const;
const QSO_SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type QsoSeason = (typeof QSO_SEASONS)[number];
type Climate = (typeof QSO_LOCATIONS)[number]['climate'];

/** Broad authored examples in Fahrenheit, not measured normals or forecasts. */
const SEASONAL_TEMPERATURES: Record<Climate, Record<QsoSeason, readonly [number, number]>> = {
  northern: { spring: [45, 65], summer: [65, 85], autumn: [40, 65], winter: [15, 35] },
  southern: { spring: [60, 80], summer: [75, 95], autumn: [55, 80], winter: [40, 60] },
  warm: { spring: [70, 85], summer: [80, 100], autumn: [70, 90], winter: [55, 75] },
  desert: { spring: [65, 85], summer: [90, 105], autumn: [65, 90], winter: [50, 70] },
  highland: { spring: [40, 60], summer: [65, 85], autumn: [40, 65], winter: [20, 40] },
  pacific: { spring: [55, 70], summer: [65, 85], autumn: [60, 80], winter: [50, 65] },
};
export const QSO_REPORTS = ['449', '459', '559', '569', '579', '589', '599'] as const;

export interface QsoStation {
  call: string;
  name: string;
  city: string;
  state: string;
  rig: string;
  watts: number;
  antenna: string;
  weather: string;
  weatherCondition: string;
  temperatureF: number;
  /** The report this station sends about the other station. */
  report: string;
}
export interface QsoTemplate {
  id: string;
  kind: 'qso';
  title: string;
  copy: QsoCopySelection;
  lines: (a: QsoStation, b: QsoStation) => string[];
}
const qth = (s: QsoStation) => `${s.city} ${s.state}`;
const turn = (sender: QsoStation, receiver: QsoStation) => `${receiver.call} DE ${sender.call}`;
const contactFields = ['callsign', 'name', 'qth', 'rst'] as const;
const ragchewFields = [
  ...contactFields,
  'rig',
  'power',
  'antenna',
  'weather',
  'temperature',
] as const;

export const QSO_TEMPLATES: readonly QsoTemplate[] = [
  {
    id: 'short-contact',
    kind: 'qso',
    title: 'A first contact',
    copy: { caller: contactFields, answering: contactFields },
    lines: (a, b) => [
      `CQ CQ CQ DE ${a.call} ${a.call} K`,
      `${turn(b, a)} ${b.call} <KN>`,
      `${turn(a, b)} GE TNX FER CALL UR RST ${a.report} ${a.report} NAME ${a.name} ${a.name} QTH ${qth(a)} ${qth(a)} HW? ${turn(a, b)} <KN>`,
      `${turn(b, a)} R R GE ${a.name} UR RST ${b.report} ${b.report} NAME ${b.name} ${b.name} QTH ${qth(b)} ${qth(b)} TNX FER RPT ${turn(b, a)} <KN>`,
      `${turn(a, b)} R TNX ${b.name} NICE TO MEET U TNX FER QSO 73 ES CU AGN ${turn(a, b)} <SK>`,
      `${turn(b, a)} TNX ${a.name} 73 ES CU AGN ${turn(b, a)} <SK>`,
    ],
  },
  {
    id: 'ragchew',
    kind: 'qso',
    title: 'Rigs, antennas, and weather',
    copy: { caller: ragchewFields, answering: ragchewFields },
    lines: (a, b) => [
      `CQ CQ DE ${a.call} ${a.call} K`,
      `${turn(b, a)} ${b.call} <KN>`,
      `${turn(a, b)} GA UR RST ${a.report} ${a.report} NAME ${a.name} ${a.name} QTH ${qth(a)} HW? ${turn(a, b)} <KN>`,
      `${turn(b, a)} R GA ${a.name} UR RST ${b.report} ${b.report} NAME ${b.name} ${b.name} QTH ${qth(b)} ${turn(b, a)} <KN>`,
      `${turn(a, b)} R ${b.name} RIG HR ${a.rig} PWR ${a.watts} WATTS ANT ${a.antenna} WX ${a.weather} HW ABT U? ${turn(a, b)} <KN>`,
      `${turn(b, a)} R TNX ${a.name} FER INFO RIG HR ${b.rig} PWR ${b.watts} WATTS ANT ${b.antenna} WX ${b.weather} ${turn(b, a)} <KN>`,
      `${turn(a, b)} R FB ${b.name} TNX FER NICE CHAT HPE CU AGN 73 ES GE ${turn(a, b)} <SK>`,
      `${turn(b, a)} TNX ${a.name} ENJOY UR DAY 73 ES CU AGN ${turn(b, a)} <SK>`,
    ],
  },
  {
    id: 'pota',
    kind: 'qso',
    title: 'A POTA contact',
    copy: { caller: ['callsign', 'rst'], answering: ['callsign', 'rst', 'state'] },
    lines: (a, b) => [
      `CQ POTA CQ POTA DE ${a.call} ${a.call} K`,
      `${b.call} ${b.call}`,
      `${turn(a, b)} UR ${a.report} ${a.report} BK`,
      `BK R R UR ${b.report} ${b.report} ${b.state} ${b.state} BK`,
      `BK TNX FER ${b.state} 73 ${turn(a, b)} K`,
      'TU 73',
    ],
  },
  {
    id: 'repeat',
    kind: 'qso',
    title: 'Asking for a repeat',
    copy: { caller: contactFields, answering: contactFields },
    lines: (a, b) => [
      `CQ CQ DE ${a.call} ${a.call} K`,
      `${turn(b, a)} ${b.call} <KN>`,
      `${turn(a, b)} GE UR RST ${a.report} ${a.report} NAME ${a.name} ${a.name} QTH ${qth(a)} ${turn(a, b)} <KN>`,
      `${turn(b, a)} R GE ${a.name} UR RST ${b.report} ${b.report} NAME ${b.name} ${b.name} PSE RPT QTH QTH? ${turn(b, a)} <KN>`,
      `${turn(a, b)} R ${b.name} QTH ${a.city} ${a.city} ${a.state} ${a.state} HW CPY? ${turn(a, b)} <KN>`,
      `${turn(b, a)} R R ${qth(a)} TNX MY QTH ${qth(b)} ${qth(b)} ${turn(b, a)} <KN>`,
      `${turn(a, b)} R ${qth(b)} TNX ${b.name} FER QSO 73 ES CU AGN ${turn(a, b)} <SK>`,
      `${turn(b, a)} TNX ${a.name} 73 ${turn(b, a)} <SK>`,
    ],
  },
];

/** Station details are sampled once, so repeats and responses agree. */
export function generateQso(
  id: string,
  random = Math.random,
  previousCalls: readonly string[] = [],
): PracticeQso {
  const template = QSO_TEMPLATES.find((item) => item.id === id);
  if (!template) throw new Error('Choose a QSO scenario.');
  const pick = <T>(values: readonly T[]): T => values[Math.floor(random() * values.length)];
  const calls = QSO_CALLSIGNS.filter((call) => !previousCalls.includes(call));
  const pool = calls.length >= 2 ? calls : [...QSO_CALLSIGNS];
  const season = pick(QSO_SEASONS);
  function weather(
    climate: Climate,
  ): Pick<QsoStation, 'weather' | 'weatherCondition' | 'temperatureF'> {
    const [low, high] = SEASONAL_TEMPERATURES[climate][season];
    const temperature = low + Math.floor(random() * (high - low + 1));
    const conditions = ['SUNNY', 'CLEAR', 'CLOUDY', 'WINDY'];
    if (temperature >= 40 && climate !== 'desert') conditions.push('RAIN');
    if (season === 'winter' && temperature <= 32) conditions.push('SNOW');
    const weatherCondition = pick(conditions);
    return {
      weather: `${weatherCondition} TEMP ${temperature} F`,
      weatherCondition,
      temperatureF: temperature,
    };
  }
  function station(call: string, previousName?: string): QsoStation {
    const district = Number(call.match(/\d/)![0]);
    const location = pick(QSO_LOCATIONS.filter((item) => item.district === district));
    const radio = pick(QSO_RADIOS);
    return {
      call,
      name: pick(QSO_NAMES.filter((name) => name !== previousName)),
      city: location.city,
      state: location.state,
      rig: radio.rig,
      watts: pick<number>(radio.watts),
      antenna: pick(QSO_ANTENNAS),
      ...weather(location.climate),
      report: pick(QSO_REPORTS),
    };
  }
  const a = station(pick(pool));
  const b = station(pick(pool.filter((call) => call !== a.call)), a.name);
  return {
    id,
    title: template.title,
    stations: [a.call, b.call],
    lines: template.lines(a, b),
    season,
    copyFields: createQsoCopyFields(a, b, template.copy),
  };
}
import { createQsoCopyFields, type QsoCopyField, type QsoCopySelection } from './qso-copy';
