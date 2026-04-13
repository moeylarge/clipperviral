import { BarChart3, Bolt, ShieldCheck, UserCircle2 } from "lucide-react";

const recentRuns = [
  { tool: "Kick Template", status: "Completed", duration: "01:52", when: "Today" },
  { tool: "Caption Studio", status: "Completed", duration: "03:41", when: "Today" },
  { tool: "YouTube AI Clips", status: "Completed", duration: "08:22", when: "Yesterday" },
];

export default function ProfilePage() {
  return (
    <div className="page-stack">
      <section className="surface-panel-strong p-6 md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="section-kicker">Account</p>
            <h1 className="mt-2 text-3xl md:text-4xl">Profile</h1>
            <p className="mt-2 text-sm text-muted-foreground">Session identity, usage summary, and workflow history.</p>
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
          <p className="metric-label">Runs this week</p>
          <p className="metric-value">24</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Avg process time</p>
          <p className="metric-value">4m 11s</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Success rate</p>
          <p className="metric-value inline-flex items-center gap-2">
            98%
            <Bolt className="h-4 w-4 text-amber-500" />
          </p>
        </article>
      </section>

      <section className="surface-panel p-5">
        <h2 className="inline-flex items-center gap-2 text-xl">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          Recent runs
        </h2>
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Tool</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => (
                <tr key={`${run.tool}-${run.when}`} className="border-t border-border bg-white">
                  <td className="px-3 py-2 font-medium text-foreground">{run.tool}</td>
                  <td className="px-3 py-2 text-emerald-600">{run.status}</td>
                  <td className="px-3 py-2 text-muted-foreground">{run.duration}</td>
                  <td className="px-3 py-2 text-muted-foreground">{run.when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
