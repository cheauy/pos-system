import { Trash2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  createCategory,
  deleteCategory,
} from "./actions";

type Category = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export default async function CategoriesPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, description, created_at")
    .order("created_at", {
      ascending: false,
    });

  const categories = (data ?? []) as Category[];

  return (
    <main>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">
          Categories
        </h1>

        <p className="mt-1 text-slate-500">
          Organize your products into categories
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">
            Add Category
          </h2>

          <form action={createCategory} className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Category name
              </label>

              <input
                id="name"
                name="name"
                type="text"
                required
                minLength={2}
                placeholder="Example: Drinks"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <div>
              <label
                htmlFor="description"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Description
              </label>

              <textarea
                id="description"
                name="description"
                rows={4}
                placeholder="Optional description"
                className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              Add Category
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-semibold text-slate-900">
              Category List
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              {categories.length} categories
            </p>
          </div>

          {error ? (
            <div className="p-6 text-red-600">
              {error.message}
            </div>
          ) : categories.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-medium text-slate-700">
                No categories yet
              </p>

              <p className="mt-1 text-sm text-slate-500">
                Create your first category using the form.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {categories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between gap-4 px-6 py-5"
                >
                  <div>
                    <h3 className="font-semibold text-slate-900">
                      {category.name}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {category.description || "No description"}
                    </p>
                  </div>

                  <form action={deleteCategory}>
                    <input
                      type="hidden"
                      name="categoryId"
                      value={category.id}
                    />

                    <button
                      type="submit"
                      aria-label={`Delete ${category.name}`}
                      className="rounded-lg p-2 text-red-600 transition hover:bg-red-50"
                    >
                      <Trash2 size={19} />
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}