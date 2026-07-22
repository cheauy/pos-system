import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { count: productCount } = await supabase
    .from("products")
    .select("*", { count: "exact", head: true });

  const { count: categoryCount } = await supabase
    .from("categories")
    .select("*", { count: "exact", head: true });

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">
            Dashboard
          </h1>

          <p className="mt-1 text-slate-500">
            Welcome, {user.email}
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <DashboardCard
            title="Total Products"
            value={productCount ?? 0}
          />

          <DashboardCard
            title="Categories"
            value={categoryCount ?? 0}
          />

          <DashboardCard title="Today's Orders" value={0} />

          <DashboardCard title="Today's Sales" value="$0.00" />
        </div>
      </div>
    </main>
  );
}

function DashboardCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">
        {title}
      </p>

      <p className="mt-3 text-3xl font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}