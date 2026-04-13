import Link from "next/link";
import { CircleHelp, LayoutGrid, UserCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SessionStatus } from "@/components/auth/session-status";

export function SiteHeader() {
  return (
    <header className="topbar">
      <div className="inline-flex items-center gap-2">
        <LayoutGrid className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">Dashboard</p>
      </div>
      <div className="flex items-center gap-2">
        <Button asChild size="sm" variant="ghost">
          <Link href="/auth/signin">
            <CircleHelp className="h-3.5 w-3.5" />
            Help
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <SessionStatus />
          <Button asChild size="sm" variant="outline">
            <Link href="/profile">
              <UserCircle2 className="h-3.5 w-3.5" />
              Profile
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
