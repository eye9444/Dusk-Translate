# Security review: 2026-10-05

Scope: source-assisted security testing of DuskTranslate, its production HTTP
endpoints, and the connected Supabase database. Exploit reproductions involving
data changes used disposable local PostgreSQL/PGlite databases and synthetic
EPUBs. Existing production customer, subscription, transaction, project, comment,
and Paddle notification records were not removed. No real payment was taken.

## Findings and remediation

| Finding | Impact | Remediation |
| --- | --- | --- |
| Document SELECT policies called a function revoked from authenticated users | Authorized owners/editors could no longer read collaborative state. Reproduced locally and with a read-only production query. | Migration `202610050003_document_read_policy.sql` adds an authenticated-session wrapper and updates both policies. Arbitrary-actor helper stays server-only. |
| Image replacement accepted another project's object path | A project could depend on a file controlled by another project's editors; cross-project assignment reproduced locally. No unauthorized byte disclosure demonstrated. | Migration `202610050004_image_comment_security.sql` binds exact owner/project/image/MIME path and checks stored size/MIME. |
| Deleting private comments restored posting capacity | Create/delete cycles bypassed the 30-posts-per-minute limit. | The same migration records posting attempts independently of message/thread deletion, serializes checks, and preserves recent pre-existing usage. Browser roles cannot access this accounting table. |
| Public snapshot exposed partial and excluded translations | Link recipients could inspect drafts that were not displayed by the reader. | Migration `202610050005_public_reader_snapshot.sql` returns only selected translations of a complete edition; incomplete editions return no translations. Comment anchors use that same edition. |
| Repeated EPUB image references multiplied allocations | A small compressed archive could cause repeated large image allocations and browser memory pressure. | Reader caches image URLs by normalized archive path, bounds streamed decompression, references, spine entries, DOM traversal and depth, and revokes URLs on failure. |

All three additive database migrations were applied through Supabase MCP during
this review. The frontend fixes require deployment of the accompanying commit.

Public reader links intentionally allow access to the complete original EPUB.
Export exclusions are not a confidentiality boundary for that original file.
The link-creation dialog now states this explicitly. Sharing only a sanitized
publication artifact would require a separate publishing change.

## Verification

- `npm test`: 43 tests passed, including owner/editor/viewer/outsider document
  reads; private comment deletion, isolation, expiration and migration backfill;
  exact image-object binding; and public snapshot draft filtering.
- `npx playwright test --config=config/playwright.modules.config.js tests/modules/epub-reader-limits.spec.js`:
  8 tests passed, covering normalized image reuse, allocation cleanup, excessive
  image references, decompressed markup/image sizes, nesting, repeated spine
  entries, and cumulative byte processing.
- `npx playwright test --config=config/playwright.config.js tests/browser/library.spec.js -g 'untrusted titles'`:
  passed against a fresh production build.
- Production anonymous requests to billing status, portal, checkout, project
  documents, translation quota, and account preferences returned 401. Forged
  unsigned JWT requests returned 403. These denials establish rejection, not
  successful authenticated behavior.
- A webhook with an invalid signature returned 500 (non-2xx); no billing event
  was accepted. The automated suite verifies raw-body signature tampering.
- `/.env`, `/.env.local`, `/.git/config`, and `/server/supabase.js` returned 404.
- Production CSP, frame, MIME-sniffing, HSTS, and referrer headers were present.
- All application tables had RLS enabled. Live privileged-function grants were
  inspected. The books bucket is private. After migration, session-bound reads
  execute while arbitrary-actor access and browser posting-ledger access remain
  denied. Public draft filtering and replacement binding were checked live.
- `npm audit --omit=dev`: no reported production dependency vulnerabilities.

## Remaining checks and limits

- Supabase's security advisor reports leaked-password protection disabled.
  Enable it in Auth password settings if available for the project's plan.
- End-to-end production browser testing with two distinct signed-in accounts
  was not performed in this pass. Repeat owner/editor/viewer revocation, image
  replacement, portal ownership, and reconnect flows with designated accounts.
- Supabase warnings about exposed SECURITY DEFINER RPCs are not automatic
  vulnerabilities: some are intentional authenticated or token-scoped entry
  points. Their presence must continue to receive authorization review.
- This was a bounded source-assisted review, not independent certification or
  exhaustive load testing. No denial-of-service traffic was sent to production.
- Browser-to-provider translation and local tools retain the agreed modified-
  client limitation. This pass does not claim tamper-proof client execution.
- Live purchase/renewal acceptance, Paddle approval, and complimentary founder
  plan administration are separate release work, not certified by these tests.
