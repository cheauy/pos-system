import Link from "next/link";
import { ExtendSubscriptionForm } from "./extend-subscription-form";
import { expireDueBusinesses } from "@/lib/subscriptions/expire-businesses";
import { BusinessActivityHistory } from "./business-activity-history";
import {
  extendBusinessSubscription,
} from "../actions";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Mail,
  Package,
  Users,
} from "lucide-react";
import {
  ToggleAndDeleteActions,
  BusinessStatusActions,
} from "@/components/super-admin/business-actions";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SubscriptionHistory } from "./subscription-history";
type PageProps = {
  params: Promise<{
    id: string;
    
  }>;
  
};

type OwnerProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type BusinessMember = {
  id: string;
  user_id: string;
  role: string;
  is_active: boolean;
  created_at: string;
};

type MemberProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

function BusinessStatusCard({
  isActive,
  createdAt,
  disabledAt,
  disabledReason,
  scheduledDeletionAt,
  subscriptionStartedAt,
  subscriptionExpiresAt,
}: {
  isActive: boolean;
  createdAt: string;
  disabledAt: string | null;
  disabledReason: string | null;
  scheduledDeletionAt: string | null;
  subscriptionStartedAt: string | null;
  subscriptionExpiresAt: string | null;
}) {
  const subscription =
    getSubscriptionInfo(
      subscriptionExpiresAt,
    );

  const deletionDaysRemaining =
  getDeletionDaysRemaining(
    scheduledDeletionAt,
  );

const businessStatus =
  getBusinessStatus({
    is_active: isActive,
    disabled_reason: disabledReason,
    subscription_expires_at: subscriptionExpiresAt,
  });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
          <CalendarDays size={21} />
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Business Status
          </h2>

          <p className="text-sm text-slate-500">
            Account and subscription information.
          </p>
        </div>
      </div>

      <dl className="mt-6 divide-y divide-slate-100">
        
       <DetailRow
  label="Current status"
  value={<StatusBadge status={businessStatus} />}
/>

        <DetailRow
          label="Created"
          value={formatDateTime(createdAt)}
        />

        <DetailRow
          label="Subscription started"
          value={formatDateTime(
            subscriptionStartedAt,
          )}
        />

        <div className="flex items-center justify-between gap-6 py-4">
          <dt className="text-sm text-slate-500">
            Subscription expires
          </dt>

          <dd className="text-right">
            <p className="font-semibold text-slate-900">
              {formatDateTime(
                subscriptionExpiresAt,
              )}
            </p>

            {subscriptionExpiresAt && (
              <p
                className={`mt-1 text-xs font-semibold ${
                  subscription.state === "expired"
                    ? "text-red-600"
                    : subscription.state ===
                        "expiring"
                      ? "text-amber-600"
                      : "text-emerald-600"
                }`}
              >
                
              </p>
            )}
          </dd>
        </div>

  

        <DetailRow
          label="Disabled"
          value={formatDateTime(disabledAt)}
        />

        <DetailRow
  label="Permanent deletion"
  value={
    scheduledDeletionAt ? (
      <div className="text-right">
        <p>{formatDateTime(scheduledDeletionAt)}</p>

        {deletionDaysRemaining !== null && (
          <p className="text-xs text-red-600">
            {deletionDaysRemaining} day
            {deletionDaysRemaining === 1 ? "" : "s"} remaining
          </p>
        )}
      </div>
    ) : (
      "—"
    )
  }
/>
      </dl>

 {(businessStatus === "expired" ||
  businessStatus === "suspended") &&
  deletionDaysRemaining !== null && (
    <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5">
      <h3 className="font-semibold text-red-900">
        {businessStatus === "expired"
          ? "Subscription expired"
          : "Business suspended"}
      </h3>

      <p className="mt-1 text-sm text-red-700">
        This business is disabled and will be
        permanently deleted in{" "}
        <strong>
          {deletionDaysRemaining}{" "}
          {deletionDaysRemaining === 1
            ? "day"
            : "days"}
        </strong>
        .
      </p>

      <p className="mt-2 text-xs text-red-600">
        {businessStatus === "expired"
          ? "Reactivate the subscription before the deletion date to preserve the business and its data."
          : "Restore the business before the deletion date to preserve the business and its data."}
      </p>
    </div>
  )}

     

      {subscription.state ===
        "expiring" && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="font-semibold text-amber-900">
            Subscription expiring soon
          </p>

          <p className="mt-1 text-sm text-amber-700">
            {subscription.remainingText}.
            Extend the subscription before it
            expires.
          </p>
        </div>
      )}
    </section>
  );
}



export default async function BusinessDetailsPage({
 
  params,
}: PageProps) {
  await requireSuperAdmin();
  await expireDueBusinesses();
  const { id } = await params;

  const {
    data: business,
    error: businessError,
  } = await supabaseAdmin
    .from("businesses")
    .select(`
      id,
      business_code,
      name,
      slug,
      disabled_reason,
      owner_id,
      product_mode,
      max_staff,
      is_active,
      disabled_at,
      subscription_months,
      scheduled_deletion_at,
      subscription_started_at,
      subscription_expires_at,
      created_at
    `)
    .eq("id", id)
    .maybeSingle();

  if (businessError) {
    throw new Error(
      `Unable to load business: ${businessError.message}`,
    );
  }

  if (!business) {
    notFound();
  }

  let owner: OwnerProfile | null = null;

  if (business.owner_id) {
    const {
      data: ownerData,
      error: ownerError,
    } = await supabaseAdmin
      .from("profiles")
      .select(`
        id,
        full_name,
        email
      `)
      .eq("id", business.owner_id)
      .maybeSingle();

    if (ownerError) {
      throw new Error(
        `Unable to load owner: ${ownerError.message}`,
      );
    }

    owner = ownerData as OwnerProfile | null;
  }

  const {
    data: memberData,
    error: memberError,
  } = await supabaseAdmin
    .from("business_members")
    .select(`
      id,
      user_id,
      role,
      is_active,
      created_at
    `)
    .eq("business_id", business.id)
    .order("created_at", {
      ascending: true,
    });

  if (memberError) {
    throw new Error(
      `Unable to load business users: ${memberError.message}`,
    );
  }

  const members =
    (memberData ?? []) as BusinessMember[];

  const memberUserIds = members.map(
    (member) => member.user_id,
  );

  let profiles: MemberProfile[] = [];

  if (memberUserIds.length > 0) {
    const {
      data: profileData,
      error: profileError,
    } = await supabaseAdmin
      .from("profiles")
      .select(`
        id,
        full_name,
        email
      `)
      .in("id", memberUserIds);

    if (profileError) {
      throw new Error(
        `Unable to load user profiles: ${profileError.message}`,
      );
    }

    profiles =
      (profileData ?? []) as MemberProfile[];
  }

  const profileMap = new Map(
    profiles.map((profile) => [
      profile.id,
      profile,
    ]),
  );

  const activeStaffCount = members.filter(
    (member) =>
      member.is_active &&
      member.role !== "owner",
  ).length;

  const disabledStaffCount = members.filter(
  (member) =>
    !member.is_active &&
    member.role !== "owner",
).length;

  const maxStaff = Number(
    business.max_staff ?? 3,
  );

  const availableSlots = Math.max(
    0,
    maxStaff - activeStaffCount,
  );
  const subscriptionMonths = Number(
  business.subscription_months ?? 0,
);

const expiryDate = business.subscription_expires_at
  ? new Date(business.subscription_expires_at)
  : null;

const today = new Date();
const businessStatus =
  getBusinessStatus(business);

  const deletionDaysRemaining =
  getDeletionDaysRemaining(
    business.scheduled_deletion_at,
  );

const subscriptionLabel =
  formatRemainingSubscription(
    new Date(
      business.subscription_expires_at!,
    ),
  );

const daysRemaining = expiryDate
  ? Math.max(
      0,
      Math.ceil(
        (expiryDate.getTime() - today.getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    )
  : 0;



  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <Link
            href="/super-admin/businesses"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-blue-600"
          >
            <ArrowLeft size={17} />
            Back to Businesses
          </Link>

          <div className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-blue-100 p-4 text-blue-700">
                <Building2 size={28} />
              </div>

              <div>
                <h1 className="text-3xl font-bold text-slate-950">
                  {business.name}
                </h1>

                <p className="mt-1 text-slate-500">
                  View business information, users,
                  limits and account status.
                </p>
              </div>
            </div>


         <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <BusinessStatusActions
  businessId={business.id}
  businessName={business.name}
  isActive={business.is_active}
  disabledReason={
    business.disabled_reason
  }
  subscriptionExpiresAt={
    business.subscription_expires_at
  }
  currentMaxStaff={
    business.max_staff ?? 3
  }
/>
      
    <ToggleAndDeleteActions
  business={{
    id: business.id,
    name: business.name,
    product_mode:
      business.product_mode,
    max_staff:
      business.max_staff,
    is_active:
      business.is_active,
    subscription_expires_at:
      business.subscription_expires_at,
  }}
/>
   
</div>  
          
          </div>
          
        </header>
         
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
       <SummaryCard
  icon={<Users size={22} />}
  label="Staff usage"
  value={`${activeStaffCount} / ${maxStaff}`}
  description={
    disabledStaffCount > 0
      ? `${availableSlots} slots available · ${disabledStaffCount} disabled`
      : `${availableSlots} slots available`
  }
/>

          <SummaryCard
            icon={<Package size={22} />}
            label="Product mode"
            value={formatProductMode(
              business.product_mode,
            )}
            description="Products are unlimited"
          />

          <SummaryCard
            icon={<Package size={22} />}
            label="Products"
            value="Unlimited"
            description="No product limit"
          />

  <SummaryCard
  icon={<Package size={22} />}
  label="Subscription Package"
  value={subscriptionLabel}
  description={
    daysRemaining > 0
      ? `${daysRemaining} day${
          daysRemaining === 1 ? "" : "s"
        } remaining`
      : "Subscription expired"
  }
/>
        </section>
 

        <section className="grid gap-6 xl:grid-cols-2">
          <BusinessInformationCard
            business={{
              name: business.name,
              slug: business.slug,
              business_code:business.business_code,
              productMode:
                business.product_mode,
              createdAt:
                business.created_at,
            }}
            owner={owner}
          />

          <BusinessStatusCard
            isActive={business.is_active}
            createdAt={business.created_at}
             disabledReason={
    business.disabled_reason
  }
            disabledAt={business.disabled_at}
            scheduledDeletionAt={
              business.scheduled_deletion_at
            }
            subscriptionStartedAt={
    business.subscription_started_at
  }
  subscriptionExpiresAt={
    business.subscription_expires_at
  }
          />
        </section>
            
{businessStatus === "suspended" ? (
  <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
    <h2 className="text-xl font-bold text-amber-900">
      Subscription changes unavailable
    </h2>

    <p className="mt-1 text-sm text-amber-700">
      Restore this business before extending its subscription.
    </p>
  </section>
) : (
  <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 className="text-xl font-bold text-slate-900">
      Extend Subscription
    </h2>

    <p className="mt-1 text-sm text-slate-500">
      Selected months will be added to the current expiry date.
    </p>

   

    <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[1, 3, 5, 12].map((months) => (
        <ExtendSubscriptionForm
          key={months}
          businessId={business.id}
          businessName={business.name}
          months={months}
          action={extendBusinessSubscription}
        />
      ))}
    </div>
  </section>
)}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6">
            <h2 className="text-xl font-bold text-slate-900">
              Business Users
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Owner and staff accounts assigned to
              this workspace.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px]">
              <thead className="bg-slate-50">
                <tr className="text-left text-sm text-slate-600">
                  <th className="px-6 py-4">
                    User
                  </th>

                  <th className="px-6 py-4">
                    Role
                  </th>

                  <th className="px-6 py-4">
                    Status
                  </th>

                  <th className="px-6 py-4">
                    Added
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {members.map((member) => {
                  const profile =
                    profileMap.get(
                      member.user_id,
                    );

                  return (
                    <tr key={member.id}>
                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-900">
                          {profile?.full_name ??
                            "Unnamed user"}
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                          {profile?.email ??
                            "No email available"}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold capitalize text-blue-700">
                          {member.role}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={
                            member.is_active
                              ? "inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700"
                              : "inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"
                          }
                        >
                          {member.is_active
                            ? "Active"
                            : "Inactive"}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-sm text-slate-600">
                        {formatDate(
                          member.created_at,
                        )}
                      </td>
                    </tr>
                  );
                })}

                {members.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-6 py-12 text-center text-slate-500"
                    >
                      No users found for this
                      business.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
  
        </section>
         <BusinessActivityHistory
  businessId={business.id}
/>

               <SubscriptionHistory
  businessId={business.id}
/>
      </div>
    </main>
  );
}

export type BusinessStatus =
  | "active"
  | "expired"
  | "suspended"
  | "inactive";

export function getBusinessStatus(business: {
  is_active: boolean;
  disabled_reason: string | null;
  subscription_expires_at: string | null;
}): BusinessStatus {
  const isSubscriptionExpired =
    business.subscription_expires_at !== null &&
    new Date(
      business.subscription_expires_at,
    ).getTime() <= Date.now();

  if (
    business.disabled_reason === "subscription_expired" ||
    isSubscriptionExpired
  ) {
    return "expired";
  }

  if (
    business.disabled_reason === "manually_suspended"
  ) {
    return "suspended";
  }

  if (business.is_active) {
    return "active";
  }

  return "inactive";
}

function formatRemainingSubscription(
  expiryDate: Date,
): string {
  const now = new Date();

  if (expiryDate <= now) {
    return "Expired";
  }

  let years =
    expiryDate.getFullYear() -
    now.getFullYear();

  let months =
    expiryDate.getMonth() -
    now.getMonth();

  if (
    expiryDate.getDate() < now.getDate()
  ) {
    months--;
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  const parts: string[] = [];

  if (years > 0) {
    parts.push(
      `${years} Year${years > 1 ? "s" : ""}`,
    );
  }

  if (months > 0) {
    parts.push(
      `${months} Month${months > 1 ? "s" : ""}`,
    );
  }

  return parts.join(" ");
}

function SummaryCard({
  icon,
  label,
  value,
  description,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="w-fit rounded-xl bg-blue-50 p-3 text-blue-600">
        {icon}
      </div>

      <p className="mt-4 text-sm font-medium text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-2xl font-bold text-slate-900">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {description}
      </p>
    </div>
  );
}

function BusinessInformationCard({
  business,
  owner,
}: {
  business: {
    business_code: string;
    name: string;
    slug: string;
    productMode: string;
    createdAt: string;
  };
  owner: OwnerProfile | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-blue-50 p-3 text-blue-600">
          <Building2 size={21} />
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Business Information
          </h2>

          <p className="text-sm text-slate-500">
            Workspace and owner details.
          </p>
        </div>
      </div>

      <dl className="mt-6 divide-y divide-slate-100">
        <DetailRow
          label="Business ID"
          value={business.business_code}
        />

        <DetailRow
          label="Business name"
          value={business.name}
        />

        <DetailRow
          label="Slug"
          value={business.slug}
        />

        <DetailRow
          label="Owner"
          value={
            owner?.full_name ??
            "Unknown owner"
          }
        />

        <DetailRow
          label="Owner email"
          value={
            owner?.email ??
            "No email available"
          }
          icon={<Mail size={16} />}
        />

        <DetailRow
          label="Product mode"
          value={formatProductMode(
            business.productMode,
          )}
        />

        <DetailRow
          label="Products"
          value="Unlimited"
        />

        <DetailRow
          label="Orders"
          value="Unlimited"
        />
  
      </dl>
    </section>
  );
}
type SubscriptionState =
  | "active"
  | "expiring"
  | "expired"
  | "none";

function getSubscriptionInfo(
  expiresAt: string | null,
): {
  state: SubscriptionState;
  remainingText: string;
} {
  if (!expiresAt) {
    return {
      state: "none",
      remainingText:
        "No expiry date configured",
    };
  }

  const expiryTime =
    new Date(expiresAt).getTime();

  const now = Date.now();

  const difference =
    expiryTime - now;

  if (difference <= 0) {
    const expiredDays = Math.max(
      1,
      Math.ceil(
        Math.abs(difference) /
          86_400_000,
      ),
    );

    return {
      state: "expired",
      remainingText: `Expired ${expiredDays} ${
        expiredDays === 1
          ? "day"
          : "days"
      } ago`,
    };
  }

  const totalDays = Math.ceil(
    difference / 86_400_000,
  );

  if (totalDays <= 7) {
    return {
      state: "expiring",
      remainingText: `${totalDays} ${
        totalDays === 1
          ? "day"
          : "days"
      } remaining`,
    };
  }

  return {
    state: "active",
    remainingText: `${totalDays} days remaining`,
  };
}

function SubscriptionBadge({
  state,
}: {
  state:
    | "active"
    | "expiring"
    | "expired"
    | "none";
}) {
  if (state === "expired") {
    return (
      <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
        Expired
      </span>
    );
  }

  if (state === "expiring") {
    return (
      <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
        Expiring Soon
      </span>
    );
  }

  if (state === "active") {
    return (
      <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
        Active
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
      Not Set
    </span>
  );
}





function StaffUsageCard({
  currentStaff,
  maximumStaff,
}: {
  currentStaff: number;
  maximumStaff: number;
}) {
  const available = Math.max(
    0,
    maximumStaff - currentStaff,
  );

  const percentage = Math.min(
    100,
    Math.round(
      (currentStaff /
        Math.max(maximumStaff, 1)) *
        100,
    ),
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Staff Limit
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            The owner account is not included in
            this limit.
          </p>
        </div>

        <div className="text-left sm:text-right">
          <p className="text-3xl font-bold text-slate-900">
            {currentStaff} / {maximumStaff}
          </p>

          <p className="text-sm text-slate-500">
            {available} available slots
          </p>
        </div>
      </div>

      <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-200">
        <div
          className={
            currentStaff >= maximumStaff
              ? "h-full rounded-full bg-red-500"
              : percentage >= 80
                ? "h-full rounded-full bg-amber-500"
                : "h-full rounded-full bg-blue-600"
          }
          style={{
            width: `${percentage}%`,
          }}
        />
      </div>
    </section>
  );
}

function DetailRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-4">
      <dt className="text-sm text-slate-500">
        {label}
      </dt>

      <dd className="flex items-center gap-2 text-right font-semibold text-slate-900">
        {icon}
        {value}
      </dd>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: BusinessStatus;
}) {
  switch (status) {
    case "active":
      return (
        <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          Active
        </span>
      );

    case "expired":
      return (
        <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
          Expired
        </span>
      );

    case "suspended":
      return (
        <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
          Suspended
        </span>
      );

    default:
      return (
        <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          Inactive
        </span>
      );
  }
}

function getDeletionDaysRemaining(
  scheduledDeletionAt: string | null,
) {
  if (!scheduledDeletionAt) {
    return null;
  }

  const difference =
    new Date(
      scheduledDeletionAt,
    ).getTime() - Date.now();

  return Math.max(
    0,
    Math.ceil(
      difference /
        (1000 * 60 * 60 * 24),
    ),
  );
}

function formatProductMode(
  mode: string,
): string {
  return mode
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function formatDate(
  value: string | null,
): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(new Date(value));
}

function formatDateTime(
  value: string | null,
): string {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(new Date(value));
}

function calculateCountdown(
  targetDate: string,
): string {
  const difference =
    new Date(targetDate).getTime() -
    Date.now();

  if (difference <= 0) {
    return "Deletion date reached.";
  }

  const totalMinutes = Math.floor(
    difference / 60_000,
  );

  const days = Math.floor(
    totalMinutes / 1_440,
  );

  const hours = Math.floor(
    (totalMinutes % 1_440) / 60,
  );

  const minutes =
    totalMinutes % 60;

  return `${days}d ${hours}h ${minutes}m remaining`;
}