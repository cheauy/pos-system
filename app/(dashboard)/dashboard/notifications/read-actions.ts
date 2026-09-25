"use server";

import { createClient } from "@/lib/supabase/branch-server";

export async function markNotificationsRead(ids: string[]) {
  if (!ids.length) return;
  if (ids.length > 1000 || ids.some(id => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))) {
    throw new Error("Invalid notification selection.");
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");
  const { error } = await supabase.from("business_notification_reads").upsert(
    [...new Set(ids)].map(notification_id => ({ notification_id, user_id: user.id, read_at: new Date().toISOString() })),
    { onConflict: "notification_id,user_id" },
  );
  if (error) throw new Error("Unable to mark notifications as read. Please try again.");
}
