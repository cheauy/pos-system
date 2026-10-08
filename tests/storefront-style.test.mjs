// Opt-in Simple storefront style: validated, merged without touching other saved profile keys, Classic by default.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as profile from '../lib/storefront/profile.ts';

const form = entries => { const f = new FormData(); for (const [k, v] of Object.entries(entries)) f.set(k, v); return f; };

test('accepts classic/simple, rejects anything else, omits when not submitted', () => {
  assert.equal(profile.parseStoreProfile(form({ storefrontStyle: 'simple' })).storefrontStyle, 'simple');
  assert.equal(profile.parseStoreProfile(form({ storefrontStyle: 'classic' })).storefrontStyle, 'classic');
  for (const bad of ['', 'fancy', '<x>']) assert.throws(() => profile.parseStoreProfile(form({ storefrontStyle: bad })), /Classic or Simple/);
  assert.equal(Object.hasOwn(profile.parseStoreProfile(new FormData()), 'storefrontStyle'), false);
});

test('save merge keeps the choice and every other saved profile key', () => {
  const existing = { defaultLanguage: 'km', featuredProductIds: ['a'], seoTitle: 'Old' };
  const merged = { ...existing, ...profile.parseStoreProfile(form({ storefrontStyle: 'simple', seoTitle: 'New' })) };
  assert.equal(merged.storefrontStyle, 'simple');
  assert.deepEqual(merged.featuredProductIds, ['a']);
  assert.equal(merged.defaultLanguage, 'km');
  const info = readFileSync(new URL('../app/(dashboard)/dashboard/settings/business/info-actions.ts', import.meta.url), 'utf8');
  assert.match(info, /profile: \{\s*\.\.\.current\.social_links\?\.profile,/);
});

test('storefront adds the Simple class only for a saved simple choice; CSS is scoped', () => {
  const page = readFileSync(new URL('../app/_sites/[slug]/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /storefrontStyle === "simple" \? " store-style-simple" : ""/);
  const css = readFileSync(new URL('../app/_sites/[slug]/storefront.css', import.meta.url), 'utf8');
  const start = css.indexOf('/* Opt-in "Simple" style');
  assert.ok(start > 0);
  for (const rule of css.slice(start).split('\n').filter(line => line.startsWith('.')))
    assert.match(rule, /^\.store-style-simple /, rule);
  const settings = readFileSync(new URL('../app/(dashboard)/dashboard/online-store/storefront-settings-form.tsx', import.meta.url), 'utf8');
  assert.match(settings, /storefrontStyle === "simple" \? "simple" : "classic"/);
  assert.match(settings, /name="storefrontStyle"/);
});
