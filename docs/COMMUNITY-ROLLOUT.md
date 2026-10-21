# Community Access Rollout

1. Apply `202610200001_community_access.sql` to production before deploying the app.
2. Verify `launch_configuration.community_access` is true.
3. Verify a normal account receives `advanced` product capabilities without being inserted into `super_users`.
4. Deploy the app and test project editing, public links, custom prompts, and a viewer account's read-only access.
5. Review existing active subscriptions separately. This release does not cancel, refund, or modify recurring billing. The billing portal remains available.

All features are free, not unlimited infrastructure. Existing Teams cloud limits remain (200 projects, 5 GB, 10 seats per project). API-provider charges are separate.

## Donations

The home/library notice appears once per browser session, expires after ten seconds, and has a dismiss button. Clicking the notice or Sure opens an accessible dialog. The header Support action reopens it.

There is deliberately no payment URL or QR code until the owner provides a verified destination. Do not collect card details in this app. When adding a destination, use a fixed reviewed HTTPS URL, explain the provider, and open external links with `rel="noopener noreferrer"`. Add a descriptive alternative for QR images and a clickable equivalent.

## Retained Billing Tests

Use a separate Supabase project/database, set `community_access=false`, and use Paddle sandbox credentials. Run Vite dev with `VITE_PAID_TESTING=true`. That switch does not enable paid UI in production builds. The checkout endpoint also blocks production deployments and community-mode databases. Existing webhooks and portal management remain intact.
