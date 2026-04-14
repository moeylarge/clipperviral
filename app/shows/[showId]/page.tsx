import Link from "next/link";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { resolveToolBySlug } from "@/lib/tool-catalog";

interface ToolWorkflowPageProps {
  params: Promise<{ showId: string }>;
}

export default async function ToolWorkflowPage({ params }: ToolWorkflowPageProps) {
  const { showId } = await params;
  const tool = resolveToolBySlug(showId);

  return (
    <div className="page-stack">
      <section className="surface-panel-strong p-6 md:p-7">
        <p className="section-kicker">Tool detail</p>
        <h1 className="mt-2 text-3xl md:text-4xl">{tool.label}</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">{tool.description}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild variant="cta">
            <Link href={tool.href}>
              Launch tool
              <ArrowUpRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/shows">Back to tools</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <article className="surface-panel p-5">
          <h2 className="text-xl">Flow</h2>
          <ol className="mt-3 grid gap-2">
            {tool.steps.map((step, index) => (
              <li key={step} className="step-item">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {index + 1}
                </span>
                <span className="text-sm">{step}</span>
              </li>
            ))}
          </ol>

          <h3 className="mt-5 text-base font-semibold">Export checks</h3>
          <ul className="mt-2 grid gap-2">
            {tool.checks.map((check) => (
              <li key={check} className="inline-flex items-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {check}
              </li>
            ))}
          </ul>
        </article>

        <article className="surface-panel overflow-hidden p-3 md:p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="section-kicker">Live preview</p>
            <Link href={tool.href} className="text-xs font-semibold text-primary hover:underline">
              Open full page
            </Link>
          </div>
          <div className="overflow-hidden rounded-lg border border-border">
            <iframe src={tool.href} title={`${tool.label} preview`} className="h-[720px] w-full bg-white" />
          </div>
        </article>
      </section>
    </div>
  );
}
