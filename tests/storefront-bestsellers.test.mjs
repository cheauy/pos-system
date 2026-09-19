import test from 'node:test';
import assert from 'node:assert/strict';
import { bestsellerKeys } from '../lib/storefront/bestsellers.ts';
const products = [{ key: 'shirt', variants: [{id:'s'},{id:'m'}] }, { key:'hoodie', variants:[{id:'h'}] }, { key:'unsold', variants:[{id:'u'}] }];
test('bestsellers combine variants and rank styles without labeling unsold products', () => {
 assert.deepEqual([...bestsellerKeys(products, new Map([['s',3],['m',4],['h',6]]))], ['shirt']);
});
test('bestsellers require five completed-sale units and include equal sales ties', () => {
 assert.equal(bestsellerKeys(products,new Map([['s',4]])).size,0);
 assert.deepEqual([...bestsellerKeys(products,new Map([['s',5],['h',5]]))],['shirt','hoodie']);
 assert.equal(bestsellerKeys(products,new Map()).size,0);
});
