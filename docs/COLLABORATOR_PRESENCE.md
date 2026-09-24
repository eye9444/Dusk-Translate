# Collaborator presence

Apply `supabase/migrations/202609250002_project_presence.sql` in Supabase before using this feature. It follows the sharing and collaborator-email migrations.

Cloud project editors display member initials with green online rings, grey offline rings, and a green dot for recent typing or translation activity. Names and status are available by hovering or focusing an avatar. Presence is scoped to the open project, not global account login status.

The client exchanges a small presence record every two seconds through an authenticated RPC. Cursor movement can take roughly two to three seconds plus network time to appear. Records expire from online status after 20 seconds without an update; normal exits attempt immediate removal. Stale rows are pruned when that project next receives an update. Multiple tabs have separate session IDs; the freshest session represents each member.

Only current owners and collaborators can exchange presence. Names come from account metadata with an email-local-part fallback. Presence contains a section ID, pane, text fingerprint, character offset, visibility and activity flags. Book text, translations and API keys are never sent through presence. The table is not directly accessible to authenticated users; RPCs enforce membership and bind writes to the signed-in user.

Remote carets appear only for other online, visible sessions viewing the same section and matching text. They are positioned in a separate non-editable overlay and disappear outside the visible text area. A text fingerprint is a positioning safeguard, not a security primitive.

This is presence, not simultaneous document merging. Existing revision conflict checks still apply when two people save edits. Guest projects have no presence. Connection failures show `Presence unavailable` instead of reporting everyone offline.

Validation: PostgreSQL tests cover access control, roster membership, offline members, state exchange, leaving and revocation. A browser test covers avatars, cursor placement, mismatched text and failure display. Live multi-account verification requires the migration to be applied to the hosted database.
