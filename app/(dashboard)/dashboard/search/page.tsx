import { requirePermission } from "@/lib/auth/require-permission";
import GlobalSearchClient from "./global-search-client";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePermission("business.view");
  const params = await searchParams;
  return <GlobalSearchClient initialQuery={typeof params.q === "string" ? params.q : ""} />;
}
