# Revised offer and post-launch roadmap

## Offer revision requested October 3, 2026

- Starter remains free. Pro becomes USD 5/month; Advanced is renamed Teams at
  USD 8/month. Present the two paid choices within one paid-plan card.
- Individual collaborators' subscriptions, rather than the project owner's
  subscription, control their premium tools. Do not grant everyone premium tools
  merely because the owner subscribes.
- Confirmed: Pro USD 50/year, Teams USD 80/year. Every collaborator purchases their
  own subscription; Teams is not a lead-paid seat bundle. Personal translation
  allowances follow the caller. The owner's plan governs storage, owned project
  count, and the 2/5/10-person cap.
- Migration 007 changes personal authorization and usage; migration 008 maps new
  sandbox prices. Historical price IDs and billing state remain preserved.
- No regional prices are authorized by this revision. Do not advertise unfinished
  workflows or search features as subscription benefits.

## First post-launch milestone: reviewed team changes

Team leads can review proposed changes and approve a final consolidated edit.
This is backlog work, not an implemented feature or a dated release commitment.

Acceptance scope:

- Explicit project setting enables review; identify reviewers independently of
  billing and preserve current viewer/editor permissions.
- Contributors submit immutable proposed revisions against a known base version.
  Submission never changes the approved document or public reader output.
- Show author, timestamp, chapter, and before/after differences. Include text,
  glossary, ruby, and image changes or explicitly reject unsupported change types.
- Reviewers approve or request changes. Approval is atomic and idempotent, checks
  the base revision, and requires conflict resolution rather than overwriting
  concurrent edits. Record an append-only audit trail.
- Publish only the approved version. Preserve submissions and audit history after
  downgrade; define submission/review eligibility before implementation.
- Test unauthorized approval, stale versions, duplicate approvals, concurrent
  reviewers, and private-draft isolation from public reader links.

## Far-future exploration: public novel discovery

Evaluate semantic/vector search only when public hosting and search requirements
are defined. A vector index supports discovery; it does not replace canonical
book storage or access control. Index only explicitly published, authorized
content, never private projects. Publication rights, moderation, takedowns,
revocation propagation, indexing cost, and deletion policy need a separate review.
