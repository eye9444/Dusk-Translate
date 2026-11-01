# Hosted DuskTranslate

The web application packages the editor source from `web/editor/engine.html`. Historical standalone HTML releases remain available on the `legacy-standalone` branch. The hosted app supports 25 approved language routes across Japanese, English, Vietnamese, Russian, German, Spanish, Italian, Portuguese, Korean and Simplified Chinese. See `web/src/languages.js` and the route list in `ARCHITECTURE.md`; this is not all-to-all translation.

## Run locally

CI uses Node 22. From the intended feature worktree, run `npm ci`, then `VITE_LOCAL_ONLY=true npm run dev` for a browser-local preview. Use `npm run dev` without that override when intentionally exercising a configured test backend. `npm run build` prepares the editor and creates `dist/`; Vercel serves those assets alongside the handlers in `api/`. Vite alone does not execute the serverless handlers.

Without Supabase configuration, the app provides a working browser-local project library. It does not pretend to authenticate users. Original books, translations, glossary, chapter position, style and model choice are saved in IndexedDB. Provider keys and development logs are never included in snapshots. Provider keys normally stay in the editor session; optional device storage remembers keys and endpoint settings in localStorage with a 30-day expiry.

All current features are free. AI-provider usage may cost money, and cloud capacity limits still apply. Paid UI is retained for isolated development testing; do not disable community access in production to test it. Existing billing records and administrative roles are separate from free product access.

## Enable accounts and cloud projects

1. For a separately authorised test environment, review the full `supabase/migrations/` chain and its migration ledger before applying a schema. The initial `202609100001_projects.sql` file alone is insufficient for current comments, collaboration, workflow, reader and access features. Reconcile the existing duplicate `202610100001` version prefix with the lead before using a migration tool; do not rename applied files or replay SQL blindly. Repository SQL is not evidence of deployed database state.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel's project environment settings. Use only a publishable/anon key, never a service-role key. Locally, copy `.env.example` to `.env.local` and fill those two values.
3. In Supabase Auth URL Configuration, set Site URL and allowed redirects to your exact deployed origin with a trailing slash. Add `http://localhost:5173/` or `http://127.0.0.1:5173/` if used locally. Avoid a broad production wildcard.
4. Enable email/password authentication and email confirmation. Configure your SMTP sender for public signups; Supabase's default mail service is restricted and is not suitable for a public launch.
5. Rebuild/redeploy after setting environment variables. They are read at build time.
6. Verify signup confirmation, login, password reset, logout, project upload, reload, and export with real test accounts. Test that a second account cannot read the first account's projects or book objects.

Auth uses the Supabase browser session. This login session is separate from AI-provider settings and their optional device storage. Book contents go to the selected AI provider when the user starts a translation. Supabase stores cloud project contents; it is not end-to-end encrypted. Put server-only credentials such as `SUPABASE_SERVICE_ROLE_KEY` in the authorised server environment, never in `VITE_*` variables. Server configuration is read by `server/supabase.js` and `server/paddle.js`; a frontend-only Vite preview does not supply those APIs.

## Enable Google sign-in and sign-up

The same **Continue with Google** button signs in returning users and creates accounts for new users. Email/password sign-up, confirmation, login, and password reset remain available. No separate Google password is collected by DuskTranslate. The button checks Supabase's public provider settings, opens Google's account chooser on the current origin, and exchanges the returned ID token with Supabase.

1. Complete the Supabase account setup above first. Without those environment variables, both email and Google buttons are disabled; the browser-local library still works.
2. In Google Cloud, configure the OAuth consent screen for your project and create an OAuth client of type **Web application**. If the consent app is in Testing, add your demo users as test users.
3. Add `https://www.dusktranslate.com`, `https://dusktranslate.com`, and each exact development origin to the Google client's **Authorized JavaScript origins**. Do not add paths or trailing slashes to origins.
4. Keep the exact callback URL shown in Supabase's Google provider settings in the Google client's **Authorized redirect URIs**. It looks like `https://<project-ref>.supabase.co/auth/v1/callback` and remains useful for provider configuration and legacy authorization responses.
5. Enable Google in Supabase Authentication's sign-in providers. Enter the Google client ID and secret there. Never put the Google client secret in source code, `VITE_*` variables, or chat.
6. Set `VITE_GOOGLE_CLIENT_ID` in Vercel to the same Web client ID. This identifier is public browser configuration; do not use the client secret. Keep Supabase's Site URL and redirect allowlist configured for the custom domain for email confirmation and password recovery.
7. Redeploy after setting all three public frontend variables. Verify with a real Google test account: sign up, sign out, sign back in, reload, and confirm its private library returns. Check another account cannot see its projects.

## Protect email authentication with Turnstile

1. Create a Cloudflare Turnstile widget for `dusktranslate.com` and `www.dusktranslate.com`.
2. Set its public site key as `VITE_TURNSTILE_SITE_KEY` in Vercel.
3. In Supabase, open Authentication > Bot and Abuse Protection, enable CAPTCHA, choose Cloudflare Turnstile, and enter the matching secret key.
4. Change the Supabase Reset password email template to include the six-digit `{{ .Token }}` value. DuskTranslate verifies that recovery code before accepting a new password.
5. Redeploy and test sign-in, sign-up, reset request, recovery code, and password change with an email/password test account.

Google Identity Services returns a signed ID token to the page, which is immediately exchanged for a Supabase session. A fresh random nonce is held in memory, while only its SHA-256 digest is sent to Google; the token is never stored by application code. Email confirmation continues to use Supabase PKCE links, while password recovery accepts the emailed verification code. Cancelled and expired legacy callbacks are still cleaned from the address bar. Local projects are not automatically uploaded when you log in.

### Brand the Google sign-in screen

Google shows two different pieces of identity and they are configured separately:

- Configure the app name, logo, home page, privacy policy, terms, and authorized domain in the Google Auth Platform **Branding** section. Complete brand verification when Google requests it. This makes the OAuth application identify itself as DuskTranslate.
- The direct Google Identity Services flow identifies the configured Google Web client rather than navigating through the Supabase project hostname. A Supabase custom domain is not required for this account chooser.

Before activating a custom domain, add both the existing Supabase callback and the new custom-domain callback to the Google OAuth client's authorized redirect URIs. After activation, Supabase Auth advertises the custom hostname; the original project hostname remains available. Follow the official [Supabase custom-domain guide](https://supabase.com/docs/guides/platform/custom-domains) rather than changing only `redirectTo` in frontend code.

See the official [Supabase Google setup guide](https://supabase.com/docs/guides/auth/social-login/auth-google) and [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## Project behavior

The reading-room home page has Library/Archive navigation, project counts, a Continue shortcut, and gallery/card/list layouts. Gallery is the default; layout choice is remembered on the device. Press `/` outside forms to focus project search. Search results and empty collections have their own actions; no sample projects are inserted into a user's library. The shell adapts on smaller screens and supports both light and Eclipse themes.

The home screen uses a wide frosted-glass window with Manrope UI text and Newsreader headings. Eclipse uses black surfaces and fiery orange accents. Signed-out visitors see a welcome page, not the project menu. An explicit device-only option keeps existing local work accessible without an account. The original vector logo in `web/public/brand/dusk-mark.svg` combines an open book and a setting sun and is also the favicon. Google credential downloads under `supabase/google cloud/` are excluded from Git and Vercel uploads.

**Remember me** keeps Supabase authentication in localStorage when checked and in sessionStorage when unchecked. Unchecked sessions normally end with the browser tab, although browser session-restore features can restore them; explicitly sign out on shared devices. This choice never stores AI keys or removes project files. Email confirmation uses PKCE in the initiating browser; the normal recovery form verifies the emailed code. Legacy recovery callbacks remain supported.

## Yomitan dictionary support

Japanese-source projects offer a Yomitan setup action in the editor's tools menu. Other source languages retain their own metadata and do not show the Japanese dictionary action. To scan inside the split editor, enable Yomitan's advanced **Show iframe popups in the root frame** setting; otherwise the popup can be constrained by the iframe.

On desktop, the default Yomitan gesture is Shift plus hover; supported mobile browsers use touch. Yomitan still needs to be installed separately with at least one Japanese dictionary. DuskTranslate does not load Yomitan, access its history, or proxy dictionary searches.

Use the official [Yomitan getting-started guide](https://yomitan.wiki/getting-started/). Browser support varies, especially on mobile, so do not promise extension support on every browser.

Cloud writes first retain a local draft. If syncing fails, the library preserves that draft and shows a pending-sync label. You can return to the library after confirming the draft was saved locally, reopen it, and retry with Save now. A failed library fetch shows locally cached account projects instead of an empty list. Revision conflicts never overwrite a newer remote revision; keep a backup when resolving them.

- Guest projects stay in the guest library. Signed-in users can keep a project local or use the cloud. Logging in does not silently upload guest documents or migrate their comments. Account-local comments stay in that account's browser namespace.
- Project edits are saved automatically; wait for the save indicator before closing. Manual translations, glossary changes, chapter selection, and interrupted streams are included.
- The original book is retained, so EPUB export works after reopening a project. TXT and source JSON projects are supported too.
- Rename, archive/restore, and delete are available from the library. Deletion requires confirmation and removes the original file and project progress.
- One tab may edit a given project at a time. Cloud updates use optimistic revision checks to detect concurrent changes on another device. An unsynced draft is retained on the originating browser. Download a backup before resolving a conflict.
- Browser-local storage is not permanent backup. Clearing site data removes local projects. Download backup exports the original file and snapshot as a ZIP; create a new project using that ZIP to restore it. This also lets you explicitly move local work into your account library after signing in.
- File validation allows up to 50 MiB. EPUB/backup expansion checks use a 500 MiB ceiling; the EPUB reader additionally bounds streamed processing to 128 MiB, each markup entry to 8 MiB and each image to 32 MiB, with traversal/reference limits. These are different checks, not a guarantee that every archive below 500 MiB will open. Account storage quotas still apply.
- Translation only runs while the page stays open. Interrupted output is saved as partial, not marked complete.

## Verification

`npm test` covers snapshot serialization, partial progress, upload validation, and Postgres RLS owner isolation/revision checks using PGlite.

`npx playwright install chromium` then `npm run test:e2e` verifies real browser project creation, edit persistence, glossary/chapter restoration, original EPUB retention/export, untrusted text rendering, project management, tab locking, and mobile layout. These use synthetic books and do not consume model API credits. Real email delivery and cloud integration require a configured Supabase project.

`npm run test:auth` tests email signup confirmation, rejected credentials, login/logout, password-reset redirects, direct Google ID-token exchange with nonce separation, and cancelled or expired legacy callbacks against mocked Google and Supabase responses. These tests do not establish that a live Auth project, Google OAuth client, or mail sender has been configured.

Run the suites sequentially because they prepare editor assets and start local servers:

```bash
npm test
npm run build
npm run test:e2e
npm run test:auth
npm run test:modules
git diff --check
```

The general browser suite uses a production build on port 4173; auth uses a Vite server with synthetic configuration on 4174; modules use 4175. `npm run test:modules` exercises components and archive helpers with browser fixtures. Do not globally export `VITE_LOCAL_ONLY=true` while running auth tests: they need the mocked cloud client. Install the browser with `npx playwright install chromium` if missing.

For normal UI release review, follow `RELEASE-WORKFLOW.md`. Feature previews use browser-local testing and mocked cloud coverage unless a separate test environment is explicitly authorised. A merge deployed through Vercel Git does not apply SQL migrations.

Official setup references: [password authentication](https://supabase.com/docs/guides/auth/passwords), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [storage access control](https://supabase.com/docs/guides/storage/security/access-control).
