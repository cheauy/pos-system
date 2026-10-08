/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

test('old mobile builds without updatedAt get an update-app error, and the version guard still applies',()=>{
 const route=fs.readFileSync('app/api/mobile/[feature]/route.ts','utf8');
 const start=route.indexOf("if (feature === 'incoming-status' || feature === 'payment')");
 assert.ok(start>0);
 const block=route.slice(start,route.indexOf("if (feature === 'adjustment')",start));
 const missing=block.indexOf("if (body.updatedAt === undefined) throw new RequestError('Update the TENH POS app to change online orders.', 426);");
 const invalid=block.indexOf("if (typeof body.updatedAt !== 'string' || !Number.isFinite(Date.parse(body.updatedAt))) throw new RequestError('Refresh the online order before changing it.');");
 const call=block.indexOf("updateOnlinePaymentStatus(id, 'paid', body.updatedAt)");
 assert.ok(missing>0&&invalid>missing&&call>invalid,'missing → 426, malformed → refresh, then the RPC receives the displayed version');
 assert.match(block,/updateOnlineOrderStatus\(id, body\.status, body\.updatedAt\)/);
});
