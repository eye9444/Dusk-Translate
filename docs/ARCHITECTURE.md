# DuskTranslate Architecture

This document describes the active hosted application. The historical standalone HTML releases remain under `releases/` for reference and are not the source of truth for the hosted library shell.

## Runtime boundaries

- `web/index.html` is the public library shell, authentication dialog, import flow, project list, and host-side persistence coordinator.
- `web/src/main.js` owns UI state, authentication events, project lifecycle actions, and communication with the embedded editor.
- `web/src/store.js` owns IndexedDB and Supabase access. Local metadata and original files use separate IndexedDB stores so listing projects does not load every book into memory.
- `web/src/model.js` owns snapshot validation, file validation, progress calculations, and data-shaping helpers shared by the host.
- `web/src/auth-storage.js` is the storage adapter for the Supabase session. The remember-me choice determines whether auth tokens use persistent or session storage.
- `web/editor/adapter.js` bridges the legacy translation engine to the host with same-origin `postMessage` events. It prevents the legacy engine from loading a second book and emits resumable snapshots.
- `releases/development/DuskTranslate_epubfixestest6dev_delimiter.html` is the currently wrapped legacy engine input. It is copied into `web/public/editor/index.html` by `scripts/prepare-editor.mjs` during development and build.

## Data flow

1. The library validates an imported EPUB, TXT, JSON, or backup ZIP before creating a project.
2. Local projects store metadata and snapshots in the `projects` IndexedDB store and the original file in `projectFiles`.
3. The editor receives the project through a same-origin iframe message and returns snapshots through `editor:state` messages.
4. Autosave updates local metadata with `local.patch`, avoiding repeated writes of the original file.
5. Signed-in projects upload the original file to owner-scoped Supabase Storage and save only the project snapshot in the database.
6. Provider API keys remain in the editor session and are intentionally excluded from snapshots and cloud rows.

## Static pages

The privacy, terms, cookie, and API-key guide pages are static HTML pages. They use `web/public/legal.css` and are included explicitly in the Vite Rollup input list so direct production URLs work after `vite build`.

## Cleanup boundaries

Historical HTML files are retained as release archaeology, not loaded by the application. They should only be deleted after confirming that no external bookmarks, release links, or local workflows depend on them. The next safe refactor is to extract the legacy translation engine into a tested module; changing it in place risks EPUB parsing and streaming regressions.

## Security and privacy invariants

- Never put an AI provider key in a snapshot, database row, backup export, URL, or log.
- Treat imported titles, chapter IDs, and source text as untrusted text; use `textContent` rather than HTML interpolation.
- Keep cloud queries owner-scoped and enforce ownership in Supabase RLS and Storage policies.
- Do not add analytics, advertising, or non-essential embeds without prior consent design and an updated policy.
