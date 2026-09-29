import { describe, expect, it } from 'vitest';
import { generateQso, QSO_TEMPLATES } from './qso-content';
import { checkQsoCopy, type QsoCopyField, type QsoCopyKind } from './qso-copy';

function seededRandom(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}
const field = (kind: QsoCopyKind, expected: string): QsoCopyField => ({
  id: `caller-${kind}`,
  station: 'caller',
  kind,
  label: kind,
  expected,
});

describe('QSO copy checking', () => {
  it('asks only for facts each station actually transmits, with scenario-specific denominators', () => {
    const counts = { 'short-contact': 8, repeat: 8, pota: 5, ragchew: 18 };
    const random = seededRandom(73);
    for (const template of QSO_TEMPLATES) {
      for (let sample = 0; sample < 12; sample++) {
        const qso = generateQso(template.id, random);
        expect(qso.copyFields).toHaveLength(counts[template.id as keyof typeof counts]);
        expect(new Set(qso.copyFields.map((item) => item.id)).size).toBe(qso.copyFields.length);
        for (const item of qso.copyFields) {
          const parity = item.station === 'caller' ? 0 : 1;
          const sent = qso.lines.filter((_, index) => index % 2 === parity).join(' ');
          switch (item.kind) {
            case 'callsign':
              expect(item.expected).toBe(qso.stations[parity]);
              expect(sent).toContain(item.expected);
              break;
            case 'name':
              expect(sent).toContain(`NAME ${item.expected} ${item.expected}`);
              break;
            case 'qth':
              expect(sent).toContain(`QTH ${item.expected}`);
              break;
            case 'rst':
              expect(sent).toMatch(new RegExp(`UR (?:RST )?${item.expected} ${item.expected}`));
              expect(item.label).toContain('sent');
              break;
            case 'rig':
              expect(sent).toContain(`RIG HR ${item.expected}`);
              break;
            case 'power':
              expect(sent).toContain(`PWR ${item.expected.replace(/ W$/, ' WATTS')}`);
              break;
            case 'antenna':
              expect(sent).toContain(`ANT ${item.expected} WX`);
              break;
            case 'weather':
              expect(sent).toContain(`WX ${item.expected} TEMP`);
              break;
            case 'temperature':
              expect(sent).toContain(`TEMP ${item.expected}`);
              break;
            case 'state':
              expect(item.station).toBe('answering');
              expect(sent).toContain(`${item.expected} ${item.expected} BK`);
          }
        }
        if (template.id === 'pota')
          expect(qso.copyFields.map((item) => item.id)).toEqual([
            'caller-callsign',
            'caller-rst',
            'answering-callsign',
            'answering-rst',
            'answering-state',
          ]);
      }
    }
  });

  it('accepts field-specific formatting without guessing missing or conflicting values', () => {
    const cases: [QsoCopyKind, string, string[], string[]][] = [
      [
        'callsign',
        'W1DPN',
        [' w1dpn ', 'W 1 D P N.'],
        ['W1DPN/P', 'W1DPN1', 'WIDPN', 'W1-DPN', 'W1DPN?'],
      ],
      ['name', 'MIGUEL', ['miguel!', ' MIGUEL '], ['MIKE', 'MIGUEL BOB']],
      [
        'qth',
        'DES MOINES IA',
        ['des  moines, Iowa', 'Des-Moines IA.'],
        ['DES MOINES', 'DES MOINES ID', 'MOINES IA'],
      ],
      ['state', 'NY', ['New York', 'ny.'], ['NJ', 'YORK', 'NEW YORK NY']],
      ['rst', '579', ['RST 579', '5 7 9.'], ['599', '5799', '57']],
      ['rig', 'IC7300', ['ic-7300', 'IC 7300.'], ['IC730', 'IC-7300 KX3']],
      ['power', '5 W', ['5', '5W', '5.0 watts.'], ['5/50', '50 W', '5 kw', '5 watts extra', '-5']],
      [
        'antenna',
        'DIPOLE UP 30 FT',
        ['dipole up 30 feet.', 'DIPOLE 30ft'],
        ['DIPOLE', 'DIPOLE UP 40 FT', 'DIPOLE UP -30 FT'],
      ],
      ['antenna', 'END FED WIRE', ['end-fed wire'], ['END FED']],
      ['weather', 'CLOUDY', ['cloudy.', ' CLOUDY ', 'clouds'], ['CLEAR', 'PARTLY CLOUDY']],
      ['weather', 'RAIN', ['rainy'], ['SNOW', 'RAIN AND WIND']],
      ['weather', 'SNOW', ['snowy'], ['RAIN']],
      ['weather', 'WINDY', ['wind'], ['CALM']],
      ['weather', 'SUNNY', ['sun'], ['CLEAR']],
      [
        'temperature',
        '70 F',
        ['70', '70° F', '70 degrees Fahrenheit.'],
        ['70 C', '70°F/21°C', '-70 F', '70 F extra'],
      ],
    ];
    for (const [kind, expected, correct, incorrect] of cases) {
      const question = field(kind, expected);
      for (const answer of correct)
        expect(
          checkQsoCopy([question], { [question.id]: answer }).fields[0].status,
          `${kind}: ${answer}`,
        ).toBe('correct');
      for (const answer of [...incorrect, 'x'.repeat(201)])
        expect(
          checkQsoCopy([question], { [question.id]: answer }).fields[0].status,
          `${kind}: ${answer}`,
        ).toBe('incorrect');
    }
  });

  it('keeps station attribution exact and distinguishes partial answers from mistakes', () => {
    const random = seededRandom(2026);
    const qso = Array.from({ length: 8 }, () => generateQso('short-contact', random)).find(
      (candidate) =>
        candidate.copyFields.find((item) => item.id === 'caller-rst')!.expected !==
        candidate.copyFields.find((item) => item.id === 'answering-rst')!.expected,
    )!;
    expect(qso).toBeDefined();
    const answers = Object.fromEntries(qso.copyFields.map((item) => [item.id, item.expected]));
    expect(checkQsoCopy(qso.copyFields, answers)).toMatchObject({
      correct: 8,
      answered: 8,
      total: 8,
    });
    for (const kind of ['name', 'rst'])
      [answers[`caller-${kind}`], answers[`answering-${kind}`]] = [
        answers[`answering-${kind}`],
        answers[`caller-${kind}`],
      ];
    const swapped = checkQsoCopy(qso.copyFields, answers);
    expect(swapped).toMatchObject({ correct: 4, answered: 8, total: 8 });
    expect(
      swapped.fields.filter((item) => item.status === 'incorrect').map((item) => item.id),
    ).toEqual(['caller-name', 'caller-rst', 'answering-name', 'answering-rst']);
    const partial = checkQsoCopy(qso.copyFields, {
      'caller-callsign': qso.stations[0],
      'caller-name': 'wrong',
      'caller-qth': '  ',
      'unknown-field': 'extra',
    });
    expect(partial).toMatchObject({ correct: 1, answered: 2, total: 8 });
    expect(partial.fields.filter((item) => item.status === 'unanswered')).toHaveLength(6);
    expect(partial.fields.map((item) => item.expected)).toEqual(
      qso.copyFields.map((item) => item.expected),
    );
  });
});
