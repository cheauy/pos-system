# Staff Report and individual permissions

**Finance → Staff Report** shows sales value, non-cancelled order count, average order, items after returns, discounts, refunds, cancellations, completion rate, staff ranking and the five highest-value orders. Yesterday is the default, using Cambodia time (UTC+7). Owners can compare branches; other report users stay within their assigned branch. Reports exclude online orders and page through matching orders instead of silently stopping at the API row limit.

Order `owner_id` historically represents business ownership. The new immutable `staff_user_id` and `staff_name` snapshots capture the authenticated staff member when a POS/manual order is created, and survive account deletion. Existing orders are not guessed or reassigned to a cashier: those without attribution appear as **Unassigned** and are excluded from the staff leaderboard. Current order totals already reflect returns, so refunds are displayed separately without subtracting them a second time.

**User & Manage User → Role Permissions** has **Per user** and **Role defaults** tabs. An Owner selects a user, checks access and saves. A user without overrides inherits their business role defaults. **Use role default** removes individual overrides. Role changes clear old overrides automatically. Owner access and branch boundaries remain protected, and Owner-only actions do not become delegable simply because a checkbox is checked.

Individual saves use one database transaction, check the current membership revision, reject stale edits and record an audit event. Server page/action guards, search and the SQL permission helper all apply the member overrides. React permission caching is request-scoped. Realtime membership/role updates refresh open workspaces; focus also refreshes permissions if realtime is unavailable. New server requests always check current permissions.

Migration: `20260923160000_staff_reports_user_permissions.sql`. No user permissions or historical cashier identities are changed by installing it.

Checks:
- `node --test tests/staff-report-permissions.test.mjs`
- `node tests/staff-permissions.integration.cjs`
