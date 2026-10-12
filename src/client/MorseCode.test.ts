import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import MorseCode from './MorseCode';

const render = (text: string, props = {}) =>
  renderToStaticMarkup(React.createElement(MorseCode, { text, ...props }));
const visual = (text: string) => render(text).replace(/<[^>]*>/g, '');

describe('visual Morse code', () => {
  it('renders 73 with two dashes and three dots, then three dots and two dashes', () => {
    expect(visual('73')).toBe('− − · · ·\u00a0\u00a0· · · − −');
  });

  it.each([
    ['0', '− − − − −'],
    ['1', '· − − − −'],
    ['2', '· · − − −'],
    ['3', '· · · − −'],
    ['4', '· · · · −'],
    ['5', '· · · · ·'],
    ['6', '− · · · ·'],
    ['7', '− − · · ·'],
    ['8', '− − − · ·'],
    ['9', '− − − − ·'],
  ])('renders digit %s using all five symbols', (digit, expected) => {
    expect(visual(digit)).toBe(expected);
  });

  it('supports letters, case normalization, punctuation and distinct word gaps', () => {
    expect(visual('  cwa\t  73?  ')).toBe(
      '− · − ·\u00a0\u00a0· − −\u00a0\u00a0· −' +
        '\u00a0\u00a0\u00a0\u00a0− − · · ·\u00a0\u00a0· · · − −\u00a0\u00a0· · − − · ·',
    );
    expect(render(' cwa\t73? ')).toContain('aria-label="CWA 73? in Morse code"');
  });

  it('labels meaningful visuals and retains caller styling', () => {
    expect(render('73', { className: 'morse-word' })).toContain(
      'class="morse-code morse-word" role="img" aria-label="73 in Morse code"',
    );
  });

  it('hides decorative visuals from assistive technology without changing their symbols', () => {
    const markup = render('73', { decorative: true });
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('role=');
    expect(markup).not.toContain('aria-label=');
    expect(markup.replace(/<[^>]*>/g, '')).toBe(visual('73'));
  });

  it('renders nothing for empty input', () => {
    expect(render(' \n\t ')).toBe('');
  });

  it('rejects unsupported characters instead of presenting incomplete Morse', () => {
    expect(() => render('73🙂')).toThrow('Unsupported Morse character: 🙂');
  });
});
