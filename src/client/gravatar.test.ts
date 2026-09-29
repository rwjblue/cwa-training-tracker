import { describe, expect, it } from 'vitest';
import { gravatarUrl } from './gravatar';

describe('Gravatar identifiers', () => {
  it('uses Gravatar’s published SHA256 example after trimming and lowercasing', async () => {
    const url = await gravatarUrl(' MyEmailAddress@example.com ');
    expect(url).toBe(
      'https://gravatar.com/avatar/84059b07d4be67b806386c0aad8070a23f18836bbaae342275dc0a83414c32ee?s=80&d=404&r=g',
    );
    expect(url).not.toContain('MyEmailAddress');
    expect(url).not.toContain('example.com');
  });

  it('does not generate an external image URL without an email address', async () => {
    expect(await gravatarUrl('  ')).toBeNull();
  });
});
