"use client";

import { useState } from "react";

import type { OpsAccessMode } from "@/lib/auth/manual-session";

export function OpsOwnerControls({ email, accessMode }: { email: string | null; accessMode: OpsAccessMode }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/manual-signout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Sign-out failed.");
      }
      window.location.href = "/auth/signin?owner=1";
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Sign-out failed.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-border/80 bg-white/70 p-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {accessMode === "owner" ? "Owner Access" : "Shared Preview"}
      </p>
      <p className="mt-2 text-sm font-semibold text-foreground">
        {accessMode === "owner" ? (email ?? "Signed in with owner session") : "Read-only review session"}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {accessMode === "owner"
          ? "You can review and record ops changes from this session."
          : "You can review the live app here, but all record changes are blocked."}
      </p>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={isSubmitting}
        className="mt-3 inline-flex rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-foreground disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Signing out..." : "Sign out"}
      </button>
      {error ? <p className="mt-2 text-xs font-semibold text-rose-700">{error}</p> : null}
    </div>
  );
}
