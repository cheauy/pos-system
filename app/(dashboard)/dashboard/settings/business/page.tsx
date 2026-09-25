import { requirePermission } from "@/lib/auth/require-permission";
import { getBusinessModePreset } from "@/lib/business/business-mode-presets";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getBusinessChangeEntitlements } from "@/lib/subscriptions/entitlements";
import { getRootDomain } from "@/lib/tenancy/domain";

import BusinessSettingsClient from "./business-settings-client";
import CreditBadges from "./credit-badges";

function inferBusinessType(productMode: string) {
  if (productMode === "variant") return "fashion";
  if (productMode === "configurable") return "milk_tea";
  return "general";
}

export default async function BusinessSettingsPage({searchParams}:{searchParams:Promise<{edit?:string}>}) {
  const query=await searchParams;
  const business = await requirePermission("business.view");

  const { data: storefront } = await supabaseAdmin
    .from("business_storefronts")
    .select("business_type")
    .eq("business_id", business.id)
    .maybeSingle();

  const entitlements = await getBusinessChangeEntitlements(business.id);
  const {data:pendingCheckout,error:checkoutError}=await supabaseAdmin.from("business_change_orders").select("id,status,total_amount").eq("business_id",business.id).in("status",["pending_payment","payment_submitted","under_review"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
  if(checkoutError)throw new Error("Unable to load business checkout.");

  const storedBusinessType = storefront?.business_type ?? "";
  const currentBusinessType =
    getBusinessModePreset(storedBusinessType)?.value ??
    inferBusinessType(business.productMode);

  if(query.edit!=="1"){
    const preset=getBusinessModePreset(currentBusinessType);
    const [userResult,branchResult,leadersResult]=await Promise.all([
      supabaseAdmin.from("business_members").select("id",{count:"exact",head:true}).eq("business_id",business.id).eq("is_active",true),
      supabaseAdmin.from("business_locations").select("id",{count:"exact",head:true}).eq("business_id",business.id).eq("is_active",true),
      supabaseAdmin.from("business_members").select("user_id,role").eq("business_id",business.id).eq("is_active",true).in("role",["owner","admin"]),
    ]);
    if(userResult.error||branchResult.error||leadersResult.error)throw new Error("Unable to load business members and branches. Please try again.");
    const leaders=leadersResult.data??[];
    const {data:profiles,error:profilesError}=leaders.length?await supabaseAdmin.from("profiles").select("id,full_name").in("id",leaders.map(member=>member.user_id)):{data:[],error:null};
    if(profilesError)throw new Error("Unable to load business owner details. Please try again.");
    const names=new Map((profiles??[]).map(profile=>[profile.id,profile.full_name]));
    const leadership=[...leaders].sort((a,b)=>Number(b.role==="owner")-Number(a.role==="owner"));
    return <main className="mx-auto w-full max-w-[1600px] space-y-5 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-tight text-slate-950 dark:text-white">Business Details</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your current business setup and available credits.</p></div><div className="flex w-full flex-wrap items-center gap-3 xl:w-auto"><CreditBadges modeCredits={entitlements.modeFreeRemaining+entitlements.modeCredits} urlCredits={entitlements.urlFreeRemaining+entitlements.urlCredits} canBuy={business.role==="owner"}/>{business.role==="owner"&&<Link href="/dashboard/settings/business?edit=1" className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700"><Pencil size={16}/>Change</Link>}</div></header>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-6 flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300"><Store size={24}/></span><div><p className="text-xs font-medium text-slate-500">Business name</p><h2 className="mt-1 text-xl font-bold text-slate-950 dark:text-white">{business.name}</h2></div></div>
        <dl className="grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2 dark:border-slate-800"><div><dt className="flex items-center gap-2 text-sm text-slate-500"><Link2 size={16}/>Store URL</dt><dd className="mt-2 break-all text-base font-semibold text-slate-900 dark:text-white">{business.slug}.{getRootDomain()}</dd></div><div><dt className="flex items-center gap-2 text-sm text-slate-500"><Store size={16}/>Business mode</dt><dd className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{preset?.label??currentBusinessType}</dd></div></dl>
        <dl className="mt-5 grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-3 dark:border-slate-800">
          <div><dt className="flex items-center gap-2 text-sm text-slate-500"><ShieldCheck size={16}/>Owner / Admin</dt><dd className="mt-2 space-y-1 text-sm font-semibold text-slate-900 dark:text-white">{leadership.length?leadership.map(member=><p key={member.user_id}>{names.get(member.user_id)?.trim()||"Name not set"}<span className="ml-2 text-xs font-normal text-slate-500">{member.role==="owner"?"Owner":"Admin"}</span></p>):"Not assigned"}</dd></div>
          <div><dt className="flex items-center gap-2 text-sm text-slate-500"><Users size={16}/>Users</dt><dd className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{userResult.count??0}</dd><p className="mt-1 text-xs text-slate-500">Active users, including the owner</p></div>
          <div><dt className="flex items-center gap-2 text-sm text-slate-500"><Building2 size={16}/>Branches</dt><dd className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{branchResult.count??0}</dd><p className="mt-1 text-xs text-slate-500">Active branches</p></div>
        </dl>
      </section>
      <p className="text-xs text-slate-500">One credit per change. Purchased credits never expire.</p>
      {pendingCheckout&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30"><p className="text-sm font-semibold">{pendingCheckout.status==='pending_payment'?'You have an unfinished checkout.':'Your payment is awaiting review.'}</p><Link href={`/dashboard/settings/business/payment/${pendingCheckout.id}`} className="inline-flex items-center gap-2 text-sm font-bold text-blue-600">{pendingCheckout.status==='pending_payment'?'Continue checkout':'View payment'}<ArrowRight size={16}/></Link></div>}
    </main>;
  }

  return (
    <BusinessSettingsClient
      businessName={business.name}
      currentBusinessType={currentBusinessType}
      currentProductMode={business.productMode}
      initialSlug={business.slug}
      rootDomain={getRootDomain()}
      canEdit={business.role === "owner"}
      subscriptionPlanKey={entitlements.planKey}
      freeUrlChangesRemaining={entitlements.urlFreeRemaining}
      freeBusinessModeChangesRemaining={entitlements.modeFreeRemaining}
      urlCredits={entitlements.urlCredits}
      modeCredits={entitlements.modeCredits}
      pendingCheckout={pendingCheckout}
    />
  );
}
import Link from "next/link";
import { ArrowRight, Building2, Link2, Pencil, ShieldCheck, Store, Users } from "lucide-react";
