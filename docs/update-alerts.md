# User update alerts

Open **Super Admin → User Update Alerts** to publish an announcement. Choose New update, Notice, Maintenance, or Important; enter a title and message; optionally add a workspace button and end time. The preview does not navigate away from the form.

- One alert is live at a time. Publishing a new one ends the previous alert in the same database transaction.
- Announcements appear for signed-in users in the dashboard, Super Admin, and business-disabled screen. Visible tabs refresh every 30 seconds and on focus. Users signing in later see the current alert while it remains live.
- Dismissal is saved per account, across sessions and devices, and does not hide future announcements or affect other users.
- Automatic expiry is enforced by the database; no scheduled job is needed. End times are entered in the admin's local time, saved as UTC, and shown in history in Cambodia time.
- Only an active Super Admin may publish, end, or read history. Direct table access is blocked for authenticated/anonymous clients. Optional buttons accept internal `/dashboard` links only.
- Alert history shows 20 announcements per page. Nothing is emailed or sent as a browser push notification.

Schema: `supabase/migrations/20260924005000_user_update_alerts.sql`.
Checks: `node --test tests/update-alerts.test.cjs` (uses the existing test-only PGlite helper; no customer data or live alerts are created).
