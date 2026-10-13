// Local-only services for real web filters; all mutation entry points reject.
/* eslint-disable @typescript-eslint/no-explicit-any -- Heterogeneous page fixtures are deliberately isolated from production services. */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import LanguageProvider, { useLanguage } from "../../components/providers/language-provider";
import { DateFilterScope, DateFilterContent } from "../../components/date-range-filter";
import DashboardPeriodFilter from "../../app/(dashboard)/dashboard/dashboard-period-filter";
import ReportsPage from "../../app/(dashboard)/dashboard/reports/page";
import StaffPage from "../../app/(dashboard)/dashboard/staff-report/page";
import OrdersWorkspace from "../../app/(dashboard)/dashboard/orders/orders-workspace";
import { parseFilters } from "../../app/(dashboard)/dashboard/orders/order-workspace-types";
import PurchaseOrdersClient from "../../app/(dashboard)/dashboard/purchase-orders/purchase-orders-client";
import ReturnsWorkspace from "../../app/(dashboard)/dashboard/returns/returns-workspace";
import ExpensesClient from "../../app/(dashboard)/dashboard/expenses/expenses-client";
import AuditLogsTable from "../../app/(dashboard)/dashboard/audit-logs/audit-log-table";
import StockAdjustmentClient from "../../app/(dashboard)/dashboard/inventory/adjustments/stock-adjustment-client";
import GlobalSearchClient from "../../app/(dashboard)/dashboard/search/global-search-client";
import ManualPayments from "../../components/super-admin/manual-payment-approval-dashboard";

const initial = new URLSearchParams(location.search);
const pageName = initial.get("fixture") || "dashboard";
const paths: Record<string,string> = { dashboard:"/dashboard",reports:"/dashboard/reports",staff:"/dashboard/staff-report",orders:"/dashboard/orders",purchases:"/dashboard/purchase-orders",returns:"/dashboard/returns",expenses:"/dashboard/expenses",audit:"/dashboard/audit-logs",stock:"/dashboard/inventory/adjustments",search:"/dashboard/search",payments:"/super-admin/manual-payments" };
const path = paths[pageName];
const dateKeys = ["2026-09-01", "2026-10-01", "2026-10-10", "2026-10-11"];
const branches = [{ id:"00000000-0000-4000-8000-000000000001",name:"Fixture Branch សាខាសម្រាប់ការធ្វើតេស្ត",is_active:true }];
const supplier = { id:"supplier",name:"Fixture Supplier",contact_person:null,phone:null,email:null,address:null,notes:null,is_active:true };
const controls: any = { requests:[],delay:30,failNext:false,serial:0,applied:"",background:null,reportProps:null,staffProps:null };
(window as any).dateFixture = controls;
const Navigation = createContext<any>(null);
export function useRouter() { return useContext(Navigation).router; }
export function useSearchParams() { return new URLSearchParams(useContext(Navigation).query); }
export function usePathname() { return path; }
export function useLinkStatus() { return { pending:false }; }
export default function FixtureLink({ href, children, ...props }: any) { return <a href={href} {...props}>{children}</a>; }
export function useBranchSwitchGuard() {}
export function useWorkspaceBranch() { return { branchId: "00000000-0000-4000-8000-000000000001", changing: false }; }
export function createClient() {
  const channel: any = { on(_kind:any,_filters:any,handler:any) { controls.background = handler; return channel; },subscribe() { return channel; } };
  return { channel:()=>channel,removeChannel:async()=>{} };
}
export const ORDER_ALERTS_KEY="fixture-alerts", ORDER_SOUND_KEY="fixture-sound";
async function request(kind:string,query:string) {
  controls.requests.push({kind,query});
  const fail = controls.failNext; controls.failNext=false;
  const response = await fetch("/fixture-data?" + new URLSearchParams({kind,query,delay:String(controls.delay),fail:String(fail)}));
  if (!response.ok) throw Error("Fixture network error. Please try again.");
  return response.json();
}
const mutations = async () => { throw Error("Real mutations are blocked by this fixture"); };
export const createExpense=mutations,deleteExpense=mutations,submitStockAdjustment=mutations,submitStockAdjustmentBatch=mutations,setPurchaseOrderStatus=mutations,receivePurchaseOrder=mutations,createPurchaseOrder=mutations,changeOrderWorkspaceStatus=mutations,deleteOrderWorkspaceOrder=mutations,saveOrderWorkspaceDetails=mutations,setIncomingOrderScope=mutations,updateOnlinePaymentStatus=mutations,cancelReturn=mutations;
export async function getOrderWorkspaceDetail() { throw Error("Detail fetching is outside this date fixture"); }
export async function incomingOrderSummary() { return []; }
export async function getPurchaseOrderChoices() { return {suppliers:[supplier],products:[]}; }
const purchaseRows: any[] = dateKeys.map((date,index)=>({ id:"po-"+index,supplier_id:supplier.id,supplier_name:supplier.name,po_number:"DATE-PO-"+index,reference_number:null,status:"draft",order_date:date,expected_date:null,notes:null,subtotal:10,total:10,created_by:"fixture",created_by_name:"Fixture",created_at:date+"T00:00:00Z",item_count:0,ordered_quantity:0,received_quantity:0,items:[] }));
function purchaseWorkspace(filters:any={}) { const rows=purchaseRows.filter(row=>(!filters.fromDate||row.order_date>=filters.fromDate)&&(!filters.toDate||row.order_date<=filters.toDate)&&(filters.statusFilter==="all"||!filters.statusFilter||row.status===filters.statusFilter));return { orders:rows,suppliers:[supplier],page:filters.page||1,total:rows.length,stats:{total:rows.length,draft:rows.length,sent:0,partial:0,completed:0,outstanding:rows.length*10} }; }
export async function loadPurchaseOrders(filters:any) { await request("purchase-load",JSON.stringify(filters));return purchaseWorkspace(filters); }
export async function runGlobalSearch({query}:any) { await request("search-query",query); return {query,warnings:[],branches,results:dateKeys.map((date,index)=>({id:"search-"+index,kind:"order",title:"DATE-SEARCH-"+index,subtitle:"Fixture only",href:"#",badge:"Order",branchId:"00000000-0000-4000-8000-000000000001",branchName:"Fixture Branch",status:"completed",createdAt:date+"T12:00:00Z",amount:10,details:[]}))}; }
export function Empty() { return null; }
function FixtureLanguage() { const {setLanguage}=useLanguage();useEffect(()=>{controls.language=setLanguage;},[setLanguage]);return null; }

function App() {
  const [query,setQuery]=useState(pageName==="orders"?"branch=00000000-0000-4000-8000-000000000001&page=2":"branch=00000000-0000-4000-8000-000000000001&range=custom&from=2026-10-01&to=2026-10-11");
  const [navigationError,setNavigationError]=useState("");
  const serial=useRef(0),applied=useRef(query);
  useEffect(()=>{applied.current=query;controls.applied=query;},[query]);
  const router=useMemo(()=>({
    async push(url:string) {
      const current=++serial.current;setNavigationError("");
      const next=url.split("?")[1]||"";
      try { await request("navigation",next); if(current!==serial.current)return;window.history.pushState({fixture:true},"",path+"?"+next);setQuery(next); }
      catch(error) { if(current===serial.current)setNavigationError((error as Error).message); }
    },
    replace(url:string) { const next=url.split("?")[1]?.split("#")[0]||"";setQuery(next); },
    async refresh() { await request("background",applied.current); },
  }),[]);
  useEffect(()=>{ window.history.replaceState({fixture:true},"",path+"?"+applied.current);const restore=()=>{if(location.pathname===path)setQuery(location.search.slice(1));};window.addEventListener("popstate",restore);return()=>window.removeEventListener("popstate",restore); },[]);
  const params=Object.fromEntries(new URLSearchParams(query));
  const from=params.from||"2026-10-01",to=params.to||"2026-10-11";
  const orderRows: any[]=dateKeys.map((date,index)=>({id:"order-"+index,updatedAt:"v1",orderNumber:"DATE-ORDER-"+index,customerId:null,customerName:"Fixture",customerPhone:null,source:"pos",fulfillment:"walk_in",status:"pending",onlineStatus:null,paymentState:"unpaid",paymentMethod:"cash",total:10,amountPaid:0,createdAt:date+"T12:00:00Z",branchId:"00000000-0000-4000-8000-000000000001",branchName:"Fixture Branch",itemCount:1,deleteBlocked:false})).filter(row=>(!params.from||row.createdAt.slice(0,10)>=params.from)&&(!params.to||row.createdAt.slice(0,10)<=params.to));
  const ordersData:any={rows:orderRows,total:orderRows.length,page:Number(params.page||1),pages:2,counts:{all:orderRows.length},metrics:{today:0,yesterday:0,completed:0,pending:orderRows.length,pendingValue:orderRows.length*10,refunds:0,refundedAmount:0},currency:"USD",timezone:"Asia/Phnom_Penh",branches,receiveAllOnline:false};
  const returnRows:any[]=dateKeys.map((date,index)=>({id:"return-"+index,returnNumber:"DATE-RETURN-"+index,orderId:"order-"+index,orderNumber:"DATE-ORDER-"+index,paymentMethod:"cash",customerName:"Fixture",customerPhone:"",customerEmail:"",reason:"Fixture",refundAmount:10,createdAt:date+"T12:00:00Z",status:"refunded",cancelledAt:null,cancelReason:null,returnType:"refund",source:"system",refundMethod:"cash",restockStatus:null,items:[{id:"item",productName:"Fixture",quantity:1,unitPrice:10,subtotal:10}]}));
  const expenseRows:any[]=dateKeys.map((date,index)=>({id:"expense-"+index,category:"Rent",description:"DATE-EXPENSE-"+index,amount:10,expense_date:date,created_at:date+"T12:00:00Z",payee:null,payment_method:"cash",reference:null,location_id:"00000000-0000-4000-8000-000000000001"}));
  const auditRows:any[]=dateKeys.map((date,index)=>({id:"audit-"+index,user_id:"fixture",action:"create",entity_type:"orders",entity_id:null,description:"DATE-AUDIT-"+index,metadata:{branch_id:"00000000-0000-4000-8000-000000000001"},created_at:date+"T12:00:00Z",ip_address:null,user_agent:null,profiles:{full_name:"Fixture"}}));
  const adjustments:any[]=dateKeys.map((date,index)=>({id:"adjust-"+index,productName:"DATE-STOCK-"+index,sku:"QA-"+index,color:null,size:null,imageUrl:null,quantityDelta:1,stockBefore:10,stockAfter:11,reason:"Fixture",reference:null,note:null,createdAt:date+"T12:00:00Z",createdByName:"Fixture"}));
  const paymentRows:any[]=dateKeys.map((date,index)=>({id:"payment-"+index,businessId:"fixture",businessName:"DATE-PAYMENT-"+index,customerName:"Fixture",customerEmail:"fixture@example.invalid",status:"waiting",changeUrl:true,changeBusinessMode:false,oldUrl:"fixture",requestedUrl:"fixture-new",oldBusinessType:"general",requestedBusinessType:"general",unitPrice:10,amount:10,currency:"USD",paymentProvider:"manual",paymentReference:"FIXTURE",paymentNote:"Fixture",proofAvailable:false,proofUrl:null,proofFileName:null,proofMimeType:null,proofSizeBytes:null,proofUploadedAt:null,submittedAt:date+"T12:00:00Z",createdAt:date+"T12:00:00Z",reviewedAt:null,reviewedByEmail:null,reviewNote:null}));
  const [initialWorkspace]=useState(purchaseWorkspace);
  let content:React.ReactNode;
  if(pageName==="dashboard")content=<><a href="#dashboard-filters" className="fixed bottom-4 right-4 z-40 min-h-12 rounded-full bg-blue-600 px-5 py-3 text-white sm:hidden">Filter</a><div id="dashboard-filters" className="w-full border-t border-slate-100 pt-4 max-sm:!m-0 max-sm:fixed max-sm:inset-0 max-sm:z-50 max-sm:hidden max-sm:items-end max-sm:border-0 max-sm:bg-slate-950/40 max-sm:p-0 max-sm:target:flex"><a href="#" aria-label="Close filters" className="absolute inset-0 sm:hidden"/><div className="max-sm:relative max-sm:max-h-[85dvh] max-sm:w-full max-sm:overflow-y-auto max-sm:rounded-t-3xl max-sm:bg-white max-sm:px-5 max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))] max-sm:pt-14"><DashboardPeriodFilter key={[params.range,from,to].join("|")} activeRange={(params.range||"custom") as any} selectedFrom={from} selectedTo={to} today="2026-10-11" branchId="00000000-0000-4000-8000-000000000001" branches={branches} canViewReports/></div></div></>;
  else if(pageName==="reports")content=<ReportsPage searchParams={Promise.resolve({})}/>;
  else if(pageName==="staff")content=<StaffPage searchParams={Promise.resolve({})}/>;
  else if(pageName==="orders")content=<OrdersWorkspace businessId="fixture" branchId="00000000-0000-4000-8000-000000000001" businessName="Fixture" data={ordersData} filters={parseFilters(params)} permissions={{edit:false,cancel:false,refund:false,create:false,delete:false}}/>;
  else if(pageName==="purchases")content=<PurchaseOrdersClient workspace={initialWorkspace} canCreate={false} canUpdate={false}/>;
  else if(pageName==="returns")content=<ReturnsWorkspace initialRecords={returnRows} completedOrderCount={10} accentColor="#2563eb" canManage={false} canCancel={false}/>;
  else if(pageName==="expenses")content=<ExpensesClient expenses={expenseRows} branches={branches} today="2026-10-11" defaultBranchId="00000000-0000-4000-8000-000000000001"/>;
  else if(pageName==="audit")content=<AuditLogsTable logs={auditRows} branches={branches as any}/>;
  else if(pageName==="stock")content=<StockAdjustmentClient branchName="Fixture Branch" branchId="00000000-0000-4000-8000-000000000001" products={[]} recentAdjustments={adjustments} recoveryKey="date-filter-stock-fixture"/>;
  else if(pageName==="search")content=<GlobalSearchClient initialQuery="Fixture"/>;
  else content=<ManualPayments rows={paymentRows} referenceNow={Date.parse("2026-10-11T12:00:00Z")}/>;
  return <Navigation.Provider value={{router,query}}><LanguageProvider initialLanguage={initial.get("lang")==="km"?"km":"en"}><FixtureLanguage/><DateFilterScope><div className="workspace-theme min-h-screen bg-slate-50"><header id="fixture-header" className="sticky top-0 z-30 border-b bg-white p-3">TENH POS · {pageName}</header><main className="workspace-content mx-auto max-w-7xl p-3"><output id="applied-query" className="block text-xs">{query}</output>{navigationError?<p role="alert">{navigationError}</p>:null}{content}<DateFilterContent kind="analytics"><div id="fixture-results" hidden={Boolean(navigationError)}>Applied fixture range: {from} → {to}</div></DateFilterContent></main></div></DateFilterScope></LanguageProvider></Navigation.Provider>;
}
createRoot(document.getElementById("root")!).render(<App/>);
