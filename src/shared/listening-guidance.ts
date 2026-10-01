import type { PlannedTask } from './plan';
import { officialRecordingCode } from './recordings';

export type ListeningFamily =
  'words' | 'phrases' | 'affixes' | 'qso' | 'pota' | 'cwt' | 'stories' | 'generic';

export interface ListeningGuidance {
  family: ListeningFamily;
  title: string;
  approach: string;
  scratchpadPrompt: string;
}

// Original suggestions only. Instructions, pass policy, time and reporting stay
// with their existing owners; showing a suggestion establishes no proficiency.
const guidance: Record<ListeningFamily, Omit<ListeningGuidance, 'family'>> = {
  words: {
    title: 'Whole words',
    approach:
      'Hear each word as a whole sound and hold it briefly in mind before deciding what to write.',
    scratchpadPrompt: 'Optional: words you recall, uncertain sounds, or words to revisit.',
  },
  phrases: {
    title: 'Phrase meaning',
    approach:
      'Hold the meaning of a phrase, then recall an idea or recognizable fragment. Write fuller notes if your exercise asks for them.',
    scratchpadPrompt: 'Optional: meanings, phrase fragments, or ideas you retained.',
  },
  affixes: {
    title: 'Word beginnings and endings',
    approach:
      'Listen for the shared beginning or ending while recognizing the sound of the whole word.',
    scratchpadPrompt: 'Optional: word patterns you recognize or want to hear again.',
  },
  qso: {
    title: 'Conversation details',
    approach:
      'Follow who is speaking and hold the callsigns, names and locations in mind as the conversation unfolds.',
    scratchpadPrompt: 'Optional: station details, who said them, or uncertain parts.',
  },
  pota: {
    title: 'Park exchange',
    approach:
      'Follow the two stations and listen for their callsigns and any park references in the exchange.',
    scratchpadPrompt: 'Optional: callsigns, park references you heard, or gaps.',
  },
  cwt: {
    title: 'Contest exchange',
    approach:
      'Hold the callsign, name and number together as one exchange before moving to the next station.',
    scratchpadPrompt: 'Optional: callsign, name, number, or details to replay.',
  },
  stories: {
    title: 'Story meaning and fragments',
    approach:
      'Follow the story’s meaning and catch familiar words or fragments. Use a full transcript when your instructions require it.',
    scratchpadPrompt: 'Optional: story ideas, familiar words, or fragments you caught.',
  },
  generic: {
    title: 'Listening objective',
    approach:
      'Start with your exercise’s objective. Try holding one detail in mind before writing, when that fits the assignment.',
    scratchpadPrompt: 'Optional: recalled details, uncertainties, or questions for your advisor.',
  },
};

const families: Record<string, ListeningFamily> = {
  WD: 'words',
  PR: 'phrases',
  QSO: 'qso',
  POTA: 'pota',
  CWT: 'cwt',
  SS: 'stories',
  DIS: 'affixes',
  IM: 'affixes',
  IN: 'affixes',
  IR: 'affixes',
  RE: 'affixes',
  UN: 'affixes',
  ED: 'affixes',
  ES: 'affixes',
  ING: 'affixes',
  LY: 'affixes',
};
const prefixes = 'WD|PR|QSO|POTA|CWT|SS|DIS|IM|IN|IR|RE|UN|ED|ES|ING|LY';
const publishedCode = new RegExp(`^(${prefixes})(?=\\d|[-_])`, 'i');
const referencedCode = new RegExp(`\\b(${prefixes})\\s*\\d+\\s*[-_–—]\\s*\\d+\\b`, 'i');

/** Derived presentation only; neither task nor saved evidence is changed. */
export function listeningGuidance(
  task: Pick<PlannedTask, 'title' | 'notes' | 'exercise'>,
  activeUrl?: string,
): ListeningGuidance | undefined {
  if (task.exercise?.type !== 'audio') return;
  const code = officialRecordingCode(activeUrl ?? task.exercise.url);
  let family: ListeningFamily;
  if (code !== undefined) {
    // Actual verified source takes priority over renamed or conflicting copy.
    family = families[publishedCode.exec(code)?.[1]?.toUpperCase() ?? ''] ?? 'generic';
  } else {
    const prefix = referencedCode.exec(task.title)?.[1] ?? referencedCode.exec(task.notes)?.[1];
    const text = `${task.title} ${task.notes}`;
    family = prefix
      ? families[prefix.toUpperCase()]!
      : /\bshort\s+stor(?:y|ies)\b/i.test(text)
        ? 'stories'
        : /\b(?:prefix|suffix)(?:es)?\b/i.test(text)
          ? 'affixes'
          : 'generic';
  }
  return { family, ...guidance[family] };
}
