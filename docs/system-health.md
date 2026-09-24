# System Health

Super Admin → Website Health → Run checks performs bounded, read-only service checks. Results are current when checked; they are not continuous monitoring.

- **Supabase:** authentication health endpoint.
- **Database:** authenticated read of one business ID.
- **Storage:** authenticated bucket listing, without upload or deletion.
- **Vercel:** current deployment readiness through the Vercel API. Set a server-only `VERCEL_TOKEN` with access to the deployment and `VERCEL_DEPLOYMENT_ID` or `VERCEL_URL`; set `VERCEL_TEAM_ID` when required. Missing configuration shows Needs review.
- **ABA PayWay:** gateway reachability and configuration. Merchant authentication requires a separate payment test.
- **Webhooks:** local signature validation, including rejection of tampered and unsigned payloads. Public callback delivery is not tested.
- **Background jobs:** latest execution of the daily `/api/internal/subscriptions/purge` job configured in `vercel.json`. Requires `CRON_SECRET` and migration `20260924022000_system_job_health.sql`. Failed executions, runs exceeding 15 minutes, or completions older than 26 hours show Failed. No recorded run shows Needs review. Other jobs are not monitored.
- Existing Resend, OAuth and external-service checks remain available.

Job monitoring stores one row, accessible only to the service role. Recording failures do not block subscription processing. Health checks never invoke the cleanup job or fabricate a successful execution; the first status appears after its next authorized run.
