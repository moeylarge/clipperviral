import Link from "next/link";

import { OpsShell } from "@/app/ops/_components/ops-shell";
import { OpsBadge, OpsMetricCard, OpsSection, OpsTable } from "@/app/ops/_components/ops-primitives";
import {
  formatCurrency,
  formatDateTime,
  getAccountStatusTone,
  getOpsDashboardFromSource,
  getRecentActivityFromSource,
  getReconciliationTone,
  rankAccountUrgency,
} from "@/lib/ops/metrics";

export default async function OpsHomePage() {
  const dashboard = await getOpsDashboardFromSource();
  const recentActivity = await getRecentActivityFromSource(8);
  const attentionAccounts = dashboard.accountRows
    .filter((row) => row.issueCount > 0 || row.balanceSupportState === "missing_opening_balance" || row.reconciliationStatus !== "clean")
    .sort((a, b) => rankAccountUrgency(b) - rankAccountUrgency(a))
    .slice(0, 6);
  const tasksDueToday = dashboard.actionQueue.filter((task) => task.dueAt.startsWith("2026-04-17"));
  const unknownBalances = dashboard.accountRows.filter((row) => row.currentBalance.cash === null);

  return (
    <OpsShell
      currentPath="/ops"
      title="Ops Home"
      description="Open this page first. It tells you what needs money, what needs a fix, and which account to open next."
    >
      <div className="space-y-6">
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <OpsMetricCard
            label="Payouts Due"
            value={`${formatCurrency(dashboard.metrics.payoutDueCash)} cash`}
            detail={`${formatCurrency(dashboard.metrics.payoutDueCredit)} credit still due on active statements.`}
          />
          <OpsMetricCard
            label="Overdue"
            value={`${formatCurrency(dashboard.metrics.overdueCash)} cash`}
            detail={`${formatCurrency(dashboard.metrics.overdueCredit)} credit is late right now.`}
          />
          <OpsMetricCard
            label="Open Issues"
            value={String(dashboard.metrics.openIssueCount)}
            detail="Problems that still need a fix."
          />
          <OpsMetricCard
            label="Accounts Needing Attention"
            value={String(attentionAccounts.length)}
            detail="Accounts with active problems, unknown balance start, or a blocked check."
          />
          <OpsMetricCard
            label="Tasks Due Today"
            value={String(tasksDueToday.length)}
            detail="Work due today so nothing slips into tomorrow by accident."
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
          <OpsSection title="Do These Next" description="Open one of these and fix it now.">
            <OpsTable columns={["Account", "What needs attention", "Status", "Quick action", "Next step"]}>
              {attentionAccounts.map((row) => (
                <tr key={row.account.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{row.account.label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{row.operatorName}</p>
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {row.balanceSupportState === "missing_opening_balance"
                      ? "Missing balance start"
                      : row.issueCount > 0
                        ? `${row.issueCount} active problem${row.issueCount === 1 ? "" : "s"}`
                        : "Needs review"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <OpsBadge className={getAccountStatusTone(row.account.status)}>{row.account.status}</OpsBadge>
                      <OpsBadge className={getReconciliationTone(row.reconciliationStatus)}>{row.reconciliationStatus}</OpsBadge>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/ops/quick-add?kind=deposit&account=${row.account.id}`} className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-foreground">Deposit</Link>
                      <Link href={`/ops/quick-add?kind=ticket&account=${row.account.id}`} className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-foreground">Ticket</Link>
                      <Link href={`/ops/quick-add?kind=settlement&account=${row.account.id}`} className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-foreground">Settlement</Link>
                      <Link href={`/ops/quick-add?kind=payout_receipt&account=${row.account.id}`} className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-foreground">Payout</Link>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/ops/accounts/${row.account.id}`}
                      className="inline-flex rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                    >
                      Open account
                    </Link>
                  </td>
                </tr>
              ))}
            </OpsTable>
          </OpsSection>

          <OpsSection title="Missing Balance Start" description="These accounts cannot be trusted until the first balance is recorded.">
            <div className="space-y-3">
              {unknownBalances.length === 0 ? (
                <p className="text-sm text-muted-foreground">No unknown balances.</p>
              ) : (
                unknownBalances.map((row) => (
                  <Link
                    key={row.account.id}
                    href={`/ops/quick-add?kind=deposit&account=${row.account.id}`}
                    className="block rounded-lg border border-border/70 bg-white/80 p-3"
                  >
                    <p className="font-semibold text-foreground">{row.account.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Add the starting balance or first confirmed money move.</p>
                  </Link>
                ))
              )}
            </div>
          </OpsSection>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
          <OpsSection title="Due Today" description="Work that should not roll into tomorrow.">
            <OpsTable columns={["Task", "Account", "Due", "Amount"]}>
              {tasksDueToday.map((task) => (
                <tr key={task.id}>
                  <td className="px-4 py-3 font-semibold text-foreground">{task.title}</td>
                  <td className="px-4 py-3 text-foreground">{task.accountLabel ?? "Unassigned"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(task.dueAt)}</td>
                  <td className="px-4 py-3 text-foreground">{formatCurrency(task.linkedIssueAmount ?? 0)}</td>
                </tr>
              ))}
            </OpsTable>
          </OpsSection>

          <OpsSection title="Recent Activity" description="Latest money moves, results, notes, and audit changes.">
            <div className="space-y-3">
              {recentActivity.map((item) => (
                <div key={item.id} className="rounded-lg border border-border/70 bg-white/80 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-foreground">{item.title}</p>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.kind}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.accountLabel ? `${item.accountLabel} · ` : ""}
                    {formatDateTime(item.when)}
                  </p>
                </div>
              ))}
            </div>
          </OpsSection>
        </section>
      </div>
    </OpsShell>
  );
}
