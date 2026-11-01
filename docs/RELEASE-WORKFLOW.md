# Staging and Release Workflow

## Current UI release path

Before requesting wording, give Eye the complete change list for the commit or release, distinguishing already-live updates from pending changes. Before major commits or pushes, ask Eye for the commit wording and wait for his answer. Before a new version release, fill in `WHATS-NEW-TEMPLATE.md`, show the draft, and ask what he wants changed before publishing. Record the chosen wording; do not treat approval of a UI preview as approval of a commit message or release announcement.

For UI-only updates and browser fixes that do not require database changes, use
the existing Vercel Git integration: review the preview, pass the required PR
checks, then merge the approved changes into `master`. Vercel deploys production
from `master`; verify the live deployment afterward. Prior creator approval does
not need another preview round when the approved UI has not changed.

The custom production workflow below is now **manual only**. Do not run it for
ordinary UI updates. It requires separately configured credentials and applies
database migrations. New database-dependent features must have their migrations
reviewed and applied before shipping the application changes that depend on them.
Merging migration files does not apply them through the Vercel Git integration.
Create version tags and GitHub releases only after verifying the live version.

The sections below describe the optional managed staging/migration workflow, not
requirements for publishing an already-approved UI update.

## Environments

| Environment | Branch | Data | Purpose |
| --- | --- | --- | --- |
| Feature preview | Isolated feature/fix branch | Browser-local, or a separately authorised test backend | Review one change before integration |
| Staging | `staging` | Browser-local only | Test one coherent release candidate without production data |
| Production | `master` | Production Supabase | Public, accepted releases only |

Preview and staging builds carry a visible environment, version, and commit badge. Never put production Supabase credentials in Preview or staging Vercel variables.

## Optional managed staging setup

These are configuration requirements for `.github/workflows/deploy-staging.yml`, not evidence that any domain, secret or protected environment is currently configured. The ordinary feature-preview/Git deployment path above does not require a dedicated staging Supabase project.

1. In Vercel, create `staging.dusktranslate.com` and assign it to the `staging` branch. Staging builds set `VITE_LOCAL_ONLY=true`, so inherited Preview Supabase variables are ignored.
2. Use staging for local project, editor, reader, import, export, and browser-persistence acceptance. Authentication, cloud sync, collaboration, hosted feedback, and public reader links remain covered by mocked CI suites rather than the hosted staging site.
3. Create the GitHub `staging` environment and retain the existing `Production` environment. Add required reviewers to both environments.
4. Add staging environment secret `VERCEL_TOKEN` and optional `VERCEL_AUTOMATION_BYPASS_SECRET`. Production additionally requires `SUPABASE_DB_URL` for release migrations.
5. Add environment variables `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `STAGING_DOMAIN=staging.dusktranslate.com`.
6. Protect `staging` and `master`. Require pull requests, `Unit, security, and build`, and `Browser suites`; dismiss stale approvals; require conversations to be resolved; block force pushes and deletion. Require creator approval for `staging -> master` release PRs.

This hosted staging workflow forces browser-local mode and has no database seeding/migration step. Keep any credentials needed by the optional production workflow in its protected environment. The ordinary Vercel Git path does not automatically apply database migrations or wait on that workflow.

## Daily development

1. Inspect the current instructions, worktrees and uncommitted changes. Fetch `origin/master`, then use a fresh isolated feature/fix branch from that base for new development. Preserve other agents' active worktrees. An approved batch already in progress needs an explicit integration plan; do not merge over its uncommitted work.
2. Implement the assigned change and run relevant focused checks, the unit suite, build and affected browser suites. Use synthetic data and mocked cloud paths unless a separate test environment is authorised.
3. Give Eye and the lead the full change list, evidence and limitations. Get the required wording before committing or pushing. A preview approval alone is not commit-message approval.
4. Eye and the lead coordinate the preview, PR checks and approved merge to `master`. Do not make passing through the optional `staging` branch a requirement for an ordinary UI fix.

## Releasing

1. Review the exact feature candidate and required checks. Browser-local/mocked results do not establish live cloud behaviour. New database dependencies require a separate reviewed migration/deployment plan before the dependent app is shipped.
2. Eye chooses version and announcement wording. Features and bug fixes can warrant a version change; cosmetic updates normally keep the current version. Keep bug-fix details in release notes and product features in What's New. Do not rewrite released tags or approved historical announcements.
3. The lead coordinates the approved merge to `master`. Vercel's Git integration deploys the application from that merge. Merging does not apply SQL, dispatch the custom workflow, or create a GitHub release.
4. The lead verifies the exact deployed commit and live behaviour, then coordinates any version tag/release with Eye. A passing local build is not a deployment.

### Optional manual production workflow

`.github/workflows/release.yml` has only `workflow_dispatch`. When separately authorised and configured, it verifies the selected commit, applies migrations, builds/deploys an unaliased candidate, smoke-tests, promotes, and checks the public site before its tag/release steps. Do not dispatch it for ordinary UI updates. Its migration credentials, environment protection and ledger must be reviewed separately; do not treat this description as permission to run it.

## Failure and rollback

- In the optional manual workflow, failed verification or candidate smoke prevents promotion. A public smoke failure happens after promotion and needs lead intervention; it is not an automatic rollback.
- Database migrations are forward-only. Repair a failed migration with a new migration rather than rewriting an applied file.
- For an application regression, Eye and the lead choose a reviewed revert or forward fix from the current production base. Preserve unrelated responsive/product fixes and verify the candidate before integration. Do not force-push protected branches or perform a rollback without authorisation.
- Preserve Playwright failure artifacts and link them from the repair PR.

## Local verification

```bash
npm ci
npm audit --audit-level=high
npm test
npm run build
npm run test:e2e
npm run test:auth
npm run test:modules
```

For a separately authorised hosted smoke check, set `SMOKE_URL` to the intended target before `npm run smoke:hosted`. Without a target the script defaults to production. It creates a browser-local synthetic project; it does not establish live cloud/collaboration behaviour. Production verification belongs to Eye and the lead.
