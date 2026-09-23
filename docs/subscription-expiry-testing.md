# Super Admin expiry testing

Open **Super Admin → Businesses → business details → Subscription expiry test**.

- **Expire now (test)** saves the current expiry and sets it one minute in the past. Refresh the owner/staff workspace to exercise its existing expired-access checks.
- **Restore test expiry** restores the saved timestamp, including an original null expiry. Trials save and restore both subscription and trial expiry timestamps.
- Repeated expire requests preserve the first snapshot. If a renewal or manual edit changes expiry during the test, Restore clears the test and preserves that newer value.

No business-ID configuration is required. Controls are enabled in development/test, hidden and server-blocked in production. Set server-only `ENABLE_SUBSCRIPTION_EXPIRY_TEST_CONTROLS=true` to explicitly enable them in production; `false` disables them everywhere. Restore active tests before disabling the flag.

Only authenticated, active Super Admins can invoke the server action. The database RPC is service-role-only and also verifies the acting Super Admin. The snapshot table has RLS enabled and no browser-role access.

Apply `supabase/migrations/20260923120000_subscription_expiry_tests.sql` before using the buttons. It adds an atomic, row-locked expire/restore routine and an expiry-test snapshot table. During an active test, a trigger preserves suspension/status/deletion bookkeeping attempted by normal expiry sweeps; access still locks through the real expiry timestamp. Non-test businesses retain their existing expiry behavior. Owner, staff, membership, branch and payment records are not modified.

Checks: `node --test tests/expiry-test-controls.test.mjs` and `node tests/expiry-test-controls.integration.cjs`. The SQL integration check uses the existing local PGlite test installation; it never changes live business records.
