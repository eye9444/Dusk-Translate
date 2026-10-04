# Live offer: October 5, 2026

These permanent production products and prices were created through the Paddle
live MCP after the owner confirmed the offer. They use the `saas` tax category,
require a payment method for a seven-day trial, and fix quantity at one because
each collaborator purchases their own plan.

| Plan | Product ID | Interval | USD amount (minor units) | Price ID |
| --- | --- | --- | --- | --- |
| Pro | `pro_01m448vh0e0qstyrgw05xwrxxe` | Month | `500` | `pri_01m448vhxb2ca4mjf274wv2hb4` |
| Pro | `pro_01m448vh0e0qstyrgw05xwrxxe` | Year | `5000` | `pri_01m448vjs9txa3ja1eqzzwn7wg` |
| Teams | `pro_01m448vk3xw0hmw8z4ejzds0as` | Month | `800` | `pri_01m448vkcr2vk5k49j0zmzxnzt` |
| Teams | `pro_01m448vk3xw0hmw8z4ejzds0as` | Year | `8000` | `pri_01m448vkpspsvzn4cgvtgft2ej` |

All four products and prices were read back as active. No regional price
overrides were added. The internal `advanced` entitlement remains the storage
key for the public Teams tier.

## Paddle.js client token

- Token ID: `ctkn_01m448zxxv1hb7eqv9ck9fe2vs`
- `VITE_PADDLE_CLIENT_TOKEN`: `live_e35087a5f6d49c64602afcd653d`

This is a client-side token and is expected to be visible in the production
browser bundle. It is not the server API key and must never replace
`PADDLE_API_KEY`.

## Fulfillment webhook

- Notification destination ID: `ntfset_01m449dhc84mhc43ssq3dkyxb9`
- URL: `https://www.dusktranslate.com/api/paddle/webhook`
- Traffic: live platform events
- Events: `customer.created`, `customer.updated`, `subscription.created`,
  `subscription.updated`, `subscription.canceled`, `transaction.completed`

The destination and signing secret are permanent infrastructure. The secret is
stored only in deployment configuration and must not be committed.

Deploy `202610050001_live_prices.sql` with the preceding feature migrations.
Set `VITE_PADDLE_LIVE_PRICES` to the JSON mapping in `.env.example`; do not use
these production IDs in sandbox configuration.
