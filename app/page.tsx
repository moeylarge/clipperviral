"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Clapperboard, Film, ListChecks, Sparkles, Subtitles, WandSparkles } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { dashboardTools, type DashboardTool } from "@/lib/tool-catalog";
import { cn } from "@/lib/utils";

const TOOL_ICONS: Record<DashboardTool["id"], ReactNode> = {
  editor: <Clapperboard className="h-4 w-4" />,
  kick: <Film className="h-4 w-4" />,
  captions: <Subtitles className="h-4 w-4" />,
  youtube: <WandSparkles className="h-4 w-4" />,
};

export default function HomePage() {
  const [selectedToolId, setSelectedToolId] = useState<DashboardTool["id"]>("editor");

  const selectedTool = useMemo(
    () => dashboardTools.find((tool) => tool.id === selectedToolId) ?? dashboardTools[0],
    [selectedToolId]
  );

  return (
    <div className="page-stack">
      <section className="surface-panel-strong p-6 md:p-7">
        <p className="section-kicker">ClipperViral</p>
        <h1 className="mt-2 text-3xl md:text-4xl">Creator clip workflow</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
          Start with a video upload or AI-generated YouTube/Kick clips, choose vertical or horizontal layout,
          add captions, then export from one cleaner editor surface.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild size="lg" variant="cta">
            <Link href="/editor.html">
              Open unified editor
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/shows">View fallback workspaces</Link>
          </Button>
        </div>
      </section>

      <section className="data-grid">
        <article className="metric-card">
          <p className="metric-label">Tools online</p>
          <p className="metric-value">4 / 4</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Production status</p>
          <p className="metric-value">Stable</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Primary workflow</p>
          <p className="metric-value">Editor</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Active view</p>
          <p className="metric-value">{selectedTool.shortLabel}</p>
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="surface-panel p-3">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Workflow map</p>
          <div className="grid gap-2">
            {dashboardTools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => setSelectedToolId(tool.id)}
                className={cn(
                  "w-full rounded-lg border px-3 py-3 text-left transition",
                  tool.id === selectedTool.id
                    ? "border-primary/45 bg-primary/5"
                    : "border-border bg-white hover:border-primary/30 hover:bg-muted/45"
                )}
              >
                <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {TOOL_ICONS[tool.id]}
                  {tool.status}
                </span>
                <p className="mt-2 text-base font-semibold text-foreground">{tool.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
              </button>
            ))}
          </div>
        </aside>

        <article className="surface-panel-strong p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="section-kicker">{selectedTool.shortLabel} workflow</p>
              <h2 className="mt-1 text-3xl">{selectedTool.label}</h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{selectedTool.description}</p>
            </div>
            <Button asChild size="lg" variant="cta">
              <Link href={selectedTool.href}>
                {selectedTool.id === "editor" ? "Open editor" : "Open fallback"}
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-white p-4">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" />
                Step flow
              </p>
              <ol className="mt-3 grid gap-2">
                {selectedTool.steps.map((step, index) => (
                  <li key={step} className="step-item">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                      {index + 1}
                    </span>
                    <span className="text-sm text-foreground">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-lg border border-border bg-white p-4">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5" />
                Quality checks
              </p>
              <ul className="mt-3 grid gap-2">
                {selectedTool.checks.map((check) => (
                  <li key={check} className="inline-flex items-center gap-2 text-sm text-foreground">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    {check}
                  </li>
                ))}
              </ul>
              <p className="mt-5 chip">
                <span className="status-dot" />
                Estimated run time: {selectedTool.eta}
              </p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
