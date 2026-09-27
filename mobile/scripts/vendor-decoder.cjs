// Reproduce the compatibility copy from the checksum-pinned upstream npm archive.
// First: npm pack decode-uri-component@0.5.0 --ignore-scripts --pack-destination .expo
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const archive = path.resolve(__dirname, '../.expo/decode-uri-component-0.5.0.tgz');
const expected = '1BiQVoK8C9gUbQU6NzAtO/tkz2qOFpEObMWpcFvhx4fYnj4Oc5yzaJN/LD36ihkVUdXyh5ZekzX+yM+ty/SrPg==';
if (createHash('sha512').update(fs.readFileSync(archive)).digest('base64') !== expected) throw new Error('Upstream archive checksum does not match.');
const source = execFileSync('tar', ['-xOf', archive, 'package/index.js'], {encoding:'utf8'});
if (!source.includes('export default function decodeUriComponent(')) throw new Error('Unexpected upstream module format.');
fs.writeFileSync(path.resolve(__dirname, '../vendor/decode-uri-component/upstream.cjs'), source.replace('export default function decodeUriComponent(', 'module.exports = function decodeUriComponent('));
fs.writeFileSync(path.resolve(__dirname, '../vendor/decode-uri-component/license'), execFileSync('tar', ['-xOf', archive, 'package/license']));
console.log('Verified upstream 0.5.0 archive; copied its decoder and MIT license.');
