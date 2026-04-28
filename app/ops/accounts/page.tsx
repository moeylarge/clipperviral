import Link from "next/link";

import { OpsShell } from "@/app/ops/_components/ops-shell";
import { OpsBadge, OpsSection, OpsTable } from "@/app/ops/_components/ops-primitives";
import { formatCurrency, getAccountStatusTone, getOpsDashboardFromSource, getReconciliationTone } from "@/lib/ops/metrics";

export default async function OpsAccountsPage() {
  const dashboard = await getOpsDashboardFromSource();

  return (
    <OpsShell
      currentPath="/ops/accounts"
      title="Accounts"
      description="One click from the list into the full account workspace."
    >
      <OpsSection title="Account List" description="Use this list to jump straight into the account you need to fix or update.">
        <OpsTable columns={["Account", "Balance", "Exposure", "Payout Due", "Status", "Issues", "Open"]}>
          {dashboard.accountRows.map((row) => (
            <tr key={row.account.id}>
              <td className="px-4 py-3">
                <p className="font-semibold text-foreground">{row.account.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.operatorName}</p>
              </td>
              <td className="px-4 py-3 text-foreground">
                {formatCurrency(row.currentBalance.cash)} cash / {formatCurrency(row.currentBalance.credit)} credit
              </td>
              <td className="px-4 py-3 text-foreground">{formatCurrency(row.pendingExposure.cash)}</td>
              <td className="px-4 py-3 text-foreground">
                {formatCurrency(row.payoutDue.cash)} cash / {formatCurrency(row.payoutDue.credit)} credit
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <OpsBadge className={getAccountStatusTone(row.account.status)}>{row.account.status}</OpsBadge>
                  <OpsBadge className={getReconciliationTone(row.reconciliationStatus)}>{row.reconciliationStatus}</OpsBadge>
                </div>
              </td>
              <td className="px-4 py-3 font-semibold text-foreground">{row.issueCount}</td>
              <td className="px-4 py-3">
                <Link
                  href={`/ops/accounts/${row.account.id}`}
                  className="inline-flex rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                >
                  Workspace
                </Link>
              </td>
            </tr>
          ))}
        </OpsTable>
      </OpsSection>
    </OpsShell>
  );
}
