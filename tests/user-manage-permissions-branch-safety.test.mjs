import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const permissions = read('lib/auth/permissions.ts');
const editor = read('app/(dashboard)/dashboard/settings/users/role-permissions-editor.tsx');
const usersActions = read('app/(dashboard)/dashboard/settings/users/users-workspace-actions.ts');
const usersUi = read('app/(dashboard)/dashboard/settings/users/users-workspace.tsx');
const branchContext = read('lib/branches/context.ts');
// The original 20260921150000_user_permissions_branch_scope.sql was applied but never
// committed. This is a schema-only snapshot of the live result (function bodies,
// policies, grants, constraints; no rows). Refresh it from the database if those change.
const scope = JSON.parse(read('tests/fixtures/user-permissions-branch-scope.json'));
const fn = (name) => { const body = scope.functions[name]; assert.ok(body, `missing function ${name}`); return body; };
const policy = (table, name) => { const p = scope.policies.find(x => x.table === table && x.name === name); assert.ok(p, `missing policy ${name}`); return p; };
const revokedFromClients = (signature) => { const g = scope.execute[signature]; assert.ok(g, `missing function ${signature}`); assert.equal(g.anon, false, `${signature} anon`); assert.equal(g.authenticated, false, `${signature} authenticated`); };
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
  assert.match(editor, /permissionLabels\[p\]/);
  assert.doesNotMatch(editor, />\s*\{p\}\s*</);
  assert.match(editor, /'Reset role'/);
  assert.match(editor, /'Save changes'/);
});

test('owner-managed role matrix supports manager staff and cashier only', () => {
  assert.match(permissions, /editablePermissionRoles = \["manager", "staff", "cashier"\]/);
  assert.match(usersActions, /Only the business owner can change role permissions/);
  assert.deepEqual(scope.business_role_permissions.checks, ["CHECK ((role = ANY (ARRAY['manager'::text, 'staff'::text, 'cashier'::text])))"]);
});

test('permission overrides are service-only and RLS protected', () => {
  const table = scope.business_role_permissions;
  assert.equal(table.rls, true);
  assert.equal(table.anon, false);
  assert.equal(table.authenticated, false);
  assert.equal(table.service_role, true);
  // Live overrides: per-user rows are service-only; per-branch role rows are writable
  // only by an active Owner of that business, through RLS.
  const member = scope.override_tables.business_member_permissions;
  assert.deepEqual([member.rls, member.anon, member.authenticated, member.service_role], [true, false, false, true]);
  assert.equal(member.policies, null);
  const branchRole = scope.override_tables.branch_role_permissions;
  assert.equal(branchRole.rls, true);
  assert.deepEqual(branchRole.checks, ["CHECK ((role = ANY (ARRAY['manager'::text, 'staff'::text, 'cashier'::text])))"]);
  for (const p of branchRole.policies) assert.deepEqual(p.roles, ['authenticated'], `${p.name} must not apply to anon`);
  const writes = branchRole.policies.filter(p => p.cmd !== 'SELECT');
  assert.deepEqual(writes.map(p => p.name), ['branch_role_write']);
  for (const clause of [writes[0].qual, writes[0].check]) {
    assert.match(clause, /business_members\.user_id = auth\.uid\(\)\) AND business_members\.is_active AND \(business_members\.role = 'owner'::text\)/);
    assert.match(clause, /business_members\.business_id = branch_role_permissions\.business_id/);
  }
});

test('server permission guards use effective business permissions', () => {
  assert.match(requirePermission, /businessHasPermission/);
  assert.match(effective, /\.from\("branch_role_permissions"\)/);
  assert.match(effective, /\.from\('business_member_permissions'\)/);
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
  assert.deepEqual(scope.business_members_columns, ['team_created_by', 'team_owner_id']);
  assert.equal(scope.business_members_triggers.aa_tenh_membership_owner_lineage, 'tenh_membership_owner_lineage');
  assert.match(fn('tenh_membership_owner_lineage'), /NEW\.team_owner_id:=v_owner/);
  assert.match(usersActions, /ensureTeamLineage/);
});

test('first sign in is forced through password setup before workspace access', () => {
  assert.match(destination, /needsTeamPasswordSetup\(userId\).*team-setup/s);
  assert.match(setupAction, /auth\.updateUser\(\{password\}\)/);
  assert.match(setupAction, /tenh_users_finish_setup/);
  assert.match(setupPage, /temporary password provided by your store owner/);
  assert.doesNotMatch(setupPage, /setup email|confirmation email/i);
});

test('non-owner branch context returns only the owner-assigned active branch', () => {
  assert.match(branchContext, /const assigned = available\.find\(b => b\.id === membership\.data\.default_location_id\)/);
  assert.match(branchContext, /if \(!owner && !assigned\) throw/);
  assert.match(branchContext, /const branches = owner \? available : available\.filter\(b => b\.id === assigned\?\.id\)/);
  assert.match(branchContext, /const branchId = owner \? branches\.find\(b => b\.id === saved\)\?\.id \?\? ownBranchId : ownBranchId/);
  assert.match(branchContext, /requested === 'all'[\s\S]*context\.business\.role === 'owner' \? '' : context\.branchId/);
  assert.match(branchContext, /context\.business\.role !== 'owner' && requested !== context\.branchId\) throw/);
});

test('database branch helper rejects tampered branch headers for non-owners', () => {
  const branch = fn('tenh_request_branch');
  assert.match(branch, /IF requested IS NOT NULL AND requested IS DISTINCT FROM assigned THEN/);
  assert.match(branch, /This branch is not assigned to your account/);
  assert.match(branch, /AND m\.is_active=true[\s\S]*team_password_required,false\)=false/);
});

test('manager can only manage staff or cashier accounts', () => {
  assert.match(teamModel, /actor==='manager' \|\| actor==='admin'\)return row\.role==='staff' \|\| row\.role==='cashier'/);
  assert.match(usersActions, /Only the business Owner can manage Manager accounts/);
  assert.match(fn('tenh_users_edit'), /Only the business Owner can manage Manager accounts/);
  assert.match(fn('tenh_users_edit'), /target_role='manager' AND r<>'owner'/);
});

test('owner remains unmodifiable and owner permission access is always full', () => {
  assert.match(teamModel, /row\.role==='owner'\)return false/);
  assert.match(fn('tenh_users_edit'), /IF m\.role='owner' OR m\.user_id=p_actor THEN RAISE EXCEPTION/);
  assert.match(effective, /if \(role === "owner"\) return \[\.\.\.permissions\]/);
});

test('user management UI is named User & Manage User', () => {
  assert.match(usersUi, /User &amp; Manage User/);
  assert.match(sidebar, /User & Manage User/);
});

test('order update buttons are hidden when the effective update permission is disabled', () => {
  // Online orders are managed in the merged Orders workspace.
  const ordersPage = read('app/(dashboard)/dashboard/orders/page.tsx');
  const workspace = read('app/(dashboard)/dashboard/orders/orders-workspace.tsx');
  const onlineActions = read('app/(dashboard)/dashboard/online-orders/actions.ts');
  assert.match(ordersPage, /businessHasPermission\(business, ?"orders\.update"\)/);
  assert.match(workspace, /permissions\.edit \? nextStatuses\(/);
  assert.match(workspace, /permissions\.edit && <div className=\{styles\.onlineButtons\}>/);
  assert.match(workspace, /const canCancelOrder = permissions\.cancel &&/);
  assert.match(onlineActions, /nextStatus === "rejected" \? "orders\.cancel" : "orders\.update"/);
});

test('purchase order actions use create update and cancel permissions separately', () => {
  const page = read('app/(dashboard)/dashboard/purchase-orders/page.tsx');
  const actions = read('app/(dashboard)/dashboard/purchase-orders/actions.ts');
  const client = read('app/(dashboard)/dashboard/purchase-orders/purchase-orders-client.tsx');
  assert.match(page, /businessHasPermission\(business, ?"purchases\.create"\)/);
  assert.match(page, /businessHasPermission\(business, ?"purchases\.update"\)/);
  assert.match(client, /canCreate/);
  assert.match(client, /canUpdate/);
  assert.match(actions, /status === "cancelled" \? "purchases\.cancel" : "purchases\.update"/);
});

// The migration's preflight only guaranteed these legacy functions existed before it
// hardened them; the lasting property is that each one is closed to browser roles or
// enforces the permission and branch itself.
test('legacy POS register and return functions are hardened', () => {
  revokedFromClients('public.tenh_pos_guard(uuid)');
  revokedFromClients('public.tenh_pos_catalog(uuid)');
  revokedFromClients('public.tenh_create_order_return_accounted(uuid,text,jsonb,text)');
  assert.equal(scope.execute['public.record_cash_movement(uuid,uuid,text,numeric,text,text)'].anon, false);
  const legacyCash = fn('record_cash_movement');
  assert.match(legacyCash, /tenh_assert_effective_permission\(p_business_id, 'register\.manage'\)/);
  assert.match(legacyCash, /v_shift\.location_id is distinct from v_branch/);
});

test('POS catalog is permission guarded and branch scoped for non owners', () => {
  const posActions = read('app/(dashboard)/dashboard/pos/pos-workspace-actions.ts');
  // The scoped catalog now wraps the original guarded body and filters to POS products.
  assert.match(fn('tenh_pos_catalog_scoped'), /result:=public\.tenh_pos_catalog_scoped_before_visibility\(p_business_id\)/);
  const catalog = fn('tenh_pos_catalog_scoped_before_visibility');
  assert.match(catalog, /tenh_assert_effective_permission\(p_business_id,'pos\.access'\)/);
  assert.match(catalog, /c\.location_id=v_branch/);
  assert.match(catalog, /s\.location_id=v_branch/);
  revokedFromClients('public.tenh_pos_catalog(uuid)');
  assert.match(posActions, /rpc\('tenh_pos_catalog_scoped'/);
});

test('legacy POS guard obeys owner managed Point of Sale permission', () => {
  assert.match(fn('tenh_pos_guard'), /tenh_user_permission_allowed\(p_business_id,auth\.uid\(\),'pos\.access'\)/);
  revokedFromClients('public.tenh_pos_guard(uuid)');
});

test('POS checkout requires both Point of Sale and Create Order permissions', () => {
  const posActions = read('app/(dashboard)/dashboard/pos/pos-workspace-actions.ts');
  assert.match(fn('tenh_pos_checkout_registered'), /tenh_assert_effective_permission\(p_business_id,'pos\.access'\)/);
  assert.match(fn('tenh_pos_checkout_registered'), /tenh_assert_effective_permission\(p_business_id,'orders\.create'\)/);
  assert.match(posActions, /businessHasPermission\(business, 'orders\.create'\)/);
});

test('register open cash movement and close operations enforce dynamic register permission and branch', () => {
  const registerActions = read('app/(dashboard)/dashboard/register/actions.ts');
  const guarded = fn('tenh_record_cash_movement_guarded');
  assert.match(guarded, /tenh_assert_effective_permission\(p_business_id,'register\.manage'\)/);
  assert.match(guarded, /public\.record_cash_movement\(/);
  assert.match(fn('record_cash_movement'), /This register belongs to another branch/);
  assert.match(fn('tenh_users_open_register_guard'), /tenh_user_permission_allowed\(NEW\.business_id,NEW\.opened_by,'register\.manage'\)/);
  assert.match(registerActions, /rpc\("(tenh_record_cash_movement_guarded|record_cash_movement)"/);
  assert.match(fn('record_cash_movement'), /tenh_assert_effective_permission\(p_business_id, 'register\.manage'\)/);
  assert.match(fn('record_cash_movement'), /v_branch := public\.tenh_request_branch\(p_business_id\)/);
});

test('branch stock operations map to effective create update cancel and return permissions', () => {
  const stock = fn('tenh_run_branch_stock');
  assert.match(stock, /p_operation='create_purchase'[\s\S]*'purchases\.create'/);
  assert.match(stock, /p_operation='cancel_purchase'[\s\S]*'purchases\.cancel'/);
  assert.match(stock, /p_operation='receive_purchase_order'[\s\S]*'purchases\.update'/);
  assert.match(stock, /p_operation='cancel_order' or p_operation='reject_online'[\s\S]*'orders\.cancel'/);
  assert.match(stock, /p_operation='return_order'[\s\S]*'orders\.return'/);
  revokedFromClients('public.tenh_create_order_return_accounted(uuid,text,jsonb,text)');
});

test('stock adjustment obeys owner managed permission and assigned branch', () => {
  assert.match(fn('adjust_branch_product_stock'), /tenh_assert_effective_permission\(p_business_id,'products\.stock_adjust'\)/);
  assert.match(fn('adjust_branch_product_stock'), /tenh_request_branch\(p_business_id\) is distinct from p_location_id/);
});

test('assigned branch is enforced on branch list and branch stock rows', () => {
  // RESTRICTIVE is essential: the permissive member policies alone would show every branch.
  const locations = policy('business_locations', 'tenh_assigned_branch_locations');
  const stock = policy('product_location_stock', 'tenh_assigned_branch_stock');
  for (const p of [locations, stock]) { assert.equal(p.permissive, 'RESTRICTIVE'); assert.equal(p.cmd, 'ALL'); assert.equal(p.qual, p.check); }
  assert.equal(locations.qual, 'tenh_branch_visible(business_id, id)');
  assert.equal(stock.qual, 'tenh_branch_visible(business_id, location_id)');
  assert.match(fn('tenh_branch_visible'), /branch:=public\.tenh_request_branch\(p_business\);\s*return branch is null or coalesce\(p_location=branch,false\)/);
});

test('browser cannot bypass registered POS checkout by calling the core checkout directly', () => {
  revokedFromClients('public.tenh_pos_checkout(uuid,jsonb)');
});

test('branch query parameters are validated against the assigned branch', () => {
  const productsPage = read('app/(dashboard)/dashboard/products/page.tsx');
  const adjustmentPage = read('app/(dashboard)/dashboard/inventory/adjustments/page.tsx');
  assert.match(productsPage, /searchParams: Promise<\{ view\?: string \}>/);
  assert.doesNotMatch(productsPage, /requestedBranch|params\.branch/);
  assert.match(adjustmentPage, /const \{ branchId: selectedBranch, userId \} = await getBranchContext\(\)/);
  assert.match(adjustmentPage, /const branchMismatch = Boolean\(requestedBranch && requestedBranch !== branch\.id\)/);
  assert.match(adjustmentPage, /branchMismatch \|\| invalidSelection \? \[\]/);
  assert.doesNotMatch(adjustmentPage, /\.eq\("location_id", requestedBranch\)/);
});

test('business settings edits require Business Update', () => {
  const settingsPage = read('app/(dashboard)/dashboard/settings/page.tsx');
  const businessPage = read('app/(dashboard)/dashboard/settings/business/page.tsx');
  const infoActions = read('app/(dashboard)/dashboard/settings/business/info-actions.ts');
  assert.match(settingsPage, /href: "\/dashboard\/settings\/business", icon: Building2, visible: canViewBusiness \|\| canViewStorefront/);
  assert.match(businessPage, /requireAnyPermission\(\["business\.view", "storefront\.view"\]\)/);
  assert.match(businessPage, /canEditInfo, canEditStorefront[\s\S]*businessHasPermission\(business, "business\.update"\)/);
  assert.match(infoActions, /requirePermission\("business\.update"\)/);
});

test('merchant permission names avoid internal/system style labels', () => {
  const labels = [...labelMap().values()];
  assert.ok(labels.length > 20);
  for (const label of labels) {
    assert.doesNotMatch(label, /\b(Business View|Business Update|Storefront View|Online Store View)\b/i);
    assert.doesNotMatch(label, /^[a-z0-9_]+\.[a-z0-9_.]+$/i);
  }
  assert.match(permissions, /permissionDescriptions: Record<Permission, string>/);
  assert.match(editor, /permissionDescriptions\[p\]/);
  assert.match(editor, /\$\{selected\.length\} enabled/);
  assert.match(editor, /' · Unsaved'/);
});

test('role permission editor keeps save reset and dependency safety', () => {
  assert.match(editor, /'Reset role'/);
  assert.match(editor, /'Save changes'/);
  assert.match(editor, /Reset this role to TENH defaults\?/);
  assert.match(editor, /removePermissionWithDependents/);
  assert.match(editor, /normalizePermissionSelection/);
  assert.match(editor, /Owner always has full access/);
  assert.match(editor, /Owner-only actions and branch limits stay protected/);
});

test('sidebar keeps Global Search while filtering menus by effective permissions', () => {
  assert.match(sidebar, /Search anything…/);
  assert.match(sidebar, /effectivePermissions/);
  assert.match(sidebar, /filterMenuGroups\(effectivePermissions\)/);
  assert.match(sidebar, /allowed\.has\(item\.permission\)/);
  assert.match(sidebar, /User & Manage User/);
});
