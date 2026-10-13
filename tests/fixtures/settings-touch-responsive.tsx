import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import LanguageProvider, {useLanguage} from '../../components/providers/language-provider';
import ThemeProvider from '../../components/providers/theme-provider';
import UsersWorkspace from '../../app/(dashboard)/dashboard/settings/users/users-workspace';
import AppearanceForm from '../../app/(dashboard)/dashboard/settings/system/appearance-form';
import RegisterSetting from '../../app/(dashboard)/dashboard/settings/register-setting';
import SecurityPage from '../../app/(dashboard)/dashboard/settings/security/page';
import CustomerSupport from '../../app/(dashboard)/dashboard/settings/support/support-client';
import systemStyles from "../../app/(dashboard)/dashboard/settings/system/system-responsive.module.css";
import touch from '../../app/(dashboard)/dashboard/settings/settings-touch.module.css';
import type {TeamWorkspace, TeamCreateInput} from '../../lib/users/team-model';
import {rolePermissions} from '../../lib/auth/permissions';
import {passwordIssue} from '../../lib/auth/password-policy';

const calls: {name:string;args:unknown[]}[]=[];
let failNext=false, factors: {id:string;status:string}[]=[];
const wait=()=>new Promise(resolve=>setTimeout(resolve,100));
async function call(name:string,...args:unknown[]){calls.push({name,args});await wait();if(failNext){failNext=false;throw Error('Synthetic service failure');}}
declare global {interface Window {touchSettingsFixture:{calls:typeof calls;failNext:()=>void}}}
window.touchSettingsFixture={calls,failNext:()=>{failNext=true;}};
export function redirect(url:string):never {throw Error("Unexpected fixture redirect "+url);}
export function useRouter(){return {refresh(){calls.push({name:'refresh',args:[]});}};}
export function Link({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>){return <a {...props}>{children}</a>;}
export default Link;
const branch='00000000-0000-4000-8000-000000000001';
const initial:TeamWorkspace={businessId:'synthetic',businessName:'Synthetic shop',actorId:'owner',actorRole:'owner',branchId:branch,branches:[{id:branch,name:'សាខាសាកល្បង · A long synthetic branch name for wrapping'}],rows:Array.from({length:18},(_,i)=>({id:String(i),userId:String(i),name:i===0?'Synthetic Owner':i===1?'អ្នកប្រើសាកល្បង · A long synthetic staff name':`Synthetic Staff ${i}`,email:`synthetic${i}@example.invalid`,phone:'000000000',role:i===0?'owner':i%2?'staff':'cashier',branchId:i===0?null:branch,status:i%5===0?'disabled':i%4===0?'pending':'active',createdAt:`2026-10-${String(1+i).padStart(2,'0')}T01:00:00Z`,lastActive:null,revision:1,passwordRequired:i%4===0})),activities:[{id:'a',description:'Synthetic member details updated',createdAt:'2026-10-12T01:00:00Z',action:'edit',actor:'Synthetic owner'}],seatLimit:40,seatsUsed:18,reservedSeats:0,canCreate:true,lockReason:null,effectiveRolePermissions:rolePermissions,canManageRolePermissions:true,canCreateUsers:true,canEditUsers:true,canDisableUsers:true,assignableRoles:['manager','staff','cashier']};
export async function loadUsersWorkspace(){await call('users-refresh');return {success:true,data:initial,message:'Synthetic users refreshed'};}
export async function createTeamUser(business:string,input:TeamCreateInput){await call('user-create',business,{...input,password:'[fixture secret]'});return {success:true,message:'Synthetic user created',data:null};}
export async function updateTeamUser(...args:unknown[]){await call('user-update',...args);return {success:true,message:'Synthetic user updated',data:null};}
export async function saveRolePermissions(){await call('role-save');return {success:true,message:'Synthetic roles saved',data:[]};}
export async function resetRolePermissions(){return saveRolePermissions();}
export async function loadMemberPermissions(){return {role:'staff',selected:rolePermissions.staff,baseline:rolePermissions.staff,custom:false,revision:1};}
export async function saveMemberPermissions(){await call('member-save');return {success:true,message:'Synthetic permissions saved',data:[]};}
export async function updateCustomerFieldSettings(data:FormData){await call('customer-fields',Object.fromEntries(data));}
export async function saveRegisterRequirement(business:string,branchId:string,value:boolean){await call('register',business,branchId,value);}
export async function submitCustomerBugReport(data:FormData){await call('report',{title:data.get('title'),reason:data.get('reason'),description:data.get('description'),image:(data.get('image') as File)?.name});return {ok:true,message:'Synthetic report sent'};}
export async function changePassword(_previous:unknown,data:FormData){await call('password');const issue=passwordIssue(String(data.get('new_password')));return {success:!issue&&data.get('new_password')===data.get('confirm_password'),message:issue||'Synthetic password result'};}
export async function deleteOwnAccount(){await call('delete');return {success:false,message:'Synthetic deletion blocked; no account was changed'};}
export function createClient(){return {from(){return {select(){return this;},eq(){return this;},async single(){return {data:{full_name:"Synthetic user",role:"staff",is_active:true}};}};},auth:{async getUser(){return {data:{user:{id:"synthetic-account",email:"synthetic@example.invalid",email_confirmed_at:"2026-10-12",identities:[{provider:"email"}],last_sign_in_at:null}}};},mfa:{async listFactors(){return {data:{totp:factors}};},async enroll(){await call('enroll');return {data:{id:'synthetic-factor',totp:{qr_code:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><text x="20" y="90">Synthetic QR</text></svg>'),secret:'SYNTHETICFIXTURE'}}};},async challengeAndVerify(){await call('verify');factors=[{id:'synthetic-factor',status:'verified'}];return {};},async unenroll(){await call('unenroll');factors=[];return {};}},async getUserIdentities(){return {data:{identities:[{provider:'email'}]}};},async refreshSession(){return {};},async linkIdentity(){await call('link');return {data:{}};},async signOut(options:unknown){await call('signout',options);return {error:{message:'Synthetic sign-out prevented navigation'}};}}};}
function Fixture(){
 const page=new URLSearchParams(location.search).get('page')||'users';
 const {language,setLanguage}=useLanguage();const [mounted,setMounted]=useState(true),[security,setSecurity]=useState<React.ReactNode>(null);
 useEffect(()=>{if(page==='security')void SecurityPage().then(setSecurity);},[page]);
 return <><div className="fixture-tools"><span>Synthetic fixtures only</span><button onClick={()=>setLanguage(language==='en'?'km':'en')}>Fixture language</button><button onClick={()=>setMounted(!mounted)}>Fixture remount</button></div><header className="fixture-header"><span>☰</span><div><strong>Synthetic TENH POS</strong><small>{page}</small></div><span>Synthetic branch</span></header><div className="fixture-content general-settings-layout">{mounted&&(page==='users'?<UsersWorkspace initial={initial}/>:page==='appearance'?<main className={`${systemStyles.page} ${touch.appearance} space-y-5`}><section className={systemStyles.intro}><h1>System &amp; Display</h1><p>Manage POS behavior and display preferences. Display preferences are saved on this device.</p></section><RegisterSetting businessId="synthetic" branchId={branch} branchName="Synthetic branch" required={new URLSearchParams(location.search).has('required')}/><AppearanceForm customerFields={{emailEnabled:true,birthdayEnabled:true,genderEnabled:true}} branchId={branch}/></main>:page==='security'?security:<CustomerSupport loadError={false} reports={[{id:'fixture',title:'Synthetic report with a long readable title សាកល្បង',reason:'Bug or Technical Issue',description:'Synthetic details only',image_path:null,status:'open',created_at:'2026-10-12T01:00:00Z'}]}/>)}</div></>;
}
createRoot(document.getElementById('root')!).render(<ThemeProvider><LanguageProvider initialLanguage="en"><Fixture/></LanguageProvider></ThemeProvider>);
