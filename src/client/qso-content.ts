/** Original practice scenarios adapted from the personal-site listening tools. */
export interface PracticeQso {
  id: string;
  title: string;
  stations: [string, string];
  lines: string[];
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
export const QSO_LOCATIONS = [
  { city: 'BOSTON', state: 'MA' },
  { city: 'ALBANY', state: 'NY' },
  { city: 'RALEIGH', state: 'NC' },
  { city: 'BOISE', state: 'ID' },
  { city: 'AUSTIN', state: 'TX' },
  { city: 'DAYTON', state: 'OH' },
  { city: 'PORTLAND', state: 'ME' },
  { city: 'MADISON', state: 'WI' },
  { city: 'TUCSON', state: 'AZ' },
  { city: 'SPOKANE', state: 'WA' },
  { city: 'DES MOINES', state: 'IA' },
  { city: 'SANTA FE', state: 'NM' },
  { city: 'PROVIDENCE', state: 'RI' },
  { city: 'LANCASTER', state: 'PA' },
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
export const QSO_WEATHER = [
  'SUNNY TEMP 75 F',
  'CLOUDY TEMP 60 F',
  'RAIN TEMP 55 F',
  'CLEAR TEMP 68 F',
  'WINDY TEMP 50 F',
  'SNOW TEMP 28 F',
] as const;
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
  /** The report this station sends about the other station. */
  report: string;
}
export interface QsoTemplate {
  id: string;
  kind: 'qso';
  title: string;
  lines: (a: QsoStation, b: QsoStation) => string[];
}
const qth = (s: QsoStation) => `${s.city} ${s.state}`;
const turn = (sender: QsoStation, receiver: QsoStation) => `${receiver.call} DE ${sender.call}`;

export const QSO_TEMPLATES: readonly QsoTemplate[] = [
  {
    id: 'short-contact',
    kind: 'qso',
    title: 'A first contact',
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
  function station(call: string, previousName?: string): QsoStation {
    const radio = pick(QSO_RADIOS);
    return {
      call,
      name: pick(QSO_NAMES.filter((name) => name !== previousName)),
      ...pick(QSO_LOCATIONS),
      rig: radio.rig,
      watts: pick<number>(radio.watts),
      antenna: pick(QSO_ANTENNAS),
      weather: pick(QSO_WEATHER),
      report: pick(QSO_REPORTS),
    };
  }
  const a = station(pick(pool));
  const b = station(pick(pool.filter((call) => call !== a.call)), a.name);
  return { id, title: template.title, stations: [a.call, b.call], lines: template.lines(a, b) };
}
