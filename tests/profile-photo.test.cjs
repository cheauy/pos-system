const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
function setup({signedIn=true,saveError=false}={}){
 const calls=[];
 const bucket={upload:async(path,file)=>{calls.push(['upload',path,file.type]);return {error:null};},getPublicUrl:path=>({data:{publicUrl:`https://images.example/${path}`}}),remove:async paths=>calls.push(['remove',paths])};
 const mod=loadTs('app/(dashboard)/dashboard/settings/profile/actions.ts',{
  'next/cache':{revalidatePath:()=>{}},'node:crypto':{randomUUID:()=> 'unique'},
  '@/lib/business/get-current-business':{getCurrentBusiness:async()=>({id:'business'})},
  '@/lib/supabase/admin':{supabaseAdmin:{storage:{from:name=>{assert.equal(name,'product-images');return bucket;}}}},
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:signedIn?{id:'owner'}:null}}),updateUser:async input=>{calls.push(['metadata',input]);return {error:saveError?{}:null};}}})},
  '@/lib/images/compress-photo':{compressPhoto:async file=>{if(file.type!=='image/png')throw Error('Choose a JPG, PNG or WebP photo up to 5 MB.');return file;}},
 });
 return {calls,save:mod.updateProfilePhoto};
}
test('profile photo saves only to the authenticated user metadata',async()=>{
 const {calls,save}=setup();const form=new FormData();form.set('photo',new File(['image'],'photo.png',{type:'image/png'}));form.set('user_id','someone-else');
 assert.equal((await save({},form)).success,true);
 assert.equal(calls[0][1],'business/owner/profile-unique.png');
 assert.deepEqual(calls[1],['metadata',{data:{avatar_url:'https://images.example/business/owner/profile-unique.png'}}]);
});
test('photo failures require sign-in and clean up only the newly uploaded object',async()=>{
 const form=new FormData();form.set('photo',new File(['image'],'photo.png',{type:'image/png'}));
 const denied=setup({signedIn:false});assert.equal((await denied.save({},form)).success,false);assert.equal(denied.calls.length,0);
 const failed=setup({saveError:true});assert.equal((await failed.save({},form)).success,false);assert.deepEqual(failed.calls.at(-1),['remove',['business/owner/profile-unique.png']]);
});
