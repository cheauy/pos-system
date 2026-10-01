import "server-only";
import { getBranchContext } from "@/lib/branches/context";
import { currencyFormat, formatStoreMoney, type CurrencyFormat } from "@/lib/currency-format";
import { createClient } from "@/lib/supabase/branch-server";

export type BranchCurrency = { currency: string; format: CurrencyFormat; dualEnabled: boolean; usdKhrRate: number };

/** The owner's Currency settings (per branch) — the accounting currency POS records sales in. */
export async function getBranchCurrency(businessId: string, branchId?: string): Promise<BranchCurrency> {
  const location = branchId || (await getBranchContext()).branchId;
  const db = await createClient();
  const { data } = location
    ? await db.from("branch_pos_settings").select("currency,currency_format,pos_dual_currency_enabled,pos_usd_khr_rate").eq("business_id", businessId).eq("location_id", location).maybeSingle()
    : { data: null };
  const currency = data?.currency || "USD";
  const rate = Number(data?.pos_usd_khr_rate ?? 4000);
  return { currency, format: currencyFormat(data?.currency_format, currency), dualEnabled: data?.pos_dual_currency_enabled === true && rate >= 1, usdKhrRate: rate >= 1 ? rate : 4000 };
}

export function formatBranchMoney(value: number, settings: BranchCurrency): string {
  return formatStoreMoney(Number(value) || 0, settings.format);
}
