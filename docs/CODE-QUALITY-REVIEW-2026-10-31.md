# Website maintainability review, 31 October 2026

Reviewed base: `4ca4f072dd8837c3b71eae276d2663a576fb7e1c` (`origin/master`, freshly fetched).
Worktree: `.worktrees/perseus`, branch `chore/perseus-maintainability-review`.

The best first changes are small dead-code removals, request deduplication, and separating production UI from paid-plan testing. The largest long-term improvement is extracting the editor and persistence coordinator into explicit modules. Deleting billing or old migrations wholesale would break still-connected paths.

This is a repository-wide static review of the 249 tracked files: frontend modules, classic editor scripts and inline handlers, CSS/HTML, Vercel API routes, server helpers, 48 SQL migrations, scripts, configs, workflows, tests, dependencies, documentation and public assets. Findings use reference searches, call tracing and a production build. Targeted inspection covered persistence, authorisation, collaboration, imports/exports, feedback and billing. This is not proof that every runtime branch is unused. No production traffic, database statistics, private books, credentials or hosted environments were inspected. Performance estimates below are structural estimates, not production measurements.

No functional cleanup was applied. This change adds this report and edits comments in eight source files. Recommendations below are separate proposed tasks.

## Findings

### 1. Uncalled reader helpers

Evidence: `web/src/epub-reader.js:54` (`markupParagraphs`) and `:153` (`firstHeading`). Both names occur only at their declarations. Current reading uses `readerBlocks` and `sectionHeading`.

- Unnecessary: these older text-only parsing/heading paths have no callers.
- Impact: remove roughly 40 source lines and one competing description of reader behaviour. Runtime savings are negligible because bundling can eliminate uncalled local functions.
- Risk: low. These are private module functions; check references again when implementing.
- Plan: remove the two helpers, keep shared constants and `cleanText`, then run reader, ruby, import and export coverage.

### 2. Unused frontend wrapper, variables and store method

Evidence: `web/src/loading.js:19` (`withLoading`), `web/editor/adapter.js:195` (`modelSelect`) and `web/src/store.js:167` (`remote.selectProjects`). No application or test calls were found. The collaborator capacity UI calls `remote.configureLaunch`, not `selectProjects`. `web/src/welcome-planet.js` also declares `timer` and clears it in close/destroy, but never assigns a timer handle.

- Unnecessary: a wrapper nobody uses, a DOM lookup whose result is never read, a disconnected JavaScript RPC wrapper, and timeout cleanup for a timeout that is never created.
- Impact: small source/API surface reduction, no intended user-visible change.
- Risk: low for JavaScript removal. Removing `selectProjects` does not establish that SQL `select_editable_projects` can be dropped; SQL dependencies and external callers are a separate boundary.
- Plan: remove these JavaScript declarations and the planet's no-op `clearTimeout(timer)` calls. Verify loader balancing, provider controls, planet close/destroy and capacity selection. Leave the SQL function pending a database review.

### 3. Helpers exercised only by tests

Evidence: `server/billing.js:6` (`grantsPaidAccess` and its `ACCESS_STATUSES` constant), `web/src/entitlements.js:22` (`countSourceCharacters`), `web/src/comment-anchors.js:1` (`makeCommentAnchor`) and `web/src/shared-document.js:66` (`createLocalUndo`). Their external references are in unit tests. Production entitlement resolution has its own status checks; editor review tools construct selection anchors themselves. No application code creates this undo manager.

- Unnecessary: these helpers currently validate APIs that the product does not use. They can make test coverage look broader than the actual runtime coverage.
- Impact: modest source reduction and fewer competing implementations. No measured bundle benefit is claimed.
- Risk: medium. Undo and anchor helpers describe useful behaviour; deleting their tests without moving coverage could lose intended contracts. Do not remove `locateCommentAnchor`, which has a live compatibility role.
- Plan: delete `countSourceCharacters` if no shared counter is wanted. For paid statuses and anchors, either route actual production code through the helper or remove it and test the real path. Remove `createLocalUndo` and its helper-only test if application undo is not planned; do not imply the product supports CRDT undo because this test passes.

### 4. An unreferenced public artwork file ships in every build

Evidence: tracked `web/public/brand/novel-suite-preview.png`, 240,927 bytes. No tracked source, documentation or script references its filename. Current assets and capture scripts use the separate README and social images. Vite copies the public directory into `dist`.

- Unnecessary: appears to be an earlier artwork iteration with no repository consumer.
- Impact: about 235 KiB less deployment output. It is not loaded by the current application, so deleting it does not itself reduce current page requests.
- Risk: medium. External posts or cached social links may still use its public URL. Repository search cannot disprove external use.
- Plan: have the lead check known shared links or available access logs. Remove it if unneeded; otherwise retain a deliberately documented compatibility asset or redirect. Keep the current README/social images.

### 5. Paid UI is still constructed in the free production app

Evidence: unconditional `createPricingPage` and `createUpgradeDialog` calls in `web/src/main.js:104` and `:279`; `web/src/access-mode.js` enables paid testing only in development. `/pricing` redirects to support in community mode. The production JS bundle still contains `cdn.paddle.com`, `PricePreview`, `Choose your paid plan` and `Upgrade your plan`. This proves included code, not an actual Paddle network request on startup.

- Unnecessary: production imports and constructs paid cards/dialogs despite the current free product policy. These are connected components, but they provide no normal production pricing flow.
- Impact: less production JS, DOM construction, CSS and maintenance work. Exact byte savings need a before/after build; the baseline main JS is 282.01 kB, 92.64 kB gzip.
- Risk: medium to high. Capability failures, old checkout links and existing subscription management still need honest behaviour. Server endpoints and database functions are not automatically unused.
- Plan: move paid UI behind an explicit development entry or lazy import. Give production capability failures a free-product-appropriate explanation. Keep `/pricing` support compatibility and review `/welcome` separately. Compare built chunks and test that community navigation makes no Paddle requests. Decide separately whether paid testing is worth retaining.

### 6. Account capabilities require billing queries even during community access

Evidence: `server/entitlements.js:13` always reads configuration, super-user state, beta expiry, customers and price mappings, plus subscriptions when a customer exists. `currentEntitlements` calls `/api/paddle/status` for signed-in projects stored locally. The server still requires `PADDLE_ENV` before returning community capabilities.

- Unnecessary: loading legacy subscription data is unnecessary for callers that only need current capabilities. It remains necessary for callers displaying billing details.
- Impact: a capability-only path could avoid several of the current five or six database requests and a billing configuration dependency. No latency figure was measured.
- Risk: high if implemented as an indiscriminate early return: existing subscribers, `hasPaidAccess`, beta information and billing management would lose data. Cloud project rights also include capacity, roles and prompts.
- Plan: split account capabilities from billing details, with explicit response contracts. Fetch billing only for billing management. Keep owner/project capacity decisions server-authoritative. Add query-count and response-contract tests for community access, paid testing and existing subscriptions.

### 7. Feedback Hub fetches the same list twice when opened

Evidence: `web/src/main.js:654` calls `remote.feedbackTickets()` as a preflight, then `feedbackHub.open()` calls it again in `web/src/feedback-hub.js:14`.

- Unnecessary: the first successful response is discarded.
- Impact: one fewer `feedback_tickets` RPC for each successful open, with less waiting and database work.
- Risk: low to medium. The preflight also selects the legacy admin inbox fallback. `feedbackHub.open()` currently catches errors internally, so simply deleting the preflight changes fallback behaviour.
- Plan: let one fetch own error handling, or pass the fetched tickets to `open`. Test normal, empty, permission-denied and missing-migration cases. Resolve fallback ownership explicitly.

### 8. A feedback badge polls full report descriptions

Evidence: `refreshTicketBadge` in `web/src/main.js:642` fetches tickets every 30 seconds while visible and after hub actions. It only counts `unread`. SQL `feedback_tickets()` returns report descriptions, status and reporter metadata for up to 200 reports in `202610240001_feedback_tickets.sql`.

- Unnecessary: the badge needs a count, not the full report list. Refreshing the page also repeats the admin check and badge request.
- Impact: smaller responses and less repeated JSON/report processing. The count can also represent all unread reports instead of only the list window.
- Risk: medium. The unread result must remain scoped to the current user/admin and must update after reads and replies. A new RPC needs an approved migration plan.
- Plan: first deduplicate in-flight ticket loads and share results during an open hub session. Later add a count-only authorised RPC, or return a summary with a paginated list. Preserve identity checks, visibility handling and failure feedback.

### 9. Shared reader repeats chapter access/comment reads

Evidence: `renderReader` in `web/src/main.js:1079` calls `remote.readerComments(token, chapter.id)` before rendering. It then calls `publicComments.open`, whose `refresh` fetches the same RPC again in `web/src/reader-comments.js:16`.

- Unnecessary: the first response validates access but its comment data is discarded.
- Impact: one fewer RPC per shared chapter render; faster comment display.
- Risk: high if the first check is simply removed. It deliberately blocks cached text after link revocation. Chapter changes and late responses must remain guarded.
- Plan: preserve the pre-render authorisation call and pass that response to the comment view as its initial data. Keep periodic revalidation and generation/token checks. Test revocation, disabled commenting, rapid chapter changes and an unavailable server.

### 10. Collaboration creates a client seed the store discards

Evidence: `web/src/collaboration.js:17` evaluates `createDocumentSeed(project.snapshot)` and passes it to `remote.initializeDocument`. `web/src/store.js:180` accepts `seed` but sends only `action` and `projectId`. The API creates the canonical seed from the server snapshot.

- Unnecessary: the frontend allocates and serialises a full Yjs document for an argument that is ignored.
- Impact: remove an import, unused parameter and full-book startup work. The benefit grows with book size.
- Risk: low for the current store contract; test doubles may have assumed a seed argument. Server-side canonical initialisation must remain.
- Plan: make `initializeDocument(projectId)` the explicit interface, remove the client seed computation, update relevant mocks and verify simultaneous initialisation and offline outbox replay.

### 11. Every collaborative append rereads and replays all history

Evidence: `api/project-document.js:29` pages through all `project_document_updates`, then `server/document-validation.js` reconstructs the document from seed and all updates for every candidate.

- Unnecessary: replaying the entire lifetime of a document repeatedly becomes redundant once a trustworthy checkpoint can represent validated history. Current replay is necessary for the current security contract.
- Impact: high at scale. With N fixed-size appends, replay work accumulates roughly quadratically. Current fixed API reads are supplemented by at least one history query, plus one per additional 1,000 rows.
- Risk: high. Truncating history, adding a row limit or blindly trusting client state can break CRDT dependencies, ruby restrictions and concurrent revision checks.
- Plan: design server-generated checkpoints with an atomic checkpoint revision and bounded tail. Preserve operation idempotency and the final revision-checked append. Test dependent updates, conflicts, ruby permission changes, retries and more than 1,000 updates. Requires a separately reviewed database design and migration.

### 12. Document append reads snapshot data it only uses for initialise

Evidence: `api/project-document.js:17` reads `owner_id,snapshot` for both actions. `owner_id` is not used; `snapshot` is only used inside the `initialize` branch. Append then reads the document seed/history instead.

- Unnecessary: append loads potentially large snapshot JSON and an unused column before validation.
- Impact: one fewer query and less snapshot transfer per append if the project read moves into initialise. Independently, removing the unused selected column is a tiny improvement.
- Risk: medium. That query currently also establishes project existence; preserve permission checks, errors for missing/deleted projects and the final transactional checks.
- Plan: move the snapshot query into the initialise path and select only `snapshot`. Trace the authorisation RPC and final append RPC first; test a deletion or permission change between validation and append.

### 13. Local and cloud controllers repeat the same editing operations

Evidence: `commonEdit` in `web/src/collaboration.js:6` and `web/src/local-document.js:4`; both controllers repeat translation/source replacement, ruby access, anchors and text access around the same shared-document helpers.

- Unnecessary: identical text-diff and document operations are maintained in two places. Persistence and polling are legitimately different.
- Impact: moderate maintainability gain and one place to fix text-offset or anchor behaviour.
- Risk: medium. Local edits notify/persist differently from remote-origin updates; over-generalising the entire controller could erase those distinctions.
- Plan: extract the pure edit-range function first. Then share a small document-operation layer if it stays simpler than duplication. Keep queueing, notification timing, network retries and shutdown in their existing controllers. Test insertion/deletion, emoji, source edits, ruby anchors and pending startup edits.

### 14. EPUB path/package/parsing logic has drifted across subsystems

Evidence: `source-import.js`, `epub-reader.js`, `epub-deletions.js`, `image-assets.js`, `project-covers.js`, editor `parseEpub` and `server/reader-preview.js` each resolve archive paths or parse package metadata. Cover code alone has browser/server variants with different XML APIs, limits and guide fallback behaviour.

- Unnecessary: multiple implementations of path resolution and package lookup make fixes easy to miss. Import text extraction, reader rendering, thumbnail extraction and server previews have different output and trust requirements.
- Impact: high maintenance/security value from a shared contract; likely modest raw code savings initially.
- Risk: high if all parsers are merged wholesale. Browser/server XML APIs differ; replacing bounded stream readers with `entry.async` would weaken current limits. Kobo markup, gaiji, ruby, navigation titles and image-only spine fragments need distinct treatment.
- Plan: first share pure archive-path rules and fixtures. Extract package/manifest lookup behind environment-specific XML adapters. Keep consumer-specific limits and projections. Audit unbounded image/import reads separately; do not replace safe reader code with the least restrictive implementation.

### 15. Hosted editor still carries replaced standalone paths

Evidence: engine `doEpubExport` is replaced by the host action at `web/editor/adapter.js:520`; `legacyInject` and the adapter `injectTranslation` wrapper only serve the old export chain. Hosted export uses `web/src/epub-reader.js`. The adapter blocks legacy drop handlers, hides/reassigns load buttons, replaces `renderList` and wraps many other globals. The build always loads `prompt.js`, while the engine retains a large Japanese-to-English fallback after `DuskTranslationPrompt`.

- Unnecessary: hosted execution pays the reading/debugging cost of old exporters, UI handlers and prompt fallbacks that are replaced or bypassed in the normal build.
- Impact: substantial simplification of the classic editor source and fewer misleading paths during incident debugging. Raw source savings are plausibly hundreds of lines, but the reachable set must be measured before deletion.
- Risk: high. Inline HTML handlers and script load order are real callers. `parseEpub` in the adapter remains a live fallback for projects without a snapshot. Functions captured as `original*` still run and cannot be deleted merely because they are reassigned. Resume recovery and old backups remain supported.
- Plan: map each replaced function and inline handler; remove the old export chain first with host export coverage. Move hosted prompt requirements into an explicit initialisation contract. Remove obsolete import/drop UI only after confirming every entry point. Keep historical standalone builds on their existing branch; no desktop work is needed.

### 16. Build-time string replacement changes translation behaviour

Evidence: `scripts/prepare-editor.mjs:6-7` patches retry conditions with literal `.replace` calls. A source wording change can silently stop either patch matching. Other replacements inject title, CSS and scripts.

- Unnecessary: correctness fixes are encoded as source-text rewrites even though the engine is already maintained in this repository.
- Impact: high clarity for little code change; source behaviour becomes inspectable without mentally applying build transformations.
- Risk: medium. The abort guard and acceptance of short translations are behaviour fixes, not dead code.
- Plan: apply those two conditions directly to authored engine source and remove the corresponding transforms. Keep packaging steps explicit, and assert any remaining insertion anchor exists exactly once. Verify cancellation, short outputs and generated-editor startup.

### 17. `main.js` owns too many unrelated lifecycles

Evidence: the base `web/src/main.js` is 2,060 lines and owns auth, routing, library rendering, account UI, feedback, reader, chapter management, prompts, workflow, export, iframe dispatch, locking and two persistence queues. Dense one-line handlers make asynchronous control flow harder to review.

- Unnecessary: the coupling forces unrelated changes to share global state and complicates error ownership. The features themselves are in use.
- Impact: high maintenance value; extraction alone does not guarantee smaller bundles or faster runtime.
- Risk: high for persistence/auth extraction. `generation`, `persisted`, `draftQueue`, project identity and release locks encode data-loss protections.
- Plan: extract feedback and account view controllers first, then reader/export coordination. Give the iframe bridge explicit message contracts. Extract persistence only after substantial-content save/reopen/export/backup tests cover interleaved edits, failures and navigation. Format touched handlers into readable blocks as they move, without a repository-wide reformat.

### 18. Polling and cover loads can do avoidable work

Evidence: collaboration, presence and editor comments each poll at roughly five seconds. Badge and reader comments poll every 30 seconds; quota status every 60 seconds, plus refreshes after quota operations. The gallery's `loadFile` callback at `main.js:875` uses `remote.open`, which reads snapshot metadata and downloads the original book, even though it only needs the file. Gallery and Continue can request the same book through separate attachments.

- Unnecessary: independent consumers can repeat reads of unchanged data. The thumbnail path fetches more than a cover requires. Polling itself is not dead code.
- Impact: potentially large network/CPU savings for long sessions and large EPUB libraries, but actual rates depend on which views and projects are open.
- Risk: medium to high. Hidden comments still feed editor gutter markers; presence must expire; collaboration must reconnect and deliver remote changes. Caches must not expose one account's books to another or keep stale files after replacement/deletion.
- Plan: deduplicate in-flight cover work by account/project/file identity and use a file-only store operation. Consider derived cover storage only with an approved data plan. Share visibility/lifecycle handling across pollers and measure before adding realtime infrastructure. Do not stop essential sync simply because its panel is closed.

### 19. A legacy feedback renderer remains as an error fallback

Evidence: `showFeedbackInbox` in `main.js:582` and `remote.feedbackInbox` still run if the ticket preflight fails for an admin. `feedback-hub.js` is the primary UI. Both render reports, signed screenshots and deletion controls; they share the same dialog.

- Unnecessary: a second full renderer duplicates report UI. It still has a caller, so this is a retirement candidate rather than confirmed dead code.
- Impact: remove roughly 25 dense lines from `main.js` and one JavaScript store wrapper, with less divergent error handling and dialog state.
- Risk: medium. It covers deployments where ticket migrations are missing. Switching from the primary hub to the fallback also leaves the primary hub's filter in the same dialog.
- Plan: verify supported schema versions with the lead. Once ticket schema availability is an explicit minimum, use a clear upgrade/unavailable error and retire the fallback renderer. Do not delete historic feedback migrations or old reports.

### 20. Language and validation metadata is duplicated

Evidence: language names in `web/src/languages.js`, `web/editor/adapter.js` and `web/editor/prompt.js`; novel-shape validation in `web/src/model.js` and editor `checkNovel`. Prompt fallback text also contains Japanese-only assumptions.

- Unnecessary: adding a supported language or tightening chapter IDs needs edits to multiple maps/validators.
- Impact: moderate reduction in drift, especially for `zh-Hans`, route support and malformed chapter handling.
- Risk: medium. Classic scripts cannot simply import host ES modules. Host validation at a trust boundary must remain even if the editor validates too. Some duplicate validation is deliberate defence.
- Plan: share immutable language metadata through a generated classic-script asset or an explicit module conversion. Preserve the approved route matrix. Define shared validation fixtures first; consolidate validation only where it preserves independent boundary checks and normalisation.

### 21. Tests and operational files contain retired-path debt

Evidence: `config/playwright.paid.config.js` runs only through a direct config invocation; there is no package script or CI step for it. Normal browser config explicitly ignores `pricing.spec.js`. `scripts/seed-staging.mjs` is not invoked by current package scripts or workflows, and the staging workflow explicitly uses browser-local storage. `.gitignore` repeats `.vercel` and overlapping `.env` rules.

- Unnecessary: paid tests can silently drift if their retained mode has no maintained verification entry. The seed script appears disconnected from current operations. Duplicate ignore entries add small reading cost.
- Impact: modest cleanup and clearer test/operations ownership. The paid config is reachable manually and should not be labelled an unused file solely because CI omits it.
- Risk: medium for retiring paid tests or the seed tool; confirm no manual maintenance procedure still relies on them. Low for deduplicating identical ignore rules, but preserve credential exclusions and `.env.example`.
- Plan: if paid testing remains, add an explicit script and decide its verification schedule; otherwise retire its dedicated UI/config/tests together. Archive or remove the seed script after confirming the current workflow. Remove duplicate ignore entries after comparing ignore behaviour. Never run the seed script to determine whether it is needed.

### 22. Tests inspect source text instead of exercising clear interfaces

Evidence: `tests/library-refresh.test.mjs` slices a function body out of `main.js` and executes it through `AsyncFunction`; several security/workflow tests use regex assertions over source and SQL.

- Unnecessary: implementation spelling becomes part of the test contract; moving a correct function can break tests, while a matching string does not prove enforcement.
- Impact: significant refactor freedom and more reliable regression coverage when tests exercise extracted behaviour.
- Risk: medium. Security grep checks can still catch accidental unsafe constructs and should supplement behaviour tests. Removing them all at once would weaken coverage.
- Plan: move refresh coordination behind an injectable module, then test results, stale responses and loader balancing through its exported function. Preserve useful static security checks while adding HTTP/SQL permission behaviour coverage at real boundaries.

### 23. Migration version collision and historical schema cannot be cleaned like source

Evidence: two files use version prefix `202610100001`: `feedback_inbox.sql` and `web_novel_reader_metadata.sql`. The PGlite helper executes sorted filenames and does not model a production migration ledger keyed by version. Many SQL functions are deliberately replaced or renamed across later migrations; triggers and RLS call functions without JavaScript references.

- Unnecessary: the duplicate version identity is ambiguous operational debt. Historical definitions may be obsolete in the final schema, but their migration steps remain necessary for replay and deployed history.
- Impact: high release safety from resolving the collision and documenting the schema baseline; no runtime speed gain from merely deleting old SQL files.
- Risk: high. This review did not verify a Supabase CLI failure or inspect deployed migration ledgers. Renaming, squashing or deleting applied files can desynchronise existing databases. Unused indexes cannot be established without workload/statistics evidence.
- Plan: have the lead compare authorised environment migration ledgers with filenames before choosing a repair. Use a reviewed forward-compatible reconciliation/baseline plan. Add an offline duplicate-version check for new migrations. Preserve RLS, triggers, grants, counters and historical data until their replacement is verified. Do not perform opportunistic database cleanup in the JavaScript pass.

### 24. Current technical/operations documentation contradicts the code

Evidence: `docs/ARCHITECTURE.md` describes a text-only reader, Google redirect auth and universal Japanese source metadata. `docs/TECH-STACK.md` still documents 20 MB uploads/100 MB expanded archives and only two AI providers; current code uses 50 MB uploads/500 MB expanded EPUB checks and supports more providers. `docs/RELEASE-WORKFLOW.md` correctly describes Git-based release at the top, but later says merging applies migrations and directs daily branching from staging. Its feature-preview table still assumes a staging Supabase project.

- Unnecessary: conflicting current-tense instructions invite incorrect fixes or release steps. Historical security reviews, incident notes and dated implementation reports can remain useful as history.
- Impact: high onboarding/release clarity, with no runtime change.
- Risk: medium. Rewriting every historical document as current would erase incident and design evidence. Confirm live operations with the lead, not from filenames or old memory.
- Plan: make architecture, setup and ordinary release instructions describe the current code and lead-approved process. Move optional managed migration workflow into a clearly separate runbook. Mark dated offers/drafts/implementation notes as historical and link one current authority. Update the release-candidate-specific `AGENTS.md` instruction to match future isolated worktree practice when approved.

### 25. Signed-in local projects are routed to cloud comment APIs

Evidence: `web/src/comments.js:38` selects local comments only when `current.owner === 'guest'`; its write path uses the same distinction. `web/src/main.js` supports account-owned projects with `storage: 'local'`, and its `isCloud` predicate explicitly accounts for that flag.

- Flaw: ownership and storage location are different properties. A signed-in local project takes the cloud comment path even though it has no corresponding cloud project. This is a source-confirmed branch mismatch, not a browser-reproduced incident.
- Impact: correcting the routing should make comments available on account-owned local projects and avoid unnecessary failing RPCs. It does not justify moving existing comments between accounts.
- Risk: medium. Hard-coded guest keys also need replacing on the local path. Preserve account isolation, guest behaviour, viewer restrictions and existing local records.
- Plan: define a consistent project-storage predicate and pass the correct account identity into local comment reads/writes. Add regression cases for guest local, signed-in local, owned cloud and shared cloud projects, including account switching. Do not migrate or upload user comments implicitly.

### 26. Reader access errors can be overwritten with a success status

Evidence: `renderReader` in `web/src/main.js:1079` catches a failed shared-reader access check, writes the error status, closes comments and returns normally. `presentReader` awaits that function and then writes `Ready to read`. The web-novel shared-reader branch also sets a success status after awaiting `renderReader`.

- Flaw: a normal return represents both successful rendering and failed authorisation. Callers cannot distinguish them and may announce success after content was withheld. This is visible in source control flow; the failing sequence has not been reproduced in a browser.
- Impact: honest reader status and clearer error ownership. This finding does not demonstrate a content-access bypass; the early check clears content before returning.
- Risk: medium. Propagating an error changes which caller handles it. Preserve access revocation, stale-render guards, retry behaviour and readable failure messages.
- Plan: make render success explicit, through a result or propagated error, and update every caller before changing the status handling. Test revoked links, server failures, an error during initial opening and rapid chapter navigation. Combine the implementation with finding 9 only if authorisation and request deduplication remain independently tested.

### 27. Persistence has an implicit state machine spread across globals

Evidence: `web/src/main.js` coordinates `generation`, `persisted`, `saveTask`, `saveTimer`, `draftQueue`, project `dirty`, `saveError` and project identity across editor messages, `flush`, export and navigation. This expands the persistence concern in finding 17.

- Unnecessary complexity: each caller needs to understand which writes have reached browser storage, which have reached the cloud, and whether newer edits arrived during an upload. Those distinctions are necessary; their scattered ownership makes changes difficult to assess.
- Impact: an explicit persistence controller would make transitions, failure recovery and acknowledgement rules easier to test. This is a design concern, not a claim that the current queues are redundant or that existing data loss has been proved.
- Risk: high. Flattening these states into one boolean can acknowledge unsaved edits or discard a recoverable draft.
- Plan: document the current transitions first, then extract one controller with explicit edit/saved versions and ordered write ownership. Exercise edits during a slow save, failed browser writes, failed cloud writes, project switching, export and retry with substantial content. Preserve existing safeguards until replacements pass those cases.

### 28. Several names obscure identity, scope or purpose

Evidence and proposed names:

| Current name | Proposed name | Reason |
| --- | --- | --- |
| `active` | `activeProject` | Identifies the object held by the coordinator. |
| `owner()` | `currentAccountId()` | Returns the current identity or guest identity, which may differ from the actual project owner. |
| `projectCollaboration` | `activeDocument` | Holds either a cloud collaboration controller or a local document controller. |
| `libraryRequest` | `libraryRefreshSequence` | Counts refresh attempts to reject stale responses; it is not a request object. |
| `generation` / `persisted` | `editVersion` / `savedVersion` | Makes save acknowledgement comparisons easier to understand. |
| `billingRequest` | `authenticatedRequest` | Also handles account preferences and translation quota. |

- Unnecessary ambiguity: readers must infer semantics from surrounding code, especially in dense asynchronous handlers. Names such as `p`, `next`, `value` and `state` become hard to follow when their scope spans several operations.
- Impact: modest readability improvement and fewer mistakes involving account identity, storage location or save versions. No runtime improvement is expected from renaming alone.
- Risk: low for private bindings, higher for classic-script globals and source-inspecting tests. `owner()` is used in several account-scoped cache keys, so its semantics must remain unchanged during a rename. Persisted fields such as `jp_char_count` are compatibility contracts and must not be renamed casually.
- Plan: rename private bindings within focused refactors, update every reference and keep behavioural changes separate. Prefer descriptive names in long handlers; keep short loop variables in small scopes. `releaseNoticeLastInteraction` and similar longer names are sufficiently specific and do not need shortening merely because they are long.

The feedback error-ownership concern raised in the follow-up is already covered by findings 7 and 19. The editor override chain, duplicate document operations and repeated CRDT replay are covered by findings 11, 13, 15 and 16. These cross-references avoid recording the same issue as separate discoveries.

## What should stay

All ten declared direct packages have real consumers. Paddle JS is used by retained pricing UI; Paddle's Node SDK is used by server processing. `sharp` and `@xmldom/xmldom` serve reader previews, JSZip serves archive work, Yjs serves documents, and PGlite/Playwright/Vite support tests and builds. No direct package is confirmed entirely unused. Remove packages only after their consumers are removed, then regenerate and verify the lockfile. Do not manually strip transitive lockfile entries.

No authored JavaScript module or API route was confirmed wholly unreferenced. Public APIs may have external consumers; SQL/RLS/trigger functions have callers outside the import graph. Static HTML pages are explicit Vite entry points, so absence of a JS import does not make them dead. Fonts have CSS references. The editor's generated public copies are ignored build output, not independent abandoned implementations.

Keep local storage upgrades, snapshot sanitisation, same-origin iframe checks, revision locks, partial translation recovery, dirty drafts, public-reader revalidation, owner scoping, upload reservations, webhook signature verification and idempotent billing writes. A fallback that supports old stored books has value even if it is uncommon. Free product access does not mean administrative access, unlimited cloud storage or permission to drop billing records.

CSS is layered across base, glass, gallery, reader, welcome and motion styles. Overrides alone do not prove a rule is unused: media queries, theme state, focus/touch classes and dynamically built DOM matter. Consolidate component ownership while changing each area, with computed-style/visual checks. No bulk selector deletion is justified by this review.

## Cleanup order

1. **Small source-only pass, about half a day:** findings 1, 2 and 10; resolve helper-only APIs in 3. Re-run affected tests and the build. Check external asset use before doing 4.
2. **Request and UI pass, about one to three days:** findings 5, 7, 9 and the in-flight cover deduplication in 18. Retire 19 only after schema support is agreed. Keep request counters in tests so redundant reads do not return.
3. **Documentation and test maintenance, about one to two days:** findings 16, 21, 22 and 24. Keep each change independently reviewable. Some test extraction work overlaps the module refactor.
4. **Larger refactor, several focused tasks:** findings 13, 14, 17 and 20. Extract pure helpers and low-risk views first; measure before/after complexity and test coverage. Avoid changing persistence contracts and presentation at the same time.
5. **Separate backend/data proposal:** findings 6, 8, 11, 12 and 23. App-only query projection changes can be isolated first. Database/RPC changes need the lead's reviewed migration and deployment plan. No database changes are part of this review.

These are rough engineering estimates, excluding release review and any investigation of live migration history. Each implementation task needs a complete change list and focused verification. Comments should explain constraints, ownership or surprising behaviour; narrating obvious assignments adds maintenance work.

Findings 25 and 26 should be prioritised for focused bug reproduction and tests before broad refactoring. Finding 27 belongs with the later persistence extraction; finding 28 can be addressed incrementally as each module changes.

Implementation is on hold pending Eye and the Lead Agent's review and explicit go-ahead. The report and previously requested comment edits remain the complete prepared change; no functional cleanup, commit, push, deployment or database modification is authorised by that review hold.

## Comment changes in this worktree

- `web/src/main.js`: project versus account rights, pre-render share validation, save-generation acknowledgement and ordered draft writes.
- `web/src/collaboration.js`: minimal edit ranges and inclusive polling/deduplication.
- `web/src/project-covers.js`: invalidating stale queued and in-flight covers.
- `web/editor/engine.html`: fix a misplaced, duplicated dev-log/archive comment.
- `server/document-validation.js`: why validation reconstructs the whole document.
- `server/entitlements.js`: why community capabilities do not erase subscription details.
- `api/project-document.js`: why the append RPC must recheck the validated revision.
- `api/paddle/webhook.js`: remove a generic HTTP retry comment; retain signature and sensitive-log explanations.

Wording follows `Projects/AI Prompt for Human Writing.md`. No annotation claims that a proposed cleanup has already been implemented.

## Validation and handback

`npm ci` installed 52 packages; its audit reported zero vulnerabilities. npm reported that esbuild's postinstall was blocked by its script policy; the existing binary nevertheless built successfully. No approval setting was changed.

Baseline `npm test`: **118 passed, zero failed**. Baseline `npm run build`: **passed**, 141 transformed modules. Main CSS: 72.43 kB, 15.54 kB gzip; main JS: 282.01 kB, 92.64 kB gzip; JSZip chunk: 97.33 kB, 30.28 kB gzip. These are existing build sizes, not cleanup savings.

After comment edits, Rollup's parser produced structurally identical executable ASTs for every changed JavaScript file and every inline script in the changed HTML file, ignoring source offsets. Non-script HTML was also unchanged. `git diff --check` passed.

Final `npm test` after comment edits: **118 passed, zero failed**, in 25.2 seconds.

`npm run test:e2e`: **105 passed, zero failed**, in five minutes, against a fresh production build in this worktree. This includes automated persistence, backup restore, export, partial recovery, provider, reader and responsive-layout checks. Tests generated screenshots; they were not manually inspected. The separate auth, module and retained paid-mode browser suites were not run for these comment-only edits. No test assertions were changed or weakened.

No visual inspection or live Supabase/cloud/collaboration acceptance was performed. No database, dependency manifest, lockfile, runtime configuration, security policy or application logic was changed. All work remains uncommitted for review; nothing was pushed, merged or deployed by Perseus.

To inspect the report and comments, use this worktree's files and `git diff`. A local-only preview can be started from this worktree with `VITE_LOCAL_ONLY=true npm run dev`; it does not establish live cloud behaviour. Decisions needed for later cleanup: whether paid testing and old-schema feedback support remain maintained, whether the unreferenced artwork URL has external consumers, and how the lead wants to reconcile migration identities. No commit wording or release approval is needed to review these uncommitted changes.
