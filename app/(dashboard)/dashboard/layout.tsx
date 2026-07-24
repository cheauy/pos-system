import { redirect } from "next/navigation";

import LogoutButton from "@/components/logout-button";
import { createClient } from "@/lib/supabase/server";

import SidebarClient from "./sidebar-client";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

return (
  <div className="min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <SidebarClient />

    <div className="lg:pl-64">
      <header className="flex h-20 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Signed in as
          </p>

          <p className="font-medium text-slate-900 dark:text-slate-100">
            {user.email}
          </p>
        </div>

        <LogoutButton />
      </header>

      <main className="p-6">
        {children}
      </main>
    </div>
  </div>
);
}