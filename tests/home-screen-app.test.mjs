// iOS/Android Home Screen install: standalone manifest on the app host only, no offline worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';

const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));

test('manifest opens the dashboard standalone inside a same-origin scope',()=>{
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.id,'/dashboard');
  assert.equal(manifest.start_url,'/dashboard');
  assert.equal(manifest.scope,'/');
  for(const icon of manifest.icons)assert.ok(existsSync(`public${icon.src}`),icon.src);
  assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'&&icon.purpose==='maskable'));
});

test('only the app host links the manifest and Apple web-app tags',()=>{
  const layout=readFileSync('app/layout.tsx','utf8');
  assert.match(layout,/subdomain === APP_SUBDOMAIN/);
  assert.match(layout,/if \(!\(await isInstallableHost\(\)\)\) return baseMetadata;/);
  assert.match(layout,/appleWebApp: \{ capable: true/);
  assert.doesNotMatch(layout,/serviceWorker/);
});

test('sign-out lands on the app host so the Home Screen app stays in scope',()=>{
  for(const file of ['components/logout-button.tsx','app/(dashboard)/dashboard/sidebar-client.tsx'])
    assert.match(readFileSync(file,'utf8'),/getAppUrl\("\/login"\)/,file);
});
