import { redirect } from "next/navigation";

export default function InventoryPage() {
  redirect("/dashboard/products?view=stock");
}
