import BackToSettingsLink from "@/components/settings/back-to-settings-link";
import { requirePermission } from "@/lib/auth/require-permission";
import { supabaseAdmin } from "@/lib/supabase/admin";

import BranchesClient, {
  type BranchManagerOption,
  type BranchViewModel,
} from "./branches-client";

type LocationRow = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  city: string | null;
  state_region: string | null;
  timezone: string | null;
  opening_hours: string | null;
  notes: string | null;
  manager_user_id: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
};

type MemberRow = {
  user_id: string;
  role: string;
  is_active: boolean;
  default_location_id: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type OrderRow = {
  location_id: string | null;
  total: number | string | null;
};

type StockRow = {
  location_id: string;
  quantity: number | null;
};

export default async function LocationsPage() {
  const business = await requirePermission("locations.manage");

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const [locationsResult, membersResult, ordersResult, stockResult] =
    await Promise.all([
      supabaseAdmin
        .from("business_locations")
        .select(`
          id,
          name,
          code,
          address,
          phone,
          city,
          state_region,
          timezone,
          opening_hours,
          notes,
          manager_user_id,
          is_default,
          is_active,
          created_at
        `)
        .eq("business_id", business.id)
        .order("is_default", { ascending: false })
        .order("name"),
      supabaseAdmin
        .from("business_members")
        .select("user_id,role,is_active,default_location_id")
        .eq("business_id", business.id),
      supabaseAdmin
        .from("orders")
        .select("location_id,total")
        .eq("business_id", business.id)
        .eq("status", "completed")
        .gte("created_at", today.toISOString()),
      supabaseAdmin
        .from("product_location_stock")
        .select("location_id,quantity")
        .eq("business_id", business.id),
    ]);

  if (locationsResult.error) {
    throw new Error(
      `Unable to load branches: ${locationsResult.error.message}. Run the branch-management migration if this is the first deploy of the new Branches UI.`,
    );
  }
  if (membersResult.error) throw new Error(membersResult.error.message);
  if (ordersResult.error) throw new Error(ordersResult.error.message);
  if (stockResult.error) throw new Error(stockResult.error.message);

  const locations = (locationsResult.data ?? []) as LocationRow[];
  const members = (membersResult.data ?? []) as MemberRow[];
  const orders = (ordersResult.data ?? []) as OrderRow[];
  const stocks = (stockResult.data ?? []) as StockRow[];

  const userIds = Array.from(
    new Set(
      members
        .map((member) => member.user_id)
        .filter(Boolean),
    ),
  );

  let profiles: ProfileRow[] = [];
  if (userIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,email")
      .in("id", userIds);
    if (error) throw new Error(error.message);
    profiles = (data ?? []) as ProfileRow[];
  }

  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));

  const managerOptions: BranchManagerOption[] = members
    .filter(
      (member) =>
        member.is_active &&
        ["owner", "admin", "manager"].includes(member.role),
    )
    .map((member) => {
      const profile = profileMap.get(member.user_id);
      return {
        id: member.user_id,
        name: profile?.full_name?.trim() || profile?.email || "Business user",
        email: profile?.email ?? "",
        role: member.role,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const todaySales = new Map<string, number>();
  for (const order of orders) {
    if (!order.location_id) continue;
    const amount = Number(order.total ?? 0);
    todaySales.set(
      order.location_id,
      (todaySales.get(order.location_id) ?? 0) +
        (Number.isFinite(amount) ? amount : 0),
    );
  }

  const inventory = new Map<string, number>();
  for (const stock of stocks) {
    inventory.set(
      stock.location_id,
      (inventory.get(stock.location_id) ?? 0) + Number(stock.quantity ?? 0),
    );
  }

  const staffCount = new Map<string, number>();
  for (const member of members) {
    if (!member.is_active || !member.default_location_id) continue;
    staffCount.set(
      member.default_location_id,
      (staffCount.get(member.default_location_id) ?? 0) + 1,
    );
  }

  const branches: BranchViewModel[] = locations.map((location) => {
    const manager = location.manager_user_id
      ? profileMap.get(location.manager_user_id)
      : null;

    return {
      id: location.id,
      name: location.name,
      code: location.code,
      address: location.address ?? "",
      phone: location.phone ?? "",
      city: location.city ?? "",
      stateRegion: location.state_region ?? "",
      timezone: location.timezone ?? "Asia/Phnom_Penh",
      openingHours: location.opening_hours ?? "",
      notes: location.notes ?? "",
      managerUserId: location.manager_user_id ?? "",
      managerName:
        manager?.full_name?.trim() || manager?.email || "Not assigned",
      isDefault: location.is_default,
      isActive: location.is_active,
      createdAt: location.created_at,
      todaySales: todaySales.get(location.id) ?? 0,
      staffCount: staffCount.get(location.id) ?? 0,
      inventoryCount: inventory.get(location.id) ?? 0,
    };
  });

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-5 pb-10">
      <BackToSettingsLink />
      <BranchesClient
        businessName={business.name}
        branches={branches}
        managerOptions={managerOptions}
      />
    </main>
  );
}
