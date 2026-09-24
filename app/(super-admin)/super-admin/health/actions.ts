"use server";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import { collectHealth } from "@/lib/super-admin/health";
export async function runWebsiteHealth() {
  await requireSuperAdmin();
  return { results: await collectHealth(), checkedAt: new Date().toISOString() };
}
