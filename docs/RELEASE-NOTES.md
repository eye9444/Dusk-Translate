# Release Notes

## 0.8.0 - 2026-10-26

- Public reader links now serve book-specific social preview metadata and the original EPUB cover, with text-only fallbacks for books without a supported cover.
- Cover requests revalidate the public link before serving an image, including cache hits. Revoked links no longer serve covers; previously cached copies on external services cannot be recalled.
- Added bounded server-side cover extraction and regression tests. No database migration is required. Self-hosted deployments must route `/reader` through the reader API and package the built `dist/index.html` with it.

## 0.7.0 - 2026-10-25

- Added a cover gallery alongside grid and list layouts, with a remembered layout preference, lazy EPUB cover loading, and title fallbacks.
- Replaced the chapter actions dialog with a cursor-positioned context menu, keyboard navigation, sidebar multi-selection, and retained destructive-action confirmation.
- Feedback contact links now use accessible Reddit and Discord icons.
- No new database migration is required for this release.

## 0.6.0 - 2026-10-24

- Added private feedback ticket conversations, founder-only status transitions, rejection reasons, and polled unread indicators. Added Reddit and Discord contact links.
- Added right-click sidebar chapter actions for bulk completion, unfinished status, and deletion with confirmation. Shift+F10 opens the same dialog; normal clicks still navigate. Completion requires translation text.
- Deleted EPUB sections are removed from translated export packages and navigation; optional image cleanup preserves covers and images referenced by retained content. Uploaded originals remain unchanged.
- Replaced community-mode billing cards with cloud project/storage usage.
- Fixed collaboration startup overwriting edits made during initialization, and separated local outbox persistence from network uploads.
- EPUB export now checkpoints locally without waiting for cloud uploads, prevents duplicate concurrent builds, and reports a bounded timeout. Download blob URLs remain valid longer for large files.
- Required migrations: `202610240001_feedback_tickets.sql`, `202610240002_reader_chapter_state.sql`, and `202610250001_feedback_status_message_length.sql`.
- The saving fixes address reproduced code defects. They do not establish the cause of every lost-work report or guarantee recovery of previously unsaved work.

## 0.5.0 - 2026-10-20

- Opened all current product features through community access while retaining project permissions and cloud capacity limits.
- Retained paid-plan testing in isolated environments and blocked production checkout.
- Added an optional ten-second home-screen donation notice and a placeholder support dialog.
- Added Japanese-to-Portuguese and English-to-Portuguese routes, prompt labels, and regression coverage.
- Updated the README and signed-in feature announcement.
- Refreshed novel-suite branding and root/home link preview imagery alongside this feature release.
- Deployment prerequisite: apply `202610200001_community_access.sql`. Existing subscriptions are not automatically canceled.

## 0.4.6 - 2026-10-18

- Added Japanese-to-Italian and English-to-Italian production translation routes.
- Added Italian prompt naming, editor language labels, EPUB language metadata, plan details, and route validation.
- Added a signed-in What's New announcement for Italian support.

## 0.4.3 - 2026-10-13

- Show What's New only to signed-in accounts; guests and the sign-in page never open the popup.
- Close release notes on account changes and discard checks started by a previous account.

## 0.4.2 - 2026-10-13

- Replaced the copper moon with a grey cratered lunar surface.
- Prevented text selection and image dragging during globe interaction.
- Made the hidden sequence require fifteen turns within fifteen seconds, resetting after a pause.
- Replaced the generated cutscene with the selected JoJo Land animation, loaded from YouTube only after unlocking, with attribution and a Close control.

## 0.4.1 - 2026-10-12

- Restored the smooth orange planet with moving directional lighting.
- Kept orbit halves and the moon aligned in one shared orbital plane.
- Made rotation follow dragging with momentum on release; clicking alone does not accelerate it.
- Cards now fade fully away during dragging without blur and return as momentum settles.

## 0.4.0 - 2026-10-12

- Updated plan details for supported providers, language routes, and the complete Teams review workflow.
- Added an ambient rotating landing-page planet, drifting orbits, and a revolving moon.
- Added pointer, touch, and keyboard planet spinning with velocity-based card fading and an original hidden time-acceleration sequence.
- Removed the ineffective translation-style selector and standardized translations on the natural/localized baseline plus editable Teams prompts.
- Made editor header notices dismiss automatically after ten seconds without repeated collaboration polls keeping them alive.
- Refreshed README screenshots in Eclipse mode and automated GitHub Releases for future package versions.

## 0.3.0 - 2026-10-12

- Added nine controlled production translation routes from Japanese or English.
- Added optional Teams chapter workflows with immutable review handoffs and per-chapter publication.
- Added shared and personal master prompt editing for Teams.
- Added account-synced What’s New notices and a permanent release history.
- Centered the provider model import dialog.
- Updated product documentation and canonical links for `dusktranslate.com`.
