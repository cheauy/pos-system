"use server";

import { getImageFile, uploadStorefrontImage } from "@/lib/storefront/images";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/require-permission";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createAuditLog } from "@/lib/audit/create-audit-log";
import { businessInfoSnapshot, businessInfoValues, parseBusinessInfo } from "@/lib/business/business-info";

export async function saveBusinessInfo(form: FormData): Promise<{ success: boolean; message: string; snapshot?: string }> {
  const business = await requirePermission("business.update");
  try {
    if (form.get("businessId") !== business.id) throw new Error("The selected business changed. Reload Business Settings before saving.");
    const info = parseBusinessInfo(form);
    const requestedName = form.get("businessName");
    const businessName = typeof requestedName === "string" ? requestedName.trim() : null;
    const nameChanged = businessName !== null && businessName !== business.name;
    if (nameChanged) {
      if (business.role !== "owner") throw new Error("Only the business Owner can change the business name.");
      if (businessName.length < 2 || businessName.length > 100) throw new Error("Business name must be between 2 and 100 characters.");
    }
    const { data: current, error: readError } = await supabaseAdmin.from("business_storefronts")
      .select("phone,address,description,logo_url,banner_url,social_links,updated_at").eq("business_id", business.id).maybeSingle();
    if (readError || !current) throw new Error("Unable to load business information. Reload Business Settings and try again.");
    const currentInfo = businessInfoValues({ ...current, profile: current.social_links?.profile });
    if (form.get("expectedInfo") !== businessInfoSnapshot(currentInfo)) {
      throw new Error("Business information changed in another tab. Reload and review the latest values before saving.");
    }
    // Preserve older contact-only submissions; this form now owns store media too.
    if (!form.has("description")) info.description = currentInfo.description;
    const logo = getImageFile(form, "logo");
    const banner = getImageFile(form, "banner");
    info.logoUrl = form.get("remove-logo") === "on" ? null : currentInfo.logoUrl;
    info.bannerUrl = form.get("remove-banner") === "on" ? null : currentInfo.bannerUrl;
    if (logo) info.logoUrl = await uploadStorefrontImage({ businessId: business.id, kind: "logo", file: logo });
    if (banner) info.bannerUrl = await uploadStorefrontImage({ businessId: business.id, kind: "banner", file: banner });
    // Name first: a retry after a later failure resubmits the same name as a no-op.
    if (nameChanged) {
      const { error: nameError } = await supabaseAdmin.from("businesses").update({ name: businessName }).eq("id", business.id);
      if (nameError) throw new Error("Unable to save the business name. Please try again.");
    }
    const socialLinks = { ...current.social_links, profile: {
      ...current.social_links?.profile,
      contactEmail: info.contactEmail, locationUrl: info.locationUrl, openingHours: info.openingHours,
    } };
    let update = supabaseAdmin.from("business_storefronts").update({
      description: info.description || null, logo_url: info.logoUrl, banner_url: info.bannerUrl,
      phone: info.phone || null, address: info.address || null, social_links: socialLinks, updated_at: new Date().toISOString(),
    }).eq("business_id", business.id);
    // A branding save racing this request must not be silently overwritten.
    update = current.updated_at == null ? update.is("updated_at", null) : update.eq("updated_at", current.updated_at);
    const { data: saved, error } = await update.select("business_id").maybeSingle();
    if (error) throw new Error("Unable to save business information. Please try again.");
    if (saved?.business_id !== business.id) throw new Error("Settings changed while saving. Reload and review before retrying.");

    // Once committed, a cache/audit failure must not report that the data save failed.
    let message = "Business information and store hours saved.";
    try {
      await createAuditLog({ action: "update", entityType: "business", entityId: business.id, description: "Updated business information and store hours" });
      for (const path of ["/dashboard/settings/business", "/dashboard/settings/online-store", "/dashboard/settings/printers", "/dashboard/settings/receipts", "/dashboard/shipping-labels", `/_sites/${business.slug}`, `/storefront/${business.slug}`]) revalidatePath(path);
      if (nameChanged) revalidatePath("/dashboard", "layout");
      revalidatePath("/dashboard/orders", "layout");
      revalidatePath("/dashboard/pos", "layout");
    } catch (error) {
      console.error("Business info saved; follow-up refresh failed", error);
      message = "Business information saved. Reload other open pages to show the latest details.";
    }
    return { success: true, message, snapshot: businessInfoSnapshot(info) };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Unable to save business information." };
  }
}
