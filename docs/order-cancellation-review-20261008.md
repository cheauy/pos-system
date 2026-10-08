# Order cancellation review — October 8, 2026

Status: the targeted safety checks pass in disposable PostgreSQL. Production approval is still blocked by the separate full-suite, SQL-fixture and lint gates, and by the missing isolated Supabase/browser acceptance run. No production migration, application-row mutation, push or deployment was performed during this recovery.

## Preserved baseline and exact files

The recovery started at HEAD `8e8c6b43c664fc8899d3042019c5e977af45b74e`. The original worktree was preserved before edits: `recovery-20261008/tracked.diff`, `staged.diff`, `status.txt`, `head.txt` and `hashes.json` under `docs/evidence/order-safety-20261008`. The earlier TAP, SQL results, lint comparison and failure lists remain unchanged.

The complete, exact dirty-worktree inventory, including inherited settings/storefront edits, deleted files, migrations, fixtures and evidence files, is [changed-files.tsv](evidence/order-safety-20261008/recovery-20261008/changed-files.tsv). The inventory uses Git status codes and lists every untracked file individually. It is an inventory for review, not an instruction to deploy every dirty file.

The following files were added or further edited by this recovery:

| File | Purpose |
|---|---|
| `AGENTS.md` | Next.js-generated guide block was observed updated during verification and retained separately from the application patch; see the full diff/inventory. |
| `app/(dashboard)/dashboard/online-orders/actions.ts` | Required displayed timestamp for online status/payment; new RPC argument; missing-RPC guidance names the new migration. |
| `app/(dashboard)/dashboard/orders/order-workspace-actions.ts` | Reject null manage-order versions before any RPC. |
| `app/(dashboard)/dashboard/orders/orders-workspace.tsx` | Pass displayed timestamp for payment confirmation/reversal. |
| `app/api/mobile/[feature]/route.ts` | Require and forward displayed online status/payment timestamp. |
| `components/cancel-order-form.tsx` | Forward displayed timestamp for online rejection. |
| `mobile/src/order-detail.tsx` | Include displayed timestamp in payment requests; status/item requests already included it. |
| `supabase/migrations/20261008043516_online_order_opened_version.sql` | Versioned incoming-order overload; reject-online stock/payment guards; locked nested timestamp; close old authenticated RPC overloads. |
| `supabase/migrations/20261008045323_manage_order_branch_cancellation.sql` | Branch-before-order locking; both legacy manage-order cancellation calls use the versioned branch stock wrapper. |
| `tests/helpers/order-safety-db.cjs` | Share captured schema; seed real required slug/branch code/product ownership. |
| `tests/helpers/order-safety-native.cjs` | Fresh local PostgreSQL cluster, captured constraints/RLS/triggers, non-superuser application sessions, guaranteed owned-cluster shutdown. |
| `tests/fixtures/order-safety-enforcement-live-20261008.json` | Read-only catalog capture: policies, trigger/helper definitions, unique indexes, caller inventory and required referenced tables. No application rows. |
| `tests/order-safety-native.test.cjs` | Stock/finance invariants, real PostgreSQL roles and two-session races. |
| `tests/order-version-callers.test.cjs` | Displayed timestamp, including microseconds; null refusal; POS hold versions; UI/mobile caller wiring; no legacy RPC fallback. |
| `docs/order-cancellation-review-20261008.md` | This review, blockers, deployment sequence and recovery plan. |
| `docs/codex-continuation.md` | Link to current verification, retaining historical archive evidence. |
| `docs/evidence/order-safety-20261008/recovery-20261008/*` | Individual exact evidence paths are in the full inventory. |

Next.js build-generated edits to `tsconfig.json` and `next-env.d.ts` were checked against the saved pre-build files and restored byte-for-byte. Build output is isolated in `.next-order-safety-20261008`. No existing build directory was replaced.

## Expected-version caller audit

Timestamps are validated without converting the value sent to SQL. Preserve the full timestamp string, including microseconds.

| Caller / SQL path | Required value and verified behavior |
|---|---|
| Legacy `orders/actions.ts::cancelOrder(FormData)` | Requires the form's `updatedAt`; sends `p_payload.p_expected_updated_at` to `tenh_run_branch_stock`. No active application importer was found; the protected export is retained. |
| `cancelOrderWorkspaceOrder` and web cancel form | Displayed `updatedAt`; validated before RPC; forwarded unchanged. |
| `cancelOrderWorkspaceItem` and mobile item cancel | Displayed `updatedAt`; forwarded as `p_expected_updated_at`; invalid/unauthorized requests cannot reach mutation. |
| Last-item SQL cancellation | Passes locked `sale.updated_at` in the nested whole-order payload. Native last-item success, replay and race tests exercise this call. |
| Manage-order edit, status, delete and bulk entry points | Every single RPC receives `p_expected_updated_at`; null is refused. Bulk paths retain each selected order's version; next-step refreshes happen only after a confirmed guarded step. |
| Manage-order status cancellation and deletion | Both nested stock calls pass locked `v_order.updated_at`. Global and original-branch stock now move together. |
| Online web/mobile status and payment | Both server actions require the caller's displayed `updatedAt`; send `p_expected_updated_at` to the six-argument `tenh_incoming_order_action`. A freshly loaded status does not replace the displayed timestamp. |
| Online rejection SQL | Six-argument RPC locks/compares the order timestamp, then the status routine passes locked `v_order.updated_at` to `reject_online`. The same stock/financial-history guard now covers `cancel_order` and `reject_online`. |
| POS save/delete held cart | Displayed integer hold version as `p_version`; null only for new-hold creation/replay. Existing hold conflicts stay `PT409`. |
| POS checkout, including mobile quote/checkout | Displayed `holdId`/`holdVersion` carried into `p_input`; SQL checks the locked hold before sale effects. |
| POS stock allocation | Each selected allocation supplies expected unallocated quantity; stale availability raises `PT409`. It uses quantity as its concurrency value, not an order timestamp. |
| Legacy `cancel_order(uuid,text)` | Internal primitive has no version parameter and is not executable by authenticated users in the captured ACL. All captured application cancellation callers now enter it only after a locked version check. |
| Legacy online RPC overloads | New migration revokes PUBLIC/anon/authenticated execution on the five-argument incoming action and four-argument status routine. There is no authenticated bypass through the status-only API. |

The server actions, mobile route and installed Supabase client tests verify one request for a conflict, with no automatic retry. Genuine `40001` serialization errors remain distinct from the business `PT409` conflicts.

## Migration dependencies and order

A read-only production migration-list query returned only `20261007174209_fix_order_conflict_nonretryable_sqlstate`. The captured `tenh_manage_order` body already uses `PT409`. Do not replay that completed migration. The incomplete migration ledger is not evidence that older base routines are absent; do not run an unrestricted `db push` or replay historical migrations to satisfy a file-based test.

All rows below are exact migration filenames in the dirty-worktree inventory. Use this order only after separate production approval, catalog preflight and an isolated staging rehearsal.

| Order | Migration | Dependency / status |
|---|---|---|
| 1 | `20261007004000_revoke_public_definer_rpcs.sql` | Independent ACL hardening; requires all five named legacy routines and verified service-role callers. Review applied ACL state before doing anything. |
| 2 | `20261007174209_fix_order_conflict_nonretryable_sqlstate.sql` | Already recorded on production. Preserve its body/code; skip reapplication. |
| 3 | `20261007193640_whole_order_cancel_expected_version.sql` | Existing exact `tenh_run_branch_stock` and `tenh_cancel_order_item` bodies; installs the whole-order guard and last-item payload together. |
| 4 | `20261007193643_pos_hold_nonretryable_conflict.sql` | Existing exact `tenh_pos_hold` stale guard. Independent of order 3. |
| 5 | `20261007193646_pos_allocate_stock_nonretryable_conflict.sql` | Existing exact `tenh_pos_allocate_stock` stale guard. Independent of order 3. |
| 6 | `20261007193651_pos_checkout_hold_nonretryable_conflict.sql` | Existing exact `tenh_pos_checkout_before_currency` stale guard and its checkout/register dependencies. |
| 7 | `20261007193654_online_order_status_nonretryable_conflict.sql` | Existing exact four-argument online status routine. |
| 8 | `20261007193657_member_permissions_nonretryable_conflict.sql` | Existing exact `tenh_save_member_permissions` stale guard; separate permissions scope. |
| 9 | `20261007193700_users_edit_nonretryable_conflict.sql` | Existing exact `tenh_users_edit` stale guard; separate users scope. |
| 10 | `20261007193703_users_delete_account_nonretryable_conflict.sql` | Existing exact `tenh_users_delete_account` stale guard; separate users scope. |
| 11 | `20261008001000_cancel_order_item_nonretryable_conflict.sql` | Existing exact item-cancellation guard. Apply after order 3 in the coordinated release. |
| 12 | `20261008043516_online_order_opened_version.sql` | Orders 3 and 7 plus exact existing five-argument incoming-order body. Adds required timestamp API and closes authenticated legacy entry points. |
| 13 | `20261008045323_manage_order_branch_cancellation.sql` | Order 3 and the already-correct `PT409` manage-order body from order 2. Adds two versioned branch stock calls and consistent lock order. |

Orders 4–10 are independent single-guard patches after their own legacy routine exists; filename order is the recommended review sequence. Orders 12 and 13 must never precede their guards. The new native test executes the order-related sequence in a fresh local database; prior real-body PGlite checks exercise the permissions/users patches. Successful account deletion and full checkout accounting are not claimed.

Body-replacement migrations fail closed on unexpected anchors. Do not remove those checks or edit a production function ad hoc to force installation. Owner/search_path/security metadata remains in the captured CREATE OR REPLACE headers; the new online overload deliberately receives explicit authenticated/service-role grants and closes the old authenticated signatures.

## Verified checks and separate failure buckets

| Check | Result | Evidence |
|---|---|---|
| Native PostgreSQL 17.11 + caller run | 11 passed, 0 failed; 7 database subtests plus wrapper/caller tests. | `recovery-20261008/native-callers-final.tap`, exit file |
| Final displayed-version callers, including missing-RPC diagnostics | 4 passed, 0 failed. Three overlap the preceding caller run; do not add totals. | `recovery-20261008/callers-final.tap`, exit file |
| HTTP/action/Supabase-client/mobile UI focused tests | 20 passed, 0 failed. External HTTP/auth/cache adapters are explicit doubles. | `recovery-20261008/focused-actions.log` |
| Three captured-body PGlite programs | All three passed after fixture updates. No production connection. | `recovery-20261008/pglite-focused.json`, exit file |
| App TypeScript | Exit 0, no errors. | `recovery-20261008/types-final.log`, exit file |
| Mobile TypeScript | Exit 0, no errors. | `recovery-20261008/mobile-types.log`, exit file |
| Final isolated local production build | Exit 0. Rebuilt after the final online error-guidance change. | `recovery-20261008/build-final.log`, exit file |
| Original 150-file baseline manifest | 1,103 tests: 995 passed, 108 failed; exact same failing names, zero added/fixed failures. | `recovery-20261008/same-baseline-manifest.tap`, `baseline-comparison.json` |
| Broader source lint | Failed: 569 errors, 101 warnings in 194 files. Source scan excludes generated build/report/backup trees. | `recovery-20261008/lint-source.json` |
| Previously compared order-workspace lint | Same 3 errors + 1 warning in orders-workspace and 1 warning in order-workspace-types. New/modified safety code and tests otherwise have zero source-lint findings. | Original `baseline-lint-comparison.json`; current source-lint report |
| Historical full SQL set | 31 passed, 15 blocked; not rerun or reported as passing. | Original `sql-results.json`, `sql-results.log` |

The native fixture has 51 real table definitions, one captured view, 140 foreign keys, NOT NULL/check/unique constraints, 23 captured unique indexes, 43 captured policies on the selected order/stock/financial tables and 17 captured triggers. All rows are synthetic. It uses a newly created loopback-only cluster, explicit authenticated PostgreSQL roles and separate backend PIDs; it never accepts a database URL or reads Supabase credentials. Created clusters are stopped and retained for inspection.

Native proofs:
- Whole-order, item, last-item, online rejection, manage-status cancellation and manage-delete restore each affected global/branch quantity once and create one movement per product. Replays add no effects.
- Thirty negative combinations cover stale/null versions, unauthorized actor, paid flag plus recorded amount, refunded payment status and existing return records across five cancellation entry points. Entire stock/order/hold/cash/refund/credit/loyalty/coupon/audit snapshots remain equal, including populated cash and credit rows.
- An injected local ledger trigger failure rolls back preceding stock work and online status atomically.
- Five cancellation races demonstrate the second backend actually blocked on the first. The loser sees a committed stale version, or an archived-order refusal for manage-delete, and adds no stock/financial effects.
- Ten payment/refund races demonstrate that a waiting cancellation observes newly committed financial history and leaves that committed snapshot intact.
- Real RLS denies outsider reads/updates and wrong-branch reads; the RPC's permission checks remain effective despite SECURITY DEFINER. A foreign-key violation and a parent-ownership trigger rejection are exercised.
- Stale POS save/allocate/registered-checkout calls raise PT409 while hold, stock and financial snapshots remain identical.

Native PostgreSQL does not stand in for the whole Supabase stack. JWT verification, real PostgREST routing/schema-cache reload, browser Server Actions, mobile installation and every production trigger/policy outside the captured representative tables remain separate staging checks.

## The 108 unchanged baseline failures

Keep these as a failing baseline, not waivers or passing tests:
- [76 default test failures](evidence/order-safety-20261008/76-default-failures.md).
- [32 CommonJS test failures](evidence/order-safety-20261008/32-cjs-failures.md).
- The exact-name/hash comparison is `recovery-20261008/baseline-comparison.json`.

The broader lint findings are a separate bucket. A whole-source pre-change lint comparison is unavailable; only the previously saved order-workspace findings have proven baseline attribution. No broad lint cleanup was attempted.

The first unrestricted recovery lint scan traversed generated `.next-*` trees and was stopped. Its incomplete scan is not a passing check. The completed source scan above is the usable lint result. Failed native setup/fixture attempts and their logs are retained separately; only the final successful run is acceptance evidence.

## Precisely blocked SQL programs

All paths below are relative to `supabase/migrations/`, except the two explicitly named temporary fixtures. These are missing-file execution blockers, not negative business-rule test results.

| Program under `tests/` | Missing dependency |
|---|---|
| `branch-completion.integration.cjs` | `20260921090000_register_pos_accounting.sql` |
| `branch-visibility.integration.cjs` | `20260924002000_branch_visibility_safe.sql` |
| `business-export.integration.cjs` | `20260923210000_business_export.sql` |
| `business-import.integration.cjs` | `20260923210000_business_export.sql` |
| `currency-settings.integration.cjs` | `20260923200000_currency_format_settings.sql` |
| `delete-team-users.integration.cjs` | `20260923140000_delete_team_users.sql` |
| `expiry-test-controls.integration.cjs` | `20260923120000_subscription_expiry_tests.sql` |
| `import-csv-types.integration.cjs` | `%TEMP%/tenh-import-baseline/tenh_export_redact.sql` |
| `import-insert-only.integration.cjs` | `%TEMP%/tenh-import-baseline/tenh_export_redact.sql` |
| `operating-branches.integration.cjs` | `20260921090000_register_pos_accounting.sql` |
| `reactivation-term.integration.cjs` | `20260923180000_reactivation_checkout_term.sql` |
| `register-accounting.integration.cjs` | `20260921090000_register_pos_accounting.sql` |
| `staff-permissions.integration.cjs` | `20260923160000_staff_reports_user_permissions.sql` |
| `subscription-branches.integration.cjs` | `20260920_subscription_branch_limits.sql` |
| `subscription-upgrade-safety.integration.cjs` | `20260920_subscription_branch_limits.sql` |

Still blocked/unperformed acceptance:
1. Recover the authoritative historical migration/fixture files and execute these 15 programs in isolation. Do not recreate missing dependencies with success-returning stubs or replay them on production.
2. Run the complete intended release against an isolated Supabase staging target with real signed sessions/PostgREST and schema reload. No such staging target was selected for this recovery.
3. Run browser and installed-mobile acceptance for cancellation, payment confirmation, held-cart checkout and ambiguous response recovery; full successful checkout/register/refund and account-deletion workflows remain unproven.
4. Resolve or explicitly disposition the 108 full-suite failures and the broader lint failure before approval. They executed and failed; they are not missing-runtime skips.
5. Recheck production catalog drift, migration/ACL state, backup/restore readiness and service-role callers immediately before any authorized release. The saved catalog snapshot is not a future deployment authorization.

## Deployment sequence — instructions only

1. Review the exact intended release files, caller/API contract, baseline buckets and independent permissions/users/ACL patches. Build from an approved commit/artifact, not an arbitrary dirty worktree. Finish the isolated staging checks above.
2. Capture a production restore point and read-only copies of function definitions, owners, grants, policies and applied migration state. Verify the exact routine/table dependencies and expected guards; preserve existing PT409 throughout. Reconcile the incomplete migration ledger before selecting changes.
3. Prepare the updated web/server and mobile artifacts. The mobile status/payment request must contain displayed `updatedAt`. Arrange a short coordinated maintenance window for order/online/POS writes and require updated mobile clients; cached screens must refresh. Old clients sending no timestamp are deliberately refused.
4. After explicit approval, apply only the approved, still-unapplied files in the dependency order above, each as a complete transaction. Wrap the independent ACL file in a transaction if the chosen runner does not supply one. Skip the already recorded PT409 migration. Stop immediately on missing dependencies or body-drift exceptions; do not continue with later files.
5. Reload/verify the PostgREST schema for the six-argument incoming-order RPC and confirm the older authenticated signatures are inaccessible. Deploy the matching server/web release and updated mobile client while writes remain paused.
6. Validate authentication/branch scopes, missing/stale-version refusals and migration metadata. Run mutation acceptance with staging fixtures only; use read-only production checks for quantities and financial history. Resume writes gradually and watch PT409/permission/server-error rates and pending request recovery. Retain release/backup metadata and the ability to disable the affected write flows.

No command in this document has been executed against production as a migration, push or deployment.

## Recovery plan

- A migration that fails before its COMMIT must be rolled back on that same session. Leave writes paused, retain the failure/metadata evidence and halt dependent migrations. The body-drift guards are a stop signal.
- After a committed migration, prefer fixing forward with a reviewed patch while writes remain disabled. The versioned API and stronger stock/payment guards remain installed. Do not restore 40001 business conflicts, remove expected-version checks, reopen legacy authenticated RPCs or restore the old branch-stock bypass just to make an old client work.
- An application rollback must target an artifact that still sends the required timestamps/hold versions. If no compatible artifact exists, keep the affected flows unavailable until a compatible build is ready; upgrade/refresh clients rather than retrying a refused write.
- Preserve uncertain request IDs and inspect existing order/stock/cash/refund/credit/loyalty evidence read-only before any retry. A timeout is not evidence that a write failed. Do not compensate stock or financial rows by hand or rerun cancellation automatically.
- If data repair is required, reconcile the specific transaction from stock movements and financial records, rehearse the repair in isolation and seek separate approval. A whole-database restore can discard legitimate orders accepted after the restore point; do not perform one as an automatic rollback.
- Keep the original snapshots, final manifests, build results and all attempt logs. No production data mutation or destructive cleanup belongs in this recovery without a separately reviewed plan.

## Reproduce the isolated checks

Use Node and the existing application dependencies. The test-only pg driver was installed separately in `%TEMP%/tenh-order-native-tools-20261008/node_modules/pg` (version 8.16.3); no runtime dependency or application lockfile was changed.

```powershell
$env:TENH_POSTGRES_BIN = '<local PostgreSQL bin directory>'
$env:TENH_PG_PATH = '<test-only pg package directory>'
node --test --test-reporter=tap tests/order-safety-native.test.cjs tests/order-version-callers.test.cjs
node --test tests/order-cancel-http.test.cjs tests/order-stale-conflict.test.mjs tests/mobile-order-actions-ui.test.cjs
```

The native launcher allocates a new local port and data directory itself. Do not replace it with a production URL or point it at an existing data directory. PGlite/body tests, baseline manifest tests, source lint, app/mobile TypeScript and the isolated build have their own evidence above.
