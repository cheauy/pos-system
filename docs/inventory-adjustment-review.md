# Advanced Inventory review — September 24, 2026

The findings below are the original audit. They have now been addressed in the application and database migrations `20260924009000` through `20260924020000`, applied on September 24, 2026. Existing product records, branch quantities, and order counts were checked before and after the migration transaction and remained unchanged. No test sales or stock adjustments were made in the real business.

## Implemented and verified

- Adjust Stock now verifies the operating branch and effective permission, rejects blank quantities, uses a retained request ID for retries, checks stale exact counts, and records branch before/after values. Legacy direct adjustment calls and raw stock updates are blocked.
- Branch catalog details, prices, bundle recipes, receipt/customer/POS settings, role defaults, and alert recipients are independent. Existing branch assignments seed the initial copies. New stock assignments and branches receive their own records.
- The online catalog and online price remain shared. Online fulfillment requires an active eligible branch with sufficient stock. Historical order items remain unchanged. One business subscription still controls branch allowance.
- Incoming online orders default to the operating branch. Users with Online Orders access may enable all-branch online orders. This does not switch their workspace or expose another branch's POS/QR orders. Cross-branch receipt, shipping-label, and payment-proof access is limited to the authorized order.
- Exports default to the current branch, with an explicit owner all-branch backup option. Imports bind preview and confirmation to that branch, preserve the shared online price, and reject foreign records. Protected accounting/history records remain non-restorable over live data.
- Purchase receipts now update local cost and stock and record branch quantities. Direct legacy purchase/return/cancellation entry points are private to the guarded workflows.

Automated checks: `safe-stock-adjustment.integration.cjs`, `incoming-online-orders.integration.cjs`, and `branch-catalog-settings.integration.cjs` passed. The production build and focused lint checks passed. SQL also passed live-schema rollback checks, including reading POS catalogs and scoped exports. Interactive signed-in browser testing was unavailable because the browser was at the login page; no live sale/return was submitted.

## Deployment and recovery

The forward path creates branch tables and views, copies current settings/catalog data, then changes operational readers and writers. The canonical product identity, online price, and accounting records are retained. Shipping settings can read the previous business file until the branch saves its own file.

For recovery, pause writes, export both the shared records and new branch tables, and restore matching application/function versions together. Keep branch tables and their saved changes; do not drop them or overwrite the shared catalog from one branch. Never re-enable unaudited stock RPCs as a rollback shortcut. The SQL fixtures capture the prior function definitions for diagnosis, not an automatic destructive rollback.

## Confirmed problems

1. **High — legacy adjustment functions can bypass branch and custom-permission rules.** Authenticated users retain execution access to the older `adjust_product_stock` overloads. The overload taking mode/reason checks a fixed membership-role list, rather than the effective stock-adjustment permission. In the reproduction, a manager whose custom adjustment permission was disabled could still change global product stock through this function, without changing branch stock. Conversely, a cashier with the permission enabled was rejected by this same legacy role check when called from the branch adjustment function. All public stock-writing entry points need the same permission and branch checks.

2. **High — an owner’s normal save is rejected for missing branch context.** The action imports the unscoped Supabase client and calls it without headers at [actions.ts](../app/(dashboard)/dashboard/inventory/adjustments/actions.ts), lines 7 and 83. The deployed `adjust_branch_product_stock` requires the request branch to equal the selected branch. `tenh_request_branch` returns null for an owner without branch headers. The reproduction returned “This stock adjustment is outside your operating branch.” The selected branch must be authorized and sent through the request context.

3. **High — retries and stale exact counts can change stock incorrectly.** There is no operation ID for duplicate detection and no expected stock/version checked by the database. Repeating an Increase request applied it twice. A Set exact request also restored stock already deducted by a sale after the screen had loaded. Separately, a simulated cache-refresh failure after a successful RPC made the action report failure, encouraging a duplicate retry. The post-save handling is at [actions.ts](../app/(dashboard)/dashboard/inventory/adjustments/actions.ts), lines 142–162.

4. **Medium — branch history displays global before/after quantities.** The branch wrapper calculates the correct branch delta, but calls the legacy global adjustment function to create the ledger entry. With Main = 7 and Second = 3, adding 2 to Second correctly produced Second = 5 and total = 12. However, the entry labelled Second recorded 10 → 12 rather than 3 → 5. “Set exact” is also converted into an increase/decrease in that ledger.

5. **Medium — the Adjust Stock link loses the selected product and branch.** The overview, row menu and detail drawer link to the bare adjustment page. The page then defaults to the workspace branch and its first product. Reviewing a product at a different branch does not carry that selection into the adjustment form. See [inventory-client.tsx](../app/(dashboard)/dashboard/inventory/inventory-client.tsx), lines 277, 547 and 663, and [stock-adjustment-client.tsx](../app/(dashboard)/dashboard/inventory/adjustments/stock-adjustment-client.tsx), line 495.

6. **Medium — missing quantity becomes zero in a Set exact request.** Server validation calls `Number("")`, which becomes zero and passes the Set exact validation. This was reproduced against the actual action with service dependencies mocked. The browser's required field protects normal clicks, but the server must also reject a missing or blank quantity. See [actions.ts](../app/(dashboard)/dashboard/inventory/adjustments/actions.ts), lines 33–57.

## Additional display issues found in code

- Adjustment-page stock uses the global product quantity when the location query returns a count of one. For branch-restricted users, one visible location does not establish that the business has only one location. Branch stock should come from the selected branch’s stock record consistently. See [page.tsx](../app/(dashboard)/dashboard/inventory/adjustments/page.tsx), lines 109–112.
- History takes the latest 200 business records before filtering for the selected branch. A quiet branch’s records can disappear from the displayed history. Apply branch filtering before limiting/paginating.
- The form says “Business-wide stock adjustment” even though it submits a specific location.
- Advanced Inventory’s 30-day product sales figures are business-wide; changing the stock branch does not change those sales figures.

## What passed

With valid branch context and an allowed legacy role, the branch adjustment changed the intended branch and global total together, preserved the other branch, and rejected a decrease exceeding that branch’s stock without partial writes.

## Required safe flow

Carry the chosen branch and exact product into the form → verify the user’s current permission and branch → validate a nonblank whole quantity → check stock freshness for an exact count → commit one uniquely identified adjustment with correct branch before/after history → refresh without reporting a committed adjustment as failed.

“Customer return” and “Supplier return” reasons here are only stock corrections. They do not themselves create an order refund or a supplier financial return.
