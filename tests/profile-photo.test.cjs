const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadTs}=require('./helpers/load-ts.cjs');
function setup({signedIn=true,saveError=false,nameError=false,uploadError=false,networkError=false}={}){
 const calls=[];
 const bucket={upload:async(path,file)=>{calls.push(['upload',path,file.type]);return {error:uploadError?{}:null};},getPublicUrl:path=>({data:{publicUrl:`https://images.example/${path}`}}),remove:async paths=>calls.push(['remove',paths])};
 const mod=loadTs('app/(dashboard)/dashboard/settings/profile/actions.ts',{
  'next/cache':{revalidatePath:()=>{}},'node:crypto':{randomUUID:()=> 'unique'},
  '@/lib/business/get-current-business':{getCurrentBusiness:async()=>({id:'business'})},
  '@/lib/supabase/admin':{supabaseAdmin:{storage:{from:name=>{assert.equal(name,'product-images');return bucket;}}}},
  '@/lib/supabase/server':{createClient:async()=>({from:table=>({update:values=>({eq:async(key,id)=>{calls.push(['name',table,values.full_name,key,id]);return {error:nameError?{}:null};}})}),auth:{getUser:async()=>({data:{user:signedIn?{id:'owner'}:null}}),updateUser:async input=>{calls.push(['metadata',input]);if(networkError)throw Error('Connection lost');return {error:saveError?{}:null};}}})},
  '@/lib/images/compress-photo':{compressPhoto:async file=>{if(file.type!=='image/png')throw Error('Choose a JPG, PNG or WebP photo up to 5 MB.');return file;}},
 });
 return {calls,save:mod.updateProfile};
}
function form(photo=true){const data=new FormData();data.set('full_name','New Name');if(photo)data.set('photo',new File(['image'],'photo.png',{type:'image/png'}));data.set('user_id','someone-else');return data;}
test('one profile save updates name and optional photo only for the authenticated user',async()=>{
 const {calls,save}=setup();assert.equal((await save({},form())).success,true);
 assert.equal(calls[0][1],'business/owner/profile-unique.png');
 assert.deepEqual(calls[1],['name','profiles','New Name','id','owner']);
 assert.deepEqual(calls[2],['metadata',{data:{avatar_url:'https://images.example/business/owner/profile-unique.png'}}]);
 const nameOnly=setup();assert.equal((await nameOnly.save({},form(false))).success,true);assert.equal(nameOnly.calls.length,1);assert.equal(nameOnly.calls[0][0],'name');
});
test('validation, sign-in and upload failures prevent profile writes',async()=>{
 const denied=setup({signedIn:false});assert.equal((await denied.save({},form())).success,false);assert.equal(denied.calls.length,0);
 const invalid=setup(),data=form();data.set('full_name','A');assert.equal((await invalid.save({},data)).success,false);assert.equal(invalid.calls.length,0);
 data.set('full_name','New Name');data.set('photo',new File(['bad'],'bad.txt',{type:'text/plain'}));assert.equal((await invalid.save({},data)).success,false);assert.equal(invalid.calls.length,0);
 const upload=setup({uploadError:true});assert.equal((await upload.save({},form())).success,false);assert.equal(upload.calls.length,1);
});
test('confirmed failures clean new uploads and report partial saves; uncertain photo saves never delete a possibly active photo',async()=>{
 for(const flags of [{nameError:true},{saveError:true}]){const failed=setup(flags);const result=await failed.save({},form());assert.equal(result.success,false);assert.equal(result.nameSaved,!!flags.saveError);assert.deepEqual(failed.calls.at(-1),['remove',['business/owner/profile-unique.png']]);}
 const uncertain=setup({networkError:true});const result=await uncertain.save({},form());assert.equal(result.success,false);assert.equal(result.nameSaved,true);assert.ok(!uncertain.calls.some(call=>call[0]==='remove'));
});


test('Profile renders name and photo inside one form with one Save Changes button',()=>{
 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');
 const Form=loadTs('app/(dashboard)/dashboard/settings/profile/profile-form.tsx',{
  react:React,'react/jsx-runtime':require('react/jsx-runtime'),'lucide-react':require('lucide-react'),'./actions':{updateProfile:async()=>({success:true,message:'Saved'})},
 }).default;
 const html=renderToStaticMarkup(React.createElement(Form,{defaultFullName:'Owner',email:'owner@example.test',role:'owner'}));
 assert.equal((html.match(/<form/g)||[]).length,1);assert.equal((html.match(/type="submit"/g)||[]).length,1);
 assert.ok(html.includes('name="photo"'));assert.ok(html.includes('name="full_name"'));assert.ok(html.includes('Save Changes'));assert.ok(!html.includes('Save photo'));
});
