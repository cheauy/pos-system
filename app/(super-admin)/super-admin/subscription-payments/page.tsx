import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

export default async function SubscriptionPaymentsPage() {
  await requireSuperAdmin();
  redirect("/super-admin/manual-payments");
}
