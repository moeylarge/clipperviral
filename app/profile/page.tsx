import Link from "next/link";
import { BarChart3, Clapperboard, ShieldCheck, UserCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ProfilePage() {
  return (
    <div className="page-stack">
      <section className="surface-panel-strong p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Account</p>
            <h1 className="mt-2 text-3xl md:text-4xl">Profile</h1>
            <p className="mt-2 text-sm text-muted-foreground">Session access and workspace shortcuts.</p>
          </div>
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-border bg-white">
            <UserCircle2 className="h-8 w-8 text-muted-foreground" />
          </div>
        </div>
      </section>

      <section className="data-grid">
        <article className="metric-card">
          <p className="metric-label">Account health</p>
          <p className="metric-value inline-flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            Verified
          </p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Primary tool</p>
          <p className="metric-value">Editor</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Sources</p>
          <p className="metric-value">Upload + URL</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Output</p>
          <p className="metric-value">Export</p>
        </article>
      </section>

      <section className="surface-panel p-5">
        <h2 className="inline-flex items-center gap-2 text-xl">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          Workspace activity
        </h2>
        <div className="mt-4 rounded-lg border border-border bg-muted/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-foreground">Open the editor to create your next clip.</p>
              <p className="mt-1 text-sm text-muted-foreground">Export history will appear here once connected storage is available.</p>
            </div>
            <Button asChild variant="cta">
              <Link href="/editor.html">
                <Clapperboard className="mr-2 h-4 w-4" />
                Open editor
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
