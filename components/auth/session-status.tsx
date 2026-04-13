import Link from "next/link";

import { getCurrentSessionIdentity } from "@/lib/data/spotlight";
import { SignOutButton } from "@/components/auth/sign-out-button";

export async function SessionStatus() {
  const { user } = await getCurrentSessionIdentity();

  if (!user) {
    return (
      <Link
        href="/auth/signin"
        className="rounded-md border border-border bg-white px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Sign in
      </Link>
    );
  }

  const displayName = user.display_name?.trim() || user.handle;

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-xs text-muted-foreground">
      <span className="text-foreground">{displayName}</span>
      <SignOutButton />
    </div>
  );
}
