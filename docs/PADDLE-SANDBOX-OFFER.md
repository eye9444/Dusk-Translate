# Sandbox offer revision: October 3, 2026

These prices were created through the Paddle sandbox MCP. No live prices were
created. Existing prices, customers, subscriptions, transactions, and notification
destinations were retained. Existing subscriptions were not migrated or repriced.

| Plan | Product ID | Interval | USD amount (minor units) | New price ID |
| --- | --- | --- | --- | --- |
| Pro | `pro_01m3ytbcz6c1jz7410dpe07r4c` | Month | `500` | `pri_01m41bn725t30w2ta3zjf181mx` |
| Pro | `pro_01m3ytbcz6c1jz7410dpe07r4c` | Year | `5000` | `pri_01m41bn7b9gww2020gar6d25v7` |
| Teams | `pro_01m3ytbdqcg14be6s8ratp2jbx` | Month | `800` | `pri_01m41bn7n481yz3hhyw7pgyyce` |
| Teams | `pro_01m3ytbdqcg14be6s8ratp2jbx` | Year | `8000` | `pri_01m41bn7yanzs6t1596hjd5n05` |

All four have seven-day free trials and quantity fixed at one. Each person buys
their own plan. The former Advanced product is named DuskTranslate Teams; the
internal `advanced` entitlement key remains compatible with stored records.

No country overrides were added to these new prices. Regional amounts need a
separate review. The frontend displays Paddle's formatted preview totals, not
hard-coded USD values. Old prices and their existing overrides were untouched.

Apply migration `202610030008_revised_sandbox_prices.sql` before deploying the
new frontend. It disables new checkout through the old app mappings, but retains
those mappings for existing subscribers' entitlements. It does not archive or
delete anything in Paddle.

Live activation remains blocked on the acceptance/security gate, live account and
domain approval, separate live catalogue and webhook setup, and explicit live
environment mapping. Payout details belong in Paddle's Business account > Payouts
> Payout settings; a personal payment card is not needed for sandbox testing.
