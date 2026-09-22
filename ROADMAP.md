# DuskTranslate — Product Roadmap

## Context

DuskTranslate is a Japanese-to-English chapter-by-chapter translation tool. The current web release (v0.2.0) has a solid foundation with import/export, translation, glossary, find-and-replace, consistency checking, cloud sync, and EPUB reader. This plan covers the next wave of features for the **free tier** that materially improve the translator and proofreader workflow, organized by priority and implementation phase.

## Immediate Reliability Work — Shipped

The following baseline work is complete and has unit or browser coverage:

- **Portable project export/import:** Every project can be exported as a versioned ZIP containing the original source, project state, glossary, reading position, and a readable `translation.txt` when translations exist. API keys are never included. The library has dedicated **Export project** and **Import project** actions, and an imported archive restores its saved title automatically.
- **Safe project-wide find and replace:** A replacement requires a current preview of the exact search, replacement, case setting, and translation state. Replacement text is treated literally, so values such as `$&` are preserved rather than interpreted by JavaScript. Clearing a match also clears the visible editor correctly.
- **Recoverable bulk changes:** The editor provides a one-level **Undo last replace** action after a project-wide replacement.
- **Reliable spellcheck preference:** The native spellcheck menu option persists with the project and reflects its actual state after a reload.
- **Honest consistency checks:** The QA dialog identifies its sentence-alignment heuristic, counts comparable chapters, and states when partial chapters were skipped instead of claiming full consistency.

### Migration Preparation — Deliberately Deferred

The future Supabase-to-Neon/Cloudflare migration notice is not enabled yet. Before any infrastructure change, users can now export a complete portable project ZIP and later restore it through the dedicated import flow. We will add an opt-out migration notice only after the replacement stack has passed its own test deployment.

**Existing foundation (do not rebuild):**
- EPUB/TXT/JSON import, backup ZIP import
- Chapter-by-chapter translation with AI providers (Google AI Studio, OpenRouter)
- Project glossary (per-project terminology)
- Yomitan dictionary lookup (host-side)
- Project-wide find and replace with preview and one-level undo
- Consistency checker / QA tool with explicit heuristic guidance
- Save locally (IndexedDB) or sync to cloud (Supabase)
- Archive/restore, rename, backup, resume projects
- Built-in EPUB reader (original, translated, standalone editions)
- TXT/EPUB export of completed translations
- Authentication (Google OAuth, email/password)
- Mobile responsive with disclosure controls
- Light and Eclipse themes
- Autopagination of long chapters (streaming)
## Short-Term Enhancements (1–3 days each)

### Feature 1: Project Tags / Categories

**Why:** Users with many projects need organization beyond archive/active. Tags (e.g., "manga", "novel", "light novel", "academic") help filter.

**Implementation:**
- Add `tags` array to project schema (empty by default)
- Add a simple tag input in the project card footer or a "tag" button that opens a small inline editor
- Add tag filtering to the library view (alongside archive/active filter)
- Update Supabase migration to add `tags jsonb` column or store in snapshot only
- Files to modify: `supabase/migrations/202609100001_projects.sql` (optional), `web/src/main.js` (render, filter, tag editing), `web/index.html` (tag input UI), `web/src/model.js` (cleanSnapshot include tags), `web/src/style.css` (tag chip styling)

**Tests:** Unit test that tags are preserved through `cleanSnapshot`. Browser test: add tags, filter by tag.

### Feature 2: Keyboard Shortcuts Help

**Why:** Power users (translators) benefit from keyboard-driven workflow. Current shortcuts are scattered and undocumented.

**Implementation:**
- Add a "Keyboard shortcuts" item to the host menu in the editor that opens a dialog listing all shortcuts
- Document: `/` to search library, Escape to close menus/dialogs, Ctrl+Shift+D for dev mode, any editor-specific shortcuts
- Add a small keyboard icon next to the host menu button as a visual hint
- Files to modify: `web/editor/adapter.js` (menu item), `web/src/main.js` (shortcuts dialog logic), `web/index.html` (dialog markup), `web/src/style.css` (shortcuts list styling)

**Tests:** Browser test: open editor, open shortcuts dialog, verify expected shortcuts are listed.

## Phase 2 — Medium Impact, Medium Effort (3–5 days each)

### Feature 3: Word Count and Reading Speed Metrics

**Why:** Professional translators bill by word count and track productivity. Showing source word count, translation progress, and estimated reading time adds value.

**Implementation:**
- Calculate word count for each chapter source text (Japanese: count characters/words; English: count words)
- Display word counts in chapter sidebar and project card
- Add a productivity summary: total words translated, average translation speed (words per minute) if timestamps are tracked
- Add to `cleanSnapshot` if timestamps are added
- Files to modify: `web/src/model.js` (word count helpers, progress enhancement), `web/editor/adapter.js` (display word counts in sidebar), `web/src/main.js` (project card word counts), `web/src/style.css` (word count styling)

**Tests:** Unit tests in `tests/model.test.mjs` for word counting on Japanese and English text. Verify word count appears in chapter list and project card.

### Feature 4: Export Options — Selective Chapter Export

**Why:** Translators sometimes need to export only specific chapters (e.g., for review by an editor), not the whole book.

**Implementation:**
- In the export flow, add a dialog that lets the user select which chapters to export
- Support TXT and EPUB formats for selective export
- Pre-select all chapters by default, allow deselection
- Files to modify: `web/src/main.js` (export dialog, chapter selection logic), `web/index.html` (dialog markup), `web/editor/engine.html` (export handler), `web/src/style.css` (dialog styling)

**Tests:** Browser test: open project, export, select subset of chapters, verify export contains only selected chapters.

### Feature 5: Dark/Theme-Aware Editor Pane

**Why:** The Eclipse theme changes the app shell but the editor pane may not fully adapt, causing eye strain during long translation sessions.

**Implementation:**
- Ensure editor iframe content adapts to both light and Eclipse themes
- Add CSS variables for editor pane backgrounds that switch with `host:theme` message
- Verify source and translation panes have sufficient contrast in both themes
- Files to modify: `web/editor/adapter.css` (theme variables), `web/editor/engine.html` (editor styling), `web/src/main.js` (theme sync if needed)

**Tests:** Browser test: switch between Dusk and Eclipse themes, verify editor pane contrast is correct in both.

## Phase 3 — Strategic Differentiators (5–10 days each)

### Feature 6: Translation Quality Score

**Why:** Gives translators immediate feedback on output quality before human proofreading. Could use a lightweight heuristic (sentence length ratio, punctuation consistency, capitalization).

**Implementation:**
- Add a quality heuristic that compares source and translation sentence counts, checks for excessive length ratio (>3x or <0.3x), flags untranslated segments
- Display a score (0–100) with color coding (green ≥ 80, yellow 60–79, red < 60) in the project card and editor header
- Make it non-blocking (informational only, not a gate)
- Files to modify: `web/src/model.js` (quality scoring function), `web/src/main.js` (display score), `web/editor/adapter.js` (editor header display), `web/src/style.css` (score badge styling)

**Tests:** Unit tests for scoring edge cases (identical text, completely different length, empty translation). Browser test: verify score displays in editor and project card.

### Feature 7: Project Sharing via Link

**Why:** Translators often share work with editors or clients. A shareable read-only link (for cloud users) adds collaboration value.

**Implementation:**
- Add a "Share" button on project cards (cloud only)
- Generate a read-only share token stored with the project (in Supabase)
- Create a public read-only endpoint that renders the project snapshot as a static view (translation only, no editing)
- Share link can be revoked from project settings
- Files to modify: `supabase/migrations/` (share tokens table), `web/src/main.js` (share button, share dialog), `web/index.html` (dialog markup), new public page `web/shared.html` or route, `web/src/style.css` (share UI)

**Tests:** Browser test: sign in, share a project, open link in incognito, verify read-only view. Test that revocation removes access.

## Phase 4 — Monetization and Target Market Features

### Pricing Tiers (strategic, not implementation plan)

Based on the project's positioning as a professional translation tool:

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0/month | Local library, up to 3 active projects, basic translation, find-replace, consistency checker, glossary |
| **Pro** | $8/month | Cloud sync, unlimited projects, tags/categories, export options, keyboard shortcuts, translation quality score |
| **Team** | $20/month (per user) | Everything in Pro + shared projects, commenting, version history, admin controls |

### Target Markets

1. **Primary:** Professional freelance translators and proofreaders (Japanese→English) — they need workflow tools and billing support
2. **Secondary:** Amateur translators and manga/light novel fans — they need ease of use and free tier
3. **Tertiary:** Translation agencies and editors — collaboration and quality scoring features

### Features to support monetization:

- **Project limit enforcement** (3 projects on free tier) — requires project counting logic
- **Cloud sync gate** (Pro tier only) — requires tier-aware access control
- **Version history** (Pro+) — requires snapshot history in IndexedDB/Supabase
- **Collaboration** (Team) — requires shared project access, real-time sync

**Implementation note:** Do not build pricing tier enforcement until the user explicitly requests monetization. Focus on Phase 1–3 features first.

## Testing Strategy

All features follow the existing test patterns:
1. **Unit tests** in `tests/` — test pure functions in `model.js` and new utility modules
2. **Browser tests** in `tests/browser/` — Playwright tests covering user workflows
3. **RLS tests** in `tests/rls.test.mjs` — for any new Supabase schema changes
4. **Build verification** — `npm run build` must pass after every change

Run all tests with `npm test`, build with `npm run build`.

## File Architecture Reference

Key files for feature development:
- `web/src/main.js` — Host UI logic, project lifecycle, dialogs, message handling
- `web/editor/adapter.js` — Editor iframe bridge, host menu, toolbar, chapter navigation
- `web/editor/engine.html` — Translation engine source (copied to `web/public/editor/index.html`)
- `web/src/model.js` — Data validation, snapshot cleaning, progress calculation
- `web/src/store.js` — IndexedDB and Supabase persistence
- `web/index.html` — Library shell markup, dialogs
- `web/src/style.css` — Global styles, CSS variables
- `supabase/migrations/202609100001_projects.sql` — Database schema
- `tests/model.test.mjs` — Unit tests for data functions
- `tests/rls.test.mjs` — Row-level security tests
- `docs/ARCHITECTURE.md` — Architecture documentation

## Notes

- Translation Memory (TM) system
- All new features should follow existing patterns: native `<dialog>` elements, postMessage for editor communication, semantic HTML, modular CSS
- Provider API keys must NEVER be stored in snapshots, database, URLs, or logs (security invariant from ARCHITECTURE.md)
- Japanese text should use `lang="ja"` and `translate="no"` attributes
- All user-facing strings in English (matches existing UI)
- Consider mobile responsive design for all new features (disclosure pattern on narrow screens)
