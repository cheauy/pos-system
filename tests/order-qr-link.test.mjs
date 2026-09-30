import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadTs } from './helpers/load-ts.cjs';
const require = createRequire(import.meta.url);

process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'tenh-pos.com';
process.env.NEXT_PUBLIC_SITE_URL = 'https://tenh-pos.com';
const domain = loadTs('lib/tenancy/domain.ts');
const qr = loadTs('lib/orders/order-qr.ts', { qrcode: require('qrcode'), '@/lib/tenancy/domain': domain });
const code = '482193057716';
const id = '0b7c1f7e-2c3a-4b5d-8e9f-a1b2c3d4e5f6';

test('order link points at the app host /o/ route', () => {
  assert.equal(qr.orderLink(code), `https://app.tenh-pos.com/o/${code}`);
  assert.throws(() => qr.orderLink('012345678901'));
  assert.throws(() => qr.orderLink('POS-F15911D1DD'));
});

test('scanner accepts the link, a bare barcode code, the app scheme and legacy labels', () => {
  assert.deepEqual(qr.parseOrderQr(`https://app.tenh-pos.com/o/${code}`), { kind: 'code', code });
  assert.deepEqual(qr.parseOrderQr(` ${code} `), { kind: 'code', code });
  assert.deepEqual(qr.parseOrderQr(`tenhpos://o/${code}`), { kind: 'code', code });
  assert.deepEqual(qr.parseOrderQr(`https://melody.tenh-pos.com/o/${code}?ref=label`), { kind: 'code', code });
  assert.deepEqual(qr.parseOrderQr(`TENH:ORDER:1:${id.toUpperCase()}`), { kind: 'id', id });
});

test('scanner rejects other sites and malformed codes', () => {
  for (const value of [`https://evil.example/o/${code}`, `https://tenh-pos.com.evil.example/o/${code}`, 'https://app.tenh-pos.com/o/12345', 'https://app.tenh-pos.com/orders/482193057716', '48219305771a', '', 'TENH:ORDER:1:not-a-uuid']) {
    assert.equal(qr.parseOrderQr(value), null, value);
  }
});

test('QR image encodes the order link', () => {
  const svg = qr.orderQrSvg(code);
  assert.match(svg, /^<svg[^>]+viewBox="0 0 \d+ \d+"/);
  assert.throws(() => qr.orderQrSvg(id));
});
