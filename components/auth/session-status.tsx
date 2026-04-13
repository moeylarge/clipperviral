import Link from "next/link";

import { getManualSessionEmail } from "@/lib/auth/manual-session";
import { SignOutButton } from "@/components/auth/sign-out-button";

export async function SessionStatus() {
  const manualEmail = await getManualSessionEmail();

  if (!manualEmail) {
    return (
      <Link
        href="/auth/signin"
        className="rounded-md border border-border bg-white px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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
