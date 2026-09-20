# Branch subscriptions and inventory

## Pricing

| Base plan | Total users, including owner | Included branches | Monthly price |
| --- | ---: | ---: | ---: |
| Solo | 1 | 1 | $10 |
| Small Team | 5 | 1 | $18 |
| Growth Team | 10 | 1 | $38 |
| Trial | Existing trial user allowance | 1 | Free for the existing 7-day trial |

Custom Plan is independent of the standard plans. The popup lets the customer choose total users (including the owner) and total branches. Every user costs $5/month and every branch costs $20/month; there is no base fee or included free branch on Custom Plan. Example: 1 user + 2 branches = $45/month, or $128.25 for 3 months after the existing 5% term discount. Existing 6/12-month discounts (8/10%) also apply. Standard plans and trial still include one branch.

Customers can cancel the popup without changing their selection, or use the configuration and continue to checkout. Active usage and paid capacity remain protected against reductions during an active term.

## Deployment required

Apply `supabase/migrations/20260920_subscription_branch_limits.sql`, then `supabase/migrations/20260920150000_custom_plan_direct_pricing.sql` using a Supabase SQL connection/editor, then deploy/restart the application. The current project environment has REST service credentials only; the migrations have NOT been applied to the live database. Custom checkout and extra branches stay unavailable until they are applied. Existing single-branch store checkout, standard subscription purchases and legacy payment review retain compatible fallback paths while rollout is pending.

The migration expects the existing POS, subscriptions, locations, register, stock-adjustment, and online-ordering database migrations already used by this application. It retains existing data and does not archive/delete excess branches automatically. Existing workspaces over the new limit must deactivate unused branches or purchase capacity. Do not deactivate a default branch without first selecting a replacement.

## Rules and operational scope

- Custom checkout sends user and branch counts only; SQL calculates prices, discounts and remaining-time credits under a business lock. Payment approval rechecks the subscription snapshot, current usage, proof and pricing before activating limits. Repeated approvals do not extend dates twice. Previously submitted version-2 base-plan orders retain their original pricing; new orders use version 3 direct pricing.
- Branch activation and user activation are guarded by database triggers and business row locks. New capacity is usable only after payment approval. Mid-term reductions below purchased capacity and reductions below active usage are blocked.
- Product definitions, categories, prices, suppliers and customer records remain shared at business level. Branches own inventory quantities, registers and sales. The Products page explicitly distinguishes combined stock from selected-branch stock; editing a shared product changes it across branches.
- POS retains its branch selector and open-register branch lock. Stock allocations and new sales verify the plan and active branch. Orders already has branch filters. Reports now filters sales and branch-assigned expenses together; unassigned business expenses remain in the combined report.
- Stock Adjustments now selects a branch and commits the global delta, branch quantity and audit branch together. Existing adjustment rows without a branch are labeled legacy business-wide.
- Transfers validate both branches. Expenses can be business-wide or tied to an active branch. Closing/refunding historical orders remains handled by the existing order workflows.
- Purchases remain business-wide receipts into the shared inventory pool; allocate stock through the existing POS inventory allocation flow before selling it in a multi-branch workspace. This is not a new per-branch purchasing ledger. The purchasing page explains this distinction.
- Public storefront stock and checkout use the active default branch. Multi-branch checkout checks and deducts branch stock atomically with the existing price/options/coupon order procedure. No other branch's inventory is offered as available online.

## Verification

Run `node --test tests/subscription-pricing.test.mjs tests/storefront-*.test.mjs` and `npx tsc --noEmit`.
For the isolated PostgreSQL integration check on Windows:

```powershell
npm install --prefix "$env:TEMP/tenh-branch-sql-check" --no-save --no-package-lock @electric-sql/pglite
node tests/subscription-branches.integration.cjs
```

The fixture reproduces relevant table columns and stubs legacy checkout/payment procedures. It checks new SQL parsing and behavior: price totals, approval/idempotence, branch/user capacity, incompatible downgrade rejection, branch adjustment stock totals, and storefront branch stock deduction. It does not replace a staging test of the existing live procedures, RLS policies, or concurrent transactions. Before production rollout, verify an actual test payment and branch transfer in staging with the full existing schema.
