# Cloud upload incident: 2026-10-08

## Confirmed cause

Production Postgres logged `Reserve upload capacity before uploading` from
`public.enforce_cloud_upload()` during Storage's final object upsert. The existing
null-metadata probe fix was already deployed, so repeating it would not fix this
failure.

Supabase Storage checks RLS as the requester, then `completeUpload()` uses
`asSuperUser()` to persist metadata. At that point `auth.uid()` is not the
uploader. The verified upload owner is retained in `storage.objects.owner_id`.
Source: https://github.com/supabase/storage/blob/master/src/storage/uploader.ts

## Repair

`202610080001_storage_upload_identity.sql` uses the row's uploader identity only
when the database session belongs to `supabase_storage_admin` and its role is
`service_role` or `supabase_storage_admin`. Other callers still use `auth.uid()`.
The matching reservation must remain unexpired, reserved, and within its byte
allowance and the owner's storage allowance. Enforcement and consumption use
the same identity rule. Reservation state is rechecked under the owner lock.

The additive migration was applied to the production database. No account tiers,
promotion grants, superuser settings, billing records, or uploaded files changed.

The shared New/Import Project dialog now places its fixed-size checkbox beside
the label, with wrapping on narrow screens.

## Verification

- 45 Node tests passed in the current working tree, including Storage-role
  finalization, replacement upserts, oversized/expired/reused reservations,
  uploader mismatch, and spoofed owner metadata rejection.
- Two authenticated browser tests passed at 390px and 1280px for both dialogs,
  checking checkbox/text geometry, overflow, and label click behavior.
- Production build and whitespace checks passed.
- The working tree already contained a quota-migration repair, upload error
  formatting, and probe migration/test from previous work. Those existing edits
  were left untouched and are not part of this hotfix commit.
- Full authenticated production upload confirmation remains a user smoke test;
  the production SQL connection cannot impersonate the Storage login role.
