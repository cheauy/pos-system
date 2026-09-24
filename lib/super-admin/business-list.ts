export type BusinessListRow = {
  id: string; name: string; business_code: string | null; slug: string; owner_id: string | null;
  product_mode: string; is_active: boolean; disabled_reason: string | null;
  subscription_plan_key: string | null; subscription_user_limit: number | null;
  subscription_branch_limit: number | null; subscription_expires_at: string | null;
  max_staff: number; created_at: string;
  subscription_status?: string | null; trial_expires_at?: string | null;
};
export type BusinessStatus = "active" | "expired" | "suspended" | "inactive";
export function businessListStatus(business: BusinessListRow, now: number): BusinessStatus {
  if (business.disabled_reason === "manually_suspended") return "suspended";
  if (business.disabled_reason === "subscription_expired" || (business.subscription_expires_at && Date.parse(business.subscription_expires_at) <= now)) return "expired";
  return business.is_active ? "active" : "inactive";
}
export function selectBusinessPage(rows: BusinessListRow[], options: { search: string; status: string; sort: string; page: number }, now: number) {
  const needle = options.search.toLowerCase().trim();
  const filtered = rows.filter(b => {
    const statusMatches = options.status === "all" || businessListStatus(b,now) === options.status
      || (options.status === "restricted" && ["suspended","inactive"].includes(businessListStatus(b,now)))
      || (options.status === "trial_ending" && b.subscription_status === "trialing" && b.trial_expires_at && Date.parse(b.trial_expires_at) > now && Date.parse(b.trial_expires_at) <= now + 7 * 86400000);
    return (!needle || [b.name,b.business_code,b.slug].some(value => value?.toLowerCase().includes(needle))) && statusMatches;
  });
  filtered.sort((a,b) => {
    if (options.sort === "name") return a.name.localeCompare(b.name,"en") || a.id.localeCompare(b.id);
    if (options.sort === "expiry") return (a.subscription_expires_at ? Date.parse(a.subscription_expires_at) : Infinity) - (b.subscription_expires_at ? Date.parse(b.subscription_expires_at) : Infinity) || a.id.localeCompare(b.id);
    return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const page = Math.min(pages, Math.max(1, Number.isFinite(options.page) ? Math.floor(options.page) : 1));
  return { rows: filtered.slice((page-1)*20,page*20), total: filtered.length, pages, page };
}
