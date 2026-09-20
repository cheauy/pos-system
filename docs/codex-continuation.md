# TENH POS — continuation from pos-system(9).zip

## Source and scope

This continuation uses only the uploaded `pos-system(9).zip` as its application baseline. It does not reinstall earlier ChatGPT patches. Codex's branch/subscription pricing, operating-branch screens, storefront, receipt templates, customer field settings, carrier-logo paths and printing work are retained.

The uploaded archive contains application source, tests and eight migrations, but not the complete legacy migration history, tsconfig.json, a package lock, framework config, environment files or installed dependencies. This patch is an incremental update for the existing project/database, not a new-database installer. Keep the configuration and lockfile in your actual working project. No production deployment or database mutation has been performed here.

## Completed code changes

1. POS workspace loads the open register belonging to the operating branch. It no longer trusts a cashier-specific drawer from a different branch. Duplicate open drawers produce an explicit error, not an arbitrary selection. Payment review requires the branch drawer before payment entry.
2. Refresh, held-cart resume and payment review send the expected branch. A branch switch in another tab stops those requests rather than mixing another branch's customers, product visibility, stock or drawer into the old cart. Inventory allocation also verifies the expected operating branch.
3. Customer list fetching is explicitly branch-scoped and newest-first, with null creation dates last. New Add customer requests carry their original branch ID, retain their UUID on uncertain outcomes and continue to honor current email/birthday settings. A post-save verification failure cannot silently issue a new customer UUID.
4. POS/customer gateway, connection, authentication and schema errors retain unresolved request IDs. Explicit validation/constraint/transaction rollbacks may be edited. A confirmed sale remains successful if cache invalidation fails. This does not add an offline-sales mode.
5. Online order status changes use one transactional RPC. For an eligible unpaid rejection, cancellation/restock and status either both commit or both roll back. Same-status retries are idempotent. Stale and backwards changes are rejected. Paid orders cannot be rejected as though a refund happened; use the refund workflow. POS-origin delivery workflow is unchanged.
6. Drawer close and the register screen use the same original-payment/change precedence. Non-cash never increases drawer cash. Closed saved summaries remain immutable. Invalid non-finite counted cash or contradictory recorded payment parts cannot silently close the register.
7. A confirmed return/status change remains successful if secondary audit/cache calls fail; failures are logged. This does not make the legacy partial-return RPC network-idempotent. An ambiguous refund response must still be checked in Returns/Register before retrying.
8. Cross-platform test commands and an internal source/import/export audit are added. SQL fixture loading is portable instead of hardcoded to Windows TEMP. The prelaunch script reports missing source/config instead of crashing on an absent migration file.

## New SQL migration

`supabase/migrations/20260921110000_operating_branch_completion.sql`

Apply after Codex's existing:
- `20260921090000_register_pos_accounting.sql`
- `20260921100000_operating_branches.sql`

The dates in the filenames continue the sequence already present in the uploaded project; they are migration identifiers, not a claim of a live deployment date.

Verify the earlier migrations are already installed; do not replay old receipt/POS patches to satisfy a source-file check. If the new preflight reports missing routines, stop and review the actual history. The new migration replaces register/checkout wrappers and adds focused helper/status functions. It does not bulk-edit existing stock, customer records, completed orders, subscription pricing or recorded balances. Existing base checkout, cancellation, return, permissions and row-level policies remain dependencies.

Use a staging/development database first. Run the whole file with BEGIN and COMMIT, not a selected fragment. Do not remove its guards, constraints or permission checks to force installation. Copy all changed application files together after the migration succeeds, then restart the application. The new online status code requires the new RPC. This patch contains no environment credentials and never connects to Supabase on its own.

## Commands

Run from the actual project root with its existing dependencies installed and Node 22.6+ for the current .ts-import test suite:

```powershell
npm run check:source
npm run test:continuation
npm test
npx tsc --noEmit
npm run build
npm run dev
```

Run each individually and stop/review errors. `check:source` is syntax plus internal module/export validation, not semantic type checking or a production build. New package.json changes add scripts only; dependencies/versions are unchanged. Keep the actual project's lockfile.

For a read-only source-only launch check (missing legacy source is reported as warnings):

```powershell
node scripts/prelaunch-check.mjs --source-only
```

`npm run check:launch` checks local deployment configuration too. Neither mode connects to the database or verifies which migrations are applied. A partial archive cannot pass a complete production prerequisite check by itself.

### Disposable SQL fixture tests

These tests use PGlite, not your Supabase credentials, project database or production inventory. The new fixture tests enum compatibility, close rollback, request replay after closing, current-branch/category guards, rejection atomicity/idempotence, paid-order refusal and optimistic status conflicts. Legacy checkout/stock/permissions are simplified fixture implementations; full staging acceptance is still required.

On Windows, install the test-only package outside the application dependency tree:

```powershell
npm install --prefix "$env:TEMP/tenh-branch-sql-check" --no-save --no-package-lock @electric-sql/pglite
$env:TENH_PGLITE_PATH = "$env:TEMP/tenh-branch-sql-check/node_modules/@electric-sql/pglite"
npm run test:sql
```

On other systems, set `TENH_PGLITE_PATH` to the equivalent package folder or install PGlite in a disposable test checkout. It is not added as an application runtime dependency. A missing SQL test dependency is a failure, not a skipped/pass result.

## Verification in this environment

- `npm run test:continuation`: 78 passed, zero failed. Includes 70 new regression tests and the existing 8 register tests. The tender test includes 1,000 valid cash/non-cash allocations.
- Full `npm test`: 126 passed, 9 failures caused by missing React, Next.js or QR-code packages (same dependency blockers observed before editing). Four test files fail at import before their test bodies are discoverable. They are not counted as passes or claimed to be exhausted tests.
- `npm run check:source`: 337 application TS/TSX sources and 810 internal imports checked; zero syntax/module/export/action-declaration errors. No actual React/Next semantic type validation is claimed.
- `npm run build`: blocked (`next` is not installed in this environment). The archive also lacks tsconfig.json; no guessed replacement was created.
- `npm run test:sql`: blocked (PGlite/PostgreSQL runtime is unavailable). New integration-test JavaScript passed Node syntax checking only. SQL execution, concurrency and live RLS behavior have NOT been verified here.
- No authenticated browser walkthrough, payment, courier booking, live database transaction or production deployment was performed. Package download was blocked by environment DNS/network restrictions. No dependency upgrades or fake framework implementations were used to turn these checks green.

## Staging acceptance before production

Use test businesses, staff, inventory and payments only.

- Open a main-branch drawer with one staff account. Verify an authorized cashier in the same branch sees that drawer, and another branch does not. No drawer must block payment review.
- Begin a cart/customer form in branch A, switch the operating branch to B in another tab, then refresh/save/review. Requests must stop without moving the old cart or customer creation to B. Return to A to resolve a pending request. A legacy unresolved customer snapshot without a branch is intentionally blocked; verify whether its UUID/customer already exists before discarding anything.
- Simulate a lost checkout response; Check sale / Retry same sale must reuse the saved request, not create a second stock deduction or payment. Never collect payment twice because of a timeout.
- Make a $15 cash sale paid with $20; expected drawer increase is $15. Check split $5 cash + $10 bank gives $5 drawer cash. Pending paid deliveries count at payment time; unpaid COD contributes zero cash.
- Return a test item with an explicit cash/non-cash refund method. Verify drawer movement, original-branch inventory and refund record agree, and closing/sale/refund concurrency is safe with the actual legacy database routines.
- Reject an eligible unpaid online order and verify one restock plus Rejected/Cancelled. Retry the same status and confirm no second restock. A paid order must require the refund workflow. Attempt stale/backwards updates from two screens.
- Confirm receipt templates, uploaded logo, actual carrier PNGs, enabled customer fields, USD/KHR entry and barcode/shipping-label saves still work in the full application. Their implementation was preserved, not rebuilt from older patches.

## Remaining boundaries

This is a targeted continuation of the latest branch/register work, not a blanket production-readiness claim for every POS module. Full original schema and installed framework dependencies are needed to finish build/database/browser validation. Tax-aware legacy refunds, prior historical unlinked refunds/drawers, external payment/Resend configuration and ambiguous legacy return responses need separate real-environment verification. Do not enable or change tax/payment/business policies merely to make these tests pass. No historical balance repair is performed automatically.
