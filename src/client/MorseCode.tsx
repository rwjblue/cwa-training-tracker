import React from 'react';
import { COPY_MORSE } from '../shared/copy-content';

interface MorseCodeProps {
  text: string;
  className?: string;
  decorative?: boolean;
}

/** Render visual Morse from the same alphabet used by practice audio. */
export default function MorseCode({ text, className, decorative = false }: MorseCodeProps) {
  const normalized = text.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!normalized) return null;

  const visual = normalized
    .split(' ')
    .map((word) =>
      [...word]
        .map((character) => {
          const code = COPY_MORSE[character];
          if (!code) throw new Error(`Unsupported Morse character: ${character}`);
          return [...code].map((symbol) => (symbol === '.' ? '·' : '−')).join(' ');
        })
        .join('\u00a0\u00a0'),
    )
    .join('\u00a0\u00a0\u00a0\u00a0');

  const label = `${normalized} in Morse code`;
  return (
    <span
      className={`morse-code${className ? ` ${className}` : ''}`}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
      title={label}
    >
      {visual}
    </span>
  );
}
