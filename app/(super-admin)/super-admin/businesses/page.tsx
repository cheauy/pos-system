import Link from "next/link";
import { expireDueBusinesses } from "@/lib/subscriptions/expire-businesses";
import {
  Building2,
  Plus,
} from "lucide-react";
import SuperAdminHeader from "@/components/super-admin/super-admin-header";
import { requireSuperAdmin } from
  "@/lib/auth/require-super-admin";
import type { ProductMode } from
  "@/lib/business/types";
import { supabaseAdmin } from
  "@/lib/supabase/admin";

import BusinessActions from
  "@/components/super-admin/business-actions";

type BusinessRow = {
  id: string;
  business_code: string;
  name: string;
  slug: string;
  owner_id: string | null;
  product_mode: ProductMode;
  max_staff: number;
  is_active: boolean;
  disabled_at: string | null;
   disabled_reason: string | null;
  scheduled_deletion_at: string | null;
  subscription_months: number | null;
subscription_started_at: string | null;
subscription_expires_at: string | null;
  created_at: string;
};

type OwnerProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
}

type BusinessDisplayStatus =
  | "active"
  | "suspended"
  | "expired"
  | "inactive";

function getBusinessDisplayStatus(
  business: BusinessRow,
): BusinessDisplayStatus {
  const expiryTimestamp =
    business.subscription_expires_at
      ? new Date(
          business.subscription_expires_at,
        ).getTime()
      : null;

  const isExpired =
    expiryTimestamp !== null &&
    !Number.isNaN(expiryTimestamp) &&
    expiryTimestamp <= Date.now();

  if (
    business.disabled_reason ===
    "manually_suspended"
  ) {
    return "suspended";
  }

  if (
    business.disabled_reason ===
      "subscription_expired" ||
    isExpired
  ) {
    return "expired";
  }

  if (business.is_active) {
    return "active";
  }

  return "inactive";
}

function getSubscriptionPackageMonths(
  startedAt: string | null,
  expiresAt: string | null,
) {
  if (!startedAt || !expiresAt) {
    return null;
  }

  const start = new Date(startedAt);
  const expiry = new Date(expiresAt);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(expiry.getTime()) ||
    expiry <= start
  ) {
    return null;
  }

  let months =
    (expiry.getFullYear() -
      start.getFullYear()) *
      12 +
    (expiry.getMonth() -
      start.getMonth());

  if (
    expiry.getDate() >
    start.getDate()
  ) {
    months += 1;
  }

  return Math.max(1, months);
}

type BusinessesPageProps = {
  searchParams: Promise<{
    search?: string;
     status?: string;
  }>;
};

function SummaryCard({
  title,
  value,
  color,
}: {
  title: string;
  value: number;
  color: "slate" | "emerald" | "red";
}) {
  const styles = {
    slate: {
      bg: "bg-slate-50",
      text: "text-slate-700",
      value: "text-slate-900",
    },
    emerald: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      value: "text-emerald-800",
    },
    red: {
      bg: "bg-red-50",
      text: "text-red-700",
      value: "text-red-800",
    },
  };

  const style = styles[color];

  return (
    <div className={`rounded-2xl border border-slate-200 ${style.bg} p-5 shadow-sm`}>
      <p className={`text-sm font-medium ${style.text}`}>
        {title}
      </p>

      <p className={`mt-2 text-3xl font-bold ${style.value}`}>
        {value}
      </p>
    </div>
  );
}

function getBusinessStatusBadge(
  status: BusinessDisplayStatus,
) {
  switch (status) {
    case "active":
      return {
        label: "Active",
        className:
          "bg-emerald-50 text-emerald-700",
      };

    case "suspended":
      return {
        label: "Suspended",
        className:
          "bg-amber-50 text-amber-700",
      };

    case "expired":
      return {
        label: "Expired",
        className:
          "bg-red-50 text-red-700",
      };

    default:
      return {
        label: "Inactive",
        className:
          "bg-slate-100 text-slate-700",
      };
  }
}

export default async function BusinessesPage({
  searchParams,
}: BusinessesPageProps) {
  const admin = await requireSuperAdmin();
  await expireDueBusinesses();
  const params = await searchParams;
const search = params.search?.trim() ?? "";
const status = params.status ?? "all";

let businessesQuery = supabaseAdmin
  .from("businesses")
  .select(`
    id,
    business_code,
    name,
    slug,
    owner_id,
    product_mode,
    max_staff,
    disabled_at,
    disabled_reason,
    scheduled_deletion_at,
    subscription_months,
    subscription_started_at,
    subscription_expires_at,
    is_active,
    created_at
  `)
  .order("created_at", {
    ascending: false,
  });

if (search) {
  const safeSearch = search.replace(
    /[%_,()]/g,
    "",
  );

  businessesQuery = businessesQuery.or(
    `business_code.ilike.%${safeSearch}%,name.ilike.%${safeSearch}%`,
  );
}

if (status === "active") {
  businessesQuery = businessesQuery.eq(
    "is_active",
    true,
  );
}

if (status === "inactive") {
  businessesQuery = businessesQuery.eq(
    "is_active",
    false,
  );
}

const {
  data,
  error,
} = await businessesQuery;
    
  

  if (error) {
    throw new Error(
      `Unable to load businesses: ${error.message}`,
    );
  }

  const businesses =
    (data ?? []) as BusinessRow[];
    const ownerIds = businesses
  .map((business) => business.owner_id)
  .filter(
    (ownerId): ownerId is string =>
      Boolean(ownerId),
  );

const businessIds = businesses.map(
  (business) => business.id,
);

const staffCountMap = new Map<string, number>();

if (businessIds.length > 0) {
  const {
    data: staffMembers,
    error: staffError,
  } = await supabaseAdmin
    .from("business_members")
    .select("business_id")
    .in("business_id", businessIds)
    .eq("is_active", true)
    .neq("role", "owner");

  if (staffError) {
    throw new Error(
      `Unable to load staff counts: ${staffError.message}`,
    );
  }

  for (const member of staffMembers ?? []) {
    const currentCount =
      staffCountMap.get(member.business_id) ?? 0;

    staffCountMap.set(
      member.business_id,
      currentCount + 1,
    );
  }
}

let owners: OwnerProfile[] = [];

if (ownerIds.length > 0) {
  const {
    data: ownerData,
    error: ownersError,
  } = await supabaseAdmin
    .from("profiles")
    .select(`
      id,
      full_name,
      email
    `)
    .in("id", ownerIds);

  if (ownersError) {
    throw new Error(
      `Unable to load business owners: ${ownersError.message}`,
    );
  }

  owners = (ownerData ?? []) as OwnerProfile[];
}

const ownerMap = new Map(
  owners.map((owner) => [owner.id, owner]),
);

const totalBusinesses =
  businesses.length;

const activeBusinesses =
  businesses.filter(
    (business) =>
      getBusinessDisplayStatus(
        business,
      ) === "active",
  ).length;

const suspendedBusinesses =
  businesses.filter(
    (business) =>
      getBusinessDisplayStatus(
        business,
      ) === "suspended",
  ).length;

const expiredBusinesses =
  businesses.filter(
    (business) =>
      getBusinessDisplayStatus(
        business,
      ) === "expired",
  ).length;

  return (
    <main className="min-h-screen bg-slate-100 p-6">

      <div className="mx-auto max-w-7xl">
                    <SuperAdminHeader
  fullName={admin.fullName}
  email={admin.email}
/>
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-blue-100 p-3 text-blue-700">
              <Building2 size={26} />
            </div>

            <div>
              <h1 className="text-3xl font-bold text-slate-900">
                Customer Businesses
              </h1>

              <p className="mt-1 text-slate-500">
                Manage all POS customer workspaces.
              </p>
            </div>
          </div>

          <Link
            href="/super-admin/businesses/new"
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
          >
            <Plus size={18} />
            New Business
          </Link>
        </div>

<form
  method="GET"
  className="mb-6 flex flex-wrap items-center gap-3"
>
  <input
    type="search"
    name="search"
    defaultValue={search}
    placeholder="Search business..."
    className="h-11 w-full max-w-md rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
  />

  <select
    name="status"
    defaultValue={status}
    className="h-11 rounded-xl border border-slate-300 px-4"
  >
    <option value="all">
      All
    </option>

    <option value="active">
      Active
    </option>

    <option value="inactive">
      Inactive
    </option>
  </select>

  <button
    type="submit"
    className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white"
  >
    Filter
  </button>

  <Link
    href="/super-admin/businesses"
    className="rounded-xl border px-5 py-3"
  >
    Reset
  </Link>
</form>
<div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
  <SummaryCard
    title="Total Business"
    value={totalBusinesses}
    color="slate"
  />

  <SummaryCard
    title="Active Business"
    value={activeBusinesses}
    color="emerald"
  />

  <SummaryCard
    title="Suspended Business"
    value={suspendedBusinesses}
    color="red"
  />
</div>
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          
  <div className="overflow-x-auto">
    <table className="w-full min-w-[1350px]">
      <thead className="bg-slate-50">
        <tr>
  <th className="px-6 py-4 text-left">
    Business
  </th>

  <th className="px-6 py-4 text-left">
    Business Owner
  </th>

  <th className="px-6 py-4 text-left">
    Product Mode
  </th>

  <th className="px-6 py-4 text-left">
    Subscription
  </th>

  <th className="px-6 py-4 text-left">
    Status
  </th>

  <th className="px-6 py-4 text-left">
    Created
  </th>

  <th className="px-6 py-4 text-left">
    Actions
  </th>
</tr>
      </thead>

      <tbody className="divide-y divide-slate-200">
        {businesses.map((business) => {
          const owner = business.owner_id
            ? ownerMap.get(business.owner_id)
            : null;
        const status =
    getBusinessDisplayStatus(
      business,
    );

  const packageMonths =
  getSubscriptionPackageMonths(
    business.subscription_started_at,
    business.subscription_expires_at,
  );

  const statusBadge =
    getBusinessStatusBadge(
      status,
    );

          return (
            <tr key={business.id}>
              <td className="px-6 py-4">
                <p className="font-semibold text-slate-900">
                  {business.name}
                </p>

              </td>

              <td className="px-6 py-4">
                <p className="font-semibold text-slate-900">
                  {owner?.full_name ??
                    "Unknown owner"}
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  {owner?.email ??
                    "No email available"}
                </p>
              </td>

              <td className="px-6 py-4">
                <span className="inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                  {formatProductMode(
                    business.product_mode,
                  )}
                </span>
              </td>

              <td className="px-6 py-5">
                  <div className="flex flex-col gap-1">
    <span className="font-semibold text-slate-900">
  {packageMonths
    ? `${packageMonths} ${
        packageMonths === 1
          ? "month"
          : "months"
      }`
    : "No plan"}
</span>

    {business.subscription_expires_at && (
      <span className="text-xs text-slate-500">
        Expires{" "}
        {new Date(
          business.subscription_expires_at,
        ).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </span>
    )}
  </div>
                </td>

                
              <td className="px-6 py-4">
                <span
          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusBadge.className}`}
        >
                 {statusBadge.label}
                </span>
              </td>

          

              <td className="px-6 py-4 text-sm text-slate-600">
                {new Intl.DateTimeFormat(
                  "en-GB",
                  {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  },
                ).format(
                  new Date(
                    business.created_at,
                  ),
                )}
              </td>

              <td className="px-6 py-4">
            <BusinessActions
  business={{
    id: business.id,
    name: business.name,
    product_mode: business.product_mode,
    max_staff: business.max_staff,
    is_active: business.is_active,
   subscription_expires_at:
  business.subscription_expires_at
    ? String(
        business.subscription_expires_at,
      )
    : null,
  }}
/>
              </td>
            </tr>
          );
        })}

        {businesses.length === 0 && (
          <tr>
            <td
              colSpan={7}
              className="px-6 py-12 text-center text-slate-500"
            >
              No customer businesses found.
            </td>
          </tr>
        )}
      </tbody>
    </table>
  </div>
</section>
      </div>
    </main>
  );
}

function formatProductMode(
  mode: ProductMode,
) {
  switch (mode) {
    case "standard":
      return "Standard";

    case "variant":
      return "Variant";

    case "configurable":
      return "Configurable";
  }
}


