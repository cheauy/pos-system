import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type {
  BusinessRole,
  CurrentBusiness,
  ProductMode,
} from "./types";

type BusinessMember = {
  business_id: string;
  role: BusinessRole;
};

type Business = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  product_mode: ProductMode;
  subscription_expires_at: string | null;
};

export async function getCurrentBusiness(): Promise<CurrentBusiness> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const {
    data: memberData,
    error: memberError,
  } = await supabase
    .from("business_members")
    .select(`
      business_id,
      role
    `)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (memberError) {
    throw new Error(
      `Unable to load business membership: ${memberError.message}`,
    );
  }

  if (!memberData) {
    redirect("/no-business");
  }

  const member = memberData as BusinessMember;

 const {
  data: businessData,
  error: businessError,
} = await supabase
  .from("businesses")
  .select(`
    id,
    name,
    slug,
    is_active,
    product_mode,
    subscription_expires_at
  `)
  .eq("id", member.business_id)
  .maybeSingle();

  if (businessError) {
    throw new Error(
      `Unable to load business: ${businessError.message}`,
    );
  }

  if (!businessData) {
    redirect("/no-business");
  }

  const business = businessData as Business;

const subscriptionExpired =
  business.subscription_expires_at !== null &&
  new Date(
    business.subscription_expires_at,
  ).getTime() <= Date.now();

if (subscriptionExpired) {
  await supabase
    .from("businesses")
    .update({
      is_active: false,
      disabled_at:
        new Date().toISOString(),
      disabled_reason:
        "subscription_expired",
      updated_at:
        new Date().toISOString(),
    })
    .eq("id", business.id);

  redirect("/business-disabled");
}

if (!business.is_active) {
  redirect("/business-disabled");
}

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    role: member.role,
    productMode: business.product_mode,
  };
}