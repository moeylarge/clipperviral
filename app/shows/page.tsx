import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { dashboardTools } from "@/lib/tool-catalog";

export default function ShowsPage() {
  return (
    <div className="page-stack">
      <section className="surface-panel-strong p-6 md:p-7">
        <p className="section-kicker">Tool library</p>
        <h1 className="mt-2 text-3xl md:text-4xl">Clip tools</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
          Start in the editor for the full clip flow, or open a focused tool for a dedicated template, caption, or URL workflow.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {dashboardTools.map((tool) => (
          <article key={tool.id} className="surface-panel p-5">
            <p className="section-kicker">{tool.status}</p>
            <h2 className="mt-2 text-2xl">{tool.label}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{tool.description}</p>
            <p className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              Typical run: {tool.eta}
            </p>
            <div className="mt-5">
              <Button asChild variant={tool.id === "editor" ? "cta" : "outline"} className="w-full">
                <Link href={`/shows/${tool.routeSlug}`}>
                  {tool.id === "editor" ? "Open editor" : "Open tool"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
