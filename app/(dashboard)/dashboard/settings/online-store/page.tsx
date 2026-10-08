import { redirect } from "next/navigation";

// Online Store Settings now live inside Business Settings.
export default function OnlineStoreSettingsPage() {
  redirect("/dashboard/settings/business?section=storefront");
}
