import type { ReportDocument } from './report-document.ts';
import { assertReportConfirmation } from './report-handoff.ts';
import type { PracticeSession } from './training.ts';

const normalized = (word: string) => word.normalize('NFC').toLowerCase();

/** Commas/semicolons separate declarations; spaces within a phrase remain meaningful. */
export function reportWordValues(text: string): string[] {
  const words = new Map<string, string>();
  for (const item of text.split(/[,;\r\n]/)) {
    const word = item.trim().replace(/\s+/g, ' ').normalize('NFC');
    if (word && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(word))
      if (!words.has(normalized(word))) words.set(normalized(word), word);
  }
  return [...words.values()];
}

/** Only this saved explicit declaration grants a candidate; other prose stays private. */
export function learnedWordsFromScratchpad(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return reportWordValues(
    value
      .split(/\r?\n/)
      .flatMap((line) => {
        const match = /^\s*learned:\s*(.*)$/i.exec(line);
        return match ? [match[1]] : [];
      })
      .join('\n'),
  );
}

export interface ConfirmedLearnedWord {
  word: string;
  reportId: string;
  submittedAt: string;
}
/** Callers supply an owned inventory. Imported reference text has no native authority. */
export function confirmedLearnedWordHistory(
  reports: readonly ReportDocument[],
): ConfirmedLearnedWord[] {
  const parents = new Map(reports.map((report) => [report.id, report]));
  return reports.flatMap((report) => {
    if (report.status !== 'submitted' || !report.confirmation) return [];
    try {
      assertReportConfirmation(report, parents.get(report.confirmation.handoffId));
    } catch {
      return []; // A label or imported text alone cannot acquire confirmation authority.
    }
    return reportWordValues(
      report.definition.fields
        .filter((field) => field.source === 'learned:words')
        .map((field) => report.answers[field.key] ?? '')
        .join('\n'),
    ).map((word) => ({ word, reportId: report.id, submittedAt: report.submittedAt! }));
  });
}

export interface LearnedWordCandidate {
  word: string;
  sources: { id: string; date: string }[];
  reportedIn: ConfirmedLearnedWord[];
}
/** Window/class/future filtering belongs to reportablePractice, shared with all report facts. */
export function learnedWordCandidates(
  eligible: readonly PracticeSession[],
  reports: readonly ReportDocument[],
  date: (entry: PracticeSession) => string,
): LearnedWordCandidate[] {
  const confirmed = confirmedLearnedWordHistory(reports);
  const history = new Map<string, ConfirmedLearnedWord[]>();
  for (const item of confirmed) {
    const key = normalized(item.word);
    history.set(key, [...(history.get(key) ?? []), item]);
  }
  const candidates = new Map<string, LearnedWordCandidate>();
  for (const entry of eligible) {
    for (const word of learnedWordsFromScratchpad(entry.metadata?.scratchpad)) {
      const key = normalized(word);
      const candidate = candidates.get(key) ?? {
        word,
        sources: [],
        reportedIn: history.get(key) ?? [],
      };
      if (!candidate.sources.some((source) => source.id === entry.id))
        candidate.sources.push({ id: entry.id, date: date(entry) });
      candidates.set(key, candidate);
    }
  }
  return [...candidates.values()];
}

/** Never shorten a declaration into a different word to fit a report answer. */
export function learnedWordAnswer(words: readonly string[], maxLength = 4000): string {
  const retained: string[] = [];
  let length = 0;
  for (const word of words) {
    const added = word.length + (retained.length ? 2 : 0);
    if (length + added > maxLength) continue;
    retained.push(word);
    length += added;
  }
  return retained.join(', ');
}
