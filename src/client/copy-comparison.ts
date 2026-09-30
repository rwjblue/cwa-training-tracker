import type { CopyAlignment } from '../shared/copy-practice';

export interface CopyComparisonRow {
  number: number;
  sent: string;
  copied: string;
  /** Includes every alignment operation, including the preceding group boundary. */
  alignment: CopyAlignment[];
  /** A correctly copied boundary is represented by the next row, not a character tile. */
  cells: CopyAlignment[];
  edits: number;
  boundaryNotes: string[];
}

const characterName = (character: string) => (character === ' ' ? 'a space' : character);

export function describeCopyEdit(item: CopyAlignment): string {
  if (item.kind === 'equal') return '';
  if (item.kind === 'deletion') return `Missing ${characterName(item.expected)}.`;
  if (item.kind === 'insertion') return `Extra ${characterName(item.received)}.`;
  return `Changed ${characterName(item.expected)} to ${characterName(item.received)}.`;
}

/**
 * Partition the existing, complete edit alignment by transmitted groups. Never zip
 * answer words to sent words: one missing or extra group would shift later rows.
 * A transmitted space belongs to the following group so an omitted group keeps
 * its missing boundary with it. No operation is discarded or rescored here.
 */
export function copyComparisonRows(alignment: readonly CopyAlignment[]): CopyComparisonRow[] {
  const groups: CopyAlignment[][] = [];
  let current: CopyAlignment[] = [];
  for (const item of alignment) {
    if (item.expected === ' ' && current.length) {
      groups.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length) groups.push(current);
  return groups.map((items, index) => {
    const cells = items.filter((item) => !(item.expected === ' ' && item.kind === 'equal'));
    const boundaryNotes = items.flatMap((item) => {
      if (item.kind === 'equal') return [];
      if (item.expected === ' ') {
        return [
          item.kind === 'deletion'
            ? 'Missing space before this group.'
            : `Space before this group copied as ${item.received}.`,
        ];
      }
      if (item.received === ' ')
        return [
          item.kind === 'insertion'
            ? 'Extra space inside this group.'
            : `${item.expected} copied as a space.`,
        ];
      return [];
    });
    return {
      number: index + 1,
      sent: items
        .map((item) => item.expected)
        .join('')
        .trim(),
      copied: cells.map((item) => item.received).join(''),
      alignment: items,
      cells,
      edits: items.filter((item) => item.kind !== 'equal').length,
      boundaryNotes: [...new Set(boundaryNotes)],
    };
  });
}
