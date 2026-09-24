"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function saveOnlineCatalogProduct(id:string,name:string,priceText:string,expected:{name:string;price:number}) {
 const business=await requirePermission('storefront.update');
 if(!/^[0-9a-f-]{36}$/i.test(id) || typeof name!=='string' || !name.trim() || name.trim().length>160 || !/^\d+(\.\d{1,2})?$/.test(priceText) || Number(priceText)>99999999.99 || !expected || typeof expected.name!=='string' || !Number.isFinite(expected.price))return {success:false,message:'Enter a valid name and price.'};
 const {data,error}=await supabaseAdmin.from('products').update({name:name.trim(),selling_price:Number(priceText),updated_at:new Date().toISOString()}).eq('business_id',business.id).eq('id',id).eq('name',expected.name).eq('selling_price',expected.price).select('id').maybeSingle();
 if(error || !data)return {success:false,message:'This online product changed or is unavailable. Refresh before saving again.'};
 try {await createAuditLog({action:'update',entityType:'storefront',entityId:id,description:'Updated shared online product',metadata:{name:name.trim(),selling_price:Number(priceText)}});}catch{ /* The catalog save has already committed. */ }
 revalidatePath('/dashboard/online-store');revalidatePath(`/storefront/${business.slug}`);
 return {success:true,message:'Online product saved.'};
}

export async function setCatalogVisibility(kind: "product" | "category", id: string, visible: boolean) {
  const business = await requirePermission("storefront.update");
  if (!["product", "category"].includes(kind) || typeof visible !== "boolean" ||
    !/^[0-9a-f-]{36}$/i.test(id)) {
    return { success: false, message: "Invalid catalog item." };
  }
  const table = kind === "product" ? "products" : "categories";
  let query = supabaseAdmin.from(table).update({ is_online: visible })
    .eq("business_id", business.id).eq("id", id);
  if (kind === "product" && visible) query = query.eq("is_active", true);
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) {
    return { success: false, message: error?.message ?? "Item not found or inactive. Refresh and try again." };
  }
  await createAuditLog({
    action: "update", entityType: "storefront", entityId: id,
    description: `${visible ? "Published" : "Hidden"} online ${kind}`,
    metadata: { is_online: visible },
  });
  revalidatePath("/dashboard/online-store");
  revalidatePath("/dashboard/products");
  revalidatePath("/dashboard/categories");
  revalidatePath(`/storefront/${business.slug}`);
  return { success: true, message: visible ? "Visible online." : "Hidden from the store." };
}

export async function updateCatalogProducts(ids: string[], field: "visibility" | "featured", enabled: boolean) {
  const business = await requirePermission("storefront.update");
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) || !["visibility", "featured"].includes(field) || typeof enabled !== "boolean") return { success: false, message: "Select between 1 and 100 valid products." };
  const uniqueIds = [...new Set(ids)];
  const { data: products, error: productError } = await supabaseAdmin.from("products").select("id").eq("business_id", business.id).eq("is_active", true).in("id", uniqueIds);
  if (productError || products?.length !== uniqueIds.length) return { success: false, message: "Some products are unavailable. Refresh and try again." };
  if (field === "visibility") {
    const { error } = await supabaseAdmin.from("products").update({ is_online: enabled }).eq("business_id", business.id).eq("is_active", true).in("id", uniqueIds);
    if (error) return { success: false, message: "Unable to update product visibility." };
  } else {
    const { data: store, error: readError } = await supabaseAdmin.from("business_storefronts").select("social_links").eq("business_id", business.id).single();
    if (readError) return { success: false, message: "Unable to load store settings." };
    const links = store.social_links ?? {};
    // Keep the legacy featuredProductIds storage key for existing storefront settings.
    // This flag now marks pre-order variants in the storefront.
    const featured = new Set<string>(Array.isArray(links.profile?.featuredProductIds) ? links.profile.featuredProductIds : []);
    for (const id of uniqueIds) { if (enabled) featured.add(id); else featured.delete(id); }
    const { error } = await supabaseAdmin.from("business_storefronts").update({ social_links: { ...links, profile: { ...links.profile, featuredProductIds: [...featured] } } }).eq("business_id", business.id);
    if (error) return { success: false, message: "Unable to update pre-order products." };
  }
  await createAuditLog({ action: "update", entityType: "storefront", entityId: business.id, description: "Updated storefront products", metadata: { product_ids: uniqueIds, field, enabled } });
  revalidatePath("/dashboard/online-store");
  revalidatePath("/dashboard/products");
  revalidatePath(`/storefront/${business.slug}`);
  return { success: true, message: "Storefront products updated." };
}
