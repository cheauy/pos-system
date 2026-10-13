// Isolated real UI: every service is replaced, passwords are never recorded.
import React from "react";
import {createRoot} from "react-dom/client";
import UsersWorkspace from "../../app/(dashboard)/dashboard/settings/users/users-workspace";
import BranchesClient from "../../app/(dashboard)/dashboard/locations/branches-client";
import PrinterSettings from "../../app/(dashboard)/dashboard/settings/printers/printer-settings";
import AuditLogsTable from "../../app/(dashboard)/dashboard/audit-logs/audit-log-table";
import LanguageProvider from "../../components/providers/language-provider";
import {DEFAULT_RECEIPT, type ReceiptAppearance} from "../../lib/receipts/receipt-model";
import type {TeamWorkspace} from "../../lib/users/team-model";
import type {BranchViewModel} from "../../app/(dashboard)/dashboard/locations/branches-client";
import {defaultBranchOpeningHours,serializeBranchOpeningHours} from "../../lib/branches/opening-hours";

const query=new URLSearchParams(location.search),km=query.get("lang")==="km";
document.documentElement.classList.toggle("dark",query.has("dark"));
const longName=km?"ឈ្មោះសម្រាប់ធ្វើតេស្តការបង្ហាញអក្សរខ្មែរវែងនៅសាខារាជធានីភ្នំពេញ":"Fixture branch with a long readable name";
const branchId="00000000-0000-4000-8000-000000000001";
const controls={calls:[] as string[],hold:false,release:()=>{},saved:null as ReceiptAppearance|null};
declare global{interface Window{fourFixture:typeof controls}}
window.fourFixture=controls;
window.print=()=>{throw Error("Physical printing is disabled in this fixture");};
export function useRouter(){return {refresh(){controls.calls.push("refresh-route");},push(){}};}
export default function Link(props:React.AnchorHTMLAttributes<HTMLAnchorElement>){return <a {...props}/>;}
async function failure(action:string){controls.calls.push(action);if(controls.hold)await new Promise<void>(resolve=>{controls.release=resolve;});return {success:false as const,message:"Fixture failure — no production changes."};}
export async function createTeamUser(){return failure("create-user");}
export async function updateTeamUser(){return failure("edit-user");}
export async function setTeamUserAccess(){return failure("change-access");}
export async function deleteTeamUser(){return failure("delete-user");}
export async function saveRolePermissions(){return failure("permissions");}
export async function loadUsersWorkspace(){controls.calls.push("load-users");return query.has("error")?{success:false as const,message:"Fixture load failed"}:{success:true as const,data:team,message:"Fixture loaded"};}
export async function createLocation(){return failure("create-branch");}
export async function updateLocation(){return failure("edit-branch");}
export async function deleteLocation(){return failure("delete-branch");}
export async function toggleLocation(){return failure("toggle-branch");}
export async function setDefaultLocation(){return failure("default-branch");}
export async function saveReceiptAppearance(_business:string,a:ReceiptAppearance){controls.saved={...a};return failure("save-receipt");}
export async function uploadReceiptLogo(_business:string,form:FormData){const file=form.get("logo") as File;controls.calls.push("upload-logo");return file.size>750*1024?{success:false as const,message:"Image must be 750 KB or smaller."}:{success:true as const,url:"/fixture-image.svg"};}
export const uploadReceiptQr=uploadReceiptLogo;
export function ReceiptViewer(){return <button type="button">View receipt</button>;}

const rows=Array.from({length:18},(_,i)=>({id:"member-"+i,userId:"user-"+i,name:i===0?"Fixture Owner":longName+" "+i,email:`fixture${i}@example.test`,phone:"",role:i===0?"owner" as const:i%2?"staff" as const:"cashier" as const,branchId:i===0?null:branchId,status:i%3===0?"active" as const:i%3===1?"pending" as const:"disabled" as const,createdAt:"2026-10-11T03:00:00Z",lastActive:null,revision:1,passwordRequired:true}));
const readonly=query.has("readonly");
const team:TeamWorkspace={businessId:"fixture-business",businessName:"Fixture business",actorId:"user-0",actorRole:"owner",branchId,rows:query.has("empty")?[]:rows,branches:[{id:branchId,name:longName}],activities:[],seatLimit:50,seatsUsed:18,reservedSeats:0,canCreate:!readonly,lockReason:null,effectiveRolePermissions:{owner:[],manager:[],staff:["products.view"],cashier:["pos.access"],admin:[]},canManageRolePermissions:!readonly,canCreateUsers:!readonly,canEditUsers:!readonly,canDisableUsers:!readonly,assignableRoles:["manager","staff","cashier"]};
const branches:BranchViewModel[]=Array.from({length:8},(_,i)=>({id:"branch-"+i,name:longName+" "+i,code:"FIX"+i,address:"Fixture address with longer text",phone:"012345678",city:"Fixture city",stateRegion:"Fixture province",timezone:"Asia/Phnom_Penh",openingHours:serializeBranchOpeningHours(defaultBranchOpeningHours()),notes:"Fixture notes",managerUserId:"",managerName:"",isDefault:i===0,isActive:i%3!==2,createdAt:"2026-10-11T03:00:00Z",todaySales:0,staffCount:2,inventoryCount:12}));
const logs=Array.from({length:25},(_,i)=>({id:"log-"+i,user_id:"fixture-user",action:i%3===0?"delete":"update",entity_type:i%2?"product":"user",entity_id:null,description:longName+" · fixture activity "+i,metadata:{branch_id:branchId},created_at:new Date(new Date("2026-10-11T03:00:00Z").getTime()-Math.floor(i/6)*86400000-i*60000).toISOString(),ip_address:null,user_agent:null,profiles:{full_name:longName}}));
const section=query.get("section")||"users";
createRoot(document.getElementById("root")!).render(<LanguageProvider initialLanguage={km?"km":"en"}><div className="fixture-shell" style={{padding:16}}>
 {section==="users"&&<UsersWorkspace initial={team}/>}
 {section==="branches"&&<BranchesClient businessName="Fixture business" branches={query.has("empty")?[]:branches} managerOptions={[]} branchCapacity={{used:8,limit:readonly?8:20,locked:readonly}}/>}
 {section==="printer"&&<PrinterSettings businessId="fixture-business" context={{branchId,store:{name:longName,phone:"012345678",address:"Fixture address"},appearance:{...DEFAULT_RECEIPT}}} settings={{}}/>}
 {section==="audit"&&<AuditLogsTable logs={query.has("empty")?[]:logs} branches={[{id:branchId,name:longName,code:"FIX",is_default:true}]} branchLoadError={query.has("error")?"Fixture branch loading error":null}/>}
</div></LanguageProvider>);
