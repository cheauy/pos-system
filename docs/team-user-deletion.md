# Team user deletion

In Settings → User & Manage User, the business Owner can choose **Delete user** and type **DELETE** to confirm. Managers retain enable/disable access controls but cannot permanently delete accounts. Export has been removed from this page.

The service-only `tenh_users_delete_account` SQL function rechecks ownership, the selected business, member revision and confirmation. It blocks self/Owner/Super Admin deletion, accounts belonging to another business, and users with an open register.

Deletion is atomic: historical rows with cascading or restrictive creator references are reassigned to the business Owner before the Auth identity is deleted. Nullable references follow their existing SET NULL behavior. Product contents, quantities, sales amounts, purchase/return details and register totals are retained. The audit entry records the deleted identity and ownership transfers. The login, sessions, profile, membership and completed account-creation reservations are removed; the email can then be registered again.

Unknown dependencies and records outside the selected business fail closed and roll back every change. A repeated confirmed request returns an already-deleted result rather than deleting a different account.

Duplicate-email errors are displayed in the existing notice, now fixed at the top right. The create form keeps its controlled field values; only a resolved failed request's internal request ID changes to allow correction and retry.

Migration: `20260923140000_delete_team_users.sql`.

Regression checks:
- `node tests/delete-team-users.integration.cjs`
- `node --test tests/team-user-account-actions.test.mjs`
