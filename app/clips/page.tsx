import Link from "next/link";
import { Clapperboard, Scissors } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function ClipsPage() {
  return (
    <div className="page-stack">
      <section className="surface-panel-strong p-6 md:p-7">
        <p className="section-kicker">Clip outputs</p>
        <h1 className="mt-2 text-3xl md:text-4xl">Exports</h1>
        <p className="mt-2 text-sm text-muted-foreground">Create a clip in the editor, then download the final rendered output.</p>
      </section>

      <section className="surface-panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
              <Scissors className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl">No saved exports yet</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Use the editor to load a source, choose a layout, apply trim and elements, then export the finished clip.
              </p>
            </div>
          </div>
          <Button asChild variant="cta">
            <Link href="/editor.html">
              <Clapperboard className="mr-2 h-4 w-4" />
              Open editor
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
