import { useSyncExternalStore } from 'react';

export type Appearance = 'light' | 'dark' | 'system';
export type ResolvedAppearance = Exclude<Appearance, 'system'>;
// Keep the pre-paint initializer in public/appearance.js in sync with this key and choices.
export const APPEARANCE_STORAGE_KEY = 'cwa:appearance:v1';

function readAppearance(): Appearance {
  try {
    const value = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (value === 'light' || value === 'dark') return value;
  } catch {
    // Appearance still works for this visit when browser storage is unavailable.
  }
  return 'system';
}

let preference = readAppearance();
const systemAppearance = window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

function applyAppearance() {
  const theme =
    preference === 'system' ? (systemAppearance.matches ? 'dark' : 'light') : preference;
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#101b16' : '#f7f8f3');
  listeners.forEach((listener) => listener());
}

export function setAppearance(value: Appearance) {
  preference = value;
  try {
    if (value === 'system') localStorage.removeItem(APPEARANCE_STORAGE_KEY);
    else localStorage.setItem(APPEARANCE_STORAGE_KEY, value);
  } catch {
    // Keep the explicit choice in memory for this visit.
  }
  applyAppearance();
}

systemAppearance.addEventListener('change', () => {
  if (preference === 'system') applyAppearance();
});
window.addEventListener('storage', (event) => {
  if (event.key === APPEARANCE_STORAGE_KEY || event.key === null) {
    preference = readAppearance();
    applyAppearance();
  }
});
applyAppearance();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAppearance() {
  const appearance = useSyncExternalStore(subscribe, () => preference);
  const theme = useSyncExternalStore(
    subscribe,
    () => document.documentElement.dataset.theme as ResolvedAppearance,
  );
  return { appearance, theme, setAppearance };
}
