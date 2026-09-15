"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { getRootUrl } from "@/lib/tenancy/domain";

export default function LogoutButton() {
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    if (pending) return;

    setPending(true);

    try {
      const supabase = createClient();
      await supabase.auth.signOut();

      window.location.assign(
        getRootUrl("/login"),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleLogout}
      className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending && (
        <Loader2
          size={16}
          className="animate-spin"
        />
      )}
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}
