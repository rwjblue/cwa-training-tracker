import type { PracticeLaunch } from './practice-launch';

export const practiceTools = [
  {
    tool: 'words',
    label: 'Word listening',
    description: 'Build recognition with common QSO words, one word at a time.',
  },
  {
    tool: 'qso',
    label: 'QSO practice',
    description: 'Hear generated contacts and get comfortable with the flow of a conversation.',
  },
  {
    tool: 'stories',
    label: 'Sentences & stories',
    description: 'Build from short phrases to sentences and stories, one chunk at a time.',
  },
  {
    tool: 'copy',
    label: 'Copy practice',
    description:
      'Hear code groups, words, callsigns, or sentences. Type your copy and review the result.',
  },
  {
    tool: 'sending',
    label: 'Sending practice',
    description: 'Use your key with readable sending scales and a practice timer.',
  },
  {
    tool: 'free',
    label: 'Free practice',
    description: 'Listen to character groups, callsigns, or your own text at your pace.',
  },
  {
    tool: 'runner',
    label: 'Morse Runner',
    description: 'Practice simulated contest contacts and review your engine results.',
  },
] satisfies { tool: NonNullable<PracticeLaunch['tool']>; label: string; description: string }[];

export function practiceTool(tool: PracticeLaunch['tool']) {
  return (
    practiceTools.find((item) => item.tool === tool) ??
    practiceTools.find((item) => item.tool === 'free')!
  );
}
