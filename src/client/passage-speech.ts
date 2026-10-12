import index from '../../public/audio/cw-training/passages/index.json';
import { loadSpeechClips } from './word-speech';

/** Whole phrases recorded ahead of time; browsers never synthesize speech. */
export const loadPassageSpeech = (lines: readonly string[]) =>
  loadSpeechClips(
    lines,
    index.clips,
    () =>
      'This collection has no prerecorded answer. Turn off Hands-free listening to hear it in Morse.',
  );
