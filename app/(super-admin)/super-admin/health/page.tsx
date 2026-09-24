import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
import HealthClient from "./health-client";
export default async function HealthPage() { await requireSuperAdmin(); return <HealthClient />; }
