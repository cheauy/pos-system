const test=require('node:test');const assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
const persistence=loadTs('lib/auth/session-persistence.ts');
const recovery=loadTs('lib/auth/password-recovery.ts');
const storage=()=>{const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};

test('Remember me controls auth cookie duration, preserves security options and deletion',()=>{
 const options={path:'/',secure:true,sameSite:'lax',domain:'.tenh-pos.com',maxAge:34560000,expires:new Date()};
 const signIn=Date.UTC(2026,0,1),day=86400000,remembered=persistence.rememberMeValue(true,signIn),deadline=signIn+30*day;
 for(const name of ['sb-project-auth-token','sb-project-auth-token.0','sb-project-auth-token.1']){
  const session=persistence.sessionCookieOptions(name,'token',options,'0');assert.equal(session.maxAge,undefined);assert.equal(session.expires,undefined);assert.equal(session.secure,true);assert.equal(session.domain,options.domain);
  // Every refresh writes the same absolute deadline: 30 days from sign-in, never extended.
  for(const now of [signIn,signIn+day,signIn+29*day]){const kept=persistence.sessionCookieOptions(name,'token',options,remembered,now);assert.equal(kept.maxAge,undefined);assert.equal(kept.expires.getTime(),deadline);}
  assert.equal(persistence.sessionCookieOptions(name,'token',options,remembered,deadline).expires,undefined);
  // Legacy sliding "1" no longer extends anything; it becomes a browser-session login.
  assert.equal(persistence.sessionCookieOptions(name,'token',options,'1').expires,undefined);assert.equal(persistence.sessionCookieOptions(name,'token',options,'1').maxAge,undefined);
  assert.equal(persistence.sessionCookieOptions(name,'',{...options,maxAge:0},remembered).maxAge,0);
 }
 assert.deepEqual(persistence.sessionCookieOptions('sb-project-auth-token-code-verifier','verifier',options,'0'),options);
 assert.equal(persistence.sessionCookieOptions('sb-project-auth-token','token',options,undefined).maxAge,undefined);
 assert.equal(persistence.isRemembered(remembered,deadline-1),true);assert.equal(persistence.isRemembered(remembered,deadline),false);
 for(const value of [undefined,'','0','1','1:abc','2:1']) assert.equal(persistence.isRemembered(value,signIn),false);
});

test('session age comes from the token amr sign-in time and ends at 30 days',()=>{
 const token=payload=>`h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
 const signedIn=Date.UTC(2026,0,1)/1000,day=86400000;
 const access=token({sub:'user',iat:signedIn+29*86400,amr:[{method:'password',timestamp:signedIn},{method:'totp',timestamp:signedIn+60}]});
 assert.equal(persistence.sessionStartedAt(access),signedIn*1000);
 assert.equal(persistence.sessionExpired(access,signedIn*1000+30*day-1),false);
 assert.equal(persistence.sessionExpired(access,signedIn*1000+30*day),true);
 // Unreadable tokens are left to Supabase Auth, which already verified them.
 for(const bad of ['garbage',token({sub:'user'}),token({amr:[{method:'password'}]})]) assert.equal(persistence.sessionExpired(bad,signedIn*1000+90*day),false);
});

test('server refresh preserves session-only and remembered cookies',async()=>{
 for(const preference of ['0',persistence.rememberMeValue(true)]){
  let config;const writes=[];
  const {createClient}=loadTs('lib/supabase/server.ts',{
   '@/lib/mobile/request-context':{mobileRequest:{getStore:()=>undefined}},
   '@supabase/supabase-js':{createClient:()=>{throw new Error('Web sessions must use the cookie client');}},
   '@supabase/ssr':{createServerClient:(_url,_key,options)=>{config=options;return {};}},
   'next/headers':{cookies:async()=>({getAll:()=>[],get:()=>({value:preference}),set:(...args)=>writes.push(args)}),headers:async()=>new Headers({host:'app.tenh-pos.com'})},
   '@/lib/tenancy/domain':{getSharedAuthCookieOptions:()=>({path:'/',secure:true})},'@/lib/auth/session-persistence':persistence,
  });
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test';
  try{await createClient();config.cookies.setAll([{name:'sb-project-auth-token',value:'refreshed',options:{maxAge:34560000}}]);assert.equal(writes[0][2].maxAge,undefined);assert.equal(writes[0][2].expires?.getTime(),preference==='0'?undefined:persistence.rememberedUntil(preference));}
  finally{if(url===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=url;if(key===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=key;}
 }
});

test('recovery marker expires, matches the user, and clears on sign-out',()=>{
 const store=storage();recovery.recordPasswordRecovery(store,'alice',1000);
 assert.equal(recovery.hasPasswordRecovery(store,'alice',1001),true);assert.equal(recovery.hasPasswordRecovery(store,'bob',1001),false);
 assert.equal(recovery.hasPasswordRecovery(store,'alice',901000),false);recovery.clearPasswordRecovery(store);assert.equal(recovery.hasPasswordRecovery(store,'alice',1001),false);
});

test('browser client reads Remember me on every write and records recovery before page mount',()=>{
 const oldWindow=global.window,oldDocument=global.document,oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 const ssr=require('@supabase/ssr');const jar=new Map(),written=[];let options,listener;
 const sessionStorage=storage();global.window={location:{hostname:'app.tenh-pos.com'},sessionStorage};
 global.document={get cookie(){return [...jar].map(([k,v])=>`${k}=${v}`).join('; ');},set cookie(value){written.push(value);const first=value.split(';')[0],index=first.indexOf('=');jar.set(first.slice(0,index),first.slice(index+1));}};
 process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='test';
 try{
  const client={auth:{onAuthStateChange:fn=>{listener=fn;}}};
  const api=loadTs('lib/supabase/client.ts',{'@supabase/ssr':{...ssr,createBrowserClient:(_u,_k,o)=>{options=o;return client;}},'@/lib/auth/session-persistence':persistence,'@/lib/auth/password-recovery':recovery,'@/lib/tenancy/domain':{getSharedAuthCookieOptions:()=>({path:'/',secure:true,sameSite:'lax'})}});
  api.createClient();api.setRememberMe(false);assert.equal(api.getRememberMe(),false);
  const write=()=>options.cookies.setAll([{name:'sb-project-auth-token.0',value:'token',options:{path:'/',maxAge:34560000}}]);
  write();assert.ok(!written.at(-1).includes('Max-Age'));
  api.setRememberMe(true);assert.equal(api.getRememberMe(),true);assert.ok(written.at(-1).includes('Max-Age=2592000'));write();assert.ok(written.at(-1).includes('Expires='));assert.ok(!written.at(-1).includes('Max-Age'));
  listener('PASSWORD_RECOVERY',{user:{id:'user'}});assert.equal(recovery.hasPasswordRecovery(sessionStorage,'user'),true);
  listener('SIGNED_OUT',null);assert.equal(recovery.hasPasswordRecovery(sessionStorage,'user'),false);
  // Sign-out clears the preference, so the next sign-in starts unchecked.
  assert.ok(written.at(-1).startsWith('tenh_remember_me=;'));assert.ok(written.at(-1).includes('Max-Age=0'));assert.equal(api.getRememberMe(),false);
 }finally{global.window=oldWindow;global.document=oldDocument;if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=oldKey;}
});

test('forgot-password reports delivery failures instead of falsely claiming success',async()=>{
 const oldWindow=global.window;global.window={location:{origin:'https://app.tenh-pos.com'}};
 try{
  for(const error of [null,{status:429},{status:500}]){
   const values=[],requests=[];let index=0;
   const react={useState(initial){const i=index++;if(!(i in values))values[i]=initial;return[values[i],v=>values[i]=v];}};
   const Component=loadTs('app/forgot-password/page.tsx',{'react/jsx-runtime':require('react/jsx-runtime'),react,'@/components/pending-submit-button':{ButtonSpinner:()=>null},'lucide-react':require('lucide-react'),'next/navigation':{useRouter:()=>({})},'@/lib/supabase/client':{createClient:()=>({auth:{resetPasswordForEmail:async(...args)=>{requests.push(args);return{error};}}})}}).default;
   const render=()=>{index=0;return Component();};const nodes=v=>Array.isArray(v)?v.flatMap(nodes):v?.props?[v,...nodes(v.props.children)]:[];
   nodes(render()).find(n=>n.type==='input').props.onChange({target:{value:' person@example.com '}});
   await nodes(render()).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
   assert.deepEqual(requests[0],['person@example.com',{redirectTo:'https://app.tenh-pos.com/reset-password'}]);
   const feedback=nodes(render()).filter(n=>n.props?.role==='status'||n.props?.role==='alert');assert.equal(feedback.length,1);assert.equal(feedback[0].props.role,error?'alert':'status');
  }
 }finally{global.window=oldWindow;}
});

test('reset page resumes verified recovery after reload and rejects ordinary/expired sessions',async()=>{
 const original=global.window;
 try{
  for(const mode of ['recovery','ordinary','expired','no-session']){
   const sessionStorage=storage();if(mode==='recovery')recovery.recordPasswordRecovery(sessionStorage,'user');if(mode==='expired')recovery.recordPasswordRecovery(sessionStorage,'user',0);
   global.window={sessionStorage,location:{search:'',hash:''},setTimeout:()=>1,clearTimeout(){}};
   const values=[],effects=[];let index=0;
   const client={auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:mode==='no-session'?null:{user:{id:'user'}}},error:null})}};
   const Component=loadTs('app/reset-password/page.tsx',{'react/jsx-runtime':require('react/jsx-runtime'),react:{useState(initial){const i=index++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return[values[i],v=>values[i]=v];},useEffect:fn=>effects.push(fn)},'next/navigation':{useRouter:()=>({})},'@/lib/supabase/client':{createClient:()=>client},'lucide-react':require('lucide-react'),'@/lib/auth/password-recovery':recovery}).default;
   const render=()=>{index=0;return Component();};render();effects[0]();await new Promise(resolve=>setImmediate(resolve));
   const tree=render();const text=v=>Array.isArray(v)?v.map(text).join(''):typeof v==='string'?v:v?.props?text(v.props.children):'';
   assert.ok(text(tree).includes(mode==='recovery'?'Update Password':'Invalid or expired link'));
  }
 }finally{global.window=original;}
});
