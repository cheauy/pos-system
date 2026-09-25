const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const {loadTs}=require('./helpers/load-ts.cjs');

function harness(){
  const state=[],refs=[],effects=[];let cursor=0,refCursor=0,interval,sounds=0,failReads=false,failSave=false;
  let rows=[];const reads=new Set(),filters=[];
  const react={
    useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return [state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},
    useRef(initial){const i=refCursor++;return refs[i]??(refs[i]={current:initial});},
    useEffect(fn){effects.push(fn);},useCallback:fn=>fn,
  };
  const channel={on(){return this;},subscribe(){return this;}};
  const client={auth:{getUser:async()=>({data:{user:{id:'user'}}})},
    rpc:async name=>({data:name==='tenh_branch_notifications'?rows:null}),
    from(table){const q={select(){return q;},eq(...args){filters.push(args);return q;},in(...args){filters.push(args);return q;},maybeSingle(){return q;},then(resolve){return Promise.resolve(table==='business_notification_reads'?{data:[...reads].map(notification_id=>({notification_id})),error:failReads?{}:null}:{data:{sound_enabled:true,browser_enabled:false}}).then(resolve);}};return q;},
    channel:()=>channel,removeChannel(){},
  };
  const events=new EventTarget();
  const window={addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events),dispatchEvent:events.dispatchEvent.bind(events),setInterval(fn){interval=fn;},clearInterval(){},setTimeout(){},clearTimeout(){}};
  function AudioContext(){sounds++;this.currentTime=0;this.createOscillator=()=>({frequency:{},connect(){},start(){},stop(){}});this.createGain=()=>({gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}});}
  const source=fs.readFileSync('app/(dashboard)/dashboard/sidebar-client.tsx','utf8');
  const hook=source.slice(source.indexOf('function useBusinessNotifications('),source.indexOf('function formatNotificationDate('));
  const output=ts.transpileModule(hook,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const api=new Function('useState','useRef','useEffect','useCallback','createClient','markNotificationsRead','window','AudioContext',output+';return useBusinessNotifications;')(
    react.useState,react.useRef,react.useEffect,react.useCallback,()=>client,async ids=>{if(failSave)throw Error('save');ids.forEach(id=>reads.add(id));},window,AudioContext,
  );
  const render=()=>{cursor=0;refCursor=0;effects.length=0;return api('business','branch');};
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  return {render,async start(){render();effects.forEach(fn=>fn());await settle();},async refresh(){interval();await settle();},settle,filters,reads,setRows(value){rows=value;},failReads(value){failReads=value;},failSave(value){failSave=value;},sounds:()=>sounds};
}
const row=id=>({id,is_active:true,notification_type:'order',title:id});

test('badge counts 1 then 2 unread; reads persist and old alerts do not replay',async()=>{
  const h=harness();h.setRows([row('old')]);h.reads.add('old');await h.start();assert.equal(h.render().unread,0);
  h.setRows([row('one'),row('old')]);await h.refresh();assert.equal(h.render().unread,1);assert.equal(h.sounds(),1);
  h.setRows([row('two'),row('one'),row('old')]);await h.refresh();assert.equal(h.render().unread,2);assert.equal(h.sounds(),2);
  await h.refresh();assert.equal(h.sounds(),2);
  await h.render().markRead('one');await h.settle();assert.equal(h.render().unread,1);
  await h.render().markAllRead();await h.settle();await h.refresh();assert.equal(h.render().unread,0);assert.equal(h.sounds(),2);
  assert.ok(h.filters.some(([key,value])=>key==='user_id'&&value==='user'));
  assert.ok(h.filters.some(([key])=>key==='notification_id'));
});

test('read-query and save failures preserve badge; resolved notifications are excluded',async()=>{
  const h=harness();h.setRows([row('one'),{...row('resolved'),is_active:false}]);await h.start();assert.equal(h.render().unread,1);assert.equal(h.sounds(),0);
  h.failSave(true);await h.render().markRead('one');assert.equal(h.render().unread,1);assert.ok(h.render().readError);
  h.failSave(false);await h.render().markRead('one');await h.settle();assert.equal(h.render().unread,0);
  h.failReads(true);h.reads.clear();await h.refresh();assert.equal(h.render().unread,0);assert.equal(h.sounds(),0);
});

test('read action uses signed-in identity and composite conflict key; rejects failures',async()=>{
  let signedIn=true,fail=false;const writes=[];
  const {markNotificationsRead}=loadTs('app/(dashboard)/dashboard/notifications/read-actions.ts',{'@/lib/supabase/branch-server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:signedIn?{id:'trusted-user'}:null}})},from:()=>({upsert:async(...args)=>{writes.push(args);return {error:fail?{}:null};}})})}});
  const id='11111111-1111-4111-8111-111111111111';
  await markNotificationsRead([id,id]);assert.equal(writes[0][0].length,1);assert.equal(writes[0][0][0].user_id,'trusted-user');assert.equal(writes[0][1].onConflict,'notification_id,user_id');
  fail=true;await assert.rejects(markNotificationsRead([id]));signedIn=false;await assert.rejects(markNotificationsRead([id]));await assert.rejects(markNotificationsRead(['invalid']));
});
