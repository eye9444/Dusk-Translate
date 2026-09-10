# Hosted DuskTranslate

The web application wraps the latest standalone development editor. Historical HTML releases stay in `releases/`. The hosted app currently translates Japanese to English.

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

The same **Continue with Google** button signs in returning users and creates accounts for new users. Email/password sign-up, confirmation, login, and password reset remain available. No separate Google password is collected by DuskTranslate.

1. Complete the Supabase account setup above first. Without those environment variables, both email and Google buttons are disabled; the browser-local library still works.
2. In Google Cloud, configure the OAuth consent screen for your project and create an OAuth client of type **Web application**. If the consent app is in Testing, add your demo users as test users.
3. Add the exact callback URL shown in Supabase's Google provider settings to the Google client's **Authorized redirect URIs**. It looks like `https://<project-ref>.supabase.co/auth/v1/callback`. This is the Supabase callback, not the Vercel URL.
4. Enable Google in Supabase Authentication's sign-in providers. Enter the Google client ID and secret there. Never put the Google client secret in source code, `VITE_*` variables, or chat.
5. Set Supabase's Site URL to `https://dusk-translate.vercel.app/` and allow that URL as a redirect. Add your exact localhost URL for local testing. The SDK may attach an `sb_flow_id` query parameter; if needed, allow `https://dusk-translate.vercel.app/?sb_flow_id=*` as well, without wildcarding unrelated hosts.
6. Redeploy after setting the two Vercel Supabase variables. Verify with a real Google test account: sign up, sign out, sign back in, reload, and confirm its private library returns. Check another account cannot see its projects.

OAuth uses PKCE: the SDK exchanges the returned code using a verifier kept in the initiating browser. Use the same browser for email confirmation and password-reset links too. Cancelled and expired callbacks display a retry message; callback parameters are removed from the address bar after handling. Local projects are not automatically uploaded when you log in.

See the official [Supabase Google setup guide](https://supabase.com/docs/guides/auth/social-login/auth-google) and [redirect URL configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## Project behavior

- Local projects and account projects are separate libraries. Logging in does not silently upload local documents. Sign out to return to local projects.
- Project edits are saved automatically; wait for the save indicator before closing. Manual translations, glossary changes, chapter selection, and interrupted streams are included.
- The original book is retained, so EPUB export works after reopening a project. TXT and source JSON projects are supported too.
- Rename, archive/restore, and delete are available from the library. Deletion requires confirmation and removes the original file and project progress.
- One tab may edit a given project at a time. Cloud updates use optimistic revision checks to detect concurrent changes on another device. An unsynced draft is retained on the originating browser. Download a backup before resolving a conflict.
- Browser-local storage is not permanent backup. Clearing site data removes local projects. Download backup exports the original file and snapshot as a ZIP; create a new project using that ZIP to restore it. This also lets you explicitly move local work into your account library after signing in.
- Uploads are limited to 20 MB. EPUB expansion is capped at 100 MB in the parser. Large books may exceed a user's browser storage quota or Supabase quota.
- Translation only runs while the page stays open. Interrupted output is saved as partial, not marked complete.

## Verification

`npm test` covers snapshot serialization, partial progress, upload validation, and Postgres RLS owner isolation/revision checks using PGlite.

`npx playwright install chromium` then `npm run test:e2e` verifies real browser project creation, edit persistence, glossary/chapter restoration, original EPUB retention/export, untrusted text rendering, project management, tab locking, and mobile layout. These use synthetic books and do not consume model API credits. Real email delivery and cloud integration require a configured Supabase project.

`npx playwright test --config=playwright.auth.config.js` tests email signup confirmation, rejected credentials, login/logout, password-reset redirects, Google authorization from both account forms, PKCE callback/session restoration, and cancelled or expired callbacks against mocked Supabase responses. These tests do not establish that a live Auth project, Google OAuth client, or mail sender has been configured.

Official setup references: [password authentication](https://supabase.com/docs/guides/auth/passwords), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [storage access control](https://supabase.com/docs/guides/storage/security/access-control).
