import { normalizePracticePreferences, type PracticePreferences } from './practice-preferences';

export function readFreeShare(hash: string | undefined, fallback: PracticePreferences) {
  const params = new URLSearchParams(hash?.split('?')[1] ?? '');
  if (!hash?.startsWith('#practice/free?')) return { preferences: fallback };
  const changes: Record<string, unknown> = {};
  for (const key of ['characterWpm', 'effectiveWpm', 'tone', 'volume', 'groupLength']) {
    const value = params.get(key);
    if (value !== null && Number.isFinite(Number(value))) changes[key] = Number(value);
  }
  if (params.has('mode')) changes.mode = params.get('mode');
  if (params.has('wordLength'))
    changes.wordLength =
      params.get('wordLength') === 'mixed' ? 'mixed' : Number(params.get('wordLength'));
  const preferences = normalizePracticePreferences({ ...fallback, ...changes, tool: 'free' });
  const text = params.get('set');
  const validText =
    preferences.mode !== 'custom' && text && text.length <= 1200 && /^[A-Z0-9 /]+$/.test(text);
  return {
    preferences,
    ...(validText ? { text } : {}),
    ...(params.has('set') && !validText
      ? {
          error:
            'This free practice link has invalid generated material. A fresh practice set has been prepared.',
        }
      : {}),
  };
}

export function freeShareRoute(p: PracticePreferences, text: string) {
  const params = new URLSearchParams({
    mode: p.mode,
    characterWpm: String(p.characterWpm),
    effectiveWpm: String(p.effectiveWpm),
    tone: String(p.tone),
    volume: String(p.volume),
    groupLength: String(p.groupLength),
    wordLength: String(p.wordLength),
  });
  // Only app-generated material is public. A typed script stays on its owner.
  if (p.mode !== 'custom') params.set('set', text);
  return `#practice/free?${params}`;
}
