"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Clapperboard, Film, ListChecks, MousePointerClick, Sparkles, Subtitles, WandSparkles } from "lucide-react";
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
      <section className="surface-panel-strong overflow-hidden p-6 md:p-8">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div>
            <p className="section-kicker">ClipperViral</p>
            <h1 className="mt-3 max-w-4xl text-4xl md:text-5xl">One premium editor for viral-ready clips.</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
              Upload a clip or generate candidates from a YouTube/Kick URL, choose a layout, add captions and branded overlays, then export from one guided workspace.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4 text-white shadow-[0_22px_70px_-42px_rgba(15,23,42,0.95)]">
            <p className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-300">
              <MousePointerClick className="h-4 w-4" />
              Start here
            </p>
            <p className="mt-3 text-sm leading-6 text-white/70">The unified editor is the primary path. Older tools are available only as fallback workspaces.</p>
          </div>
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
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
        <aside className="surface-panel p-4">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Workflow map</p>
          <div className="grid gap-2">
            {dashboardTools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => setSelectedToolId(tool.id)}
                className={cn(
                  "w-full rounded-xl border px-3.5 py-3.5 text-left shadow-sm transition focus-visible:ring-2 focus-visible:ring-primary/30",
                  tool.id === selectedTool.id
                    ? "border-primary/60 bg-primary/5 shadow-[0_18px_42px_-34px_rgba(37,99,235,0.75)]"
                    : "border-slate-200 bg-white hover:-translate-y-0.5 hover:border-primary/35 hover:bg-primary/5"
                )}
              >
                <span className={cn(
                  "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-black uppercase tracking-[0.08em]",
                  tool.id === selectedTool.id ? "bg-primary text-white" : "bg-slate-100 text-slate-600"
                )}>
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
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
