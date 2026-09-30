import { describe, expect, it } from 'vitest';
import {
  BOB_CARTER_SCALES_PDF_URL,
  SENDING_SCALES,
  sendingScalesForSections,
} from './sending-scales';

describe('native sending scales', () => {
  it('shows just the assigned sections in reading order, without duplicate cards', () => {
    expect(
      sendingScalesForSections(['drill', 'warm-up', 'drill']).map((scale) => scale.id),
    ).toEqual(['warm-up', 'drill']);
    expect(sendingScalesForSections(['exercise']).map((scale) => scale.id)).toEqual(['exercise']);
    expect(sendingScalesForSections()).toHaveLength(3);
    expect(sendingScalesForSections([])).toEqual([]);
  });

  it('includes every letter and digit exactly once in the five-character exercise', () => {
    const exercise = sendingScalesForSections(['exercise'])[0];
    const targets = exercise.rows.flatMap((row) => row.groups.map((group) => group.text));
    expect(targets.map((text) => text[0]).join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');
    expect(targets.every((text) => /^([A-Z0-9])\1{4}$/.test(text))).toBe(true);
  });

  it('retains the PDF warm-up prosigns and attaches each drill prosign to its own group', () => {
    const [warmUp, drill] = sendingScalesForSections(['warm-up', 'drill']);
    const warmUpSymbols = warmUp.rows.find((row) => row.id === 'alphabet-and-symbols')!.groups;
    expect(warmUpSymbols.slice(-3).map((group) => group.text)).toEqual(['<SK>', '<AR>', '<BT>']);
    const drillSymbols = drill.rows.find((row) => row.id === 'punctuation-and-prosigns')!.groups;
    expect(drillSymbols.filter((group) => group.annotation)).toEqual([
      { text: '/////', annotation: 'DN' },
      { text: '*****', annotation: 'SK' },
      { text: '+++++', annotation: 'AR' },
      { text: '=====', annotation: 'BT' },
    ]);
    expect(drillSymbols.every((group) => group.text.length === 5)).toBe(true);
  });

  it('keeps phrase repetitions distinct and links the public source PDF', () => {
    const drill = sendingScalesForSections(['drill'])[0];
    const phraseRows = drill.rows.filter((row) => row.id.startsWith('drill-phrase-'));
    expect(phraseRows).toHaveLength(2);
    expect(phraseRows[0].groups).toEqual(phraseRows[1].groups);
    expect(drill.rows.find((row) => row.id === 'bent-wire')!.groups).toHaveLength(3);
    expect(BOB_CARTER_SCALES_PDF_URL).toBe(
      'https://cwops.org/wp-content/uploads/2022/03/Everyday-Send-Code-WR7Q-ver.-7.pdf',
    );
    for (const scale of SENDING_SCALES) {
      expect(new Set(scale.rows.map((row) => row.id)).size).toBe(scale.rows.length);
      expect(
        scale.rows
          .flatMap((row) => row.groups)
          .every((group) => group.text === group.text.toUpperCase()),
      ).toBe(true);
    }
  });
});
