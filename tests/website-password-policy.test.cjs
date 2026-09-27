const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
const policy=loadTs('lib/auth/password-policy.ts');
test('one password policy requires every character class and preserves exact input',()=>{
 for(const value of ['Ab1!abc','abcdefgh','ABCDEFG1!','Abcdefg!','Abcdefg1','abcdef1!','Abcdef1 ','Aa1!'+ 'a'.repeat(69)]) assert.ok(policy.passwordIssue(value),value);
 for(const value of ['Abcdef1!',' Abcdef1! ','Aa1!'+ 'a'.repeat(68)]) assert.equal(policy.passwordIssue(value),null);
});
test('team setup never changes credentials when shared validation fails',async()=>{
 let changed=0;
 const setup=loadTs('app/team-setup/actions.ts',{
  '@/lib/auth/password-policy':policy,
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'test'}}}),updateUser:async()=>{changed++;return {}}}})},
  '@/lib/supabase/admin':{supabaseAdmin:{rpc:async()=>({})}},
 });
 assert.equal((await setup.completeTeamPasswordSetup('abcdefgh','abcdefgh')).success,false);
 assert.equal(changed,0);
 assert.equal((await setup.completeTeamPasswordSetup('Abcdef1!','Abcdef1!')).success,true);
 assert.equal(changed,1);
});
