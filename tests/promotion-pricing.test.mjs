import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './helpers/load-ts.cjs';
const { promotionalPrice, campaignDiscount, couponPreview } = loadTs('lib/promotions/pricing.ts');
const campaign = { id:'a', code:'SAVE', is_active:true, is_automatic:true, apply_pos:true, apply_online:false, product_ids:['p'], discount_type:'percentage', discount_value:20, minimum_order:0, max_discount:null, starts_at:null, ends_at:null, usage_limit:null, usage_count:0, per_customer_limit:null };
test('automatic discounts select best eligible price without stacking', () => {
  const campaigns=[campaign,{...campaign,discount_value:30}];
  assert.equal(promotionalPrice('p',10,campaigns,'pos'),7);
  assert.equal(promotionalPrice('other',10,campaigns,'pos'),10);
  assert.equal(promotionalPrice('p',10,campaigns,'online'),10);
  assert.equal(promotionalPrice('p',10,[{...campaign,ends_at:'2000-01-01'}],'pos'),10);
});
test('discount matches SQL half-up rounding and caps', () => {
  assert.equal(campaignDiscount({...campaign,discount_value:10},1.05),0.11);
  assert.equal(campaignDiscount({...campaign,max_discount:1},10),1);
  assert.equal(campaignDiscount({...campaign,discount_type:'fixed',discount_value:50},10),10);
  assert.equal(campaignDiscount(campaign,NaN),0);
});
test('coupon discounts eligible products after automatic pricing', () => {
  const lines=[{productId:'p',unitPrice:8,quantity:2},{productId:'other',unitPrice:100,quantity:1}];
  assert.equal(couponPreview({...campaign,is_automatic:false,discount_value:10},lines,'pos').discount,1.6);
  assert.ok(couponPreview({...campaign,is_automatic:false,apply_pos:false},lines,'pos').error);
});
