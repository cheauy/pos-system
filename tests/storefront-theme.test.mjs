import test from 'node:test';
import assert from 'node:assert/strict';
import { storefrontTheme } from '../lib/storefront/theme.ts';
const light = hex => {
 const rgb = [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4);
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
};
test('dark and medium fills use white text; bright fills use dark text', () => {
 for (const color of ['#123456','#0788d1','#ff0000','#777777','#FFFF00','#E1FF00','#ffffff']) {
  const theme=storefrontTheme(color);
  assert.equal(theme['--store-primary'],color);
  const background=light(theme['--store-primary-surface']), foreground=light(theme['--store-on-primary']);
  assert.ok((Math.max(background,foreground)+.05)/(Math.min(background,foreground)+.05)>=4.5);
 }
 assert.equal(storefrontTheme('#0788d1')['--store-on-primary'],'#ffffff');
 assert.equal(storefrontTheme('#FFFF00')['--store-on-primary'],'#13223d');
});
test('missing and invalid colors use the storefront default', () => {
 for (const value of [null,'','red;display:none','#zzzzzz']) assert.equal(storefrontTheme(value)['--store-primary'],'#2563eb');
});
