@RTK.md

# CW Academy Companion

An independent, public companion for CWops Academy students. Keep public
practice tools useful without an account and personal training data private.
This is not an official CWops service. Link to official curriculum; do not
redistribute restricted course documents, audio, or personal training data.

## Development

- Use TypeScript, React, Vite, and Cloudflare Workers Static Assets with D1.
- Use mise file tasks under `mise/tasks/`; keep commands out of TOML tasks.
- Run `mise run check`, `mise run test`, and `mise run build` before committing.
- Follow [docs/testing.md](docs/testing.md) for test scope, layers, and fast feedback.
- Consult and update [docs/trainer-parity.md](docs/trainer-parity.md) before porting
  trainer features or declaring parity; verify the complete workflow, not only UI names.
- Verify interface changes at desktop and mobile widths in a browser.
- Generate Worker binding types with `mise run types` after config changes.
- Production is the top-level Worker configuration. Deploy with `mise run deploy`.
- Never commit secrets, authentication state, or personal imports. Local private
  data belongs under ignored `data/private/`.
- Every private database operation must be scoped to the authenticated user.
- Keep codes single-use, browser-bound, and expiring after five minutes.
- Keep import operations validated, transactional, repeatable, and reversible
  through a user export. Never mutate the source personal site during import.
- This repo uses colocated Jujutsu. Use `jj` to commit; preserve push signing.
- Make focused, logical commits as each coherent change is completed and
  validated. Keep unrelated features in separate commits instead of batching
  an entire work session into one commit.

## Public URLs

- Treat shareable URLs as part of every public feature. Navigation and public
  selections must update the address automatically and reopen without an account.
  Use real links for navigation so copy-link and opening another tab work.
- Include the selected tool, course level/session/exercise, recording and public
  setup in the URL. Generated public listening content must reproduce the same
  material, order and pitches after reload or opening on another device.
- Use bounded, validated, versioned recipes with stable catalog identities.
  Preserve published recipe versions when generators or catalogs change. Explain
  invalid or unsupported exact recipes visibly before preparing replacement content.
- Shared URLs override device defaults, open paused and preserve existing
  navigation/save guards. In-page setting changes replace the current history
  entry; navigation adds an entry and supports Back/Forward.
- Never serialize account/task/material IDs, dates, notes, answers, results,
  training progress or personal/custom scripts. A public curriculum link opens
  public practice without the sender's private assignment attribution.
- Verify fresh guest reopening, device-default precedence, exact generated
  content and guarded navigation. See [docs/public-urls.md](docs/public-urls.md)
  for the current route inventory and sharing boundaries.

commit-message-default: auto
