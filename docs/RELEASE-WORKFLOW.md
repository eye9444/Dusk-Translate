# Staging and Release Workflow

## Environments

| Environment | Branch | Data | Purpose |
| --- | --- | --- | --- |
| Feature preview | `feature/*`, `fix/*`, `ops/*` | Staging Supabase | Review one change before integration |
| Staging | `staging` | Browser-local only | Test one coherent release candidate without production data |
| Production | `master` | Production Supabase | Public, accepted releases only |

Preview and staging builds carry a visible environment, version, and commit badge. Never put production Supabase credentials in Preview or staging Vercel variables.

## One-time setup

1. In Vercel, create `staging.dusktranslate.com` and assign it to the `staging` branch. Staging builds set `VITE_LOCAL_ONLY=true`, so inherited Preview Supabase variables are ignored.
2. Use staging for local project, editor, reader, import, export, and browser-persistence acceptance. Authentication, cloud sync, collaboration, hosted feedback, and public reader links remain covered by mocked CI suites rather than the hosted staging site.
3. Create the GitHub `staging` environment and retain the existing `Production` environment. Add required reviewers to both environments.
4. Add staging environment secret `VERCEL_TOKEN` and optional `VERCEL_AUTOMATION_BYPASS_SECRET`. Production additionally requires `SUPABASE_DB_URL` for release migrations.
5. Add environment variables `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `STAGING_DOMAIN=staging.dusktranslate.com`.
6. Protect `staging` and `master`. Require pull requests, `Unit, security, and build`, and `Browser suites`; dismiss stale approvals; require conversations to be resolved; block force pushes and deletion. Require creator approval for `staging -> master` release PRs.

Staging never connects to Supabase or seeds cloud fixtures. Production remains migration-gated and must keep its database credentials only in the protected `Production` environment.

## Daily development

1. Branch from `staging` using `feature/<name>`, `fix/<name>`, or `ops/<name>`.
2. Keep commits focused and push the branch. Vercel may create a feature preview, while GitHub runs both required check suites.
3. Open a PR into `staging`, complete the feature template, review the preview, and merge only when the change is ready to join the release candidate.
4. Keep only one release candidate in staging. Fix rejected behaviour in a new branch and merge it back into `staging`; do not patch `master` first.

## Releasing

1. Test the stable local-only staging URL and complete the release checklist. Record approval on the release PR. Use CI results for cloud-specific acceptance.
2. Choose the version manually. Features and bug fixes increment `package.json`; visual-only changes keep the current version and do not add a What's New entry.
3. Open `staging -> master`. The merge commit must contain the exact approved staging tree.
4. Merging runs production migrations, builds an unaliased production candidate, smoke-tests it, promotes it to the public domains, and smoke-tests the public site.
5. If the package version has no GitHub release, the verified production commit receives its matching tag and release. If the tag already exists, the deployment remains a silent same-version update.

## Failure and rollback

- A failed migration, build, candidate smoke, or public smoke leaves the workflow red. A candidate is never promoted after a failed pre-promotion smoke.
- Database migrations are forward-only. Repair a failed migration with a new migration rather than rewriting an applied file.
- For an application regression, revert the release PR into `staging`, verify the reverted candidate, then promote it through a new release PR. Do not force-push protected branches.
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

Smoke any hosted deployment with `SMOKE_URL=https://deployment.example npm run smoke:hosted`.
