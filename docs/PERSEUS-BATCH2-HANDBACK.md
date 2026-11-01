# Perseus batch 2: private cleanup, current docs and Feedback Hub loading

Prepared 1 November 2026 for Eye and lead review. This batch covers the authorised subset of findings 1–3, current documentation from finding 24, and finding 7. It does not authorise the other findings.

Worktree: `/mnt/VolumeD/Fillers/Programming/Projects/Dusk Translate/.worktrees/perseus`.
Branch: `chore/perseus-maintainability-review`.
Unchanged branch HEAD: `4ca4f072dd8837c3b71eae276d2663a576fb7e1c`.
Fetched `origin/master`: `6537ea438083beb3f7eea1e6c6f633a9aad3edba`, five commits ahead.

All work remains uncommitted. No merge, push, release, deployment, dependency change or hosted database change was performed. Production was not accessed for testing.

## Baseline, batch separation and integration

Read this worktree's `AGENTS.md`, the current handoff in the staging worktree, and the fetched master's `AGENTS.md`. The handoff is dated 31 October and still records an older owner checkout and master tip. The owner checkout is now on `master` at the fetched tip; its directory name was not used as proof of freshness. The inherited release-candidate instruction does not override Eye's current isolated-worktree and no-commit instructions.

Before batch-2 edits, saved all 15 pre-existing modified/untracked files, their SHA-256 manifest and the tracked diff under `/tmp/perseus-batch2-baseline-hl0hxt2w`. The path is also recorded in `/tmp/perseus-batch2-baseline-path`. These temporary copies may not survive machine cleanup. No previous source or tests were reset or stashed.

The other 14 pre-existing files remain byte-for-byte identical to that snapshot. In `web/src/main.js`, an AST comparison excluding only `openFeedbackHub` confirms the rest of the batch-1 source is unchanged. Batch-1's comment routing, reader fixes, all 20 regressions, earlier comment edits, review report and handback remain present. The original review and batch-1 documents describe their own earlier snapshots and were not rewritten as current technical guides.

The five upstream commits comprise PR #12's community support update and PR #13's responsive changes. Preserve all seven upstream files during integration:

- `web/src/responsive.css` and its `import './responsive.css'` in `main.js`.
- `web/editor/adapter.css`.
- `web/src/donations.js` and `web/src/releases.js`.
- `tests/browser/donations.spec.js` and `tests/browser/responsive.spec.js`.

Only `main.js` overlaps our pre-existing modified paths. Upstream adds an import near the top; batch 1 changes comment/reader behaviour elsewhere, and batch 2 changes `openFeedbackHub`. A read-only `git apply --check` of the complete upstream diff succeeds against the candidate, both before and after these edits. No upstream patch was applied. No conflicting agent changes were found.

A final fetch still reports the same `6537ea4` master tip. For review, `test-results/perseus-batch2-review/batch2-only.patch` contains only changes from the saved pre-batch-2 working state, including new tests and this handback. `batch2-manifest.json` in that directory records before/after hashes and the unchanged batch-1 files. These ignored local artifacts are not commits or integration actions. Preserve them separately if moving the review to another checkout.

Integration must start from freshly checked current master and combine reviewed hunks, not replace newer files with this older worktree's whole files. The checks in this document cover the local branch plus batches 1 and 2. They do not cover an integrated tree containing `6537ea4`'s responsive changes. The lead must rerun required checks, including the new upstream responsive tests, on the exact combined candidate before any release. If the remote advances again or a conflict appears, stop and review it rather than overwriting it.

## Findings 1–3: removal evidence and decisions

Reference tracing included authored source, imports/exports, inline editor handlers, generated-editor scripts, tests, current docs, build preparation and fetched upstream differences. No direct dependency or publicly accessible asset was removed.

| Item | Decision and evidence |
| --- | --- |
| `markupParagraphs` in `web/src/epub-reader.js` | Removed. Private, non-exported declaration; its name had no other source/test reference. The active reader calls `readerBlocks`. No dynamic evaluation exposes this module's private binding. |
| `firstHeading` in the same module | Removed. Private, non-exported declaration with no caller/import/test. Active heading selection uses `sectionHeading`. |
| `modelSelect` in `web/editor/adapter.js` | Removed the unused private DOM lookup. Cross-script tracing found no reads of the binding in engine, adapter, review, presence, prompt, provider or linked-scroll source. The generator copies the adapter and injects those known scripts; it adds no caller. The `#model-select` element, `modelPicker`, handlers and all provider behaviour remain unchanged. |
| `timer` in `web/src/welcome-planet.js` | Removed its uninitialised declaration and two `clearTimeout(timer)` calls. All three occurrences were the declaration and those clears; no timer was assigned or created. Animation-frame ownership, gestures, visibility handling and event cleanup remain unchanged. |
| `withLoading` | Retained. No runtime caller was found, but it is exported. This batch permits private removals, not retirement of an exported interface merely because it currently has no internal consumer. |
| `remote.selectProjects` | Retained. The exported facade still exposes an existing SQL RPC contract. No application caller was found, but deciding to retire that interface is separate from removing an unused private binding. SQL and capacity behaviour were not changed. |
| `grantsPaidAccess` / `ACCESS_STATUSES` | Retained. `tests/billing.test.mjs` exercises the exported paid-status contract; billing is outside the batch boundary. |
| `countSourceCharacters` | Retained. `tests/launch-billing.test.mjs` exercises its Unicode character-count contract. Lack of a production caller alone is insufficient for deletion. |
| `makeCommentAnchor` | Retained. `tests/comment-anchors.test.mjs` exercises the exported anchor format and validation. Comment compatibility/security boundaries were not altered. |
| `createLocalUndo` | Retained. `tests/shared-document.test.mjs` exercises Yjs undo and tracked origins. Removing that tested export or changing CRDT behaviour is outside this batch. |

The EPUB module's parsed AST, after excluding exactly the two removed private declarations from the baseline, is identical to the new module. No live parsing, limits, archive paths, exports, public functions or sanitisation were changed. Existing EPUB/ruby/export/limit browser coverage remains the behaviour check; no deletion-only test was added to mirror the source change. A fresh build also confirms the removed editor lookup does not remain in generated editor assets.

Separate AST comparisons confirm that the adapter differs only by the removed `modelSelect` declaration and the planet module only by the unassigned `timer` declaration and its two clears. No surrounding runtime code changed in either file.

## Finding 7: one authorised response per hub open

Previously `openFeedbackHub` discarded the successful result of `remote.feedbackTickets()` and then `feedbackHub.open()` requested it again. The first read also selected the founder fallback on failure, so simply deleting it would have changed error handling.

The host still makes that authorised preflight request. It passes the returned tickets to `feedbackHub.open(initialTickets)`, whose optional argument accepts an empty array as a successful result. Opens without an argument, filters and existing action refreshes still request fresh data. No cache is reused across user opens, and no error is converted into an empty success.

Existing server RPCs, permission checks, founder-role lookup, reporter error text and legacy founder fallback remain intact. A denied reporter cannot use that fallback; founder fallback errors still display their own error without report data. Passing a preflight snapshot also requires checking that the account has not changed while it was loading. The host now discards both successful/error results for an expired account context, so a response started before sign-out cannot reopen private reports afterward. Server-side permissions and RLS were not changed.

The success path makes one fewer ticket-list RPC per open. Badge polling, subsequent filter reads, action refreshes and finding 9's separate public-reader requests are unchanged.

## Finding 24: current documentation

Updated five current guides, checking claims against source and configuration:

- `docs/ARCHITECTURE.md`: runtime boundaries, serverless APIs, local/cloud documents and comments, Yjs, illustrated/ruby reader, Google ID-token exchange, account defaults, 25 language routes, free access and ordinary releases.
- `docs/HOSTED-SETUP.md`: CI's Node 22, local-only previews versus mocked auth, Vite/serverless distinction, complete schema requirements, opt-in device key storage, signed-in local projects, language-aware dictionary support, actual size/processing limits and sequential verification commands.
- `docs/TECH-STACK.md`: supported providers, Yjs and server preview dependencies, safe data boundaries, language/access rules, source/generated files and selected file descriptions. It no longer claims to describe every tracked file.
- `docs/RELEASE-WORKFLOW.md`: current-master feature work, lead review, ordinary Vercel Git deployment versus optional manual migration/release workflows, and no automatic SQL/tag/release on merge.
- `README.md`: module verification command, local-only preview/test distinction, selected-file-guide wording and current schema/deployment explanation. Existing approved release copy and artwork were not changed.

The language module evaluates to ten languages and 25 routes, with `zh-Hans` retained. Documented file/reader limits come from `model.js`, `main.js`, `source-import.js` and the reader constants. Device storage expiry and Google nonce/token flow were traced in editor/provider and auth source. Workflow descriptions were checked against the tracked YAML and `vercel.json`, not inferred from old infrastructure notes.

No historical release, incident, offer, migration, announcement, legal page, handoff or security-review record was rewritten. This work does not verify live identity-provider settings, deployed migration ledgers, subscription states or hosting configuration.

## Exact batch-2 file list

Runtime changes:

- `web/src/epub-reader.js`: remove two unused private declarations only.
- `web/editor/adapter.js`: remove one unused private lookup only.
- `web/src/welcome-planet.js`: remove an unassigned timer and no-op clears only.
- `web/src/main.js`: reuse the authorised ticket result and guard its account context in `openFeedbackHub` only.
- `web/src/feedback-hub.js`: accept that optional initial result; all other loads retain their fetch/error path.

Documentation: the five current guides listed above, plus this handback.

Added regressions: `tests/auth/feedback-hub.spec.js` (eight app scenarios) and `tests/modules/feedback-hub-loading.spec.js` (three component scenarios). Existing tests remain unchanged.

## Verification

All required checks passed on the final candidate. Browser suites ran sequentially:

| Command/check | Result |
| --- | --- |
| `npm test` | 118 passed, zero failed. |
| `npm run build` | Passed; editor assets generated and production assets built. |
| `npm run test:modules` | 26 passed, zero failed; includes private-parser behaviour coverage and batch-1 local-comment regressions. |
| `npm run test:auth` | 41 passed, zero failed; includes all eight Feedback Hub app cases and batch-1 auth/reader regressions. |
| `npm run test:e2e` | 105 passed, zero failed, in six minutes, against a fresh production build. |
| `git diff --check` | Passed; new files also checked for trailing whitespace/final newlines. |
| Structural preservation | Passed: EPUB/adapter/planet AST checks and all pre-existing batch-1 file checks described above. |
| Read-only integration checks | Upstream patch applies cleanly to this worktree; batch-2-only patch applies cleanly to the clean current-master checkout, and its reverse checks cleanly against this candidate. Nothing was applied. |

The general suite includes provider controls, hero interaction/visibility, reader/ruby/export behaviour, desktop/mobile guest comments, save/reopen, backups and interrupted translation recovery. No manual visual comparison was performed in this batch, and no CSS or artwork was edited. Production's newer responsive suite is not in this old-base worktree and must be run after integration. No assertion or existing test was deleted, disabled or weakened.

The initial component regression run failed the two supplied-snapshot cases and passed the standalone/filter case. The corrected app regression baseline failed the three duplicate-fetch cases and passed four permission/fallback cases. A delayed-sign-out case then failed on the intermediate snapshot-reuse candidate and passed after adding the account guard. During test authoring, corrected assertions to include the existing error-code detail and to inspect founder controls inside a closed details element; neither required changing product permission behaviour.

Focused final checks passed: all four feedback module tests (three new plus the existing safe-render/reply case), and all eight new app cases. Service responses are mocked at the synthetic Supabase URL; these are not live-service checks. Existing SQL permission tests run in isolated in-process PGlite, not a hosted database. No production content or credentials were used.

Logs are local `/tmp/perseus-batch2-*.log` files and may not survive cleanup. The original baseline snapshots remain available separately as noted above.

## Limits and review

Exported helper retirement, billing/entitlement changes, migrations, persistence queues, CRDT history, live EPUB parsing, public asset removal and unrelated UI changes remain deferred. This batch has no stylesheet or dependency changes. It does not integrate or retest the responsive changes already in production.

To review locally, use this worktree and run the focused suites sequentially:

```bash
npm run test:modules -- tests/modules/feedback-hub-loading.spec.js tests/modules/feedback-hub.spec.js
npm run test:auth -- tests/auth/feedback-hub.spec.js
```

Append `--headed --workers=1 --debug` to step through the mocked app flow. Do not force `VITE_LOCAL_ONLY=true` for auth tests. A guest-only manual preview can use `VITE_LOCAL_ONLY=true npm run dev`; it cannot exercise signed-in feedback without the test fixtures.

Eye and the lead must review the batch-only diff, retained interfaces and integration requirements before any next action. No later batch, commit, merge or release has been started.

## Lead review follow-up: legacy founder-inbox lifecycle

This section records the separately requested follow-up after batch-2 review. The earlier file list, verification and review patch describe the pre-follow-up candidate. The initial ticket guard did not cover the later legacy inbox read. No claim above about delayed ticket snapshots should be read as proof that the legacy path was already guarded.

### Root cause and reproduction

`showFeedbackInbox()` awaited `remote.feedbackInbox()` and wrote its result without checking the account, dialog or request context. Auth changes closed the dialog and emptied its list, but a late success could append old reports back into that closed DOM. Its error handler could also overwrite status after the context had expired. Lazy screenshot URL reads and deletion completion handlers had the same missing UI-context checks.

The legacy function in the saved pre-follow-up candidate is AST-identical to the original `4ca4f07` function. This is pre-existing behaviour, not a regression caused by batch 2's duplicate-fetch removal.

Read the lead's reproduction at `.worktrees/lead-perseus-review/tests/auth/feedback-hub.spec.js` and ported its named case into this worktree, with fixture additions only. Before implementation:

```bash
npm run test:auth -- tests/auth/feedback-hub.spec.js --grep 'lead review:'
```

failed at `expect(#feedback-inbox-list).toBeEmpty()`: releasing the held founder-inbox response after sign-out restored report nodes. The evidence log is `/tmp/perseus-inbox-followup-red.log`. The lead review checkout was only read, not copied over this worktree or modified.

### Exact follow-up changes

Only four files differ from the saved pre-follow-up state:

- `web/src/main.js`: capture account identity, founder status, request generation and dialog-open state for legacy reads. Ignore stale list results/errors, signed screenshot URLs/errors, image callbacks and deletion UI completions. Invalidate pending work on account transitions, new hub attempts, new displayed views and dialog closure. The initial ticket preflight also checks its generation before starting either view or fallback.
- `web/src/feedback-hub.js`: add an optional `onOpen` lifecycle notification, defaulting to a no-op. The host uses it to supersede a pending legacy inbox when a filter, action refresh or normal hub open starts. Existing fetching, rendering, permission behaviour and error handling remain in place.
- `tests/auth/feedback-hub.spec.js`: extend the synthetic fixture with held list/screenshot/delete responses and account switching; retain the original eight test bodies unchanged and add 17 focused cases, including the lead's exact named regression.
- `docs/PERSEUS-BATCH2-HANDBACK.md`: this follow-up record. Earlier batch artifacts are retained separately.

The newest open attempt and newest displayed view have separate generation stamps. Native dialog close events are queued; an old close event must not invalidate a newer open that is still awaiting its preflight. A current legacy response requires the captured account and generation to match, founder status to remain true, and the dialog to remain open. User-ID equality alone cannot validate work across close/reopen or sign-out/sign-in as the same account.

Successful current reads still render normal reports. Current errors still display their original error text. A failed read is not converted to an empty successful list. Founder authorisation, ticket-error fallback selection, RPC names/arguments, screenshot signing and delete confirmation remain unchanged. Already-started mutations are not cancelled; only their stale UI effects are suppressed.

### Regression coverage

The feedback auth file now contains 25 scenarios: the original eight plus 17 follow-up cases. The new cases cover:

- The lead's delayed-success-after-sign-out failure, and a delayed error after sign-out.
- Account switching and sign-out/sign-in as the same account.
- Closing with a list request pending, for both success and error.
- Close/reopen followed by a newer successful fallback, for older success and error responses.
- A filter superseding a pending legacy request without closing the dialog.
- A new hub attempt superseding the legacy request before the newer preflight has completed.
- An older failed ticket preflight being prevented from starting a fallback over a newer hub.
- Delayed screenshot URL/error results after closure, including zero image fetches from stale URLs.
- Normal current screenshot loading and signing errors.
- Normal founder deletion and a delayed deletion error that must not overwrite a newer inbox's status.

Existing cases still cover current fallback success after missing/unavailable ticket RPCs, founder fallback permission errors, reporter denial and one ticket fetch per normal open. Assertions inspect DOM contents even while the dialog is closed, plus status text and image request counts.

The initial focused run passed all 23 scenarios then present. Two deletion-completion cases were subsequently added and are included in final auth verification. No existing test was removed or weakened. All original eight feedback test bodies are AST-identical to the pre-follow-up snapshot; their fixture was extended.

### Follow-up verification and limits

All follow-up checks passed on the local candidate, with suites run sequentially:

| Command/check | Result |
| --- | --- |
| Lead reproduction before the fix, command above | Failed as expected: old report data returned to the closed DOM. |
| `npm run test:auth -- tests/auth/feedback-hub.spec.js` | Initial focused run: 23 passed. The final two deletion cases were then included in the full auth run. |
| `npm test` | 118 passed, zero failed. |
| `npm run build` | Passed, including generated editor preparation. |
| `npm run test:modules` | 26 passed, zero failed. |
| `npm run test:auth` | 58 passed, zero failed; all 25 focused feedback cases and the earlier batch regressions passed. |
| `git diff --check` | Passed; changed files also checked for trailing whitespace/final newlines. |
| Preservation checks | 23 other pre-existing files are byte-identical to the snapshot; all eight original feedback tests are AST-identical. Main code outside the inbox handlers and their lifecycle hooks, and component code outside the optional open notification, are AST-identical. The lead test file hash is unchanged. |
| Runtime-only patch compatibility | Read-only `git apply --check` succeeds against the lead's combined review checkout. No patch was applied. |

Logs are `/tmp/perseus-inbox-followup-{red,focused,unit,build,modules,auth}.log`; they may not survive machine cleanup. Follow-up verification did not rerun the general or responsive suites. No existing assertions were deleted, disabled or weakened.

These checks use synthetic users and intercepted responses at the fake Supabase endpoint. Unit SQL tests use in-process PGlite. They do not establish live Supabase behaviour. No production user data, hosted database or external permission configuration was accessed. No screenshot/visual comparison was needed for this DOM-lifecycle fix; no CSS or responsive controls changed.

Eye/lead reported that the earlier isolated combined candidate passed 118 unit, 26 module, all 41 supplied auth and 16 responsive/hero tests, with the added founder regression as its sole failure. Those are lead-reported pre-follow-up results, not tests rerun by Perseus against that checkout. The earlier 105 general browser passes also belong to batch 2 before this follow-up.

### Preservation and integration

Before editing, saved all 27 existing modified/untracked files and a hash manifest under `/tmp/perseus-inbox-followup-baseline-1d4_gjks`; its path is recorded in `/tmp/perseus-inbox-followup-baseline-path`. This separates the follow-up from batches 1 and 2. The earlier batch-2-only patch remains the pre-follow-up artifact; it has not been overwritten to hide this delta.

Follow-up review artifacts are under `test-results/perseus-inbox-followup-review/`: `followup-only.patch`, `runtime-only.patch` and `followup-manifest.json`. The runtime patch contains only the two runtime files. The full patch additionally contains the auth fixture/regressions and this handback update. These ignored local files are review artifacts, not commits or applied changes.

The lead review worktree is based at `6537ea4` and already contains the combined candidate and the extra lead test. Integrate the narrow runtime hunks into that candidate while retaining its responsive import/styles and both approved batches. Reconcile fixture/test additions so the lead's named regression exists once; do not replace the lead's entire test file with ours or blindly apply a patch that adds a duplicate case. Re-run the focused lifecycle tests, required unit/build/module/auth checks and the lead's responsive/hero checks on the exact updated combined tree before approval or integration.

Perseus's branch remains at `4ca4f07`; it has not been merged, rebased, committed, pushed or deployed. Server permissions, SQL, dependencies, billing, persistence and responsive CSS are unchanged. No later batch has started.

## P3 follow-up, 2 November 2026: collapsed screenshot completion

The lead identified one regression in the privacy follow-up: collapsing a report while its screenshot download was pending made both completion handlers return early. A failed image retained its `src`, so reopening skipped the retry. A successful image could retain `Loading screenshot...` because reopening reused the existing `src` and no new load event occurred.

The fix removes only the report-expanded requirement from `image.onload` and `image.onerror`. Account identity, founder role, generation, dialog-open and connected-card checks remain intact. A collapsed report can complete within its valid inbox view. A closed, replaced or unauthorised view still cannot be updated. Request-start and post-signing checks still require the report to be expanded; this change does not start screenshot requests for collapsed reports.

Within a valid context, failure clears `src`, hides the image and retains the existing retry message. Reopening then signs and downloads again. Success clears the loading message even while collapsed, retaining the decoded image for reopening without another download.

### P3 scope and regression evidence

Only three files differ from the saved pre-P3 state:

- `web/src/main.js`: two callback-condition edits and one explanatory comment. No other runtime logic changed.
- `tests/auth/feedback-hub.spec.js`: port the lead's named regression once, extend it through a successful reopen/retry, and add the successful-download-while-collapsed case. Existing fixture code and all prior 25 tests remain byte-identical.
- `docs/PERSEUS-BATCH2-HANDBACK.md`: this P3 record.

Read the reproduction in the lead checkout without modifying it. Before the fix, both cases failed under:

```bash
npm run test:auth -- tests/auth/feedback-hub.spec.js --grep 'while collapsed'
```

The failure case retained its failed `src`; the success case retained `Loading screenshot...`. The log is `/tmp/perseus-collapsed-screenshot-red.log`. The ported failure test keeps the lead's exact name, `lead review: a screenshot download failure while collapsed remains retryable`, and verifies that reopening completes a fresh successful retry with exactly two signings and two download attempts. The success case verifies a decoded image, cleared status while collapsed, and reuse after reopening with one download attempt.

An AST comparison confirms that the entire runtime differs only by removing `card.open` from those two completion conditions. All other privacy guards and earlier logic are unchanged. The other 24 pre-existing files and the lead test file remain byte-identical to the pre-P3 snapshot at `/tmp/perseus-collapsed-screenshot-baseline-n9k5tbsf` (path also recorded in `/tmp/perseus-collapsed-screenshot-baseline-path`).

### P3 verification and review

P3 verification passed:

| Command/check | Result |
| --- | --- |
| The two `while collapsed` regressions before the fix | Both failed with the expected retained `src` / loading-message symptoms. |
| `npm run test:auth -- tests/auth/feedback-hub.spec.js` | All 27 affected tests passed, including both new cases and all 25 earlier lifecycle/permission cases. |
| `npm run build` | Passed. |
| `git diff --check` | Passed; changed files checked for trailing whitespace and final newlines. |
| Preservation | All prior test/fixture bytes are unchanged. Runtime AST differs only by the two callback expansion checks; all other guards and runtime code are unchanged. The other 24 existing files and the lead test file are unchanged. |

Logs are `/tmp/perseus-collapsed-screenshot-{red,auth,build}.log`. The broader unit, module, full auth, general and responsive suites were not rerun for this two-condition P3 delta; their earlier results remain attributed to the earlier candidates above.

These image and auth responses are mocked; the browser executes the real download completion/error callbacks and checks DOM state and image decoding. No live-service or production-data verification was performed. Broader suite results earlier in this document describe their respective earlier candidates, not fresh P3 runs.

P3-only artifacts are under `test-results/perseus-collapsed-screenshot-review/`: `p3-only.patch`, `runtime-only.patch` and `p3-manifest.json`. Earlier batch and privacy-follow-up artifacts remain separate. Integrate the single-file runtime delta on top of the reviewed privacy fix, preserving its lifecycle guards and responsive changes. The lead already has the named failure regression; keep one copy and reconcile its new retry assertions and the additional success case rather than replacing the entire test file.

The lead checkout remains unchanged. No commits, pushes, merges, deployments, database changes or other cleanup were performed. Stop for Eye and lead review after this P3 follow-up.
