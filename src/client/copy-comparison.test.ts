import { describe, expect, it } from 'vitest';
import { scoreCopyText } from '../shared/copy-practice';
import { copyComparisonRows, describeCopyEdit } from './copy-comparison';

describe('copy comparison rows', () => {
  it('keeps later groups aligned when a complete middle group is omitted', () => {
    const score = scoreCopyText('BTMUX VYQAO AQRZC ZXFKA', 'BTMUX AQRZC ZXFKA');
    const rows = copyComparisonRows(score.alignment);
    expect(rows.map((row) => [row.sent, row.copied])).toEqual([
      ['BTMUX', 'BTMUX'],
      ['VYQAO', ''],
      ['AQRZC', 'AQRZC'],
      ['ZXFKA', 'ZXFKA'],
    ]);
    expect(rows[0].edits).toBe(0);
    expect(rows[1].edits).toBe(6);
    expect(rows[1].boundaryNotes).toEqual(['Missing space before this group.']);
    expect(rows[2].edits).toBe(0);
    expect(rows[3].edits).toBe(0);
    expect(rows.flatMap((row) => row.alignment)).toEqual(score.alignment);
  });

  it('shows a missing boundary without treating the joined copy as different groups', () => {
    const score = scoreCopyText('ABC DEF GHI', 'ABCDEF GHI');
    const rows = copyComparisonRows(score.alignment);
    expect(rows.map((row) => [row.sent, row.copied])).toEqual([
      ['ABC', 'ABC'],
      ['DEF', 'DEF'],
      ['GHI', 'GHI'],
    ]);
    expect(rows[1].cells[0]).toEqual({ kind: 'deletion', expected: ' ', received: '' });
    expect(rows[1].boundaryNotes).toEqual(['Missing space before this group.']);
    expect(rows.reduce((edits, row) => edits + row.edits, 0)).toBe(score.distance);
  });

  it('retains every extra character and space before, inside, and after sent groups', () => {
    for (const answer of [
      'XXX ABC DEF GHI',
      'ABC XXX DEF GHI',
      'ABC DEF GHI XXX',
      'AB C DEF GHI',
    ]) {
      const score = scoreCopyText('ABC DEF GHI', answer);
      const rows = copyComparisonRows(score.alignment);
      expect(rows.map((row) => row.sent)).toEqual(['ABC', 'DEF', 'GHI']);
      expect(rows.flatMap((row) => row.alignment)).toEqual(score.alignment);
      expect(
        rows
          .flatMap((row) => row.alignment)
          .map((item) => item.received)
          .join(''),
      ).toBe(answer);
      expect(rows.reduce((edits, row) => edits + row.edits, 0)).toBe(score.distance);
    }
    const rows = copyComparisonRows(scoreCopyText('ABC DEF GHI', 'AB C DEF GHI').alignment);
    expect(rows[0].boundaryNotes).toEqual(['Extra space inside this group.']);
    expect(rows[2].edits).toBe(0);
  });

  it('retains substituted boundaries, punctuation, and empty answers', () => {
    const boundary = copyComparisonRows(scoreCopyText('ABC DEF', 'ABCXDEF').alignment);
    expect(boundary[1].copied).toBe('XDEF');
    expect(boundary[1].boundaryNotes).toEqual(['Space before this group copied as X.']);
    const missing = copyComparisonRows(scoreCopyText('ABC DEF.', '').alignment);
    expect(missing.map((row) => [row.sent, row.copied])).toEqual([
      ['ABC', ''],
      ['DEF.', ''],
    ]);
    expect(missing[1].cells.at(-1)).toEqual({ kind: 'deletion', expected: '.', received: '' });
    expect(copyComparisonRows([])).toEqual([]);
  });

  it('describes errors in words so feedback does not depend on color', () => {
    expect(describeCopyEdit({ kind: 'substitution', expected: 'B', received: 'D' })).toBe(
      'Changed B to D.',
    );
    expect(describeCopyEdit({ kind: 'deletion', expected: ' ', received: '' })).toBe(
      'Missing a space.',
    );
    expect(describeCopyEdit({ kind: 'insertion', expected: '', received: '🙂' })).toBe('Extra 🙂.');
  });
});
