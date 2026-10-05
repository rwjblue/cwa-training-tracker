import { describe, expect, it } from 'vitest';
import { courseHash, launchHash, readAppRoute } from './app-route';

describe('public navigation', () => {
  it('resolves each public tool without a private practice owner', () => {
    for (const tool of ['words', 'qso', 'stories', 'copy', 'free', 'sending', 'runner']) {
      expect(readAppRoute(`#practice/${tool}?v=1`).launch).toEqual({
        tool,
        publicRoute: `#practice/${tool}?v=1`,
      });
    }
    expect(readAppRoute('#practice').launch).toBeUndefined();
    expect(readAppRoute('#practice/unpublished')).toEqual({ page: 'tools', hash: '#tools' });
  });
  it('round trips course selection and discards private query data', () => {
    expect(readAppRoute(courseHash('advanced', 8))).toEqual({
      page: 'course',
      hash: '#course?level=advanced&session=8',
      level: 'advanced',
      session: 8,
    });
    expect(readAppRoute('#logbook?notes=private').hash).toBe('#logbook');
    expect(readAppRoute('#course?level=unknown&session=999&user=private').hash).toBe('#course');
    expect(readAppRoute('#events?time=utc&private=ignored').hash).toBe('#events?time=utc');
    expect(launchHash({ material: { id: 'private-material' } } as never)).toBe('#practice');
  });
  it('resolves exact public recordings while keeping source URLs allowlisted', () => {
    const route = readAppRoute('#practice/recording/POTA208_15');
    expect(route.hash).toBe('#practice/recording/pota208_15');
    expect(route.launch?.activity).toMatchObject({ type: 'audio', characterWpm: 15 });
    expect(route.launch?.task).toBeUndefined();
    expect(readAppRoute('#practice/recording/https://example.com').page).toBe('tools');
  });
});
