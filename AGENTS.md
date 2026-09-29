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

commit-message-default: auto
