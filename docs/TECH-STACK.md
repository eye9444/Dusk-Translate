# DuskTranslate Tech Stack and File Guide

This document describes the active `master` branch. Historical standalone HTML builds are preserved on the [`legacy-standalone`](https://github.com/eye9444/Dusk-Translate/tree/legacy-standalone) branch and are not part of the hosted application's active source tree.

## Architecture at a Glance

DuskTranslate is primarily a client-side web application. Vite builds static HTML, CSS, JavaScript, and generated editor assets into `dist/`; Vercel serves that directory. There is no custom application server.

The browser owns the interactive application state. Device-only projects use IndexedDB. Signed-in projects use Supabase Auth, PostgreSQL, and private Storage. The embedded translation editor runs in a same-origin iframe and exchanges project snapshots with the library shell through `postMessage`. Translation requests are made directly from the browser to Google AI Studio or OpenRouter with the provider key entered for that editor session.

```text
Browser shell (web/index.html + web/src/main.js)
  |-- IndexedDB device library
  |-- Supabase Auth / PostgreSQL / private Storage
  |-- Built-in EPUB reader
  `-- Same-origin translation iframe
        |-- Editor engine
        |-- Host adapter
        `-- Google AI Studio or OpenRouter API
```

## Technology Stack

| Layer | Technology | Role |
| --- | --- | --- |
| Markup | HTML5 | Semantic application shell, dialogs, reader, static guide, and legal pages |
| Styling | CSS3 | Responsive glass interface, Eclipse theme, editor adaptation, reader layout, and focus states |
| Application code | Modern JavaScript ES modules | Project state, persistence, authentication, EPUB processing, editor integration, and UI behavior |
| Build tool | Vite 7 | Development server, module bundling, static-page inputs, and production output |
| Archive processing | JSZip 3 | EPUB parsing, translated EPUB generation, and project backup ZIP handling |
| Device persistence | IndexedDB | Project metadata, snapshots, and original uploaded files |
| Session preferences | localStorage and sessionStorage | Theme, layout, guest mode, reader font size, and remember-me behavior |
| Accounts | Supabase Auth | Email/password and Google OAuth with PKCE |
| Cloud database | Supabase PostgreSQL | Owner-scoped project metadata and translation snapshots |
| Cloud files | Supabase Storage | Private original books stored in an owner-scoped `books` bucket |
| AI providers | Google Generative Language API and OpenRouter | Browser-originated chapter translation requests |
| Hosting | Vercel | Static hosting, HTTPS, response headers, and deployment from the Vite build |
| Unit testing | Node.js `node:test` | Snapshot, validation, storage-selection, and progress behavior |
| Browser testing | Playwright | End-to-end UI, responsive, persistence, reader, export, and authentication behavior |
| Database testing | PGlite | Local PostgreSQL-compatible verification of migrations and row-level security |
| Typography | Manrope, Newsreader, and IBM Plex Mono | Interface, editorial headings, and technical metadata |
| Brand asset | SVG | Resolution-independent eclipse mark used in navigation and as the favicon |

## Runtime Data Flow

1. `web/index.html` loads `web/src/main.js`, which imports the application styles and modules.
2. The library shell checks Supabase configuration and restores either a remembered or tab-scoped login session.
3. Project lists come from IndexedDB for device-only use or from Supabase for signed-in users. Cloud projects retain local drafts for recovery.
4. Opening a project loads `/editor/index.html`, which is generated before development and production builds.
5. The host sends the original file and sanitized snapshot to the same-origin editor iframe.
6. The adapter sends edited snapshots back to the host. Autosave stores the snapshot locally and optionally synchronizes it to Supabase.
7. The editor sends only an explicitly requested chapter and prompt to the selected AI provider. API keys are not included in project snapshots.
8. The EPUB reader can open an arbitrary EPUB, a project's original book, or a temporary translated edition after every chapter is complete.

## Security and Privacy Boundaries

- AI-provider keys stay in editor memory and are excluded from snapshots, backups, IndexedDB records, and Supabase rows.
- Imported titles, chapter identifiers, and source content are treated as untrusted text.
- Supabase row-level security and Storage policies scope cloud content to the authenticated owner.
- Original files and snapshots are separated in IndexedDB so routine autosaves do not rewrite large EPUB blobs.
- Uploads are limited to 20 MB and expanded EPUB/ZIP data is limited to 100 MB.
- Vercel response headers restrict framing, browser permissions, referrers, content types, and allowed network origins.
- The current application includes no advertising or behavioral analytics.

## Generated and Local-Only Files

These paths are intentionally not tracked as active source files:

- `web/public/editor/index.html` is generated from `web/editor/engine.html` by `scripts/prepare-editor.mjs`.
- `web/public/editor/adapter.js` and `adapter.css` are generated copies of the authored adapter files.
- `web/public/editor/jszip.min.js` is copied from the installed JSZip package.
- `dist/` is the production Vite output served by Vercel.
- `node_modules/` contains installed npm dependencies.
- `test-results/` and `playwright-report/` contain test artifacts.
- `.env.local` contains local Supabase configuration and must remain untracked.
- `.vercel/` contains the local Vercel project link and machine-specific metadata.
- `Important/`, `test files/`, and Google OAuth credential downloads are private local material excluded from Git.

## File-by-File Guide

### Repository Root

#### `.env.example`

A manually maintained, non-secret template listing the two public Vite variables required to connect a Supabase project. Developers copy these names into an ignored local environment file or Vercel settings.

#### `.gitignore`

Defines files Git must not track: dependencies, builds, local environments, test output, generated editor assets, private books, and downloaded OAuth credentials.

#### `.vercelignore`

Prevents development-only, private, or unnecessary paths from being uploaded to Vercel. It keeps deployment input smaller and blocks accidental credential or test-data inclusion.

#### `README.md`

The public GitHub landing page. It presents the hosted release, real deployment screenshots, current features, workflow, tech-stack summary, setup commands, legacy branch, and policy links.

#### `package.json`

The npm manifest. It declares the project as an ES-module package, records runtime and development dependencies, and exposes commands for development, builds, unit tests, browser tests, and mocked-auth tests.

#### `package-lock.json`

Generated by npm. It pins exact dependency versions and integrity hashes so local machines, CI, and Vercel install the same dependency graph. It should be updated through npm rather than edited manually.

#### `vercel.json`

The Vercel deployment contract. It selects the Vite build, serves `dist/`, and defines security headers including CSP, frame restrictions, referrer policy, and disabled camera, microphone, and geolocation permissions.

#### `vite.config.js`

The Vite build configuration. It uses `web/` as the application root, writes to `dist/`, and explicitly includes the home, legal, cookie, and API-key guide pages as production entry points.

### `config/`

#### `config/playwright.config.js`

Configures the main browser suite. It builds and previews the production app on port 4173, points Playwright at `tests/browser/`, fixes the default desktop viewport, retains traces on failure, and keeps tests serial where shared browser state matters.

#### `config/playwright.auth.config.js`

Configures mocked Supabase account tests on port 4174. It supplies non-secret fixture environment values and runs the authentication scenarios under `tests/auth/` without contacting or mutating the production Supabase project.

### `docs/`

#### `docs/ARCHITECTURE.md`

The concise engineering architecture reference. It records runtime ownership, persistence flow, responsive editor behavior, static-page handling, cleanup boundaries, and security invariants.

#### `docs/HOSTED-SETUP.md`

The deployment and operations guide. It explains local startup, Supabase migration and environment configuration, Google OAuth setup, project behavior, limitations, and verification commands.

#### `docs/TECH-STACK.md`

This document. It is the exhaustive map of technologies, runtime flow, generated artifacts, security boundaries, and tracked source files.

#### `docs/screenshots/welcome-desktop.png`

A real Playwright capture of the deployed signed-out Eclipse welcome page at a desktop viewport. The README uses it as the main product image.

#### `docs/screenshots/welcome-mobile.png`

A real Playwright capture of the deployed signed-out Eclipse welcome page at a mobile viewport. It demonstrates responsive behavior in the README.

### `scripts/`

#### `scripts/prepare-editor.mjs`

A Node.js build-preparation script. It reads the authored editor engine, applies small hosted-only compatibility substitutions, injects the adapter stylesheet and script, and copies JSZip plus adapter assets into the ignored `web/public/editor/` output directory.

#### `scripts/smoke-hosted.mjs`

A Playwright production smoke test. It opens the live Vercel site, creates a synthetic device project, edits a translation, waits for autosave, reloads, resumes the project, and fails if the page emits JavaScript errors.

### `supabase/`

#### `supabase/migrations/202609100001_projects.sql`

The initial PostgreSQL/Supabase migration. It creates the `projects` table, owner/update index, revision trigger, private `books` Storage bucket, grants, validation constraints, row-level-security policies, and owner-scoped Storage policies.

### `tests/`

#### `tests/auth-storage.test.mjs`

Unit tests for remember-me storage. It uses in-memory Storage-like objects to verify that only Supabase credentials move between persistent and tab-scoped storage.

#### `tests/model.test.mjs`

Unit tests for trusted snapshot serialization, partial-translation progress, duplicate or dangerous chapter identifiers, and upload size/type boundaries.

#### `tests/rls.test.mjs`

A PGlite database test that adapts and runs the migration locally. It verifies owner isolation and optimistic revision behavior without requiring the hosted database.

#### `tests/auth/auth.spec.js`

Playwright scenarios for email signup, consent, rejected credentials, login/logout, password reset, same-tab Google PKCE, callback errors, remembered-session restoration in a fresh browser context, tab-only sessions, and responsive account dialogs.

#### `tests/auth/cloud.spec.js`

Playwright scenarios backed by a mocked Supabase HTTP surface. They verify original-file upload, cloud project restoration, failed-sync draft recovery, retries, and session-only authentication storage.

#### `tests/browser/library.spec.js`

The largest end-to-end suite. It covers project creation and management, autosave, glossary and chapter restoration, key exclusion, untrusted content, EPUB export and reading, backups, locks, interrupted streams, desktop/mobile layouts, provider controls, themes, and visual captures.

#### `tests/browser/static-pages.spec.js`

Verifies that policy and API-key pages survive the production build, are directly reachable, and open from the app without replacing the active work tab.

#### `tests/browser/welcome.spec.js`

Verifies the signed-out entry experience, account and guest routes, theme/mobile viewport fit, and the accessible color treatment of primary actions.

### `web/` Pages

#### `web/index.html`

The main semantic HTML shell. It defines shared icons, masthead, signed-out welcome, project library, project/authentication/management dialogs, embedded editor iframe, and standalone/project EPUB reader. JavaScript progressively supplies state and behavior.

#### `web/privacy.html`

A static Privacy Policy describing processed data, storage locations, third parties, user choices, retention, security, and placeholders that require final operator details before commercial launch.

#### `web/terms.html`

Static Terms and Conditions covering service scope, accounts, user content, AI providers, keys, acceptable use, availability, backups, subscriptions, intellectual property, and pending business details.

#### `web/cookies.html`

A static Cookie Policy explaining that the app currently has no analytics or advertising cookies, while documenting its necessary IndexedDB, localStorage, and sessionStorage uses.

#### `web/guides/api-keys.html`

A static setup guide for obtaining and safely using Google AI Studio and OpenRouter keys, including direct provider links, spending/restriction guidance, safety checks, and troubleshooting.

### `web/public/`

#### `web/public/brand/dusk-mark.svg`

The hand-authored eclipse logo. Its SVG shapes provide a crisp favicon and reusable brand mark at any display scale without a raster image dependency.

#### `web/public/legal.css`

Shared styling for the policy and API-key pages. It provides typography, navigation, notices, tables, code blocks, responsive rules, focus visibility, and an automatic dark color scheme.

### `web/editor/`

#### `web/editor/engine.html`

The self-contained translation engine source. It contains the chapter workspace markup and original CSS/JavaScript for EPUB/JSON/TXT parsing, chapter navigation, glossary editing, AI Studio/OpenRouter model calls and streaming, translation editing, export, theme switching, and developer diagnostics. The build script augments this file rather than serving it directly.

#### `web/editor/adapter.js`

The hosted integration layer injected into the engine. It adds the project menu, branded identity, API-key guide, Yomitan-compatible Japanese source metadata and setup action, desktop/mobile provider layout, control disclosures, safer import checks, host actions, manual-edit tracking, partial-stream handling, and same-origin snapshot messaging.

#### `web/editor/adapter.css`

The hosted editor override stylesheet. It removes duplicated standalone controls, aligns provider fields, applies the compact desktop bar, creates mobile disclosure panels, splits source and translation vertically on small screens, confines scrolling to text panes, and supplies subtle whole-pane edit focus.

### `web/src/`

#### `web/src/main.js`

The application coordinator. It controls themes, welcome/library rendering, filtering and layouts, project CRUD, IndexedDB/cloud selection, autosave and draft recovery, editor messages, backups, EPUB reader state and font controls, authentication dialogs, email flows, same-tab Google OAuth, and navigation safety.

#### `web/src/store.js`

The persistence module. It creates the Supabase client and PKCE storage adapter, checks Google-provider availability, manages the versioned IndexedDB database, separates project metadata from original files, and implements owner-scoped remote list/create/open/save/delete operations.

#### `web/src/model.js`

Pure validation and data-shaping helpers. It enforces accepted file boundaries, validates novel/chapter structure, strips runtime-only or sensitive values from snapshots, and calculates completed translation progress.

#### `web/src/auth-storage.js`

A small Supabase-compatible storage adapter. It moves only provider session credentials between localStorage and sessionStorage according to the remember-me choice and removes credentials from both on logout.

#### `web/src/epub-reader.js`

Safe EPUB parsing and translated-edition generation. It normalizes archive paths, ignores active or non-text markup, extracts readable paragraphs from the EPUB spine, enforces expanded-size limits, injects completed translations as text-only XHTML, and converts page direction to left-to-right.

#### `web/src/style.css`

The foundational application stylesheet. It defines color/action tokens, reset rules, controls, library structure, project cards, dialogs, workspace iframe, responsive breakpoints, keyboard focus, and reduced-motion-aware entrance animation.

#### `web/src/glass.css`

The current visual-system layer loaded after the foundation. It applies Manrope/Newsreader/IBM Plex Mono typography, the floating liquid-glass shell, expanded desktop layout, translucent cards, branded artwork, responsive refinements, and primary-action styling.

#### `web/src/welcome.css`

Styles the signed-out landing page and Eclipse presentation. It defines the hero grid, book-and-orbit artwork, direct capability copy layout, black/fire-orange theme surfaces, responsive composition, and desktop viewport sizing.

#### `web/src/reader.css`

Styles the full-window EPUB reader. It defines the toolbar, chapter sidebar, reading measure, adjustable typography, active chapter state, and mobile replacement of the sidebar with a chapter selector.
