const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts.cjs');
const { generateInternalBarcode } = loadTs('lib/barcode/generate.ts');
const { code39Bars } = loadTs('lib/barcode/code39.ts');
test('generated identifiers are distinct and printable by the existing label renderer', () => {
  const codes = Array.from({length:1000}, generateInternalBarcode);
  assert.equal(new Set(codes).size, codes.length);
  for (const code of codes) { assert.match(code, /^\d{15}$/); assert.ok(code39Bars(code)); }
});
test('numeric barcodes retain leading zeros', t => {
  t.mock.method(globalThis.crypto, 'randomUUID', () => '00000000-0001-4000-8000-000000000000');
  assert.equal(generateInternalBarcode(), '000000000000001');
});
