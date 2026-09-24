/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');

test('service health distinguishes missing, failed, overdue and verified checks',async()=>{
  const original={...process.env},oldFetch=global.fetch;
  Object.assign(process.env,{NEXT_PUBLIC_SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret-db',CRON_SECRET:'secret-cron',VERCEL_TOKEN:'secret-vercel',VERCEL_DEPLOYMENT_ID:'dpl_test'});
  let job=[],deployment='READY',httpStatus=200;
  global.fetch=async(url)=>({ok:httpStatus===200,status:httpStatus,json:async()=>String(url).includes('system_job_health')?job:String(url).includes('api.vercel.com')?{readyState:deployment}:[]});
  const api=loadTs('lib/super-admin/health.ts',{'server-only':{},'node:crypto':require('node:crypto'),'@/lib/payway/server':{getPaywayConfig:()=>({purchaseUrl:'https://example.com',apiKey:'secret'}),verifyPaywayCallbackSignature:()=>false}});
  const status=async(name)=>(await api.collectHealth()).find(r=>r.name===name).status;
  try{
    assert.equal(await status('Supabase'),'ok');
    assert.equal(await status('Vercel'),'ok');
    assert.equal(await status('Background jobs'),'warning');
    job=[{status:'succeeded',started_at:new Date().toISOString(),finished_at:new Date().toISOString()}];
    assert.equal(await status('Background jobs'),'ok');
    job[0].finished_at=new Date(Date.now()-27*3600_000).toISOString();
    assert.equal(await status('Background jobs'),'error');
    job[0].status='running';job[0].started_at=new Date(Date.now()-16*60_000).toISOString();
    assert.equal(await status('Background jobs'),'error');
    job[0].started_at=new Date().toISOString();assert.equal(await status('Background jobs'),'warning');
    job[0].status='failed';assert.equal(await status('Background jobs'),'error');
    deployment='ERROR';assert.equal(await status('Vercel'),'error');
    deployment='BUILDING';assert.equal(await status('Vercel'),'warning');
    httpStatus=503;assert.equal(await status('Supabase'),'error');
    assert.equal(await status('Background jobs'),'error');
    httpStatus=404;assert.equal(await status('Background jobs'),'warning');
    delete process.env.VERCEL_TOKEN;assert.equal(await status('Vercel'),'warning');
    delete process.env.CRON_SECRET;assert.equal(await status('Background jobs'),'warning');
    assert.ok(!JSON.stringify(await api.collectHealth()).includes('secret-'));
  }finally{global.fetch=oldFetch;for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original);}
});

test('cron auth runs before monitoring and processing; results are recorded accurately',async()=>{
  const oldSecret=process.env.CRON_SECRET;process.env.CRON_SECRET='test-cron';
  const calls=[];let failure=false,throws=false;
  const api=loadTs('app/api/internal/subscriptions/purge/route.ts',{
    'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
    '@/lib/supabase/admin':{supabaseAdmin:{rpc:async()=>{calls.push('rpc');if(throws)throw Error('network');return {data:[],error:failure?{message:'failed'}:null};}}},
    '@/lib/super-admin/job-health':{recordSubscriptionJob:async(_,status)=>calls.push(status)},
  });
  try{
    assert.equal((await api.GET({headers:new Headers()})).status,401);assert.deepEqual(calls,[]);
    const request={headers:new Headers({authorization:'Bearer test-cron'})};
    assert.equal((await api.GET(request)).status,200);assert.deepEqual(calls,['running','rpc','succeeded']);
    calls.length=0;failure=true;
    assert.equal((await api.GET(request)).status,500);assert.deepEqual(calls,['running','rpc','failed']);
    calls.length=0;throws=true;
    assert.equal((await api.GET(request)).status,500);assert.deepEqual(calls,['running','rpc','failed']);
  }finally{if(oldSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=oldSecret;}
});

test('job telemetry failure is contained and completion targets the same run',async()=>{
  const steps=[];const originalWarn=console.warn;console.warn=()=>{};
  const query={upsert:(v)=>{steps.push(['upsert',v]);return query;},update:(v)=>{steps.push(['update',v]);return query;},eq:(...v)=>{steps.push(['eq',...v]);return query;},abortSignal:async()=>{throw Error('offline');}};
  const api=loadTs('lib/super-admin/job-health.ts',{'server-only':{},'@/lib/supabase/admin':{supabaseAdmin:{from:()=>query}}});
  try{
    await api.recordSubscriptionJob('2026-09-24T00:00:00Z','running');
    await api.recordSubscriptionJob('2026-09-24T00:00:00Z','succeeded');
    assert.ok(steps.some(s=>s[0]==='eq'&&s[1]==='started_at'&&s[2]==='2026-09-24T00:00:00Z'));
  }finally{console.warn=originalWarn;}
});
