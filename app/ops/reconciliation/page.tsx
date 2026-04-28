import Link from "next/link";

import { OpsShell } from "@/app/ops/_components/ops-shell";
import { OpsBadge, OpsSection, OpsTable } from "@/app/ops/_components/ops-primitives";
import { formatCurrency, formatDate, getOpsDashboardFromSource, getReconciliationTone } from "@/lib/ops/metrics";

export default async function OpsReconciliationPage() {
  const dashboard = await getOpsDashboardFromSource();
  const fixQueue = [...dashboard.reconciliationRows].sort((a, b) => b.issueCount - a.issueCount);

  return (
    <OpsShell
      currentPath="/ops/reconciliation"
      title="Reconciliation"
      description="Treat this like a fix queue. Open the account or add the missing record until the line is clean."
    >
      <OpsSection title="Fix Queue" description="Highest-friction items first. Every row tells you what to do next.">
        <OpsTable columns={["Account", "Problem", "Still Due", "Variance", "Next Action", "Fix"]}>
          {fixQueue.map((row) => (
            <tr key={`${row.account.id}-${row.payoutPeriod.id}`}>
              <td className="px-4 py-3">
                <p className="font-semibold text-foreground">{row.account.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.operatorName}</p>
              </td>
              <td className="px-4 py-3 text-foreground">
                {row.issueCount > 0
                  ? `${row.issueCount} problem${row.issueCount === 1 ? "" : "s"} · ${formatDate(row.payoutPeriod.periodStart)} - ${formatDate(row.payoutPeriod.periodEnd)}`
                  : "Needs review"}
              </td>
              <td className="px-4 py-3 text-foreground">
                {formatCurrency(row.payoutDueCash)} cash / {formatCurrency(row.payoutDueCredit)} credit
              </td>
              <td className="px-4 py-3 text-foreground">{formatCurrency(row.variance)}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <OpsBadge className={getReconciliationTone(row.status)}>{row.status}</OpsBadge>
                  <span className="text-sm font-semibold text-foreground">
                    {row.issueCount > 0
                      ? row.issueCount === 1
                        ? "Fix this now"
                        : "Work through issues"
                      : "Review and close"}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-2">
                  <Link
                    href={`/ops/accounts/${row.account.id}`}
                    className="inline-flex rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    Open account
                  </Link>
                  <Link
                    href={`/ops/quick-add?kind=${row.payoutDueCash || row.payoutDueCredit ? "payout_receipt" : "manual_adjustment"}&account=${row.account.id}`}
                    className="inline-flex rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground"
                  >
                    Fix this
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </OpsTable>
      </OpsSection>
    </OpsShell>
  );
}
