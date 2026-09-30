import { redirect } from "next/navigation";

// Online and QR orders are managed in Orders; keep old links and bookmarks working.
export default function OnlineOrdersPage() {
  redirect("/dashboard/orders?source=online");
}
