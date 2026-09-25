# Subscription discounts

Super Admin → Plan discounts lets an administrator create or edit a scheduled percentage offer:

- All plans or Solo, Small Team, Growth Team, Custom.
- All billing terms or 1, 3, 6, 12 months.
- Percentage from 1% to 90%, up to two decimal places.
- Inclusive start and end dates in Cambodia time (UTC+7).
- New customers, existing customers, or both. Existing includes upgrades, renewals and reactivations.
- Enable/disable without deleting quote history.

For example, choose Solo, 3 months and 30%. Its $30 billing-term subtotal becomes $21. A separate All plans / All terms / 10% rule can coexist; the highest eligible discount wins, including the normal term discount. Percentages never stack.

Offers apply to the new billing term. Immediate upgrade charges for the remaining paid time retain the existing proration calculation. Capacity-only upgrades do not receive a billing-term discount. Existing paid access, users and branches retain their normal entitlement rules.

## Price protection

The database calculates prices, not customer-submitted fields. Creating a checkout or changing its term saves an internal discount snapshot in the same transaction. Manual approval and PayWay confirmation check that snapshot, the amount, plan, term and existing subscription. Later edits or expiration of an offer do not reprice a pending payment. Changing a term before payment starts creates a new quote using current offers. Existing payment locks and expiry rules continue to apply.

Older orders without a promotion snapshot continue using their original term discount. No active offers are installed automatically. Customer plan previews use the same maximum-discount rule; checkout is authoritative if an offer changes while the page is open.

## Installation and verification

Migration: `supabase/migrations/20260924023000_subscription_promotions.sql`. It adds two private tables and narrowly patches the installed pricing and approval functions, aborting the transaction if their expected pricing expressions have changed. It does not change customer records or existing payment amounts.

Tests: `node tests/subscription-promotions.integration.cjs` and `node --test tests/subscription-promotions.test.cjs`. SQL tests run in a disposable PGlite database with captured pricing/approval functions and constraints; they never charge a real payment.

To stop promotions, disable the offers in Super Admin. Keep the quote snapshot tables and approval functions until outstanding discounted orders are resolved; reverting approval to fixed discounts would reject those orders.
