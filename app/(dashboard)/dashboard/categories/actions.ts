"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function createCategory(formData: FormData) {
  const name = formData.get("name");
  const description = formData.get("description");

  if (typeof name !== "string" || name.trim().length < 2) {
    throw new Error("Category name must contain at least 2 characters.");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase.from("categories").insert({
    owner_id: user.id,
    name: name.trim(),
    description:
      typeof description === "string" && description.trim()
        ? description.trim()
        : null,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/categories");
}

export async function deleteCategory(formData: FormData) {
  const categoryId = formData.get("categoryId");

  if (typeof categoryId !== "string") {
    throw new Error("Invalid category ID.");
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", categoryId)
    .eq("owner_id", user.id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/categories");
}