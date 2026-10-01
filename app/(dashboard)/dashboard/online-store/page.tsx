import { redirect } from "next/navigation";

// Preserve old bookmarks without keeping two independent settings screens.
export default async function LegacyOnlineStorePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const part of Array.isArray(value) ? value : value == null ? [] : [value]) query.append(key, part);
  }
  redirect(`/dashboard/settings/online-store${query.size ? `?${query}` : ""}`);
}
