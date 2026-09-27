const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
test('remounts and concurrent subscribers never reuse a subscribed topic',()=>{
 const first=loadTs('lib/supabase/realtime-topic.ts'),reloaded=loadTs('lib/supabase/realtime-topic.ts');
 const topics=new Set();
 for(let i=0;i<1000;i++) for(const module of [first,reloaded]) topics.add(module.realtimeTopic('notifications:business'));
 assert.equal(topics.size,2000);
});
