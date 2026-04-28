import { OpsShell } from "@/app/ops/_components/ops-shell";
import { OpsBadge, OpsSection, OpsTable } from "@/app/ops/_components/ops-primitives";
import { formatCurrency, formatDateTime, getOpsDashboardFromSource, getPriorityTone } from "@/lib/ops/metrics";

export default async function OpsTasksPage() {
  const dashboard = await getOpsDashboardFromSource();

  return (
    <OpsShell
      currentPath="/ops/tasks"
      title="Tasks"
      description="Tasks remain secondary records. They point back to issues, periods, notes, and accounts."
    >
      <OpsSection title="Open Work" description="Each task is linked to a concrete issue or note instead of a free-form reminder.">
        <OpsTable columns={["Title", "Account", "Operator", "Priority", "Amount", "Due"]}>
          {dashboard.actionQueue.map((task) => (
            <tr key={task.id}>
              <td className="px-4 py-3 font-semibold text-foreground">{task.title}</td>
              <td className="px-4 py-3 text-foreground">{task.accountLabel ?? "Unassigned"}</td>
              <td className="px-4 py-3 text-foreground">{task.operatorName ?? "Unknown"}</td>
              <td className="px-4 py-3">
                <OpsBadge className={getPriorityTone(task.priority)}>{task.priority}</OpsBadge>
              </td>
              <td className="px-4 py-3 text-foreground">{formatCurrency(task.linkedIssueAmount ?? 0)}</td>
              <td className="px-4 py-3 text-muted-foreground">{formatDateTime(task.dueAt)}</td>
            </tr>
          ))}
        </OpsTable>
      </OpsSection>
    </OpsShell>
  );
}
