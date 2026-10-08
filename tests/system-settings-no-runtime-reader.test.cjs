/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

// system_settings holds one legacy store's name/address and has no business_id.
// Any runtime reader would show that store's details to every other business.
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
 const p=path.join(dir,e.name);
 if(e.isDirectory())return ['node_modules','.next','dist','build'].includes(e.name)?[]:walk(p);
 return /\.(ts|tsx|js|mjs|cjs)$/.test(e.name)?[p]:[];
});

test('no route, action or component reads the legacy single-store system_settings row',()=>{
 const readers=new Set(['lib/settings/get-receipt-settings.ts','lib/settings/get-appearance-settings.ts']);
 const sources=['app','components','lib','mobile/src'].filter(fs.existsSync).flatMap(walk).map(p=>p.replaceAll('\\','/'));
 const direct=sources.filter(p=>!readers.has(p)&&/from\(\s*["'`]system_settings["'`]\s*\)/.test(fs.readFileSync(p,'utf8')));
 assert.deepEqual(direct,[]);
 const callers=sources.filter(p=>!readers.has(p)&&/\b(getReceiptSettings|getAppearanceSettings)\s*\(/.test(fs.readFileSync(p,'utf8')));
 assert.deepEqual(callers,[],'legacy readers must stay uncalled; use per-business/branch settings');
});

test('receipts and theme come from per-business sources, not system_settings',()=>{
 const receipt=fs.readFileSync('app/(dashboard)/dashboard/orders/[id]/receipt/page.tsx','utf8');
 assert.match(receipt,/loadReceiptContext/);
 assert.doesNotMatch(receipt,/system_settings|getReceiptSettings/);
 const layout=fs.readFileSync('app/layout.tsx','utf8');
 assert.match(layout,/localStorage\.getItem\("tenh-appearance"\)/);
 assert.doesNotMatch(layout,/getAppearanceSettings|system_settings/);
});
