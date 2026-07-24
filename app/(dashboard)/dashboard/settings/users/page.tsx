import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import DeleteUserButton from "./delete-user-button";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import CreateUserForm from "./create-user-form";

type Profile = {
  id: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
};

export default async function UsersPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  const {
    data: currentProfile,
    error: currentProfileError,
  } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (currentProfileError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-bold text-red-700">
          Unable to load your profile
        </h1>

        <p className="mt-2 text-sm text-red-600">
          {currentProfileError.message}
        </p>
      </div>
    );
  }

 const canManageUsers =
  currentProfile?.role === "owner" ||
  currentProfile?.role === "admin";

if (
  !currentProfile ||
  !canManageUsers ||
  !currentProfile.is_active
) {
  redirect("/dashboard");
}
    

  if (!canManageUsers) {
    return (
      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6">
        <h1 className="text-xl font-bold text-yellow-800">
          Access denied
        </h1>

        <p className="mt-2 text-sm text-yellow-700">
          Only the Owner or Admin can manage users.
        </p>

        <p className="mt-2 text-sm text-yellow-700">
          Current role: {currentProfile?.role ?? "unknown"}
        </p>
      </div>
    );
  }

  if (!currentProfile.is_active) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-bold text-red-700">
          Account inactive
        </h1>
      </div>
    );
  }

  const {
    data: profiles,
    error: profilesError,
  } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, full_name, role, is_active, created_at",
    )
    .order("created_at", {
      ascending: false,
    });

  if (profilesError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-bold text-red-700">
          Unable to load users
        </h1>

        <p className="mt-2 text-sm text-red-600">
          {profilesError.message}
        </p>
      </div>
    );
  }

  const {
    data: authUsersData,
    error: authUsersError,
  } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });

  if (authUsersError) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-bold text-red-700">
          Unable to load authentication users
        </h1>

        <p className="mt-2 text-sm text-red-600">
          {authUsersError.message}
        </p>
      </div>
    );
  }

  const emailByUserId = new Map(
    authUsersData.users.map((authUser) => [
      authUser.id,
      authUser.email ?? "No email",
    ]),
  );

  const userProfiles =
    (profiles ?? []) as Profile[];

  return (
    <div className="space-y-6">
      <div>
        <Link
      href="/dashboard/settings"
     className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-blue-600"
    >
      <ArrowLeft size={18} />
      Back to Settings
    </Link>

        <h1 className="text-2xl font-bold">
          Users
        </h1>

        <p className="text-sm text-gray-500">
          Create and manage employee accounts.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <CreateUserForm />

        <div className="overflow-hidden rounded-xl border bg-white">
          <div className="border-b p-4">
            <h2 className="font-semibold">
              System Users
            </h2>

            <p className="text-sm text-gray-500">
              {userProfiles.length} user(s)
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm">
                    Name
                  </th>

                  <th className="px-4 py-3 text-left text-sm">
                    Email
                  </th>

                  <th className="px-4 py-3 text-left text-sm">
                    Role
                  </th>

                  <th className="px-4 py-3 text-left text-sm">
                    Status
                  </th>

                  <th className="px-4 py-3 text-right text-sm">
                      Action
                    </th>
                </tr>
              </thead>

              <tbody>
                {userProfiles.map((profile) => (
                  <tr
                    key={profile.id}
                    className="border-t"
                  >
                    <td className="px-4 py-3">
                      {profile.full_name ||
                        "Unnamed user"}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-600">
                      {emailByUserId.get(
                        profile.id,
                      ) ?? "Unknown"}
                    </td>

                    <td className="px-4 py-3">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium capitalize text-blue-700">
                        {profile.role}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <span
                        className={
                          profile.is_active
                            ? "rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700"
                            : "rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
                        }
                      >
                        {profile.is_active
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </td>

                        <td className="px-4 py-3 text-right">
  <DeleteUserButton
    userId={profile.id}
    userName={
      profile.full_name ||
      emailByUserId.get(profile.id) ||
      "this user"
    }
    disabled={
      profile.id === user.id ||
      profile.role === "owner" ||
      (
        currentProfile.role === "admin" &&
        profile.role === "admin"
      )
    }
  />
</td>
                  </tr>
                ))}

                {userProfiles.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="p-8 text-center text-gray-500"
                    >
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}