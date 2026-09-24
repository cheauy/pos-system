/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
const list=loadTs('lib/super-admin/business-list.ts');
const {dashboardMetrics}=loadTs('lib/super-admin/dashboard.ts',{'./business-list':list});
const now=new Date('2026-09-24T12:00:00Z');
const business={id:'b',name:'Business',is_active:true,disabled_reason:null,subscription_status:'active',subscription_plan_key:'solo',subscription_expires_at:'2027-01-01',trial_expires_at:null,subscription_monthly_price:20,subscription_discount_percent:10,subscription_cycle_value:216,subscription_months:12,created_at:'2026-09-01T00:00:00Z'};
const payment={id:'p',business_id:'b',status:'approved',total_amount:120,currency:'USD',approved_at:'2026-09-15T00:00:00Z',reviewed_at:null,payway_verified_at:null};
test('trend uses approval dates, only approved USD values, and separates missing dates',()=>{
 const metrics=dashboardMetrics([business],[payment,{...payment,id:'old',approved_at:'2026-08-01'}, {...payment,id:'unknown',approved_at:null},{...payment,status:'pending_payment'},{...payment,currency:'KHR'},{...payment,total_amount:'bad'}],now);
 assert.equal(metrics.approvedValue,360);assert.equal(metrics.months[5].revenue,120);assert.equal(metrics.months[4].revenue,120);assert.equal(metrics.months[5].subscriptions,1);assert.equal(metrics.undatedApprovals,1);
});
test('monthly estimate normalizes annual cycles and excludes expired or trial access',()=>{
 const metrics=dashboardMetrics([business,{...business,id:'expired',subscription_expires_at:'2026-08-01'},{...business,id:'trial',subscription_status:'trialing',subscription_plan_key:'trial'},{...business,id:'monthly',subscription_cycle_value:null,subscription_monthly_price:10},{...business,id:'unknown',subscription_cycle_value:null,subscription_monthly_price:null}],[],now);
 assert.equal(metrics.mrr,27);assert.equal(metrics.unpriced,1);assert.equal(metrics.expired,1);
});
test('attention filters agree with dashboard counts and seven-day trial bounds',()=>{
 const rows=[business,{...business,id:'s',disabled_reason:'manually_suspended'},{...business,id:'i',is_active:false},{...business,id:'t',subscription_status:'trialing',trial_expires_at:'2026-09-29'},{...business,id:'later',subscription_status:'trialing',trial_expires_at:'2026-10-05'}];
 const metrics=dashboardMetrics(rows,[],now);
 assert.equal(metrics.restricted,2);assert.equal(metrics.trialsEnding,1);
 for(const [status,count]of [['restricted',2],['trial_ending',1]])assert.equal(list.selectBusinessPage(rows,{status,search:'',sort:'newest',page:1},now.getTime()).total,count);
});
test('empty analytics are zeros with six stable monthly buckets',()=>{
 const metrics=dashboardMetrics([],[],now);assert.equal(metrics.mrr,0);assert.equal(metrics.approvedValue,0);assert.equal(metrics.months.length,6);assert.equal(metrics.months[0].key,'2026-04');assert.deepEqual(metrics.plans,[]);
});
