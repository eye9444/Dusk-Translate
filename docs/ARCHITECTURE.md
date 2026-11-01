# DuskTranslate Architecture

This document describes the active hosted application. Historical standalone HTML releases live on the `legacy-standalone` branch and are not the source of truth for the hosted library shell.

## Runtime boundaries

- `web/index.html` is the public library shell, authentication dialog, import flow, project list, and host-side persistence coordinator.
- `web/src/main.js` owns UI state, authentication events, project lifecycle actions, and communication with the embedded editor.
- `web/src/store.js` owns IndexedDB and Supabase access. Local metadata and original files use separate IndexedDB stores so listing projects does not load every book into memory.
- `web/src/model.js` owns snapshot validation, file validation, progress calculations, and data-shaping helpers shared by the host.
- `web/src/source-import.js` imports EPUB, TXT and source JSON. `web/src/languages.js` defines supported language routes; `language-preferences.js` handles account and guest defaults.
- `web/src/auth-storage.js` is the storage adapter for the Supabase session. The remember-me choice determines whether auth tokens use persistent or session storage.
- `web/src/epub-reader.js` parses EPUBs into text, ruby and illustration blocks, and builds translated EPUBs from project snapshots. `ruby-renderer.js` constructs safe reading DOM. Web-novel projects can be read and exported without an original EPUB.
- `web/src/comments.js` handles private editor threads. `reader-comments.js` handles public reader comments separately. Shared-reader chapter navigation revalidates access before showing cached text; failed or stale rendering cannot announce success.
- `local-document.js`, `collaboration.js` and `shared-document.js` manage Yjs text, ruby and anchors. Local document state stays on the device; cloud edits use a durable local outbox and server-validated updates.
- `web/editor/adapter.js` bridges the translation engine to the host with same-origin `postMessage` events. It prevents the engine from loading a second book and emits resumable snapshots.
- `web/editor/engine.html` is the hosted editor source. It is copied into `web/public/editor/index.html` and augmented with the adapter by `scripts/prepare-editor.mjs` during development and build.
- `api/` contains Vercel handlers for validated document updates, quota, account preferences, reader previews and retained billing operations. `server/` contains their shared server-side helpers. A Vite dev server serves the frontend; it does not execute these serverless handlers.

## Data flow

1. The library validates an imported EPUB, TXT, JSON, or backup ZIP before creating a project.
2. Local projects store metadata and snapshots in the `projects` IndexedDB store and the original file in `projectFiles`.
3. The editor receives the project through a same-origin iframe message and returns snapshots through `editor:state` messages.
4. Autosave updates local metadata with `local.patch`, avoiding repeated writes of the original file.
5. Cloud projects upload the original file to private Supabase Storage and store snapshots, document updates and related project data in PostgreSQL. Signed-in users can also keep projects local; guest projects are not silently uploaded at sign-in. Local comments remain in the guest or account namespace that owns the local project.
6. Provider API keys are excluded from snapshots, backups and cloud rows. Keys normally stay in the editor session. Optional device storage remembers provider settings in localStorage with a 30-day expiry; it is separate from Supabase login storage.
7. The reader accepts a local EPUB, a project's original file, a completed selected translated edition, or a web-novel snapshot. Published workflow translations determine exports when a project uses staged review.

## Languages and free access

`web/src/languages.js` defines 25 approved routes across ten languages:

- Japanese to English, Vietnamese, Russian, German, Spanish, Italian, Portuguese, Korean or Simplified Chinese.
- English to Vietnamese, Russian, German, Spanish, Italian, Portuguese, Korean or Simplified Chinese.
- Each of those eight languages to English.

Support is not all-to-all. Simplified Chinese uses `zh-Hans`. Source and target metadata belong to each project; changing account defaults affects new projects. Account defaults are stored in user metadata with account-scoped browser caching; guests have browser defaults.

All current product features are free. Users supply their own provider keys and may incur provider charges. Cloud project, storage and membership limits still apply. Product access does not grant administrative permissions or bypass project ownership and roles. Legacy Paddle code and isolated paid-testing mode remain in the repository; they are not a reason to add production feature gates.

## Responsive editor

On narrow screens the adapter groups provider settings, chapter navigation, and translation tools into native disclosure controls. The source and editable translation panes then share the remaining viewport equally, and only their text regions scroll. Desktop keeps the existing side-by-side workspace.

Google sign-in uses Google Identity Services and exchanges an ID token plus nonce through Supabase `signInWithIdToken`. Email confirmation uses the Supabase PKCE flow; normal password recovery verifies an emailed code. Legacy callback and recovery-link handling remains supported. A checked remember-me choice stores the Supabase session in localStorage; an unchecked choice uses sessionStorage.

The source pane is ordinary selectable DOM text marked with the project's source language. Japanese-source projects offer the Yomitan setup action, including its **Show iframe popups in the root frame** setting. The action is hidden for other source languages. DuskTranslate does not embed a third-party dictionary script or send lookup text to another API.

## Static pages

The privacy, terms, cookie, features and API-key guide pages are static Vite entry points. The policy and API-key pages use `web/public/legal.css`. `vercel.json` also defines app routes and sends `/reader` through the server-side preview handler for book-specific share metadata.

## Development and release

Use `docs/HOSTED-SETUP.md` for local configuration and test commands. CI uses Node 22. Run browser suites sequentially: the production preview uses port 4173, mocked auth uses 4174, and module checks use 4175. Build/dev preparation writes `web/public/editor/`; edit `web/editor/`, not those generated copies.

The ordinary release path is a reviewed feature preview and required checks, then a lead-approved merge to `master`. Vercel's Git integration deploys the application. It does not apply SQL migrations. The separate production workflow is manual-only and requires an explicit migration/release plan. See `docs/RELEASE-WORKFLOW.md`.

## Cleanup boundaries

Historical HTML files are retained as release archaeology on the `legacy-standalone` branch and in the `v0.1.0` release. The next safe refactor is to extract the hosted translation engine into tested modules; changing it in place risks EPUB parsing and streaming regressions.

## Security and privacy invariants

- Never put an AI provider key in a snapshot, database row, backup export, URL, or log. Device key storage is opt-in and must not be confused with project persistence.
- Treat imported titles, chapter IDs, and source text as untrusted text; use `textContent` rather than HTML interpolation.
- Keep cloud access scoped to authorised owners, collaborators or public-reader tokens, enforced by Supabase RLS, Storage policies and server-side checks.
- Do not add analytics, advertising, or non-essential embeds without prior consent design and an updated policy.
