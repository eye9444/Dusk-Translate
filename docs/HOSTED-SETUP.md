# Hosted DuskTranslate

The web application packages the editor source from `web/editor/engine.html`. Historical standalone HTML releases remain available on the `legacy-standalone` branch. The hosted app currently translates Japanese to English.

## Run locally

Use Node 22 or 24 LTS, then run `npm ci` and `npm run dev`. `npm run build` creates `dist/`; only that directory is served on Vercel.

Without Supabase configuration, the app provides a working browser-local project library. It does not pretend to authenticate users. Original EPUBs, translations, glossary, chapter position, style, and model choice are saved in IndexedDB. Provider keys and development logs are never included in snapshots. Keys are cleared whenever the editor is reopened.

## Enable accounts and cloud projects

1. Create a Supabase project and run `supabase/migrations/202609100001_projects.sql` once in its SQL editor. This creates the `projects` table, private `books` bucket, owner-only row/storage policies, and revision trigger.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Vercel's project environment settings. Use only a publishable/anon key, never a service-role key. Locally, copy `.env.example` to `.env.local` and fill those two values.
3. In Supabase Auth URL Configuration, set Site URL and allowed redirects to your exact deployed origin with a trailing slash. Add `http://localhost:5173/` or `http://127.0.0.1:5173/` if used locally. Avoid a broad production wildcard.
4. Enable email/password authentication and email confirmation. Configure your SMTP sender for public signups; Supabase's default mail service is restricted and is not suitable for a public launch.
5. Rebuild/redeploy after setting environment variables. They are read at build time.
6. Verify signup confirmation, login, password reset, logout, project upload, reload, and export with real test accounts. Test that a second account cannot read the first account's projects or book objects.

Auth uses the Supabase browser session. This login session is separate from AI-provider API keys, which are only held in the editor's memory. Book contents go to the selected AI provider only when the user starts a translation. Supabase stores cloud project contents; it is not end-to-end encrypted.

## Enable Google sign-in and sign-up

The same **Continue with Google** button signs in returning users and creates accounts for new users. Email/password sign-up, confirmation, login, and password reset remain available. No separate Google password is collected by DuskTranslate. The button checks Supabase's public provider settings, opens Google's account chooser on the current origin, and exchanges the returned ID token with Supabase.

1. Complete the Supabase account setup above first. Without those environment variables, both email and Google buttons are disabled; the browser-local library still works.
2. In Google Cloud, configure the OAuth consent screen for your project and create an OAuth client of type **Web application**. If the consent app is in Testing, add your demo users as test users.
3. Add `https://www.dusktranslate.com`, `https://dusktranslate.com`, and each exact development origin to the Google client's **Authorized JavaScript origins**. Do not add paths or trailing slashes to origins.
4. Keep the exact callback URL shown in Supabase's Google provider settings in the Google client's **Authorized redirect URIs**. It looks like `https://<project-ref>.supabase.co/auth/v1/callback` and remains useful for provider configuration and legacy authorization responses.
5. Enable Google in Supabase Authentication's sign-in providers. Enter the Google client ID and secret there. Never put the Google client secret in source code, `VITE_*` variables, or chat.
6. Set `VITE_GOOGLE_CLIENT_ID` in Vercel to the same Web client ID. This identifier is public browser configuration; do not use the client secret. Keep Supabase's Site URL and redirect allowlist configured for the custom domain for email confirmation and password recovery.
7. Redeploy after setting all three public frontend variables. Verify with a real Google test account: sign up, sign out, sign back in, reload, and confirm its private library returns. Check another account cannot see its projects.

Google Identity Services returns a signed ID token to the page, which is immediately exchanged for a Supabase session. A fresh random nonce is held in memory, while only its SHA-256 digest is sent to Google; the token is never stored by application code. Email confirmation and password recovery continue to use Supabase PKCE links. Cancelled and expired legacy callbacks are still cleaned from the address bar. Local projects are not automatically uploaded when you log in.

### Brand the Google sign-in screen

Google shows two different pieces of identity and they are configured separately:

- Configure the app name, logo, home page, privacy policy, terms, and authorized domain in the Google Auth Platform **Branding** section. Complete brand verification when Google requests it. This makes the OAuth application identify itself as DuskTranslate.
- The direct Google Identity Services flow identifies the configured Google Web client rather than navigating through the Supabase project hostname. A Supabase custom domain is not required for this account chooser.

Before activating a custom domain, add both the existing Supabase callback and the new custom-domain callback to the Google OAuth client's authorized redirect URIs. After activation, Supabase Auth advertises the custom hostname; the original project hostname remains available. Follow the official [Supabase custom-domain guide](https://supabase.com/docs/guides/platform/custom-domains) rather than changing only `redirectTo` in frontend code.

See the official [Supabase Google setup guide](https://supabase.com/docs/guides/auth/social-login/auth-google) and [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## Project behavior

The reading-room home page has Library/Archive navigation, project counts, a latest-edited-project resume shortcut, and grid/list layouts. Layout choice is remembered on the device. Press `/` outside forms to focus project search. Search results and empty collections have their own actions; no sample projects are inserted into a user's library. The desktop-style shell adapts to a compact navigation bar on mobile, and supports both light and Eclipse themes.

The home screen uses a wide frosted-glass window with Manrope UI text and Newsreader headings. Eclipse uses black surfaces and fiery orange accents. Signed-out visitors see a welcome page, not the project menu. An explicit device-only option keeps existing local work accessible without an account. The original vector logo in `web/public/brand/dusk-mark.svg` combines an open book and a setting sun and is also the favicon. Google credential downloads under `supabase/google cloud/` are excluded from Git and Vercel uploads.

**Remember me** keeps Supabase authentication in localStorage when checked and in sessionStorage when unchecked. Unchecked sessions normally end with the browser tab, although browser session-restore features can restore them; explicitly sign out on shared devices. This choice never stores AI keys or removes project files. Email confirmation and password-recovery links must still return to the initiating browser for PKCE.

## Yomitan dictionary support

The hosted editor keeps Japanese source text selectable and marks it as Japanese. To scan inside the split editor, enable Yomitan's advanced **Show iframe popups in the root frame** setting. Yomitan disables this option by default, which can leave its popup constrained or clipped by the editor iframe. The editor's book icon opens a compact reminder of this requirement.

On desktop, the default Yomitan gesture is Shift plus hover; supported mobile browsers use touch. Yomitan still needs to be installed separately with at least one Japanese dictionary. DuskTranslate does not load Yomitan, access its history, or proxy dictionary searches.

Use the official [Yomitan getting-started guide](https://yomitan.wiki/getting-started/). Browser support varies, especially on mobile, so do not promise extension support on every browser.

Cloud writes first retain a local draft. If syncing fails, the library preserves that draft and shows a pending-sync label. You can return to the library after confirming the draft was saved locally, reopen it, and retry with Save now. A failed library fetch shows locally cached account projects instead of an empty list. Revision conflicts never overwrite a newer remote revision; keep a backup when resolving them.

- Local projects and account projects are separate libraries. Logging in does not silently upload local documents. Sign out to return to local projects.
- Project edits are saved automatically; wait for the save indicator before closing. Manual translations, glossary changes, chapter selection, and interrupted streams are included.
- The original book is retained, so EPUB export works after reopening a project. TXT and source JSON projects are supported too.
- Rename, archive/restore, and delete are available from the library. Deletion requires confirmation and removes the original file and project progress.
- One tab may edit a given project at a time. Cloud updates use optimistic revision checks to detect concurrent changes on another device. An unsynced draft is retained on the originating browser. Download a backup before resolving a conflict.
- Browser-local storage is not permanent backup. Clearing site data removes local projects. Download backup exports the original file and snapshot as a ZIP; create a new project using that ZIP to restore it. This also lets you explicitly move local work into your account library after signing in.
- Uploads are limited to 50 MB. EPUB expansion is capped at 500 MB in the parser. Large books may exceed a user's browser storage quota or Supabase quota.
- Translation only runs while the page stays open. Interrupted output is saved as partial, not marked complete.

## Verification

`npm test` covers snapshot serialization, partial progress, upload validation, and Postgres RLS owner isolation/revision checks using PGlite.

`npx playwright install chromium` then `npm run test:e2e` verifies real browser project creation, edit persistence, glossary/chapter restoration, original EPUB retention/export, untrusted text rendering, project management, tab locking, and mobile layout. These use synthetic books and do not consume model API credits. Real email delivery and cloud integration require a configured Supabase project.

`npm run test:auth` tests email signup confirmation, rejected credentials, login/logout, password-reset redirects, direct Google ID-token exchange with nonce separation, and cancelled or expired legacy callbacks against mocked Google and Supabase responses. These tests do not establish that a live Auth project, Google OAuth client, or mail sender has been configured.

Official setup references: [password authentication](https://supabase.com/docs/guides/auth/passwords), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [storage access control](https://supabase.com/docs/guides/storage/security/access-control).
