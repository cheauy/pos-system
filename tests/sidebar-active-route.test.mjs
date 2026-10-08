// Sidebar route matching: exactly one menu group owns each route; unmatched routes highlight nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync('app/(dashboard)/dashboard/sidebar-client.tsx','utf8');
const groupsSource=source.slice(source.indexOf('const menuGroups'),source.indexOf('const searchScopes'));
const helpers=source.slice(source.indexOf('// No fallback group'));
const icon=null;
const code=ts.transpileModule(`${groupsSource}\n${helpers}\nreturn {menuGroups,getActiveGroup,isItemActive};`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
  .replace(/\b(ShoppingCart|ReceiptText|BadgePercent|RotateCcw|Users|Boxes|PackagePlus|ArrowRightLeft|Tags|Barcode|Truck|BarChart3|WalletCards|Landmark|CreditCard|Settings|Store|Printer|Download|FileSearch)\b(?=[,\s}])/g,'icon');
const {menuGroups,getActiveGroup,isItemActive}=new Function('icon',code)(icon);
const group=path=>getActiveGroup(path,menuGroups)?.title ?? null;

test('Business Settings and its sections highlight Settings, never Sales/POS',()=>{
  for(const path of ['/dashboard/settings/business','/dashboard/settings/business/payment/abc','/dashboard/settings/online-store','/dashboard/settings/online-store/ordering','/dashboard/settings/notifications','/dashboard/settings']){
    assert.equal(group(path),'Settings',path);
    assert.equal(isItemActive(path,'/dashboard/pos'),false,path);
  }
});

test('each route activates at most one sidebar item',()=>{
  const items=menuGroups.flatMap(g=>g.items.map(i=>i.href));
  for(const path of ['/dashboard/pos','/dashboard/settings/business','/dashboard/settings/users','/dashboard/settings/printers','/dashboard/settings/receipts','/dashboard/locations','/dashboard/inventory'])
    assert.ok(new Set(items.filter(href=>isItemActive(path,href))).size<=1,path);
  assert.equal(group('/dashboard/pos'),'Sales');
  assert.equal(group('/dashboard/settings/users'),'Settings');
  assert.equal(isItemActive('/dashboard/settings/users','/dashboard/settings'),false);
});

test('routes owned by direct rail links or nothing do not fall back to Sales',()=>{
  for(const path of ['/dashboard','/dashboard/settings/profile','/dashboard/settings/subscription','/dashboard/search','/dashboard/unknown'])
    assert.notEqual(group(path),'Sales',path);
});
