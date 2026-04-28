import { OpsShell } from "@/app/ops/_components/ops-shell";
import { OpsMetricCard, OpsSection, OpsTable } from "@/app/ops/_components/ops-primitives";
import { formatCurrency, getOpsDashboardFromSource } from "@/lib/ops/metrics";

export default async function OpsWeeklyNetPage() {
  const dashboard = await getOpsDashboardFromSource();

  return (
    <OpsShell
      currentPath="/ops/weekly-net"
      title="Weekly Net"
      description="For v1, weekly net means posted ticket settlement cash PnL inside the current week. Deposits, withdrawals, and payout receipts stay separate."
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-3">
          <OpsMetricCard
            label="Weekly Settled Cash Net"
            value={formatCurrency(dashboard.metrics.weeklySettledCashNet)}
            detail="Sum of posted ticket settlement pnl_cash within the current week window."
          />
          <OpsMetricCard
            label="Payout Due"
            value={`${formatCurrency(dashboard.metrics.payoutDueCash)} cash / ${formatCurrency(dashboard.metrics.payoutDueCredit)} credit`}
            detail="Outstanding posted statement obligations, not included in weekly net."
          />
          <OpsMetricCard
            label="Overdue Payout"
            value={`${formatCurrency(dashboard.metrics.overdueCash)} cash / ${formatCurrency(dashboard.metrics.overdueCredit)} credit`}
            detail="Undisputed shortfalls past due time, kept separate from weekly net."
          />
        </section>

        <OpsSection title="Weekly Net Trace" description="Every line item links back to explicit settlement and payout ledger records.">
          <OpsTable columns={["Line", "Amount", "Source Records"]}>
            {dashboard.weeklyBreakdown.map((line) => (
              <tr key={line.label}>
                <td className="px-4 py-3 font-semibold text-foreground">{line.label}</td>
                <td className="px-4 py-3 text-foreground">{formatCurrency(line.amount)}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{line.sourceRecordIds.join(", ")}</td>
              </tr>
            ))}
          </OpsTable>
        </OpsSection>
      </div>
    </OpsShell>
  );
}
