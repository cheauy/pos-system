import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import TempHealthClient from "./temp-health-client";

export default async function TempPage() {
  await requireSuperAdmin();
  return <TempHealthClient />;
}
