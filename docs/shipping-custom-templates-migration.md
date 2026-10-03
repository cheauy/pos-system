# Named shipping templates: offline migration review

Reviewed SQL: `supabase/migrations/20261003001000_shipping_custom_templates.sql`. The approved migration was installed on POS on 2026-10-03 and independently postchecked. Its exact SHA-256 is `1c184bdd2d43ed56b968516ce9f255d002ac4a7f7915d07d44f136a1e96157a0`. Do not reapply it as part of this application release. Execution on any other database requires exact review approval.

The change adds only `public.branch_shipping_templates`: one catalogue row per `(business_id, location_id)`, a bounded JSONB `templates` array, and `updated_at`. Each named entry has a numeric `revision`. No receipt, branch-receipt, order, printer-size, visibility, preset, or existing storage schema is altered. Existing branch JSON files remain intact.

The new `tenh_save_shipping_template` RPC locks the branch catalogue row and merges one named entry. Creates cannot overwrite an ID. Updates compare that entry's expected revision inside the transaction; other templates' changes do not create false conflicts. Names are unique within the branch after NFKC normalization and case folding. Database checks bound layouts, formatting, catalogue size, and QR geometry. Runtime URL-dependent QR density remains enforced by the existing app and print guards.

The RPC is `SECURITY DEFINER` with an empty search path. It requires an authenticated user, the existing `business.update` permission, the exact requested operating branch, and the existing plan guard. The table reuses `tenh_guard_branch_setting` for membership, branch, and closing-plan checks. Authenticated clients receive only table SELECT plus RPC EXECUTE; direct catalogue writes and anonymous RPC execution are denied. The existing server role receives SELECT only for catalogues used by authorized order prints. App reads still resolve the operating branch or call `authorizedOrderBranch` before their server-role query.

Reads perform no import or database write. Before the first explicit named save, legacy private JSON is displayed with revision zero. The RPC imports those legacy entries only when creating the branch row. `INSERT ... ON CONFLICT DO NOTHING` plus the row lock protects concurrent first imports. Imported entries start at revision zero; an edit increments to one. Existing canonical catalogues always override stale JSON snapshots, so old snapshots cannot resurrect or delete database entries.

Shipping size, visibility, and default selection continue through the existing settings JSON flow. A template commit is not rolled back if saving its optional default selection fails: the action returns the committed catalogue and an explicit selection warning. This avoids a misleading failed-create response and a duplicate retry. General settings still have their existing last-writer semantics; named entries are protected independently.

The POS installation postcheck confirmed the reviewed functions, grants, and RLS with an empty catalogue and unchanged existing business/location/settings counts. Missing migration support on another database deliberately blocks named saves instead of falling back to unsafe object upserts. Do not run old named-template writers concurrently during cutover. No new secret or change to existing application permissions is needed; the new table/RPC grants are limited to the contracts described above.

Local evidence includes mock concurrent RPC saves and a disposable PGlite PostgreSQL-engine fixture running the actual migration and existing branch guard. It covers repeatable application, legacy import once, two creates, independent edits, conflicting revision CAS, duplicate names, direct-write denial, branch visibility, permission, plan, anonymous access, validation, and rollback on failure. PGlite serializes queries in one engine; separate production PostgreSQL sessions and network lock contention remain to be verified in an approved staging environment.

## Rollback without data loss

1. Pause named-template writes and retain the additive table/RPC. Do not delete catalogues or revert readers first.
2. Export each canonical catalogue with its business/branch identity. Keep a secure local backup and verify its template count, IDs, names, formatting, and QR review states.
3. In an approved rollback operation, merge the canonical catalogue into the corresponding existing private `shipping-settings.json` while preserving that file's size, visibility, selection, and legacy singleton design. Confirm its selected named ID exists. Never restore an old ZIP or stale object over the canonical catalogue.
4. Verify all templates reload and print previews match, then switch readers/writers to the prior compatible version. Retain the database table and backups until preservation is reviewed. No destructive purge is part of this plan.

Applying the migration alone adds schema/grants; it does not backfill, modify existing JSON, deploy the app, or print labels. Reverting app code alone after database saves would hide new templates, so it is not a safe complete rollback.
