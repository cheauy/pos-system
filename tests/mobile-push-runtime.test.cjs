const test=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
function runtime(go){
 const effects=[],calls=[];let handler;
 const notifications={setNotificationHandler:value=>{handler=value;},setBadgeCountAsync:async count=>calls.push(['badge',count]),addNotificationResponseReceivedListener:()=>{calls.push(['listen']);return {remove:()=>calls.push(['remove'])};},getLastNotificationResponseAsync:async()=>null};
 const dependencies={
  react:{useEffect:fn=>effects.push(fn),useState:value=>[value,()=>{}]},
  'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
  'react-native':{AppState:{addEventListener:()=>({remove(){}})},Platform:{OS:'android'}},
  'expo-device':{isDevice:true},'expo-crypto':{},'expo-constants':{},expo:{isRunningInExpoGo:()=>go},
  './client':{api:async(...args)=>calls.push(['api',...args]),deviceStorage:{getItem:async()=>null,removeItem:async()=>{}}},
  './ui':{Button:'Button',Card:'Card',Label:'Label'},
 };
 // No notification mock in Expo Go: loadTs fails if runtime import is attempted.
 if(!go)dependencies['expo-notifications']=notifications;
 const module=loadTs('mobile/src/push.tsx',dependencies);
 return {module,effects,calls,get handler(){return handler;}};
}
test('Expo Go startup, settings and signed-in hooks never load native push notifications',async()=>{
 const r=runtime(true),scope={userId:'u',businessId:'b',branchId:'l'};
 const settings=r.module.PushSettings({scope,online:true});
 assert.match(JSON.stringify(settings),/development build/);assert.doesNotMatch(JSON.stringify(settings),/Enable notifications/);
 r.module.usePush(scope,true,2,()=>assert.fail('No native navigation in Expo Go'));
 for(const effect of r.effects)effect();
 await r.module.disablePush('u');await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(r.calls,[]);assert.equal(r.handler,undefined);
});
test('development builds retain notification handling, badges and listener cleanup',async()=>{
 const r=runtime(false);
 assert.equal((await r.handler.handleNotification()).shouldShowBanner,false);
 r.module.usePush({userId:'u',businessId:'b',branchId:'l'},false,2,()=>{});
 const cleanups=r.effects.map(effect=>effect());await new Promise(resolve=>setImmediate(resolve));
 assert.ok(r.calls.some(c=>c[0]==='badge'&&c[1]===2));assert.ok(r.calls.some(c=>c[0]==='listen'));
 for(const cleanup of cleanups)cleanup?.();
 assert.ok(r.calls.some(c=>c[0]==='remove'));
 await r.module.disablePush('u');assert.ok(r.calls.some(c=>c[0]==='badge'&&c[1]===0));
});
