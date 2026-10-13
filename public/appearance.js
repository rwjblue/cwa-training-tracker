// This small blocking script applies the device preference before styles and
// React load. Keep the key and choices in sync with src/client/appearance.ts.
// A same-origin file also works with the site's script-src 'self' policy.
(() => {
  let choice;
  try {
    choice = localStorage.getItem('cwa:appearance:v1');
  } catch {
    // Fall back to the system preference when storage is unavailable.
  }
  const theme =
    choice === 'light' || choice === 'dark'
      ? choice
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#101b16' : '#f7f8f3');
})();
