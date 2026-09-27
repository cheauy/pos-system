const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const query = require('../mobile/node_modules/query-string');
const decode = require('../mobile/vendor/decode-uri-component');

test('fixed decoder retains CommonJS URL/query compatibility used by Expo Router', () => {
  assert.equal(typeof decode,'function');
  assert.deepEqual({...query.parse('name=TENH+POS&khmer=%E1%9E%81%E1%9F%92%E1%9E%98%E1%9F%82%E1%9E%9A&branch=a&branch=b')}, {name:'TENH POS',khmer:'ខ្មែរ',branch:['a','b']});
  assert.equal(query.parse('url=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1').url,'https://example.com/a?x=1');
  assert.equal(query.parseUrl('/Orders?id=abc#TENH+POS',{parseFragmentIdentifier:true}).fragmentIdentifier,'TENH POS');
  assert.equal(decode('%E0%A4%A'),'%E0%A4%A');
  assert.equal(decode('%FE%FF'),'\uFFFD\uFFFD');
  assert.throws(()=>decode(null),TypeError);
  const original={name:'ខ្មែរ + blue / M',id:'123',filter:['a','b']};
  assert.deepEqual({...query.parse(query.stringify(original))},original);
});

test('malformed long URLs finish within a bounded worker rather than freezing navigation', () => {
  const decoder = require.resolve('decode-uri-component',{paths:[path.dirname(require.resolve('../mobile/node_modules/query-string'))]});
  const result = spawnSync(process.execPath,['-e',`const decode=require(${JSON.stringify(decoder)});const input='%E0%A4'.repeat(20000);const output=decode(input);if(typeof output!=='string')process.exit(2);`],{timeout:5000,encoding:'utf8'});
  assert.equal(result.error,undefined); assert.equal(result.status,0,result.stderr);
});
