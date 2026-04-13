import { AlertCircle, ClipboardList, Gauge, MonitorPlay } from "lucide-react";

interface HostConsolePageProps {
  params: Promise<{ showId: string }>;
}

const hostPanels = [
  {
    title: "Source Intake",
    description: "Validate incoming files and URLs before starting processing.",
    icon: ClipboardList,
  },
  {
    title: "Process Queue",
    description: "Track active render jobs and identify failed tasks quickly.",
    icon: Gauge,
  },
  {
    title: "Live Preview",
    description: "Review active output preview before final export release.",
    icon: MonitorPlay,
  },
  {
    title: "Incident Panel",
    description: "See warnings and retry failed operations with clear logs.",
    icon: AlertCircle,
  },
];

export default async function HostConsolePage({ params }: HostConsolePageProps) {
  const { showId } = await params;

  return (
    <div className="page-stack">
      <section className="surface-panel-strong p-6 md:p-7">
        <p className="section-kicker">Ops console</p>
        <h1 className="mt-2 text-3xl md:text-4xl">Host Workspace: {showId.replace(/-/g, " ")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Operational controls for monitoring and validating processing workflows.</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {hostPanels.map((panel) => {
          const Icon = panel.icon;
          return (
            <article key={panel.title} className="surface-panel p-5">
              <p className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-muted/55">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </p>
              <h2 className="mt-3 text-xl">{panel.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{panel.description}</p>
            </article>
          );
        })}
      </section>
    </div>
  );
}
