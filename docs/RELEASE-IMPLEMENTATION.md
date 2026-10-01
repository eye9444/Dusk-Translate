# Public release implementation

Status: in progress; not a release-ready feature set.

## Agreed behavior

- Preserve original ruby; translator-added ruby is shared reference-only unless explicitly published.
- Anchored comments with replies, resolution, and owner/editor access.
- Inline image visibility, downloads, replacement, and restoration. Replacement bytes are limited to immutable original bytes plus 10 MiB, capped by storage capacity.
- Simultaneous merged edits, shared cursors, reconnection, and local-user undo are required before release.
- Keep Supabase/Vercel; custom domain decision pending.

## Implemented foundation

- Yjs document seeding/loading, bounded edit ranges, relative anchors, and local-user undo.
- Tests for concurrent edits, replay, anchor movement, changed/deleted selections, and undo isolation.
- Shared ruby metadata, reference-only default, explicit publication filtering, and stale-anchor review state; rendering and authoring UI remain outstanding.
- Image metadata policy and boundary tests. This is not server-side file validation.
- Pending SQL migration for canonical seeds, append-only idempotent updates, editor-only access, payload limits, and a public-reader snapshot allowlist.
- SQL tests cover canonical seed reuse, replay, changed retry payloads, payload limits, viewer denial, downgrade denial, and public metadata filtering.

## Additional implemented workflows

- Anchored comment panel: create, reply, edit own comments, delete with author/owner checks, resolve/reopen, and jump to matching text. Ambiguous or changed passages are marked unavailable rather than jumping to stale offsets.
- Guest comments persist separately in IndexedDB. Cloud comments use permission-checked RPCs with message quotas and polling while the panel is open; migration `202610010003_project_comments.sql` must be applied before cloud use.
- Original EPUB ruby displays in the reader using text-only DOM construction. Readings are excluded from section titles. This does not yet add ruby authoring or editor display.
- Browser tests cover guest comment persistence and lifecycle, highlight cleanup, and safe ruby/comment rendering. Database tests cover editor/viewer/author permissions. Live multi-account acceptance remains pending.

## Remaining integration and release gates

1. Test SQL permissions, initialization races, revocation, replay, and limits. Add bounded update compaction and server validation before enabling transport.
2. Implement durable local update outbox, authenticated transport, reconnect replay, canonical initialization with revision checking, and current snapshot projection.
3. Bind editor input, IME, selections, translation streaming, find/replace, and undo to the shared document. Coordinate translation jobs; remove stale snapshot writes from collaborative sessions.
4. Add ruby parsing, authoring, display, publication filtering, versioned backups, and EPUB/TXT exports.
5. Verify cloud comments with multiple accounts and mobile layouts; add comment backup/restore and CRDT-relative anchors before the text-sync cutover.
6. Add occurrence-specific image placements, preview/download/replacement/restoration, bounded server decoding/re-encoding, private asset policies, and orphan cleanup.
7. Complete bounded archive worker, resumable uploads, quotas, monitoring, recovery, and security review on isolated staging.
8. Run multi-user browser acceptance, malicious-input and role tests, mobile memory checks, restore/rollback rehearsal, and beta import-to-export workflow.

No production deployment of the new collaboration path until its persistence and authorization tests pass. New migration is not applied automatically.
