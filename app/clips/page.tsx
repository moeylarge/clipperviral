import { Download, Eye, Scissors } from "lucide-react";

const clips = [
  { title: "Creator Pitch Hook", source: "YouTube AI Clips", duration: "00:34", format: "9:16" },
  { title: "Audience Proof Snippet", source: "Caption Studio", duration: "00:27", format: "1:1" },
  { title: "Kick Fast Intro", source: "Kick Template", duration: "00:18", format: "16:9" },
];

export default function ClipsPage() {
  return (
    <div className="page-stack">
      <section className="surface-panel-strong p-6 md:p-7">
        <p className="section-kicker">Clip outputs</p>
        <h1 className="mt-2 text-3xl md:text-4xl">Clip library</h1>
        <p className="mt-2 text-sm text-muted-foreground">Generated clips and export-ready assets from your latest runs.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {clips.map((clip) => (
          <article key={clip.title} className="surface-panel p-4">
            <div className="inline-flex h-36 w-full items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
              <Scissors className="h-6 w-6" />
            </div>
            <h2 className="mt-3 text-lg font-semibold">{clip.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{clip.source}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="chip">{clip.duration}</span>
              <span className="chip">{clip.format}</span>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="chip">
                <Eye className="h-3.5 w-3.5" />
                Preview
              </button>
              <button type="button" className="chip bg-primary text-white hover:bg-primary hover:text-white">
                <Download className="h-3.5 w-3.5" />
                Download
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
