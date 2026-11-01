# Perseus batch 1: local comments and reader status

Scope: findings 25 and 26 only, as authorised by Eye after lead review.
Worktree: `/mnt/VolumeD/Fillers/Programming/Projects/Dusk Translate/.worktrees/perseus`.
Branch: `chore/perseus-maintainability-review`.
Base commit: `4ca4f072dd8837c3b71eae276d2663a576fb7e1c`.

All changes are uncommitted. No push, merge, release, deployment or external database change was performed. Production is unchanged by this batch. The earlier review document and comment edits remain in the worktree for review. Other findings have not been implemented.

## Root causes and changes

### Signed-in local comments

The component selected local storage only for projects owned by `guest`. A signed-in user's local book therefore tried to load and write comments through cloud RPCs. Local thread keys and authors were also hard-coded to `guest`.

`comments.js` now recognises `storage: 'local'` as local and retains the guest-owner fallback for existing guest projects without that storage flag. Local comments use the current account's existing IndexedDB namespace and author ID. No records are migrated, copied to another namespace or uploaded. Cloud projects still use the existing RPC names and arguments, including shared projects owned by someone else.

The component captures the account/project context for asynchronous work. Responses and write completions from an old context cannot replace a new account's threads or clear its draft. A local project owned by another identity cannot be opened through this component. Viewer write restrictions remain enforced. Stopping the component invalidates pending work and clears the old rendered threads.

### Reader errors and stale rendering

`renderReader()` returned normally after an access error. Both EPUB and web-novel callers then announced `Ready to read`. The comment view also swallowed its own access errors, so the host could announce success after that later check failed. A late pre-render failure lacked the stale-response guard already used for successful responses.

Rendering now returns `rendered`, `failed` or `stale`. The current successful render is the only place that writes `Ready to read`. All render/presentation callers were updated: shared and project readers, chapter navigation and standalone EPUB input. Stale work cannot navigate, scroll, focus, or acknowledge a newer chapter. Genuine standalone/EPUB failures still retain the reader route and error display.

Pre-render authorisation remains in place. Content is withheld while it runs, and access failures retain an error heading/status with no cached chapter text. Starting another chapter or preparing/closing a reader invalidates old comment-view requests before awaiting the new authorisation result. Late successes and failures are ignored. EPUB parsing also checks whether its reader preparation is still current before installing the parsed book, releasing discarded image URLs if superseded.

The pre-render access request and the separate comment-view request both remain. Finding 9's request deduplication was not implemented; a regression explicitly checks that the initial successful preflight followed by a failed comment-view check still makes two requests and preserves the error.

## Files in this batch

| File | Change |
| --- | --- |
| `web/src/comments.js` | Storage routing, account-scoped local keys/authors, viewer and asynchronous context guards. |
| `web/src/main.js` | Reader results, success-status ownership, caller handling, stale-response and preparation guards. Existing review comments remain. |
| `web/src/reader-comments.js` | Propagate rendered/failed/stale results and avoid scheduling a stale open. |
| `tests/modules/project-comments-routing.spec.js` | Ten component/browser regressions using real IndexedDB and mocked cloud RPCs. |
| `tests/auth/reader-status.spec.js` | Nine reader regressions through the actual app with mocked Supabase responses. |
| `tests/auth/local-comments.spec.js` | Signed-in local-book creation, comment save and reload through the actual UI, using mocked authentication. |
| `docs/PERSEUS-BATCH1-HANDBACK.md` | This review record. |

Previously prepared comments in API/server/editor/collaboration/cover files and `docs/CODE-QUALITY-REVIEW-2026-10-31.md` are earlier work, not additional implementation in this batch. No existing test was deleted or weakened. No dependency, lockfile, migration, billing, runtime configuration or security-policy change was made.

## Regression evidence

The first corrected comments regression run against the pre-fix source had **three failures and five passes**: signed-in local routing, account switching, and a late old-account cloud response. The initial reader run had **four failures and three passes**: initial EPUB access failure, initial web-novel access failure, comment-view access failure, and a late failure overwriting a newer chapter. These failures established the bugs before application edits.

After the fixes, the focused comments and reader runs each passed eight tests. Further cases expanded the final regression coverage to twenty tests across the three new files. Coverage includes:

- Legacy guest local comments and signed-in local comments, including read/create/edit/delete and preserved neighbouring namespaces.
- Owned and shared cloud RPC routing, plus local/cloud viewer restrictions.
- Account switching, access to another account's local book, late reads and an in-flight local write that must not clear the next account's draft.
- Actual signed-in local project creation, local author identity, reload/reopen persistence and zero cloud comment requests.
- Initial EPUB/web-novel access failures and failures in the separate comment-view check.
- Revoked links, server errors, delayed successful/failed responses, navigation while an old comment check is pending, and leaving with a chapter request in flight.

Baseline failure logs are local review evidence at `/tmp/perseus-batch1-comments-red.log` and `/tmp/perseus-batch1-reader-red.log`. Final suite logs use the same `/tmp/perseus-batch1-` prefix with `unit`, `build`, `modules`, `auth` and `browser` suffixes. These temporary files may not survive machine cleanup.

## Verification

All required checks passed on the final source:

| Command | Result |
| --- | --- |
| `npm test` | 118 passed, zero failed; final run 23.6 seconds. |
| `npm run build` | Production build passed, including editor preparation. |
| `npm run test:modules` | 23 passed, zero failed; includes all ten comment-routing/isolation regressions. |
| `npm run test:auth` | 33 passed, zero failed; includes the nine reader regressions and signed-in local UI regression. |
| `npm run test:e2e` | 105 passed, zero failed, in five minutes, against a fresh production build. |
| `git diff --check` | Passed. New files also checked for trailing whitespace. |

The full general suite includes existing desktop/mobile guest comment read/write/reply/resolve/reload coverage, reader checks in both themes, routes, imports/exports, backups and partial-translation recovery. The retained paid-testing browser configuration was not run because billing is outside this batch. No failures were bypassed, tests deleted, or assertions weakened.

## Visual checks and limits

Inspected the generated 1280-by-720 screenshots of the signed-in local comment panel and the EPUB access-error state. The account-local note and controls were visible; the reader showed the access error and withheld content. No stylesheet was changed. Broader theme/responsive behaviour is covered by existing automated browser checks; this is not a claim of a manual visual pass across every device/theme.

New comments component tests exercise real browser IndexedDB with mock cloud methods. New reader tests intercept requests to the synthetic `dusk-test.supabase.co` endpoint. The signed-in local UI test mocks authentication and account responses. The unit suite uses local fixtures, including in-process PGlite databases. None of this proves behaviour against a live Supabase deployment, and no production users' books or credentials were used.

The context guards do not cancel a local IndexedDB write that started before an account switch; it completes in its captured original namespace. They prevent that completion from affecting the next account's UI. Remote permissions remain the server's responsibility. Request deduplication and the other review findings remain separate work.

## Local review

From this worktree, run the focused regressions sequentially:

```bash
npm run test:modules -- tests/modules/project-comments-routing.spec.js
npm run test:auth -- tests/auth/local-comments.spec.js tests/auth/reader-status.spec.js
```

For interactive inspection with synthetic services:

```bash
npm run test:auth -- tests/auth/local-comments.spec.js tests/auth/reader-status.spec.js --headed --workers=1
```

These auth tests supply their own fake Supabase configuration and responses. Do not set `VITE_LOCAL_ONLY=true` for the auth tests, because that disables the mocked cloud client they exercise. For a guest-only manual preview without cloud configuration, use `VITE_LOCAL_ONLY=true npm run dev`, create a local book, select source text, open Tools > Comments, add a note, then reload and reopen it.

Append `--debug` to a focused Playwright command to pause and step through the mocked UI flows. Generated screenshots are under `test-results/auth/`, including `signed-in-local-comments.png` and `reader-access-failure.png` in their corresponding test directories.

Review the uncommitted diff and this record before authorising another step. No commit message, deployment or later implementation batch has been requested.
