import { redirect } from "next/navigation";
import { getCurrentProfile } from "./get-current-profile";

export async function requireSystemOwner() {
  const profile = await getCurrentProfile();

  if (profile.role !== "system_owner") {
    redirect("/dashboard");
  }

  return profile;
}