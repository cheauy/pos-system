const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');

test('device protection requires successful native verification before storing enable/disable', async () => {
  const writes = []; let enrolled = false, success = false, options;
  const device = loadTs('mobile/src/device-auth.ts', {
    'expo-local-authentication': { hasHardwareAsync: async()=>true, isEnrolledAsync: async()=>enrolled, authenticateAsync: async value=>{options=value;return {success};} },
    './client': {deviceStorage: {setItem:async(...args)=>writes.push(args)}},
  });
  await assert.rejects(device.saveDeviceLock('alice',true), /Set up fingerprint/); assert.equal(writes.length,0);
  enrolled=true; await assert.rejects(device.saveDeviceLock('alice',true), /not completed/); assert.equal(writes.length,0);
  success=true; await device.saveDeviceLock('alice',true);
  assert.deepEqual(writes,[['tenh-device-lock-alice','on']]); assert.equal(options.biometricsSecurityLevel,'strong'); assert.equal(options.disableDeviceFallback,false);
  success=false; await assert.rejects(device.saveDeviceLock('alice',false),/not completed/); assert.equal(writes.length,1);
  success=true; await device.saveDeviceLock('alice',false); assert.deepEqual(writes[1],['tenh-device-lock-alice','off']);
});

test('offline snapshots isolate accounts, expire, bound storage, and clear queued data without touching checkout', async () => {
  const values = new Map([['tenh-sale-pending', 'keep']]);
  const { offlineSnapshots, canSaveOffline } = loadTs('mobile/src/offline-snapshots.ts');
  const cache = offlineSnapshots({getItem:async key=>values.get(key)??null,setItem:async(key,value)=>values.set(key,value),removeItem:async key=>values.delete(key)});
  await cache.save('alice','workspace',{userId:'alice'});
  await cache.save('alice','branch-a:stock',{rows:[{name:'Shirt'}]});
  assert.equal(await cache.read('bob','branch-a:stock'),undefined);
  assert.equal(await cache.read('alice','branch-b:stock'),undefined);
  assert.equal((await cache.read('alice','branch-a:stock')).data.rows[0].name,'Shirt');
  await cache.clear('alice',true); assert.ok(await cache.read('alice','workspace')); assert.equal(await cache.read('alice','branch-a:stock'),undefined);
  await cache.save('alice','too-large','x'.repeat(25000)); assert.equal(await cache.read('alice','too-large'),undefined);
  for(let i=0;i<12;i++) await cache.save('alice',`stock-${i}`,{data:'x'.repeat(15000)});
  assert.ok(values.get('tenh-offline-v1-alice').length<=80000);
  const expired=JSON.parse(values.get('tenh-offline-v1-alice')).map(row=>({...row,at:Date.now()-25*60*60*1000}));
  values.set('tenh-offline-v1-alice',JSON.stringify(expired)); assert.equal(await cache.read('alice','stock-11'),undefined);
  await Promise.all([cache.save('alice','stock','fresh'),cache.clear('alice')]); assert.equal(await cache.read('alice','stock'),undefined);
  assert.equal(values.get('tenh-sale-pending'),'keep');
  assert.equal(canSaveOffline('stock?page=1&search='),true); assert.equal(canSaveOffline('reports?range=yesterday'),true);
  assert.equal(canSaveOffline('stock?page=2'),false); assert.equal(canSaveOffline('customers'),false); assert.equal(canSaveOffline('order?id=secret'),false); assert.equal(canSaveOffline('stock?search=private'),false);
});
