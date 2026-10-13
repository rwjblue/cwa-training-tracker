// Update the offline speech manifest from the public, versioned passage catalog.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { PRACTICE_PASSAGES } from '../../src/shared/listening-stories.ts';

const lines = [...new Set(PRACTICE_PASSAGES.flatMap((passage) => [...passage.lines]))];
// Keep the approved voice/model/settings aligned with the existing word answers.
// This reads only public generation settings; the API key is loaded separately by mise.
const { generator } = JSON.parse(
  readFileSync(new URL('../../data/cw-training/word-speech.json', import.meta.url), 'utf8'),
);
writeFileSync(
  new URL('../../data/cw-training/passage-speech.json', import.meta.url),
  JSON.stringify(
    {
      version: 1,
      assetDirectory: 'audio/cw-training/passages',
      generator,
      words: lines.map((line) => ({
        word: line,
        pronunciation: line.charAt(0) + line.slice(1).toLowerCase(),
        path: `public/audio/cw-training/passages/${createHash('sha256').update(line).digest('hex').slice(0, 16)}.wav`,
      })),
    },
    null,
    2,
  ) + '\n',
);
