import { requireSystemOwner } from "@/lib/auth/require-system-owner";

export default async function BusinessesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSystemOwner();

  return children;
}