import { notFound } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";
export default async function RemovedBusinessCreationPage() { await requireSuperAdmin(); notFound(); }
