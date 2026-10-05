import { describe, expect, it } from 'vitest';
import { DEFAULT_PRACTICE_PREFERENCES as defaults } from './practice-preferences';
import { freeShareRoute, readFreeShare } from './free-share';

describe('public free practice', () => {
  it('reopens the same generated material and sound over device preferences', () => {
    const p = {
      ...defaults,
      tool: 'free' as const,
      mode: 'groups' as const,
      groupLength: 3,
      tone: 720,
      volume: 75,
    };
    const shared = readFreeShare(freeShareRoute(p, 'ABC DEF GHI'), { ...defaults, tone: 400 });
    expect(shared.text).toBe('ABC DEF GHI');
    expect(shared.preferences).toMatchObject({
      mode: 'groups',
      groupLength: 3,
      tone: 720,
      volume: 75,
    });
  });
  it('never serializes a custom script and bounds URL settings', () => {
    const url = freeShareRoute({ ...defaults, mode: 'custom' }, 'Private script');
    expect(url).not.toContain('Private');
    expect(readFreeShare(url, defaults).text).toBeUndefined();
    expect(
      readFreeShare('#practice/free?mode=groups&tone=999999&set=ABC', defaults).preferences.tone,
    ).toBe(1000);
  });
  it('explains replacement of a damaged generated set', () => {
    const share = readFreeShare('#practice/free?mode=groups&set=%3Cinvalid%3E', defaults);
    expect(share.text).toBeUndefined();
    expect(share.error).toContain('fresh practice set');
  });
});
