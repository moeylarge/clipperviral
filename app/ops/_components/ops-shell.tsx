import Link from "next/link";
import type { ReactNode } from "react";

import { OpsOwnerControls } from "@/app/ops/_components/ops-owner-controls";
import { getOpsAccessState } from "@/lib/auth/manual-session";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/ops", label: "Ops Home" },
  { href: "/ops/accounts", label: "Accounts" },
  { href: "/ops/quick-add", label: "Quick Add" },
  { href: "/ops/reconciliation", label: "Reconciliation" },
  { href: "/ops/history", label: "History" },
];

export async function OpsShell({
  title,
  description,
  currentPath,
  children,
}: {
  title: string;
  description: string;
  currentPath: string;
  children: ReactNode;
}) {
  const access = await getOpsAccessState();

  return (
    <main className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 lg:flex-row">
        <aside className="surface-panel-strong h-fit w-full shrink-0 p-4 lg:sticky lg:top-6 lg:w-72">
          <div className="border-b border-border/70 pb-4">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Ops v1</p>
            <h1 className="mt-2 text-3xl font-semibold text-foreground">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <nav className="mt-4 space-y-2">
            {navItems.map((item) => {
              const active = item.href === currentPath || (item.href === "/ops/accounts" && currentPath.startsWith("/ops/accounts/"));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/70 text-foreground hover:bg-white hover:text-primary",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="mt-5 rounded-lg border border-border/80 bg-white/70 p-3 text-xs leading-5 text-muted-foreground">
            Built for one operator. Keep the daily loop tight: check home, open an account, add the missing record, clear the issue.
          </div>
          <OpsOwnerControls email={access.email} accessMode={access.mode} />
        </aside>
        <section className="min-w-0 flex-1">{children}</section>
      </div>
    </main>
  );
}
