import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const permissions = read('lib/auth/permissions.ts');
const editor = read('app/(dashboard)/dashboard/settings/users/role-permissions-editor.tsx');
const usersActions = read('app/(dashboard)/dashboard/settings/users/users-workspace-actions.ts');
const usersUi = read('app/(dashboard)/dashboard/settings/users/users-workspace.tsx');
const branchContext = read('lib/branches/context.ts');
const migration = read('supabase/migrations/20260921150000_user_permissions_branch_scope.sql');
const setupPage = read('app/team-setup/page.tsx');
const setupAction = read('app/team-setup/actions.ts');
const destination = read('lib/auth/get-account-destination.ts');
const sidebar = read('app/(dashboard)/dashboard/sidebar-client.tsx');
const requirePermission = read('lib/auth/require-permission.ts');
const effective = read('lib/auth/effective-permissions.ts');
const teamModel = read('lib/users/team-model.ts');

function permissionKeys() {
  const block = permissions.match(/export const permissions = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
  return [...block.matchAll(/"([a-z0-9_.]+)"/g)].map(m => m[1]);
}
function labelMap() {
  const block = permissions.match(/export const permissionLabels:[\s\S]*?= \{([\s\S]*?)\n\};/)?.[1] ?? '';
  return new Map([...block.matchAll(/"([a-z0-9_.]+)":\s*"([^"]+)"/g)].map(m => [m[1], m[2]]));
}

test('every internal permission has a friendly merchant label', () => {
  const keys = permissionKeys();
  const labels = labelMap();
  assert.ok(keys.length > 20);
  assert.equal(labels.size, keys.length);
  for (const key of keys) {
    const label = labels.get(key);
    assert.ok(label, `missing label for ${key}`);
    assert.ok(!label.includes('.'), `raw-looking label for ${key}`);
    assert.notEqual(label, key);
  }
});

test('role editor renders labels instead of permission keys', () => {
  assert.match(editor, /permissionLabels\[permission\]/);
  assert.doesNotMatch(editor, />\s*\{permission\}\s*</);
  assert.match(editor, /Reset to default/);
  assert.match(editor, /Save permissions/);
});

test('owner-managed role matrix supports manager staff and cashier only', () => {
  assert.match(permissions, /editablePermissionRoles = \["manager", "staff", "cashier"\]/);
  assert.match(usersActions, /Only the business owner can change role permissions/);
  assert.match(migration, /role text NOT NULL CHECK \(role IN \('manager','staff','cashier'\)\)/);
});

test('permission overrides are service-only and RLS protected', () => {
  assert.match(migration, /ALTER TABLE public\.business_role_permissions ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON public\.business_role_permissions FROM PUBLIC,anon,authenticated/);
  assert.match(migration, /GRANT ALL ON public\.business_role_permissions TO service_role/);
});

test('server permission guards use effective business permissions', () => {
  assert.match(requirePermission, /businessHasPermission/);
  assert.match(effective, /business_role_permissions/);
  assert.match(effective, /role === "owner"/);
  assert.match(sidebar, /effectivePermissions/);
  assert.match(sidebar, /allowed\.has\(item\.permission\)/);
});

test('direct user creation sends no confirmation or reset email', () => {
  assert.match(usersActions, /auth\.admin\.createUser/);
  assert.match(usersActions, /email_confirm:true/);
  assert.match(usersActions, /sendInvite:false/);
  assert.match(usersActions, /requirePasswordChange:true/);
  assert.doesNotMatch(usersActions, /resetPasswordForEmail|inviteUserByEmail|signInWithOtp/);
  assert.match(usersUi, /No confirmation email is sent/);
});

test('new membership records workspace owner and creator lineage', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS team_owner_id uuid/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS team_created_by uuid/);
  assert.match(migration, /NEW\.team_owner_id:=v_owner/);
  assert.match(usersActions, /ensureTeamLineage/);
});

test('first sign in is forced through password setup before workspace access', () => {
  assert.match(destination, /needsTeamPasswordSetup\(userId\).*team-setup/s);
  assert.match(setupAction, /auth\.updateUser\(\{password\}\)/);
  assert.match(setupAction, /tenh_users_finish_setup/);
  assert.match(setupPage, /temporary password provided by your Owner/);
  assert.doesNotMatch(setupPage, /setup email|confirmation email/i);
});

test('non-owner branch context returns only the owner-assigned active branch', () => {
  assert.match(branchContext, /if \(!owner\)[\s\S]*default_location_id/);
  assert.match(branchContext, /locationsQuery = locationsQuery\.eq\("id", membership\.default_location_id\)/);
  assert.match(branchContext, /branchRestricted: !owner/);
  assert.match(branchContext, /requested === "all"[\s\S]*context\.branchRestricted \? context\.branchId : ""/);
});

test('database branch helper rejects tampered branch headers for non-owners', () => {
  assert.match(migration, /IF requested IS NOT NULL AND requested IS DISTINCT FROM assigned THEN/);
  assert.match(migration, /This branch is not assigned to your account/);
  assert.match(migration, /AND m\.is_active=true[\s\S]*team_password_required,false\)=false/);
});

test('manager can only manage staff or cashier accounts', () => {
  assert.match(teamModel, /actor==='manager' \|\| actor==='admin'\)return row\.role==='staff' \|\| row\.role==='cashier'/);
  assert.match(usersActions, /Only the business Owner can manage Manager accounts/);
  assert.match(migration, /Only the business Owner can manage Manager accounts/);
  assert.match(migration, /target_role='manager' AND r<>'owner'/);
});

test('owner remains unmodifiable and owner permission access is always full', () => {
  assert.match(teamModel, /row\.role==='owner'\)return false/);
  assert.match(migration, /IF m\.role='owner' OR m\.user_id=p_actor THEN RAISE EXCEPTION/);
  assert.match(effective, /if \(role === "owner"\) return \[\.\.\.permissions\]/);
});

test('user management UI is named User & Manage User', () => {
  assert.match(usersUi, /User &amp; Manage User/);
  assert.match(sidebar, /User & Manage User/);
});

test('order update buttons are hidden when the effective update permission is disabled', () => {
  const onlinePage = read('app/(dashboard)/dashboard/online-orders/page.tsx');
  const onlineClient = read('app/(dashboard)/dashboard/online-orders/online-orders-client.tsx');
  const onlineActions = read('app/(dashboard)/dashboard/online-orders/actions.ts');
  assert.match(onlinePage, /businessHasPermission\(business, "orders\.update"\)/);
  assert.match(onlineClient, /canUpdate && primary/);
  assert.match(onlineClient, /canUpdate && order\.payment_method === "khqr"/);
  assert.match(onlineActions, /nextStatus === "rejected" \? "orders\.cancel" : "orders\.update"/);
});

test('purchase order actions use create update and cancel permissions separately', () => {
  const page = read('app/(dashboard)/dashboard/purchase-orders/page.tsx');
  const actions = read('app/(dashboard)/dashboard/purchase-orders/actions.ts');
  const client = read('app/(dashboard)/dashboard/purchase-orders/purchase-orders-client.tsx');
  assert.match(page, /businessHasPermission\(business, "purchases\.create"\)/);
  assert.match(page, /businessHasPermission\(business, "purchases\.update"\)/);
  assert.match(client, /canCreate/);
  assert.match(client, /canUpdate/);
  assert.match(actions, /status === "cancelled" \? "purchases\.cancel" : "purchases\.update"/);
});

test('migration preflights legacy POS register and return functions before hardening', () => {
  assert.match(migration, /tenh_pos_guard\(uuid\).*IS NULL/s);
  assert.match(migration, /tenh_pos_catalog\(uuid\).*IS NULL/s);
  assert.match(migration, /record_cash_movement\(uuid,uuid,text,numeric,text,text\).*IS NULL/s);
  assert.match(migration, /tenh_create_order_return_accounted\(uuid,text,jsonb,text\).*IS NULL/s);
});

test('POS catalog is permission guarded and branch scoped for non owners', () => {
  const posActions = read('app/(dashboard)/dashboard/pos/pos-workspace-actions.ts');
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.tenh_pos_catalog_scoped/);
  assert.match(migration, /tenh_assert_effective_permission\(p_business_id,'pos\.access'\)/);
  assert.match(migration, /c\.location_id=v_branch/);
  assert.match(migration, /s\.location_id=v_branch/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.tenh_pos_catalog\(uuid\) FROM PUBLIC,anon,authenticated/);
  assert.match(posActions, /rpc\('tenh_pos_catalog_scoped'/);
});

test('legacy POS guard obeys owner managed Point of Sale permission', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.tenh_pos_guard/);
  assert.match(migration, /tenh_user_permission_allowed\(p_business_id,auth\.uid\(\),'pos\.access'\)/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.tenh_pos_guard\(uuid\) FROM PUBLIC,anon,authenticated/);
});

test('POS checkout requires both Point of Sale and Create Order permissions', () => {
  const posActions = read('app/(dashboard)/dashboard/pos/pos-workspace-actions.ts');
  assert.match(migration, /tenh_assert_effective_permission\(p_business_id,'pos\.access'\)/);
  assert.match(migration, /tenh_assert_effective_permission\(p_business_id,'orders\.create'\)/);
  assert.match(posActions, /businessHasPermission\(business, 'orders\.create'\)/);
});

test('register open cash movement and close operations enforce dynamic register permission and branch', () => {
  const registerActions = read('app/(dashboard)/dashboard/register/actions.ts');
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.tenh_record_cash_movement_guarded/);
  assert.match(migration, /tenh_assert_effective_permission\(p_business_id,'register\.manage'\)/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.tenh_users_open_register_guard/);
  assert.match(migration, /tenh_user_permission_allowed\(NEW\.business_id,NEW\.opened_by,'register\.manage'\)/);
  assert.match(migration, /This register belongs to another branch/);
  assert.match(registerActions, /rpc\("tenh_record_cash_movement_guarded"/);
});

test('branch stock operations map to effective create update cancel and return permissions', () => {
  assert.match(migration, /p_operation='create_purchase'[\s\S]*'purchases\.create'/);
  assert.match(migration, /p_operation='cancel_purchase'[\s\S]*'purchases\.cancel'/);
  assert.match(migration, /p_operation='receive_purchase_order'[\s\S]*'purchases\.update'/);
  assert.match(migration, /p_operation='cancel_order' or p_operation='reject_online'[\s\S]*'orders\.cancel'/);
  assert.match(migration, /p_operation='return_order'[\s\S]*'orders\.return'/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.tenh_create_order_return_accounted\(uuid,text,jsonb,text\) FROM PUBLIC,anon,authenticated/);
});

test('stock adjustment obeys owner managed permission and assigned branch', () => {
  assert.match(migration, /adjust_branch_product_stock[\s\S]*tenh_assert_effective_permission\(p_business_id,'products\.stock_adjust'\)/);
  assert.match(migration, /tenh_request_branch\(p_business_id\) is distinct from p_location_id/);
});

test('assigned branch is enforced on branch list and branch stock rows', () => {
  assert.match(migration, /CREATE POLICY tenh_assigned_branch_locations ON public\.business_locations/);
  assert.match(migration, /OR id=public\.tenh_request_branch\(business_id\)/);
  assert.match(migration, /CREATE POLICY tenh_assigned_branch_stock ON public\.product_location_stock/);
  assert.match(migration, /tenh_branch_visible\(business_id,location_id\)/);
});

test('browser cannot bypass registered POS checkout by calling the core checkout directly', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.tenh_pos_checkout\(uuid,jsonb\) FROM PUBLIC,anon,authenticated/);
});

test('branch query parameters are validated against the assigned branch', () => {
  const productsPage = read('app/(dashboard)/dashboard/products/page.tsx');
  const adjustmentPage = read('app/(dashboard)/dashboard/inventory/adjustments/page.tsx');
  assert.match(productsPage, /getViewingBranchId\(requestedBranch\)/);
  assert.match(adjustmentPage, /getViewingBranchId\(requestedBranch\)/);
  assert.doesNotMatch(productsPage, /requestedBranch === "all" \? ""/);
});

test('business management link is hidden when Business Update is disabled', () => {
  const settingsPage = read('app/(dashboard)/dashboard/settings/page.tsx');
  assert.match(settingsPage, /businessHasPermission\(business, "business\.update"\)/);
  assert.match(settingsPage, /canUpdateBusiness \? <Link/);
});

test('merchant permission names avoid internal/system style labels', () => {
  const labels = [...labelMap().values()];
  assert.ok(labels.length > 20);
  for (const label of labels) {
    assert.doesNotMatch(label, /\b(Business View|Business Update|Storefront View|Online Store View)\b/i);
    assert.doesNotMatch(label, /^[a-z0-9_]+\.[a-z0-9_.]+$/i);
  }
  assert.match(permissions, /permissionDescriptions: Record<Permission, string>/);
  assert.match(editor, /permissionDescriptions\[permission\]/);
  assert.match(editor, /Current permissions/);
  assert.match(editor, /Unsaved changes/);
});

test('role permission editor keeps save reset and dependency safety', () => {
  assert.match(editor, /Reset to default/);
  assert.match(editor, /Save permissions/);
  assert.match(editor, /removePermissionWithDependents/);
  assert.match(editor, /normalizePermissionSelection/);
  assert.match(editor, /Owner always keeps full access/);
  assert.match(editor, /assigned branch/);
});

test('sidebar keeps Global Search while filtering menus by effective permissions', () => {
  assert.match(sidebar, /Search anything…/);
  assert.match(sidebar, /effectivePermissions/);
  assert.match(sidebar, /filterMenuGroups\(effectivePermissions\)/);
  assert.match(sidebar, /allowed\.has\(item\.permission\)/);
  assert.match(sidebar, /User & Manage User/);
});
