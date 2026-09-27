# TENH POS mobile

Android/iOS development app for the existing TENH POS business workspace. Expo owner: `cheauy`. EAS project: `e2e5731a-ff35-4493-a6f8-ce3f30f075d6`.

**Status: development pilot, not a completed store release.** Apple App Store and Google Play submission are deferred at the owner's request. No real orders, refunds, stock changes or emails were submitted during automated verification.

## Run on a phone

1. Run the existing Next.js server on port 3000, accessible on your local network.
2. Install dependencies in this directory with `npm ci`.
3. Copy `env.example` to `.env.local` and fill in the public values. The API URL must be your computer's LAN address, not `localhost`, when testing on a phone. Alternatively, `node scripts/configure-local.cjs` creates local configuration from the website's public variables if no mobile environment file exists.
4. Run `npm start -- --go --lan` and scan the Expo QR code. Phone and computer must be on the same local network. Sign in on the phone with your existing business account.
5. Stop the preview with Ctrl+C. A changed network address requires updating the API URL and restarting Metro.

Never put a Supabase service-role key, Resend key, PayWay secret or other server credential in `EXPO_PUBLIC_*`. Production builds reject private Supabase keys and require HTTPS. Public variables are bundled into the app.

## Implemented

- Secure session storage and refresh; website password-recovery flow.
- Expo Router navigation, workspace selection and assigned staff branch restrictions.
- Light/dark appearance, Hanuman font and partial English/Khmer translation.
- Offline banner, encrypted first-page snapshots with a 24-hour expiry, reconnect/foreground refresh, 15-second foreground refresh, debounced search and paginated lists. Snapshots are separated by account and branch and cleared on sign-out. Customer lists, payment proofs and order details are not stored offline. Writes require a connection; this is not offline checkout.
- Optional device biometric/passcode lock after a restart or one minute in the background. Face ID requires a development build; physical-device verification remains required.
- POS product/variant/options selection and automatic promotional prices from the existing catalog; server-quoted totals; customer selection; walk-in/pickup/delivery; cash, verified bank transfer, unpaid COD, deposit and cash/bank split payments; pending-sale recovery with the same request ID.
- Enabled coupon codes, amount/percentage discounts and loyalty redemption, validated against branch settings and customer balance. Unpaid COD/deposit orders cannot redeem points.
- Save, resume and delete supported held orders with exact version checks and recovery after a lost response; cart details and hold identity survive an app restart. Holds containing unsupported details remain on the website.
- Return items and record refunds with branch/permission checks and persistent request IDs. Unknown outcomes retain the same request; only a recorded rollback allows starting a corrected request. Requires the refund migration below.
- Orders and online orders, detail/images, supported status transitions, incoming branch preference and payment-proof review.
- Stock lookup/scanning and counted stock adjustment using the website's concurrency/idempotency flow.
- Purchase-order search/details and partial/full receiving. Receiving saves the request on the device, checks previous quantities and reuses the existing atomic branch-stock procedure. Retrying a lost response cannot receive the same request twice. Requires the purchase-receiving migration below.
- Stock-transfer search/details, Send and Receive in the operating branch. Confirmation checks the exact transfer version and items. Database guards prevent sent transfers from being reopened or edited; repeated Send/Receive cannot move stock twice. Draft creation and editing remain on the website.
- Customers with quick-add, expenses with receipt upload, register opening/closing and support reports.
- Foreground notification feed and read state.
- Branch reports with yesterday default, sales/cost/expense/profit totals, variant rankings, payment totals and staff KPIs. Periods use UTC+7, matching existing staff reports. Large results fail rather than silently truncate totals.
- Saved receipt and shipping-label settings used for native print/PDF sharing. Shipping labels require an address and a single-page PDF before printing.

The native API verifies the bearer token, membership, subscription, branch and effective permissions, then reuses existing server actions. It does not expose arbitrary database operations. Web cookie authentication remains in place for website requests.

## Still required before completion

- Remaining POS parity: additional split methods and device validation of held orders, returns and printing.
- Native product/bundle editing, purchase-order creation, stock-transfer draft creation/editing and storefront controls.
- Full dashboard/chart parity, complete Khmer translation and accessibility/device-layout review.
- Background push notifications and physical-device validation of biometric unlock and offline viewing.
- Real Android and iPhone testing: sign-in/recovery, staff branch restrictions, register reconciliation, stock changes, paid/unpaid order handling, interrupted checkout recovery, camera permissions, print/PDF and supported physical printer models.
- Native development/preview builds, production HTTPS deployment, store credentials, privacy disclosures and store submission when the owner is ready.

## Checks

From this directory: `npm run lint`, `npm run typecheck`, `npx expo-doctor`, `npm run export:native`.

From the repository root: `node --test tests/mobile-foundation.test.cjs tests/sign-in-recovery.test.cjs tests/pos-lock-branch-context.test.cjs tests/workspace-branches-printer.test.mjs` and `npx tsc --noEmit`.

Run `node tests/mobile-refund.integration.cjs` for isolated PostgreSQL refund replay/rollback checks.
Run `node tests/mobile-purchase.integration.cjs` for isolated receiving tests using the real branch-stock SQL, including replay, stale quantities, stock isolation and transaction rollback.
Run `node tests/mobile-transfer.integration.cjs` for isolated transfer replay, stock conservation, stale snapshot, permission, rollback and deletion-cascade checks.
Run `node --test tests/mobile-device.test.cjs tests/mobile-decoder.test.cjs` for device-lock persistence, offline storage and navigation decoder checks.
Run `node mobile/scripts/check-backend.cjs` for a read-only shared-project and published-function check.

The Expo Router decoder advisory is addressed with a checksum-pinned upstream decoder and a small CommonJS compatibility adapter in `vendor/decode-uri-component`. The dependency audit reported zero vulnerabilities on September 27, 2026. Remove the override when the supported router dependency includes the fixed decoder; see the vendor README.

Passing JavaScript exports and tests does not verify signed APK/IPA builds, live payments or physical printers. The existing web migrations and permission functions must already be deployed.

## Refund rollout

`supabase/migrations/20260927001000_mobile_refund_requests.sql` was applied to the shared `pos-system` Supabase project on September 27, 2026. RLS, restricted grants and published RPCs were verified without submitting a real refund. It adds request history and two scoped RPCs without changing the existing website refund procedure. Phone testing remains required before release.

To roll back access, revoke authenticated execution of the two new RPCs and disable mobile refunds. Retain `mobile_refund_requests` and its results so lost-response recovery cannot cause duplicate refunds; do not drop request history.

## Purchase receiving rollout

`supabase/migrations/20260927002000_mobile_purchase_receipts.sql` was applied to the shared project on September 27, 2026, after checking the existing branch-stock functions. RLS, restricted grants and published RPCs were verified without receiving live stock. Verify partial receiving, a lost response, a stale screen and final receiving on both phones before release.

The migration adds request history and two mobile RPCs without changing website receiving. To roll back, revoke authenticated execution of `tenh_mobile_receive_purchase` and `tenh_mobile_purchase_receipt_status`; keep `mobile_purchase_receipts` intact for recovery. Never clear a device's pending request while its outcome is unknown.

## Transfer rollout

`supabase/migrations/20260927003000_mobile_transfer_actions.sql` was applied to the shared project on September 27, 2026 after isolated PostgreSQL checks. Both guards were confirmed enabled and anonymous RPC access denied. No live stock transfer was submitted. The guards also protect website draft edits from changing items after sending and preserve business deletion cascades. To disable mobile transfer writes, revoke authenticated execution of `tenh_mobile_transfer_action(uuid,uuid,uuid,text,timestamptz,jsonb)`; retain the shared guards.
