# POS and register accounting rollout

Apply `supabase/migrations/20260921090000_register_pos_accounting.sql` in the Supabase SQL Editor before using the updated checkout, register close or refund actions. The uploaded source does not establish migration application status. Verify it in your development database; the continuation patch was not applied to any live system.

The migration keeps existing permission checks in the checkout and close RPCs. It requires one open drawer per business/branch. If that index fails because duplicates exist, review the duplicate shifts; do not delete cash history to force installation.

## Workflow

1. Select a branch in Staff Shifts & Cash Register and open the drawer with the physical opening cash.
2. POS checkout locks that branch's open shift, runs the existing idempotent checkout and links the order within the same transaction. No open register means the sale is rejected before payment is recorded. Retrying a previously saved sale remains possible after closing.
3. Cash contributes payment received minus change. Bank/other tenders do not increase drawer cash. Pending pickup/delivery payments count immediately. Unpaid credit/COD contribute zero.
4. Record cash in/out with a reason. Refunds explicitly select cash or non-cash. A POS cash refund inserts one cash-out into the currently open drawer at the original branch. A cash refund with no open drawer is rolled back.
5. Closing locks the drawer against checkout and new movements, then stores expected cash, counted cash, variance and a payment summary. Expected cash = opening + cash collected + cash in − cash out (including cash refunds).
6. New closed Z reports use the stored summary. A refund paid during a later shift does not rewrite the earlier shift's totals.

## Verification and limits

`node --test tests/register.test.mjs` checks payment math and action boundaries. `node tests/register-accounting.integration.cjs` executes the migration in a disposable PGlite database; it uses fixture implementations of the pre-existing checkout/close/return RPCs. It does not prove the deployed RPC internals or physical cash counts.

Historical refunds before this migration are not automatically converted into cash movements: review old open drawers before closing them. Existing closed reports without a stored summary retain their original saved expected/count/variance fields. No historical order links or balances are rewritten.

After applying in staging, verify an actual POS $15 cash sale paid with $20 gives $15 cash, a $15 bank sale gives $0 cash, and a partial $5 cash refund reduces the currently open drawer by $5. Test closing and checkout from two sessions. Do not create test sales against live inventory.

## Continuation after operating branches

Apply `20260921110000_operating_branch_completion.sql` after the operating-branches migration. The POS workspace now reads the actual open drawer for its selected operating branch, rather than retaining a drawer returned for a cashier's different branch. New direct registered-checkout requests verify the request branch and category assignment as well; committed request retries retain their original result.

Drawer calculation precedence is shared by the client model and SQL close: original receipt amount/change, explicit `cashReceived` when present, otherwise original tenders, then legacy payment method. Invalid/non-finite records are rejected rather than silently closed. Closing uses business-then-drawer lock order and retains existing permissions, side effects and immutable saved summaries.

Run `npm run test:continuation` for focused JavaScript tests. Run `npm run test:sql` after installing the disposable PGlite test dependency; see `docs/codex-continuation.md`. Integration fixtures do not prove the deployed legacy routines, RLS policies, simultaneous cashier transactions, or physical cash counts.
