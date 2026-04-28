import { loadOpsDataset } from "@/lib/ops/data";
import { opsMockData } from "@/lib/ops/mock-data";
import {
  assertOpsInvariants,
  getAuthoritativeStatement,
  getLedgerSettledNetForStatement,
  getStatementExpectedTotal,
  getStatementVariance,
  getTicketPayoutExposure,
} from "@/lib/ops/invariants";
import type {
  OpsAccount,
  OpsAccountStatus,
  OpsDataset,
  OpsPeriodStatement,
  OpsPayoutPeriod,
  OpsReconciliationIssue,
  OpsReconciliationStatus,
  OpsTaskPriority,
  OpsWalletEntry,
  OpsWalletEntryStatus,
} from "@/lib/ops/types";

const NOW = new Date("2026-04-17T14:22:00-07:00");
const WEEK_START = new Date("2026-04-13T00:00:00-07:00");
const WEEK_END = new Date("2026-04-19T23:59:59-07:00");

type MoneySummary = {
  cash: number | null;
  credit: number | null;
};

type AccountComputed = {
  account: OpsAccount;
  operatorName: string;
  currentBalance: MoneySummary;
  pendingExposure: MoneySummary;
  settledCashNetWeek: number;
  payoutDue: MoneySummary;
  overduePayout: MoneySummary;
  statementVariance: number | null;
  reconciliationStatus: OpsReconciliationStatus | "not_run";
  issueCount: number;
  latestNote?: string;
  balanceSupportState: "supported" | "missing_opening_balance";
};

type ReconciliationComputed = {
  account: OpsAccount;
  operatorName: string;
  payoutPeriod: OpsPayoutPeriod;
  statement?: OpsPeriodStatement;
  ledgerSettledNet: number | null;
  statementExpected: number | null;
  variance: number | null;
  receivedCash: number;
  receivedCredit: number;
  payoutDueCash: number | null;
  payoutDueCredit: number | null;
  overdueCash: number | null;
  overdueCredit: number | null;
  openTicketCount: number;
  issueCount: number;
  status: OpsReconciliationStatus | "not_run";
  issues: OpsReconciliationIssue[];
};

type DashboardComputed = {
  metrics: {
    currentCashBalance: number | null;
    pendingExposureCash: number;
    weeklySettledCashNet: number;
    payoutDueCash: number | null;
    payoutDueCredit: number | null;
    overdueCash: number;
    overdueCredit: number;
    openIssueCount: number;
  };
  actionQueue: Array<{
    id: string;
    title: string;
    accountLabel?: string;
    operatorName?: string;
    priority: OpsTaskPriority;
    dueAt: string;
    status: string;
    linkedIssueAmount?: number;
  }>;
  accountRows: AccountComputed[];
  reconciliationRows: ReconciliationComputed[];
  weeklyBreakdown: Array<{
    label: string;
    amount: number;
    sourceRecordIds: string[];
  }>;
};

type AccountWorkspace = {
  summary: AccountComputed;
  openIssues: OpsDataset["reconciliationIssues"];
  recentEntries: OpsDataset["walletEntries"];
  recentTickets: OpsDataset["tickets"];
  recentSettlements: OpsDataset["ticketSettlements"];
  notes: OpsDataset["accountNotes"];
  quickActions: Array<{
    label: string;
    href: string;
  }>;
};

export function getOpsDataset(): OpsDataset {
  return opsMockData;
}

export async function getOpsDatasetFromSource(): Promise<OpsDataset> {
  return loadOpsDataset();
}

export function formatCurrency(value: number | null): string {
  if (value === null) {
    return "Unknown";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function getAccountStatusTone(status: OpsAccountStatus): string {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    case "paused":
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
    case "collections":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
    case "closed":
      return "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200";
  }
}

export function getPriorityTone(priority: OpsTaskPriority): string {
  switch (priority) {
    case "high":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
    case "medium":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    case "low":
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
  }
}

export function getReconciliationTone(status: ReconciliationComputed["status"]): string {
  switch (status) {
    case "clean":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    case "attention":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    case "blocked":
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
    case "disputed":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
    case "not_run":
      return "bg-blue-50 text-blue-700 ring-1 ring-blue-200";
  }
}

function isPosted(entry: OpsWalletEntry): boolean {
  return entry.status === "posted";
}

function isExcludedFromAuthority(status: OpsWalletEntryStatus): boolean {
  return status === "pending" || status === "void" || status === "duplicate" || status === "disputed";
}

function isInCurrentWeek(value?: string): boolean {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  return date >= WEEK_START && date <= WEEK_END;
}

function getAccountOpeningEntry(entries: OpsWalletEntry[], walletType: "cash" | "credit") {
  return entries.find((entry) => entry.entryType === "opening_balance" && entry.walletType === walletType && entry.status === "posted");
}

function sumWallet(entries: OpsWalletEntry[], walletType: "cash" | "credit"): number {
  return entries
    .filter((entry) => entry.walletType === walletType && isPosted(entry))
    .reduce((sum, entry) => sum + entry.signedAmount, 0);
}

function getCurrentBalance(entries: OpsWalletEntry[]): MoneySummary {
  const hasCashOpening = Boolean(getAccountOpeningEntry(entries, "cash"));
  const hasCreditOpening = Boolean(getAccountOpeningEntry(entries, "credit"));

  return {
    cash: hasCashOpening ? sumWallet(entries, "cash") : null,
    credit: hasCreditOpening ? sumWallet(entries, "credit") : 0,
  };
}

function getWeeklySettledCashNet(accountId: string, data: OpsDataset): number {
  const ticketIds = new Set(data.tickets.filter((ticket) => ticket.accountId === accountId).map((ticket) => ticket.id));

  return data.ticketSettlements
    .filter((settlement) => settlement.status === "posted" && ticketIds.has(settlement.ticketId) && isInCurrentWeek(settlement.effectiveAt))
    .reduce((sum, settlement) => sum + settlement.pnlCash, 0);
}

function getLatestRunStatus(accountId: string, data: OpsDataset): ReconciliationComputed["status"] {
  const runs = data.reconciliationRuns
    .filter((run) => run.accountId === accountId)
    .sort((a, b) => +new Date(b.runAt) - +new Date(a.runAt));

  return runs[0]?.status ?? "not_run";
}

function getStatementReceipts(statement: OpsPeriodStatement, entries: OpsWalletEntry[]): MoneySummary {
  const ledgerNet = getLedgerSettledNetForStatement(statement, entries);
  return { cash: ledgerNet.cash, credit: ledgerNet.credit };
}

function getPayoutDue(statement: OpsPeriodStatement | undefined, entries: OpsWalletEntry[]): MoneySummary {
  if (!statement) {
    return { cash: null, credit: null };
  }

  const received = getStatementReceipts(statement, entries);

  return {
    cash: Math.max(statement.expectedCashDue - (received.cash ?? 0), 0),
    credit: Math.max(statement.expectedCreditDue - (received.credit ?? 0), 0),
  };
}

function getOverduePayout(statement: OpsPeriodStatement | undefined, payoutPeriod: OpsPayoutPeriod | undefined, entries: OpsWalletEntry[]): MoneySummary {
  if (!statement || !payoutPeriod) {
    return { cash: null, credit: null };
  }

  const due = getPayoutDue(statement, entries);
  if (NOW <= new Date(payoutPeriod.dueAt)) {
    return { cash: 0, credit: 0 };
  }

  return {
    cash: due.cash ?? 0,
    credit: due.credit ?? 0,
  };
}

function getOpenIssuesForAccount(accountId: string, data: OpsDataset) {
  return data.reconciliationIssues.filter(
    (issue) => issue.accountId === accountId && (issue.status === "open" || issue.status === "disputed"),
  );
}

function buildAccountComputed(data: OpsDataset): AccountComputed[] {
  return data.accounts.map((account) => {
    const operatorName = data.operators.find((operator) => operator.id === account.operatorId)?.name ?? "Unknown";
    const entries = data.walletEntries.filter((entry) => entry.accountId === account.id);
    const tickets = data.tickets.filter((ticket) => ticket.accountId === account.id);
    const statements = data.periodStatements.filter((statement) => statement.accountId === account.id);
    const authoritativeStatements = statements.filter((statement) => statement.authority === "authoritative");
    const latestAuthoritative = [...authoritativeStatements].sort((a, b) => +(new Date(b.postedAt ?? 0)) - +(new Date(a.postedAt ?? 0)))[0];
    const latestPeriod = latestAuthoritative
      ? data.payoutPeriods.find((period) => period.id === latestAuthoritative.payoutPeriodId)
      : undefined;
    const currentBalance = getCurrentBalance(entries);
    const pendingExposure = tickets.reduce<MoneySummary>(
      (sum, ticket) => ({
        cash: (sum.cash ?? 0) + getTicketPayoutExposure(ticket, data.ticketSettlements),
        credit: 0,
      }),
      { cash: 0, credit: 0 },
    );
    const payoutDue = getPayoutDue(latestAuthoritative, entries);
    const overduePayout = getOverduePayout(latestAuthoritative, latestPeriod, entries);
    const latestNote = data.accountNotes
      .filter((note) => note.accountId === account.id)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0]?.subject;
    const issueCount = getOpenIssuesForAccount(account.id, data).length;

    for (const entry of entries) {
      if (entry.statementId && !data.periodStatements.some((statement) => statement.id === entry.statementId) && !isExcludedFromAuthority(entry.status)) {
        throw new Error(`Wallet entry ${entry.id} references missing statement ${entry.statementId}`);
      }
    }

    return {
      account,
      operatorName,
      currentBalance,
      pendingExposure,
      settledCashNetWeek: getWeeklySettledCashNet(account.id, data),
      payoutDue,
      overduePayout,
      statementVariance: latestAuthoritative ? getStatementVariance(latestAuthoritative, entries) : null,
      reconciliationStatus: getLatestRunStatus(account.id, data),
      issueCount,
      latestNote,
      balanceSupportState: currentBalance.cash === null ? "missing_opening_balance" : "supported",
    };
  });
}

function buildReconciliationComputed(data: OpsDataset): ReconciliationComputed[] {
  return data.reconciliationRuns.map((run) => {
    const account = data.accounts.find((item) => item.id === run.accountId);
    const payoutPeriod = data.payoutPeriods.find((item) => item.id === run.payoutPeriodId);

    if (!account || !payoutPeriod) {
      throw new Error(`Reconciliation run ${run.id} references missing account or payout period`);
    }

    const operatorName = data.operators.find((operator) => operator.id === account.operatorId)?.name ?? "Unknown";
    const entries = data.walletEntries.filter((entry) => entry.accountId === account.id);
    const authoritativeStatement = getAuthoritativeStatement(data.periodStatements, account.id, payoutPeriod.id);
    const displayStatement = run.statementId ? data.periodStatements.find((item) => item.id === run.statementId) : authoritativeStatement;
    const received = authoritativeStatement ? getStatementReceipts(authoritativeStatement, entries) : { cash: 0, credit: 0 };
    const payoutDue = getPayoutDue(authoritativeStatement, entries);
    const overdue = getOverduePayout(authoritativeStatement, payoutPeriod, entries);
    const issues = data.reconciliationIssues.filter(
      (issue) => issue.reconciliationRunId === run.id && (issue.status === "open" || issue.status === "disputed"),
    );
    const openTicketCount = data.tickets.filter(
      (ticket) => ticket.accountId === account.id && (ticket.status === "open" || ticket.status === "partially_settled"),
    ).length;

    return {
      account,
      operatorName,
      payoutPeriod,
      statement: displayStatement,
      ledgerSettledNet: authoritativeStatement ? getLedgerSettledNetForStatement(authoritativeStatement, entries).total : null,
      statementExpected: getStatementExpectedTotal(authoritativeStatement),
      variance: authoritativeStatement ? getStatementVariance(authoritativeStatement, entries) : null,
      receivedCash: received.cash ?? 0,
      receivedCredit: received.credit ?? 0,
      payoutDueCash: payoutDue.cash,
      payoutDueCredit: payoutDue.credit,
      overdueCash: overdue.cash,
      overdueCredit: overdue.credit,
      openTicketCount,
      issueCount: issues.length,
      status: run.status,
      issues,
    };
  });
}

function getWeeklyBreakdown(data: OpsDataset) {
  const weeklySettlements = data.ticketSettlements.filter(
    (settlement) => settlement.status === "posted" && isInCurrentWeek(settlement.effectiveAt),
  );

  return weeklySettlements.map((settlement) => {
    const ticket = data.tickets.find((item) => item.id === settlement.ticketId);
    const account = ticket ? data.accounts.find((item) => item.id === ticket.accountId) : undefined;
    return {
      label: `${account?.label ?? "Unknown"} · ${ticket?.ticketRef ?? settlement.id}`,
      amount: settlement.pnlCash,
      sourceRecordIds: [settlement.id, settlement.ticketId, settlement.payoutWalletEntryId ?? "none"],
    };
  });
}

export function buildOpsDashboard(data: OpsDataset): DashboardComputed {
  assertOpsInvariants(data);

  const accountRows = buildAccountComputed(data);
  const reconciliationRows = buildReconciliationComputed(data);
  const openIssues = data.reconciliationIssues.filter((issue) => issue.status === "open" || issue.status === "disputed");
  const weeklyBreakdown = getWeeklyBreakdown(data);
  const allCurrentCashKnown = accountRows.every((row) => row.currentBalance.cash !== null);
  const allPayoutDueKnown = accountRows.every((row) => row.payoutDue.cash !== null && row.payoutDue.credit !== null);

  return {
    metrics: {
      currentCashBalance: allCurrentCashKnown
        ? accountRows.reduce((sum, row) => sum + (row.currentBalance.cash ?? 0), 0)
        : null,
      pendingExposureCash: accountRows.reduce((sum, row) => sum + (row.pendingExposure.cash ?? 0), 0),
      weeklySettledCashNet: accountRows.reduce((sum, row) => sum + row.settledCashNetWeek, 0),
      payoutDueCash: allPayoutDueKnown ? accountRows.reduce((sum, row) => sum + (row.payoutDue.cash ?? 0), 0) : null,
      payoutDueCredit: allPayoutDueKnown ? accountRows.reduce((sum, row) => sum + (row.payoutDue.credit ?? 0), 0) : null,
      overdueCash: accountRows.reduce((sum, row) => sum + (row.overduePayout.cash ?? 0), 0),
      overdueCredit: accountRows.reduce((sum, row) => sum + (row.overduePayout.credit ?? 0), 0),
      openIssueCount: openIssues.length,
    },
    actionQueue: data.tasks
      .filter((task) => task.status === "open" || task.status === "in_progress")
      .map((task) => ({
        id: task.id,
        title: task.title,
        accountLabel: task.accountId ? data.accounts.find((account) => account.id === task.accountId)?.label : undefined,
        operatorName: task.accountId
          ? data.operators.find(
              (operator) => operator.id === data.accounts.find((account) => account.id === task.accountId)?.operatorId,
            )?.name
          : undefined,
        priority: task.priority,
        dueAt: task.dueAt,
        status: task.status,
        linkedIssueAmount: task.reconciliationIssueId
          ? data.reconciliationIssues.find((issue) => issue.id === task.reconciliationIssueId)?.amount
          : undefined,
      }))
      .sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt)),
    accountRows,
    reconciliationRows,
    weeklyBreakdown,
  };
}

export function getOpsDashboard(): DashboardComputed {
  return buildOpsDashboard(getOpsDataset());
}

export async function getOpsDashboardFromSource(): Promise<DashboardComputed> {
  return buildOpsDashboard(await getOpsDatasetFromSource());
}

export function getMetricTrace() {
  const data = getOpsDataset();
  assertOpsInvariants(data);

  return {
    currentCashBalance: data.walletEntries
      .filter((entry) => entry.walletType === "cash" && entry.status === "posted")
      .map((entry) => entry.id),
    weeklySettledCashNet: data.ticketSettlements
      .filter((settlement) => settlement.status === "posted" && isInCurrentWeek(settlement.effectiveAt))
      .map((settlement) => settlement.id),
    payoutDue: data.periodStatements
      .filter((statement) => statement.authority === "authoritative")
      .map((statement) => statement.id),
  };
}

export function getRecentActivity(limit = 10) {
  const data = getOpsDataset();
  assertOpsInvariants(data);

  const events = [
    ...data.walletEntries.map((entry) => ({
      id: entry.id,
      when: entry.postedAt ?? entry.occurredAt,
      kind: "money move",
      title: entry.description,
      accountId: entry.accountId,
    })),
    ...data.ticketSettlements.map((settlement) => ({
      id: settlement.id,
      when: settlement.effectiveAt,
      kind: "result posted",
      title: settlement.id,
      accountId: data.tickets.find((ticket) => ticket.id === settlement.ticketId)?.accountId,
    })),
    ...data.accountNotes.map((note) => ({
      id: note.id,
      when: note.createdAt,
      kind: "note",
      title: note.subject,
      accountId: note.accountId,
    })),
    ...data.auditEvents.map((event) => ({
      id: event.id,
      when: event.createdAt,
      kind: "audit",
      title: event.detail,
      accountId: undefined,
    })),
  ];

  return events
    .sort((a, b) => +new Date(b.when) - +new Date(a.when))
    .slice(0, limit)
    .map((event) => ({
      ...event,
      accountLabel: event.accountId ? data.accounts.find((account) => account.id === event.accountId)?.label : undefined,
    }));
}

export async function getRecentActivityFromSource(limit = 10) {
  const data = await getOpsDatasetFromSource();
  assertOpsInvariants(data);

  const events = [
    ...data.walletEntries.map((entry) => ({
      id: entry.id,
      when: entry.postedAt ?? entry.occurredAt,
      kind: "money move",
      title: entry.description,
      accountId: entry.accountId,
    })),
    ...data.ticketSettlements.map((settlement) => ({
      id: settlement.id,
      when: settlement.effectiveAt,
      kind: "result posted",
      title: settlement.id,
      accountId: data.tickets.find((ticket) => ticket.id === settlement.ticketId)?.accountId,
    })),
    ...data.accountNotes.map((note) => ({
      id: note.id,
      when: note.createdAt,
      kind: "note",
      title: note.subject,
      accountId: note.accountId,
    })),
    ...data.auditEvents.map((event) => ({
      id: event.id,
      when: event.createdAt,
      kind: "audit",
      title: event.detail,
      accountId: undefined,
    })),
  ];

  return events
    .sort((a, b) => +new Date(b.when) - +new Date(a.when))
    .slice(0, limit)
    .map((event) => ({
      ...event,
      accountLabel: event.accountId ? data.accounts.find((account) => account.id === event.accountId)?.label : undefined,
    }));
}

export function rankAccountUrgency(row: ReturnType<typeof getOpsDashboard>["accountRows"][number]) {
  if ((row.overduePayout.cash ?? 0) > 0 || (row.overduePayout.credit ?? 0) > 0) return 100;
  if (row.balanceSupportState === "missing_opening_balance") return 90;
  if (row.issueCount > 0) return 80;
  if ((row.pendingExposure.cash ?? 0) > 0) return 70;
  return 10;
}

export function getAccountWorkspace(accountId: string): AccountWorkspace {
  const data = getOpsDataset();
  return getAccountWorkspaceForData(data, accountId);
}

export function getAccountWorkspaceForData(data: OpsDataset, accountId: string): AccountWorkspace {
  const dashboard = buildOpsDashboard(data);
  const summary = dashboard.accountRows.find((row) => row.account.id === accountId);

  if (!summary) {
    throw new Error(`Unknown account ${accountId}`);
  }

  const recentEntries = data.walletEntries
    .filter((entry) => entry.accountId === accountId)
    .sort((a, b) => +new Date(b.postedAt ?? b.occurredAt) - +new Date(a.postedAt ?? a.occurredAt))
    .slice(0, 8);
  const recentTickets = data.tickets
    .filter((ticket) => ticket.accountId === accountId)
    .sort((a, b) => +new Date(b.acceptedAt ?? b.placedAt) - +new Date(a.acceptedAt ?? a.placedAt))
    .slice(0, 6);
  const recentSettlements = data.ticketSettlements
    .filter((settlement) =>
      recentTickets.some((ticket) => ticket.id === settlement.ticketId),
    )
    .sort((a, b) => +new Date(b.effectiveAt) - +new Date(a.effectiveAt))
    .slice(0, 6);
  const notes = data.accountNotes
    .filter((note) => note.accountId === accountId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 6);

  return {
    summary,
    openIssues: data.reconciliationIssues.filter(
      (issue) => issue.accountId === accountId && (issue.status === "open" || issue.status === "disputed"),
    ),
    recentEntries,
    recentTickets,
    recentSettlements,
    notes,
    quickActions: [
      { label: "Add deposit", href: `/ops/quick-add?kind=deposit&account=${accountId}` },
      { label: "Add ticket", href: `/ops/quick-add?kind=ticket&account=${accountId}` },
      { label: "Post result", href: `/ops/quick-add?kind=settlement&account=${accountId}` },
      { label: "Record payout", href: `/ops/quick-add?kind=payout_receipt&account=${accountId}` },
      { label: "Add note", href: `/ops/quick-add?kind=note&account=${accountId}` },
      { label: "Fix balance", href: `/ops/quick-add?kind=manual_adjustment&account=${accountId}` },
    ],
  };
}

export async function getAccountWorkspaceFromSource(accountId: string): Promise<AccountWorkspace> {
  return getAccountWorkspaceForData(await getOpsDatasetFromSource(), accountId);
}
