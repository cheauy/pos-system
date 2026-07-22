import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const { error } = await supabase
    .from("products")
    .select("id")
    .limit(1);

  const connected =
    !error || error.code === "PGRST205" || error.code === "42P01";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-3xl font-bold text-slate-900">
          POS System
        </h1>

        <p className="mt-3 text-slate-600">
          Supabase connection:
        </p>

        <p
          className={`mt-2 font-semibold ${
            connected ? "text-green-600" : "text-red-600"
          }`}
        >
          {connected ? "Connected successfully" : "Connection failed"}
        </p>

        {error && (
          <p className="mt-4 break-words text-sm text-slate-500">
            {error.message}
          </p>
        )}
      </div>
    </main>
  );
}