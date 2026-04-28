import Link from "next/link";
import { notFound } from "next/navigation";

import { OpsShell } from "@/app/ops/_components/ops-shell";
import { OpsBadge, OpsSection, OpsTable } from "@/app/ops/_components/ops-primitives";
import { QuickAddForm } from "@/app/ops/quick-add/quick-add-form";
import { getOpsAccessState } from "@/lib/auth/manual-session";
import {
  formatCurrency,
  formatDateTime,
  getAccountStatusTone,
  getAccountWorkspaceForData,
  getOpsDatasetFromSource,
  getReconciliationTone,
} from "@/lib/ops/metrics";

export default async function AccountWorkspacePage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  const data = await getOpsDatasetFromSource();
  const access = await getOpsAccessState();

  if (!data.accounts.some((account) => account.id === accountId)) {
    notFound();
  }

  const workspace = getAccountWorkspaceForData(data, accountId);
  const nextAction =
    workspace.summary.balanceSupportState === "missing_opening_balance"
      ? {
          title: "Add missing balance start",
          detail: "This account cannot be trusted until the first balance is recorded.",
          href: `/ops/quick-add?kind=deposit&account=${accountId}`,
          label: "Add balance start",
        }
      : workspace.summary.issueCount > 0
        ? {
            title: "Fix the active problems",
            detail: `${workspace.summary.issueCount} problem${workspace.summary.issueCount === 1 ? "" : "s"} still needs review.`,
            href: `/ops/reconciliation`,
            label: "Open fix queue",
          }
        : workspace.summary.pendingExposure.cash && workspace.summary.pendingExposure.cash > 0
          ? {
              title: "Watch the open action",
              detail: "This account still has live exposure that may change the balance.",
              href: `/ops/quick-add?kind=settlement&account=${accountId}`,
              label: "Post result",
            }
      : {
          title: "Account is in good shape",
          detail: "Use a quick action if you need to add the next record.",
          href: `/ops/quick-add?kind=ticket&account=${accountId}`,
          label: "Add ticket",
        };
  const inlineKind =
    workspace.summary.balanceSupportState === "missing_opening_balance"
      ? "deposit"
      : workspace.summary.issueCount > 0 && (workspace.summary.payoutDue.cash || workspace.summary.payoutDue.credit)
        ? "payout_receipt"
        : workspace.summary.issueCount > 0
          ? "manual_adjustment"
          : workspace.summary.pendingExposure.cash && workspace.summary.pendingExposure.cash > 0
            ? "settlement"
            : "ticket";

  return (
    <OpsShell
      currentPath={`/ops/accounts/${accountId}`}
      title={workspace.summary.account.label}
      description="Everything you need for this account is here. Read the status, scan the latest records, then use a quick action."
    >
      <div className="space-y-6">
        <OpsSection title="Do This Next" description="The fastest next step for this account.">
          <div className="flex flex-col justify-between gap-4 rounded-lg border border-border/70 bg-white/80 p-4 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold text-foreground">{nextAction.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{nextAction.detail}</p>
            </div>
            <Link
              href={nextAction.href}
              className="inline-flex rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              {nextAction.label}
            </Link>
          </div>
        </OpsSection>

        <OpsSection title="Fix Or Add Right Here" description="You do not need to leave this page for the next record.">
          <QuickAddForm data={data} initialKind={inlineKind} initialAccountId={accountId} embedded canWrite={access.mode === "owner"} />
        </OpsSection>

        {workspace.openIssues.length > 0 ? (
          <OpsSection title="Active Problems" description="These are the problems still blocking this account. Fix them here or add the missing record.">
            <div className="space-y-3">
              {workspace.openIssues.slice(0, 4).map((issue) => (
                <div key={issue.id} className="flex flex-col justify-between gap-3 rounded-lg border border-border/70 bg-white/80 p-4 md:flex-row md:items-center">
                  <div>
                    <p className="font-semibold text-foreground">
                      {issue.issueType === "duplicate_entry"
                        ? "Duplicate entry"
                        : issue.issueType === "missing_opening_balance"
                          ? "Missing balance start"
                          : issue.issueType === "late_settlement"
                            ? "Late result"
                            : issue.issueType === "statement_shortfall"
                              ? "Still due"
                              : "Needs review"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{issue.notes}</p>
                  </div>
                  <Link
                    href={`/ops/quick-add?kind=${issue.issueType === "statement_shortfall" ? "payout_receipt" : "manual_adjustment"}&account=${accountId}`}
                    className="inline-flex rounded-md border border-border px-3 py-2 text-sm font-semibold text-foreground"
                  >
                    Fix this
                  </Link>
                </div>
              ))}
            </div>
          </OpsSection>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="surface-panel rounded-lg p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Balance Now</p>
            <p className="mt-3 text-3xl font-semibold text-foreground">{formatCurrency(workspace.summary.currentBalance.cash)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatCurrency(workspace.summary.currentBalance.credit)} in credit
            </p>
          </div>
          <div className="surface-panel rounded-lg p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Open Exposure</p>
            <p className="mt-3 text-3xl font-semibold text-foreground">{formatCurrency(workspace.summary.pendingExposure.cash)}</p>
            <p className="mt-1 text-sm text-muted-foreground">Possible payout still hanging on open tickets.</p>
          </div>
          <div className="surface-panel rounded-lg p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Still Due</p>
            <p className="mt-3 text-3xl font-semibold text-foreground">{formatCurrency(workspace.summary.payoutDue.cash)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{formatCurrency(workspace.summary.payoutDue.credit)} credit still due.</p>
          </div>
          <div className="surface-panel rounded-lg p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Problems</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <OpsBadge className={getAccountStatusTone(workspace.summary.account.status)}>{workspace.summary.account.status}</OpsBadge>
              <OpsBadge className={getReconciliationTone(workspace.summary.reconciliationStatus)}>{workspace.summary.reconciliationStatus}</OpsBadge>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{workspace.summary.issueCount} active problem(s).</p>
          </div>
        </section>

        <OpsSection title="Quick Actions" description="Add the next record without leaving this account.">
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            {workspace.quickActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="rounded-lg border border-border/70 bg-white px-3 py-3 text-center text-sm font-semibold text-foreground transition-colors hover:border-primary/50 hover:text-primary"
              >
                {action.label}
              </Link>
            ))}
          </div>
        </OpsSection>

        <section className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
          <OpsSection title="Recent Money Moves" description="Latest balance-changing records for this account.">
            <OpsTable columns={["When", "Type", "Amount", "Source", "Note"]}>
              {workspace.recentEntries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(entry.postedAt ?? entry.occurredAt)}</td>
                  <td className="px-4 py-3 text-foreground">
                    {entry.entryType === "manual_adjustment"
                      ? "Correction needed"
                      : entry.entryType === "opening_balance"
                        ? "Balance start"
                        : entry.entryType.replaceAll("_", " ")}
                  </td>
                  <td className="px-4 py-3 text-foreground">{formatCurrency(entry.signedAmount)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{entry.sourceOfEntry}</td>
                  <td className="px-4 py-3 text-muted-foreground">{entry.description}</td>
                </tr>
              ))}
            </OpsTable>
          </OpsSection>

          <OpsSection title="Notes" description="Messages and notes that explain what is going on.">
            <div className="space-y-3">
              {workspace.notes.map((note) => (
                <div key={note.id} className="rounded-lg border border-border/70 bg-white/80 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-foreground">{note.subject}</p>
                    <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{note.platform}</p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{note.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(note.createdAt)}</p>
                </div>
              ))}
            </div>
          </OpsSection>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <OpsSection title="Recent Tickets" description="Latest action added to this account.">
            <OpsTable columns={["Ticket", "Pick", "Stake", "Status"]}>
              {workspace.recentTickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-foreground">{ticket.ticketRef}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{ticket.market}</p>
                  </td>
                  <td className="px-4 py-3 text-foreground">{ticket.side}</td>
                  <td className="px-4 py-3 text-foreground">
                    {formatCurrency(ticket.stakeCash)} cash / {formatCurrency(ticket.stakeCredit)} credit
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{ticket.status}</td>
                </tr>
              ))}
            </OpsTable>
          </OpsSection>

          <OpsSection title="Recent Results" description="Latest posted results tied to this account.">
            <OpsTable columns={["When", "Result", "Payout", "Net"]}>
              {workspace.recentSettlements.map((settlement) => (
                <tr key={settlement.id}>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(settlement.effectiveAt)}</td>
                  <td className="px-4 py-3 text-foreground">{settlement.settlementType}</td>
                  <td className="px-4 py-3 text-foreground">
                    {formatCurrency(settlement.cashReturn)} cash / {formatCurrency(settlement.creditReturn)} credit
                  </td>
                  <td className="px-4 py-3 text-foreground">
                    {formatCurrency(settlement.pnlCash)} cash / {formatCurrency(settlement.pnlCredit)} credit
                  </td>
                </tr>
              ))}
            </OpsTable>
          </OpsSection>
        </section>
      </div>
    </OpsShell>
  );
}
