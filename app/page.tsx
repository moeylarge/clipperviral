"use client";

import Link from "next/link";
import { ArrowUpRight, Captions, CheckCircle2, Sparkles, TvMinimalPlay, WandSparkles, Youtube } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ToolId = "kick" | "captions" | "youtube";

type ToolConfig = {
  id: ToolId;
  label: string;
  shortLabel: string;
  href: string;
  accent: string;
  description: string;
  steps: string[];
  quickChecks: string[];
};

const TOOL_CONFIG: ToolConfig[] = [
  {
    id: "kick",
    label: "Kick Template",
    shortLabel: "Kick",
    href: "/kick-template.html",
    accent: "Kick-first formatting",
    description: "Set your title and visual framing, preview instantly, then export a clean clip-ready format.",
    steps: ["Load source clip", "Apply Kick layout + text options", "Preview and export"],
    quickChecks: ["Layout lock", "Readable text", "Export ready"],
  },
  {
    id: "captions",
    label: "Caption Studio",
    shortLabel: "Captions",
    href: "/caption-template.html",
    accent: "Fast caption workflow",
    description: "Upload a file, generate captions, tune style settings, and download subtitle or burned output.",
    steps: ["Upload video", "Generate and style captions", "Export subtitle or MP4"],
    quickChecks: ["Timing quality", "Style pass", "Output format"],
  },
  {
    id: "youtube",
    label: "YouTube AI Clips",
    shortLabel: "YouTube AI",
    href: "/caption-template.html#youtube-auto-highlights",
    accent: "URL to clips in minutes",
    description: "Drop a YouTube or Kick URL, run AI clip scoring, and export ranked highlights.",
    steps: ["Paste source URL", "Run AI candidate generation", "Preview and download winning clips"],
    quickChecks: ["Source validity", "Clip ranking", "Download check"],
  },
];

const TOOL_ICON: Record<ToolId, ReactNode> = {
  kick: <TvMinimalPlay className="h-4 w-4" />,
  captions: <Captions className="h-4 w-4" />,
  youtube: <Youtube className="h-4 w-4" />,
};

export default function HomePage() {
  const [activeTool, setActiveTool] = useState<ToolId>("kick");

  const currentTool = useMemo(
    () => TOOL_CONFIG.find((tool) => tool.id === activeTool) ?? TOOL_CONFIG[0],
    [activeTool]
  );

  return (
    <div className="spotlight-flow">
      <section className="surface-panel-strong p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="space-y-3">
            <p className="section-title">ClipperViral Workspace</p>
            <h1 className="max-w-3xl text-4xl leading-[0.98] md:text-6xl">Create clips in steps, not clutter.</h1>
            <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
              One dashboard, three focused tools. Each tab has a dedicated flow so workflows do not overlap.
            </p>
          </div>
          <div className="grid min-w-[220px] gap-3 text-xs uppercase tracking-[0.14em] text-muted-foreground">
            <p className="chip justify-between">
              Active tool
              <span className="text-foreground">{currentTool.shortLabel}</span>
            </p>
            <p className="chip justify-between">
              Mode
              <span className="text-foreground">Production</span>
            </p>
            <p className="chip justify-between">
              Flow
              <span className="text-foreground">Step-based</span>
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="surface-panel p-3">
          <p className="px-2 pb-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">Tools</p>
          <div className="grid gap-2">
            {TOOL_CONFIG.map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => setActiveTool(tool.id)}
                className={cn(
                  "w-full rounded-xl border px-3 py-3 text-left transition",
                  activeTool === tool.id
                    ? "border-primary/55 bg-primary/15 text-foreground shadow-[0_12px_36px_-28px_rgba(255,98,56,0.85)]"
                    : "border-white/15 bg-black/20 text-foreground/90 hover:border-white/30 hover:bg-black/40"
                )}
              >
                <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {TOOL_ICON[tool.id]}
                  {tool.accent}
                </span>
                <p className="mt-2 text-base font-semibold text-foreground">{tool.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{tool.description}</p>
              </button>
            ))}
          </div>
        </aside>

        <article className="surface-panel-strong p-5 md:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="section-title">Current Workflow</p>
              <h2 className="text-3xl md:text-4xl">{currentTool.label}</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">{currentTool.description}</p>
            </div>
            <Button asChild size="lg" variant="cta">
              <Link href={currentTool.href}>
                Open {currentTool.shortLabel}
                <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-2xl border border-white/14 bg-black/35 p-4 md:p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Steps</p>
              <ol className="mt-3 grid gap-3">
                {currentTool.steps.map((step, index) => (
                  <li key={step} className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-3">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
                      {index + 1}
                    </span>
                    <span className="text-sm text-foreground">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-white/14 bg-black/35 p-4 md:p-5">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Completion Checks</p>
              <ul className="mt-3 grid gap-2">
                {currentTool.quickChecks.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-foreground/95">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-5 rounded-xl border border-accent/30 bg-accent/10 px-3 py-3 text-xs uppercase tracking-[0.14em] text-accent">
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5" />
                  Non-overlapping flow active
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-white/14 bg-black/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Tool Preview</p>
              <Link
                href={currentTool.href}
                className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.14em] text-foreground/85 transition hover:text-white"
              >
                Launch full tool
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="overflow-hidden rounded-xl border border-white/12">
              <iframe
                key={currentTool.id}
                src={currentTool.href}
                title={`${currentTool.label} preview`}
                className="h-[560px] w-full bg-black"
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Active tab loads one focused tool at a time to keep each workflow clean and separate.
            </p>
          </div>
        </article>
      </section>

      <section className="surface-panel p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-title">Quick Actions</p>
            <h3 className="mt-1 text-2xl">Jump directly into each tool</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {TOOL_CONFIG.map((tool) => (
              <Button key={tool.id} asChild size="sm" variant={tool.id === activeTool ? "default" : "outline"}>
                <Link href={tool.href}>{tool.label}</Link>
              </Button>
            ))}
            <Button asChild size="sm" variant="ghost">
              <Link href="/format-template.html">
                Format Template
                <WandSparkles className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
