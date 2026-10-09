# Architecture and security

The application runs as one Cloudflare Worker with Static Assets and a D1
database. React renders the public tools and private workspace. Public practice
tools work without a login; every saved profile, practice entry, import archive,
and private task belongs to an authenticated account. Official course materials
are linked publicly. Imported personal materials remain in the private database.

## Authentication

Email sign-in creates accounts after verification. Six-digit codes are generated
with Web Crypto and rejection sampling. Each code expires after exactly five
minutes, permits at most five verification attempts, and is bound to an HttpOnly
browser cookie. D1 stores a keyed HMAC of the code and a SHA-256 hash of the
cookie token. A conditional delete consumes the code once, including under
concurrent requests. Failed delivery deletes the code. Codes are sent through
the native Cloudflare Email Service binding; production never returns or logs
them. Email and IP request limits, resend cooldowns, and verification limits are
enforced with atomic D1 counters. Account existence is not disclosed by the
request-code response.

Passkeys use SimpleWebAuthn. Discoverable credentials and user verification are
required. Both registration and authentication verify the configured application
origin and relying-party hostname. Five-minute challenges are browser-bound and
consumed once. Registration also binds its challenge to the current account and
session. Passkey creation and removal require authentication within the previous
ten minutes. Accounts can hold ten passkeys. Email remains available for recovery.

Sessions use random 256-bit tokens; only SHA-256 hashes are stored in D1. Cookies
are HttpOnly, Secure, SameSite=Lax, host-only, and scoped to `/`. Production uses
the `__Host-` cookie prefix. A session expires after 30 days and is revoked on
logout. Sign-in rotates the current browser's session. An account retains at
most 20 sessions. Expired credentials and rate buckets are removed by a daily
scheduled handler.

`AUTH_SECRET` must be at least 32 characters and is a Worker secret, never a
checked-in variable. Rotating it invalidates outstanding email codes and rate
keys. Existing sessions and passkeys remain valid. Rotate sessions separately by
deleting their rows if an operational incident requires universal sign-out.

## Request boundaries

Account identity uses the full callsign, falling back to “Me.” The optional
`useGravatar` profile preference defaults to true, including in older imported
profiles without a saved preference. Explicit opt-outs remain off. The account
button waits for the current account's settings before loading an avatar. The
browser computes SHA-256 of the trimmed, lowercased sign-in email and requests a G-rated image
from `https://gravatar.com`, with `d=404` so missing images retain the local
identity. Requests omit credentials and referrers. This still shares an email
hash, IP address, and browser information with Gravatar; the privacy page
explains that choice. No profile API key, upload storage, or Gravatar JavaScript
is used. The image origin alone is allowed in the static Content Security Policy.

References: [Gravatar avatar requests](https://docs.gravatar.com/sdk/images/) and
[Gravatar email hashing](https://docs.gravatar.com/rest/hash/).

Every modifying API request must carry an exact matching `Origin` and cannot
come from a cross-site fetch context. Requests containing JSON require the JSON
content type and are read with a byte limit, including chunked requests. API
responses are never cached. The Worker also returns frame, MIME-sniffing,
referrer, permissions, and HTTPS transport security headers. Worker SQL values
always use bound parameters. Private operations include the authenticated
`user_id` in their queries. No user IDs supplied by clients establish ownership.
The read-only statistics API is an explicit exception for aggregate queries
across accounts: every request independently verifies an existing
`metrics_viewer` grant before querying totals, and never returns account
identities, email addresses, profiles, or private practice content.

The origin setting also controls WebAuthn. During local development set
`APP_ORIGIN` to the exact browser URL, including its port; for example,
`http://localhost:8787` for the built preview. Use `localhost`, rather than an IP
address, so browsers permit the WebAuthn relying-party hostname. HTTP cookies are allowed only by
this explicit local configuration. Do not configure an HTTP production origin.
Wrangler's local Email Service simulator can inspect development mail without
contacting real recipients. There is no development authentication bypass.

## Data, backup, and import

Practice records use a shared validated domain model, stored as JSON with an
indexed account ID and calendar date. Profiles retain the learner's IANA
timezone. The browser timezone initializes a newly verified account; subsequent
sign-ins preserve the saved timezone.

Each account can store up to 20,000 practice records and 2,000 planned tasks.
SQLite triggers enforce a shared 6 MiB storage budget for entries, tasks, and
the retained source archive. Transactional byte accounting prevents concurrent
writes from bypassing the quota. This budget leaves space for export wrappers
and profiles within the 8 MiB import-request ceiling. Individual requests and
domain fields have smaller validation limits.

Native exports are versioned. Imports support native backups and the personal
site's legacy snapshot format. Merge skips existing record IDs; it does not
silently overwrite edited records. Replace clears the current training records,
private plan, and source archives, then imports the validated backup. The
operation uses a D1 transactional batch, so any write failure rolls it back.
Legacy imports retain the full original source privately in bounded, Unicode-safe
chunks. An import carrying a source archive replaces the previous archive within
the same transaction; imports without an archive preserve the current one in
merge mode. This latest source is included in native exports for future
remapping. Repeated legacy conversion produces stable IDs. Legacy imports keep
an existing display name and callsign when the source has no identity fields.

Reset requires the literal confirmation `RESET`. It clears training records,
private tasks, source archives, and profile settings. It keeps the account,
sessions, and passkeys so the same account can import a fresh backup. Export
before resetting or replacing data you want to retain. Import never writes to
the original personal site.

## Aggregate statistics and access

`account_roles` stores an account ID, role, and original grant time, with one
row per account/role pair. `metrics_viewer` is the only supported additional
role. Ordinary account access requires no role row. Operators grant or revoke
it by verified sign-in email through `mise run stats:grant` and
`mise run stats:revoke`; see [deployment and bootstrap instructions](deployment.md#statistics-access).
There is no dashboard role-management UI or implicit admin bootstrap. Each
metrics API request checks the live grant, so revocation does not depend on
session expiry or profile refresh.

Role grants are not profile preferences and cannot be changed through account
settings, native backups, or imported data. They survive a training-data reset
and cascade when the account is deleted. The privileged operator CLI resolves
the email to the permanent account ID and uses properly quoted SQL literals
because Wrangler's D1 command interface does not accept parameter bindings.
It runs Wrangler with argument arrays, never a shell command assembled from
the email address.

`users.last_activity_day` keeps only the latest server UTC day of meaningful
authenticated workspace access: successful journal, plan, and settings
reads/writes, or a private account operation. Updates are best effort and exclude authentication,
routine account checks, admin statistics, and usage reporting. There is no
per-account activity-event history or corresponding guest activity record.
This installation metadata is separate from exported/imported training data
and survives a training-data reset. Authentication and account-menu checks alone
do not update it; when signing in opens the private workspace, its journal or
plan load counts as activity. Direct statistics access avoids an eager journal
load, and statistics API requests never update the day.

Practice volume comes from a separate first-party `POST /api/practice-usage`
notification for a newly recorded positive-duration practice session. Guest
and account saves send the same single background request with credentials
omitted and only a bounded tool category plus `guest`/`account` category. Class
and zero-time note records, edits, retry uploads, imports, and guest-to-account
transfers do not report another session. Saving and tool behavior do not wait
for metrics, retry them, or queue their delivery. There are no event IDs,
deduplication receipts, account IDs, guest IDs, or browser identifiers in the
counter request or stored counters.

The public counter endpoint validates its small payload and exact same-origin
request boundary. A transient per-Worker-isolate write budget allows a burst of
120 reports and refills at two reports per second. It stores only a token count
and refill time in memory, with no IP, account, browser, or other identity keys.
The budget resets when an isolate is recreated and applies only to that
instance; stronger perimeter protections require separate Cloudflare
configuration. It provides a modest write guard while aggregate counts remain
self-reported and approximate. The endpoint increments `practice_usage` atomically
by `(day, tool, audience)` using the receiving server's UTC day. The nine tool
categories are word listening, QSO practice, story listening, copy, sending,
free practice, Morse Runner, assigned recordings, and manually logged practice.
Audience is a self-reported category, not authentication or identity evidence.
These are approximate received-session counts: offline or failed reports can
be lost, and the request day may differ from a saved entry's calendar date.
They do not represent distinct people, exact completions, or historical account
activity. Totals cover only the selected retained window.

The current UTC day and its 179 predecessors are retained; daily cleanup deletes
older rows. `admin_stats_metadata` stores the collection start day and last
successful cleanup time, with no user identifiers. The console distinguishes
dates before collection began from measured zero activity. Account storage
totals measure stored account payload, separately from database storage and
infrastructure telemetry. Cloudflare monitoring remains the source for detailed
request volume, latency, and failure information; unavailable metrics are
labeled rather than inferred from practice counts. The privacy page explains
this collection without introducing advertising cookies or third-party
analytics scripts.

## Operations and verification

The Intermediate curriculum catalog contains factual assignment identifiers,
session/day mappings, requirements, and official resource URLs. The API derives
dates from the account's course schedule and merges private completion and note
overrides by stable exercise ID. It stores only those overrides, not a copy of
the entire generated plan per account. Exports preserve overrides and the
profile; reset clears both. Matching legacy assignments retain their private
instructions and history without duplicating the generated assignment.

Generated Morse audio is bounded to 20 minutes per rendered round, using mono
16-bit PCM in a Blob URL. A native HTML audio element plays the entire round,
including gaps. The same word timeline provides highlighting and seeking;
animation frames update only the visible interface. Native looping and Media
Session controls do not depend on foreground JavaScript. Blob URLs and media
listeners are released when tracks change or the player unmounts. Optional
spoken answers use checked-in ElevenLabs-generated word WAVs, fetched four at a time
and cached by content hash. The renderer splices three Morse repetitions, the
answer PCM, and all pauses into the same bounded WAV. Playback, native looping,
seeking, and listening credit use the same media clock as Morse-only rounds.
Custom spoken lists require published answer clips; unavailable words produce
an explicit error before playback. See [spoken audio](spoken-audio.md) for
provenance and regeneration. Official recordings stream directly from CWops through native
audio, with only the CWops media origins added to the Content Security Policy.

Web Morse Runner is a pinned, reviewed local dependency, embedded from an exact
same-origin document. Only that document permits same-origin framing; the main
application and API continue to deny framing. Its Content Security Policy allows
connections only to the vendored asset path. The parent verifies message origin,
iframe source, run identity, sequence, elapsed time, and result bounds before
accepting engine events. The iframe receives practice settings, not profile or
account data. This is trusted same-origin code, not an isolation boundary for
untrusted scripts; review vendor updates accordingly. See
[vendor provenance and maintenance](morse-runner.md).

Each runner frame represents one continuous run. Measured audio-engine time,
actual settings, speed changes, and results remain together; wall-clock time is
never substituted for missing events. Backgrounding or stopping the run ends it.
Saving remains explicit, and only the matching saved run clears its unsaved
state. Starting again creates a new frame and run identity.

Bindings and environment types come from `wrangler types`; do not hand-maintain
an alternate Env interface. Apply migrations before deployment. Production
observability logs contain event names and exception classes, not request
bodies, email addresses, codes, tokens, or provider error details. D1 Time Travel
provides operational database recovery; user JSON exports provide portable
per-account backups.

The Worker integration tests run the production schema and SQL against SQLite,
including transactional batches. They cover code expiry and replay, concurrent
consumption, guess limits, failed delivery, origins, session revocation, account
isolation, invalid and repeated imports, rollback, and retained archives. Browser
tests exercise the actual Worker and passkey flows. Run `mise run check`,
`mise run test`, `mise run build`, and the browser suite before deployment.
