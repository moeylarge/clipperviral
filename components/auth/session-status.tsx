import Link from "next/link";

import { getManualSessionEmail } from "@/lib/auth/manual-session";
import { SignOutButton } from "@/components/auth/sign-out-button";

export async function SessionStatus() {
  const manualEmail = await getManualSessionEmail();

  if (!manualEmail) {
    return (
      <Link
        href="/auth/signin"
        className="inline-flex cursor-pointer items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-black text-foreground shadow-sm transition-colors hover:border-primary/50 hover:text-primary"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-xs text-muted-foreground">
      <span className="text-foreground">{manualEmail}</span>
      <SignOutButton />
    </div>
  );
}
