import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import sharp from 'sharp';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
function load(path, deps) {
  const loaded = { exports: {} };
  const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('module', 'exports', 'require', code)(loaded, loaded.exports, id => {
    if (id in deps) return deps[id];
    throw new Error(`Unmocked dependency ${id}`);
  });
  return loaded.exports;
}

const { compressPhoto } = load('lib/images/compress-photo.ts', { 'server-only': {}, sharp });
test('large product photos shrink, keep aspect ratio and use matching file MIME/extension', async () => {
  const original = await sharp({ create: { width: 3200, height: 2400, channels: 3, background: '#1685cc' } }).jpeg({ quality: 96 }).toBuffer();
  const file = await compressPhoto(new File([original], 'photo.jpg', { type: 'image/jpeg' }));
  const metadata = await sharp(Buffer.from(await file.arrayBuffer())).metadata();
  assert.equal(metadata.width, 1600); assert.equal(metadata.height, 1200);
  assert.equal(file.type, 'image/webp'); assert.equal(file.name, 'photo.webp');
  assert.ok(file.size < original.length);
  console.log(`Synthetic photo: ${original.length} bytes -> ${file.size} bytes`);
});
test('photo compression rejects corrupt, oversized and non-photo files', async () => {
  await assert.rejects(compressPhoto(new File(['broken'], 'bad.png', { type: 'image/png' })));
  await assert.rejects(compressPhoto(new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' })), /JPG/);
  await assert.rejects(compressPhoto(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })), /5 MB/);
});
test('small photos never become larger', async () => {
  const original = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#ffffff00' } }).webp({ lossless: true }).toBuffer();
  const file = await compressPhoto(new File([original], 'small.webp', { type: 'image/webp' }));
  assert.ok(file.size <= original.length);
});
test('responsive optimizer accepts only our public product photos; private and preview URLs bypass it', () => {
  const old = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
  try {
    const { default: ProductPhoto } = load('components/product-photo.tsx', {
      'react/jsx-runtime': require('react/jsx-runtime'),
      'next/image': props => React.createElement('img', { ...props, 'data-optimized': true }),
    });
    const render = src => renderToStaticMarkup(React.createElement(ProductPhoto, { src, alt: 'Product' }));
    assert.match(render('https://project.supabase.co/storage/v1/object/public/product-images/shop/photo.webp'), /data-optimized/);
    for (const src of ['blob:https://app.example/preview', '/private/receipt', 'https://project.supabase.co/storage/v1/object/sign/product-images/photo.png?token=x', 'https://other.supabase.co/storage/v1/object/public/product-images/photo.png']) {
      assert.ok(!render(src).includes('data-optimized'));
    }
  } finally {
    if (old === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = old;
  }
});
