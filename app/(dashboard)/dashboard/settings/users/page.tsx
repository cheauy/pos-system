import {
  redirect,
} from "next/navigation";
import {
  CalendarDays,
  ShieldCheck,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";

import {
  requireAnyPermission,
} from "@/lib/auth/require-permission";
import {
  supabaseAdmin,
} from "@/lib/supabase/admin";
import type {
  BusinessRole,
} from "@/lib/business/types";
import CreateBusinessUserForm from
  "@/components/settings/create-user-form";
import UpdateMemberRoleForm from
  "@/components/settings/update-member-role-form";
import DeleteUserButton from "./delete-user-button";
import {
  ToggleUserStatusButton,
} from "./user-status-button";

type Membership = {
  id: string;
  user_id: string;
  role: BusinessRole;
  is_active: boolean;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type BusinessUser = Membership & {
  fullName: string;
  email: string;
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
  }>;
}) {
  const { error } = await searchParams;
  const business =
    await requireAnyPermission([
      "users.view",
      "users.create",
      "users.create_limited",
    ]);

  if (
    !["owner", "admin"].includes(
      business.role,
    )
  ) {
    redirect("/dashboard");
  }

  const {
    data: businessData,
    error: businessError,
  } = await supabaseAdmin
    .from("businesses")
    .select("max_staff")
    .eq("id", business.id)
    .maybeSingle();

  if (businessError) {
    throw new Error(
      businessError.message,
    );
  }

  const {
    data: membershipData,
    error: membershipError,
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

  if (membershipError) {
    throw new Error(
      membershipError.message,
    );
  }

  const memberships =
    (membershipData ?? []) as Membership[];

  const userIds = memberships.map(
    (membership) =>
      membership.user_id,
  );

  let profiles: Profile[] = [];

  if (userIds.length > 0) {
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
      .in("id", userIds);

    if (profileError) {
      throw new Error(
        profileError.message,
      );
    }

    profiles =
      (profileData ?? []) as Profile[];
  }

  const profileMap = new Map(
    profiles.map((profile) => [
      profile.id,
      profile,
    ]),
  );

  const users: BusinessUser[] =
    memberships.map((membership) => {
      const profile =
        profileMap.get(
          membership.user_id,
        );

      return {
        ...membership,
        fullName:
          profile?.full_name ??
          "Unnamed user",
        email:
          profile?.email ??
          "No email",
      };
    });

  const staffUsers = users.filter(
    (user) =>
      user.role !== "owner",
  );

  const activeStaffCount =
    staffUsers.filter(
      (user) => user.is_active,
    ).length;

  const disabledStaffCount =
    staffUsers.filter(
      (user) => !user.is_active,
    ).length;

  const maxStaff = Number(
    businessData?.max_staff ?? 3,
  );

  const availableSlots = Math.max(
    0,
    maxStaff - activeStaffCount,
  );

  return (
    <main>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Users size={24} />
          </div>

          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              Users
            </h1>

            <p className="mt-1 text-slate-500">
              Manage users for {business.name}
            </p>
          </div>
        </div>

        <div className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <ShieldCheck
            size={18}
            className="text-blue-600"
          />

          <span className="text-sm text-slate-500">
            Product mode:
          </span>

          <span className="text-sm font-bold capitalize text-slate-900">
            {business.productMode}
          </span>
        </div>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={<UserCheck size={20} />}
          label="Active staff"
          value={`${activeStaffCount} / ${maxStaff}`}
          description={`${availableSlots} slots available`}
        />

        <SummaryCard
          icon={<UserMinus size={20} />}
          label="Disabled users"
          value={String(
            disabledStaffCount,
          )}
          description="Accounts without access"
        />

        <SummaryCard
          icon={<Users size={20} />}
          label="Total users"
          value={String(users.length)}
          description="Including business owner"
        />
      </div>
{error && (
  <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
    ⚠️ {error}
  </div>
)}
      <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        <CreateBusinessUserForm
          currentRole={business.role}
        />

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck
                  size={20}
                  className="text-blue-600"
                />

                <h2 className="text-xl font-bold text-slate-900">
                  Business Users
                </h2>
              </div>

              <p className="mt-1 text-sm text-slate-500">
                Manage roles, account access and users
              </p>
            </div>

            <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700">
              {users.length}{" "}
              {users.length === 1
                ? "user"
                : "users"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
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
                    Created
                  </th>

                  <th className="px-6 py-4 text-right">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {users.map((member) => {
                  const canManage =
                    member.role !== "owner" &&
                    (
                      business.role ===
                        "owner" ||
                      (
                        business.role ===
                          "admin" &&
                        [
                          "editor",
                          "viewer",
                        ].includes(
                          member.role,
                        )
                      )
                    );

                  return (
                    <tr
                      key={member.id}
                      className="transition hover:bg-slate-50/70"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-600">
                            {getInitials(
                              member.fullName,
                            )}
                          </div>

                          <div>
                            <p className="font-semibold text-slate-900">
                              {member.fullName}
                            </p>

                            <p className="mt-0.5 text-sm text-slate-500">
                              {member.email}
                            </p>
                          </div>
                        </div>
                      </td>
 <td className="px-6 py-4">
    {member.role === "owner" ? (
      <span className="inline-flex rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600">
        Owner
      </span>
    ) : (
      <UpdateMemberRoleForm
        memberId={member.id}
        currentMemberRole={member.role}
        loggedInRole={business.role}
      />
    )}
  </td>

                      <td className="px-6 py-4">
                        <span
                          className={
                            member.is_active
                              ? activeClass
                              : inactiveClass
                          }
                        >
                          <span
                            className={
                              member.is_active
                                ? activeDotClass
                                : inactiveDotClass
                            }
                          />

                          {member.is_active
                            ? "Active"
                            : "Disabled"}
                        </span>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <CalendarDays
                            size={16}
                            className="text-slate-400"
                          />

                          {formatDate(
                            member.created_at,
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          {canManage ? (
                            <>
                              <ToggleUserStatusButton
                                  memberId={member.id}
                                  isActive={member.is_active}
                                />

                              <DeleteUserButton
                                memberId={
                                  member.id
                                }
                                userName={
                                  member.fullName
                                }
                              />
                            </>
                          ) : (
                            <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-500">
                              Protected
                            </span>
                          )}
                        </div>
                      </td>
                 </tr>
                  );
                })}

                {users.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-6 py-16 text-center text-slate-500"
                    >
                      No business users found.
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
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">
            {label}
          </p>

          <p className="mt-2 text-2xl font-bold text-slate-900">
            {value}
          </p>

          <p className="mt-1 text-sm text-slate-500">
            {description}
          </p>
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          {icon}
        </div>
      </div>
    </div>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) =>
      part.charAt(0).toUpperCase(),
    )
    .join("");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(
    "en-GB",
    {
      day: "2-digit",
      month: "short",
      year: "numeric",
    },
  ).format(new Date(value));
}

const activeClass =
  "inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700";

const inactiveClass =
  "inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700";

const activeDotClass =
  "h-2 w-2 rounded-full bg-emerald-500";

const inactiveDotClass =
  "h-2 w-2 rounded-full bg-red-500";

const disableButtonClass =
  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-amber-700 transition hover:bg-amber-50";

const enableButtonClass =
  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50";
