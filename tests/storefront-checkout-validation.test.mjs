import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCheckoutContact, proofPath, formatOrderDate } from '../lib/storefront/checkout-validation.ts';
test('checkout requires customer name, valid phone, fulfillment and delivery address', () => {
 assert.ok(validateCheckoutContact('  ','012345678','pickup',null));
 assert.ok(validateCheckoutContact('Customer','abc','pickup',null));
 assert.ok(validateCheckoutContact('Customer','123','pickup',null));
 assert.ok(validateCheckoutContact('Customer','012345678','invalid',null));
 assert.ok(validateCheckoutContact('Customer','012345678','delivery','  '));
 assert.equal(validateCheckoutContact('Customer','+855 12 345 678','delivery','Street 144'),null);
 assert.equal(validateCheckoutContact('Customer','012345678','pickup',null),null);
});
test('proof references accept only generated private image paths', () => {
 const path='11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png';
 assert.equal(proofPath(`proof:${path}`),path);
 for(const value of ['https://example.com/proof.png','proof:../private.png','proof:a/b.svg',null]) assert.equal(proofPath(value),null);
});
test('order dates render identically across server time zones', () => {
 const previous=process.env.TZ;
 try { process.env.TZ='UTC'; const server=formatOrderDate('2026-09-19T17:14:24Z'); process.env.TZ='America/New_York'; assert.equal(formatOrderDate('2026-09-19T17:14:24Z'),server); assert.match(server,/20 Sept 2026, 00:14/); }
 finally { if(previous) process.env.TZ=previous; else delete process.env.TZ; }
});
