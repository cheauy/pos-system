/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
const plans=loadTs('lib/subscriptions/plans.ts');
const promotions=loadTs('lib/subscriptions/promotions.ts',{'./plans':plans});
const base={name:'Offer',plan_key:null,term_months:null,discount_percent:10,starts_on:'2026-09-24',ends_on:'2026-09-30',apply_new:true,apply_existing:true,enabled:true};
test('promotion fields reject invalid dates, percentages, plans and empty audiences',()=>{
 assert.equal(promotions.validatePromotion(base),null);
 for(const patch of [{discount_percent:NaN},{discount_percent:100},{discount_percent:0},{discount_percent:1.001},{starts_on:'2026-02-30'},{ends_on:'2026-09-23'},{plan_key:'fake'},{term_months:2},{apply_new:false,apply_existing:false}])assert.ok(promotions.validatePromotion({...base,...patch}));
});
test('price previews choose strongest offer and match cents without stacking',()=>{
 const rules=[base,{...base,plan_key:'solo',term_months:3,discount_percent:30}];
 assert.equal(promotions.promotionPrice(plans.calculateSubscriptionPrice('solo',3),rules,'solo',3).total,21);
 assert.equal(promotions.promotionDiscount(rules,'small_team',3),10);
 assert.equal(promotions.promotionDiscount([{...base,discount_percent:5}],'solo',12),10);
});
test('only super admin can write discount rules',async()=>{
 let writes=0;
 const api=loadTs('app/(super-admin)/super-admin/discounts/actions.ts',{'next/cache':{revalidatePath(){}},'@/lib/auth/require-super-admin':{requireSuperAdmin:async()=>{throw Error('Forbidden');}},'@/lib/supabase/admin':{supabaseAdmin:{from(){writes++;}}},'@/lib/subscriptions/promotions':promotions});
 await assert.rejects(api.savePromotion({error:null,saved:false},new FormData()),/Forbidden/);assert.equal(writes,0);
});
