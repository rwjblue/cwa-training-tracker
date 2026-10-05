/** Optional learner-selected categories; older on-air entries remain uncategorized. */
export const ON_AIR_CATEGORIES = [
  { id: 'qso', label: 'QSO / ragchew' },
  { id: 'pota', label: 'POTA' },
  { id: 'sota', label: 'SOTA' },
  { id: 'cwt', label: 'CWT' },
  { id: 'contest', label: 'Other contest' },
  { id: 'listening', label: 'On-air listening' },
  { id: 'other', label: 'Other on-air practice' },
] as const;

export type OnAirCategory = (typeof ON_AIR_CATEGORIES)[number]['id'];

export function onAirCategoryLabel(value: unknown): string | undefined {
  return ON_AIR_CATEGORIES.find((category) => category.id === value)?.label;
}

export function validateOnAirCategory(value: unknown): OnAirCategory {
  if (!onAirCategoryLabel(value)) throw new Error('Choose a valid on-air category.');
  return value as OnAirCategory;
}
