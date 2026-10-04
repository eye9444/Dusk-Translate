# Launch implementation and release gate

Status: **in progress, not approved for live release**.

## Confirmed offer

- Starter: Free, no checkout or trial.
- Pro: USD 5/month or 50/year, seven-day trial.
- Teams: USD 8/month or 80/year, seven-day trial.
- Each person subscribes individually. Their plan controls premium tools and
  translation usage in both owned and shared projects.
- The owner's plan still controls owned project count, total stored bytes, and
  the 2/5/10-person cap. Internal `advanced` means Teams for compatibility with
  existing subscriptions. No lead-paid seat bundle is implemented.
- AI requests remain browser-to-provider. No provider API key enters quota,
  billing, preferences, or server requests.

## Implemented locally

- Highest eligible recognized-price entitlement resolution; active/trialing grant
  access, scheduled cancellation does not revoke early.
- Server-created checkout associations, stable account ownership, portal/status
  identity isolation, placeholder event-clock repair, and operator-only exact
  verified-email reconciliation. Welcome waits for provisioning.
- New sandbox prices and one paid card containing Pro/Teams choices beside
  Starter. Monthly/yearly previews and checkout use Paddle's exact formatted
  totals and price IDs. See `PADDLE-SANDBOX-OFFER.md` for permanent IDs.
- Protected spending-notice preference, guest session dismissal, personal daily
  cloud reservations, heartbeat, full-output commit, release, and durable retry
  queue. Quota counts saved source Unicode code points, not prompt/output.
- Cloud project/storage accounting and upload reservations, invitation/acceptance
  seat enforcement, preserved records on downgrade, and owner selection screens
  for editable projects and active collaborators. Archived projects count.
- Server-validated Yjs updates, revision fencing, and personal ruby authorization.
  Direct authenticated access to old unchecked document RPCs is revoked.
- Crown/upgrade controls and action checks for consistency, ruby, export chapter
  selection, and custom prompts. Image replacement has a paid-action check.
  Translated TXT import is hidden/blocked for Free cloud callers. Ordinary paste
  and source-book import are unchanged.
- Free full exports ignore premium chapter exclusions without erasing preferences.
- Shared fidelity prompt plus Teams project instructions. Protected cloud
  instructions are applied only for a Teams caller; local instructions are
  device-stored for signed-in Teams users.
- Public reader comment storage and UI: signed-in posting, author edit/delete,
  owner moderation, plain-text rendering, 2000-character cap, 5/minute and 50/day
  rate enforcement, stale anchors, and access validation on navigation/polling.
  Public comments never expose private editor threads.
- Reader-link eligibility follows the publishing editor's own Teams plan and
  continuing edit access. Suspension/revocation preserves tokens and comments;
  explicit re-enabling after revocation issues a new token.
- Optional bidirectional proportional Japanese/English linked scrolling, including
  mobile controls. It aligns scroll progress, not matched paragraphs.
- Signed-in users can explicitly create device-only projects. Personal paid
  entitlements unlock local ruby and image replacement without uploading the
  project or AI key. Anchored ruby and replacement blobs persist in IndexedDB,
  survive reopen, are included in schema-v3 backups, and feed translated EPUB
  output. Published ruby is emitted as escaped XHTML.
- Collaborator-facing public-link management and a visible personal quota meter
  are implemented. Reader-comment browser behavior now covers sign-in gating and
  plain-text rendering in addition to database authorization/rate tests.

## Unfinished release blockers

- Full cloud acceptance: concurrent PostgreSQL sessions, storage/invitation races,
  personal quota expiry/UTC rollover/recovery, downgrade during in-flight commits,
  account switching, and failed saves. PGlite is not a production race test.
- Deployed sandbox checkout/provisioning/portal and notification replay verification
  after schema deployment, followed by penetration testing.
- Provider/domain approval, a future regional-price review, and the live webhook
  destination/environment deployment. The permanent live catalogue now exists;
  see `PADDLE-LIVE-OFFER.md`. No regional overrides were added.
- Approval workflow is post-launch backlog, semantic discovery far-future backlog:
  see `POST-LAUNCH-ROADMAP.md`. Neither is an advertised shipped benefit.

## Deployment order

1. Apply additive feature migrations `202610030001` through
   `202610040001_settlement_and_publishing` in filename order alongside the matching
   app deployment. They remain pending remotely. The independent
   `202610040002_billing_rpc_permissions.sql` security hotfix was applied through
   Supabase MCP on October 4 and verified: browser roles cannot execute any of the
   three Paddle mirror RPCs; service_role can. Do not reapply it or replace an
   already-applied migration. Dashboard-created baseline tables exist despite
   the initially empty migration history; do not recreate those tables.
   Apply `202610040003_server_operation_permissions` and
   `202610050001_live_prices` with the feature migrations:
   it removes explicit Supabase API-role grants from server-only operations and
   the retired unchecked document writers. Do not deploy these enforcement changes
   ahead of the updated app. Review remaining function grants before release.
2. Server-only: `PADDLE_ENV=sandbox`, `PADDLE_API_KEY`,
   `PADDLE_NOTIFICATION_WEBHOOK_SECRET`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`. Configure the database
   `launch_configuration.environment` to match explicitly.
3. Browser: `VITE_PADDLE_ENV=sandbox`, `VITE_PADDLE_CLIENT_TOKEN=test_...`.
   Production uses the `VITE_PADDLE_LIVE_PRICES` mapping documented in
   `PADDLE-LIVE-OFFER.md` and its matching protected billing-price rows.
4. Deploy browser/server together after migrations. New handlers fail closed
   without the schema. Never prefix server secrets with `VITE_`.
5. Server API permissions must include transaction creation and customer portal
   sessions, not just reads. Webhook verification uses the independent signing secret.
6. Inspect failed webhook deliveries before replay. Manually review verified,
   exact-email matches before invoking `reconcile_sandbox_customer`; ambiguous
   matches require review. Never authorize portal access through email matching.
7. Run acceptance/security tests before enabling live checkout. Configure the
   approved live domain/default payment link separately. The owner reports that
   Paddle payout settings are configured; dashboard verification remains external.

The available local environment lacks `PADDLE_API_KEY`, `SUPABASE_URL`, and
`SUPABASE_SERVICE_ROLE_KEY`. This does not assert anything about Vercel settings.
The separately connected Paddle MCP created and read back the revised sandbox
prices. Existing Paddle products/prices, customers, subscriptions, transactions,
and webhook infrastructure were retained; existing subscribers were not repriced.

## Verification

- 37 Node tests passed, including local ruby persistence and explicit API-role grant regression tests,
  personal-plan isolation, upload upsert,
  billing identity, quota foundations, reader comment authorization/rates,
  ruby write validation, and downgrade preservation.
- All 58 production-build browser tests passed in one uninterrupted run, including
  pricing, linked scrolling, spending consent, crown/upgrade dialogs, existing ruby
  preservation, image management, retries, responsive layouts, and review controls.
- All 13 authenticated-development browser tests passed, including email/Google
  authentication and paid ruby/image persistence in a signed-in device-only project.
- Both source-module integration tests passed: reader-comment sign-in/plain-text
  behavior and escaped ruby publication in translated EPUB XHTML.
- Production Vite build and whitespace diff check passed.
- Sandbox price preview was exercised; no checkout completion was performed during
  this continuation. Model prompt fixtures do not prove absence of hallucinations.

```sh
npm test
npm run test:e2e
npm run test:auth
npm run test:modules
npm run build
```
