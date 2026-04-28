import { LocalFastEntryHistory } from "@/app/ops/history/local-fast-entry-history";
import { OpsShell } from "@/app/ops/_components/ops-shell";
import { OpsSection, OpsTable } from "@/app/ops/_components/ops-primitives";
import { formatDateTime, getRecentActivityFromSource } from "@/lib/ops/metrics";

export default async function OpsHistoryPage() {
  const activity = await getRecentActivityFromSource(20);

  return (
    <OpsShell
      currentPath="/ops/history"
      title="History"
      description="Recent records across money moves, notes, posted results, and audit events."
    >
      <div className="space-y-6">
        <OpsSection title="Recent History" description="Use this when you need to answer what changed and when.">
          <OpsTable columns={["When", "Type", "Account", "Detail"]}>
            {activity.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 text-muted-foreground">{formatDateTime(item.when)}</td>
                <td className="px-4 py-3 text-foreground">{item.kind}</td>
                <td className="px-4 py-3 text-foreground">{item.accountLabel ?? "System"}</td>
                <td className="px-4 py-3 text-foreground">{item.title}</td>
              </tr>
            ))}
          </OpsTable>
        </OpsSection>

        <OpsSection title="Fast Entry Audit" description="Raw parser commands and parsed output previews from this browser before final review.">
          <LocalFastEntryHistory />
        </OpsSection>
      </div>
    </OpsShell>
  );
}
