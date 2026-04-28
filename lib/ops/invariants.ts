import type {
  OpsDataset,
  OpsPeriodStatement,
  OpsReconciliationIssue,
  OpsTicket,
  OpsTicketSettlement,
  OpsWalletEntry,
} from "@/lib/ops/types";

export class OpsInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpsInvariantError";
  }
}

export function getAuthoritativeStatement(
  statements: OpsPeriodStatement[],
  accountId: string,
  payoutPeriodId: string,
): OpsPeriodStatement | undefined {
  const inScope = statements.filter(
    (statement) => statement.accountId === accountId && statement.payoutPeriodId === payoutPeriodId,
  );

  return inScope.find((statement) => statement.authority === "authoritative");
}

export function getLedgerSettledNetForStatement(
  statement: OpsPeriodStatement | undefined,
  entries: OpsWalletEntry[],
): { cash: number; credit: number; total: number } {
  if (!statement) {
    return { cash: 0, credit: 0, total: 0 };
  }

  const cash = entries
    .filter(
      (entry) =>
        entry.statementId === statement.id &&
        entry.walletType === "cash" &&
        entry.entryType === "payout_cash_receipt" &&
        entry.status === "posted",
    )
    .reduce((sum, entry) => sum + entry.signedAmount, 0);

  const credit = entries
    .filter(
      (entry) =>
        entry.statementId === statement.id &&
        entry.walletType === "credit" &&
        entry.entryType === "payout_credit_receipt" &&
        entry.status === "posted",
    )
    .reduce((sum, entry) => sum + entry.signedAmount, 0);

  return { cash, credit, total: cash + credit };
}

export function getStatementExpectedTotal(statement: OpsPeriodStatement | undefined): number | null {
  if (!statement) {
    return null;
  }

  return statement.expectedCashDue + statement.expectedCreditDue;
}

export function getStatementVariance(statement: OpsPeriodStatement | undefined, entries: OpsWalletEntry[]): number | null {
  const expected = getStatementExpectedTotal(statement);
  if (expected === null) {
    return null;
  }

  return getLedgerSettledNetForStatement(statement, entries).total - expected;
}

export function getTicketPayoutExposure(
  ticket: OpsTicket,
  settlements: OpsTicketSettlement[],
): number {
  if (ticket.status !== "open" && ticket.status !== "partially_settled") {
    return 0;
  }

  const postedSettlements = settlements.filter((settlement) => settlement.ticketId === ticket.id && settlement.status === "posted");
  const settledCashStake = postedSettlements.reduce((sum, settlement) => sum + settlement.settledCashStake, 0);
  const settledCreditStake = postedSettlements.reduce((sum, settlement) => sum + settlement.settledCreditStake, 0);
  const realizedReturns = postedSettlements.reduce((sum, settlement) => sum + settlement.cashReturn + settlement.creditReturn, 0);
  const remainingStake = Math.max(ticket.stakeCash - settledCashStake, 0) + Math.max(ticket.stakeCredit - settledCreditStake, 0);

  return Math.max(remainingStake * ticket.oddsDecimal - realizedReturns, 0);
}

export function assertOpsInvariants(data: OpsDataset): void {
  const accountIds = new Set(data.accounts.map((account) => account.id));
  const ticketIds = new Set(data.tickets.map((ticket) => ticket.id));
  const noteIds = new Set(data.accountNotes.map((note) => note.id));
  const statementIds = new Set(data.periodStatements.map((statement) => statement.id));
  const payoutPeriodIds = new Set(data.payoutPeriods.map((period) => period.id));
  const creditGrantIds = new Set(data.creditGrants.map((grant) => grant.id));

  const activeDedupeKeys = new Map<string, string>();

  for (const entry of data.walletEntries) {
    if (!accountIds.has(entry.accountId)) {
      throw new OpsInvariantError(`wallet entry ${entry.id} references missing account ${entry.accountId}`);
    }
    if (entry.ticketId && !ticketIds.has(entry.ticketId)) {
      throw new OpsInvariantError(`wallet entry ${entry.id} references missing ticket ${entry.ticketId}`);
    }
    if (entry.statementId && !statementIds.has(entry.statementId)) {
      throw new OpsInvariantError(`wallet entry ${entry.id} references missing statement ${entry.statementId}`);
    }
    if (entry.noteId && !noteIds.has(entry.noteId)) {
      throw new OpsInvariantError(`wallet entry ${entry.id} references missing note ${entry.noteId}`);
    }
    if ((entry.entryType === "manual_adjustment" || entry.entryType === "correction_reverse") && !entry.noteId) {
      throw new OpsInvariantError(`wallet entry ${entry.id} is a correction without note linkage`);
    }
    if (entry.entryType === "manual_adjustment" || entry.entryType === "correction_reverse") {
      const hasAuditEvent = data.auditEvents.some(
        (event) => event.entityType === "wallet_entry" && event.entityId === entry.id,
      );
      if (!hasAuditEvent) {
        throw new OpsInvariantError(`wallet entry ${entry.id} is a silent correction without audit event`);
      }
    }
    if (entry.dedupeKey && entry.status !== "duplicate" && entry.status !== "void") {
      const existing = activeDedupeKeys.get(entry.dedupeKey);
      if (existing) {
        throw new OpsInvariantError(`dedupe_key ${entry.dedupeKey} duplicates authoritative entries ${existing} and ${entry.id}`);
      }
      activeDedupeKeys.set(entry.dedupeKey, entry.id);
    }
  }

  for (const settlement of data.ticketSettlements) {
    if (!ticketIds.has(settlement.ticketId)) {
      throw new OpsInvariantError(`ticket settlement ${settlement.id} references missing ticket ${settlement.ticketId}`);
    }
    if (settlement.payoutWalletEntryId) {
      const payoutEntry = data.walletEntries.find((entry) => entry.id === settlement.payoutWalletEntryId);
      if (!payoutEntry) {
        throw new OpsInvariantError(`ticket settlement ${settlement.id} references missing payout wallet entry`);
      }
      if (payoutEntry.ticketId !== settlement.ticketId) {
        throw new OpsInvariantError(`ticket settlement ${settlement.id} payout wallet entry is linked to another ticket`);
      }
      if (payoutEntry.status !== "posted") {
        throw new OpsInvariantError(`ticket settlement ${settlement.id} payout wallet entry must be posted`);
      }
      if (payoutEntry.walletType === "cash" && payoutEntry.signedAmount !== settlement.cashReturn) {
        throw new OpsInvariantError(`ticket settlement ${settlement.id} cash payout does not match linked wallet entry`);
      }
    }
  }

  const statementsBySeries = new Map<string, OpsPeriodStatement[]>();
  for (const statement of data.periodStatements) {
    if (!accountIds.has(statement.accountId) || !payoutPeriodIds.has(statement.payoutPeriodId)) {
      throw new OpsInvariantError(`statement ${statement.id} references missing account or payout period`);
    }
    const series = statementsBySeries.get(statement.statementSeriesId) ?? [];
    series.push(statement);
    statementsBySeries.set(statement.statementSeriesId, series);
  }

  for (const [seriesId, series] of statementsBySeries.entries()) {
    const authoritative = series.filter((statement) => statement.authority === "authoritative");
    const suspended = series.filter((statement) => statement.authority === "suspended");
    const versions = new Set<number>();

    for (const statement of series) {
      if (versions.has(statement.versionNo)) {
        throw new OpsInvariantError(`statement series ${seriesId} has duplicate version ${statement.versionNo}`);
      }
      versions.add(statement.versionNo);
      if (statement.authority === "superseded" && !statement.supersededByStatementId) {
        throw new OpsInvariantError(`superseded statement ${statement.id} is missing supersededByStatementId`);
      }
      if (statement.authority === "suspended" && statement.status !== "disputed") {
        throw new OpsInvariantError(`suspended statement ${statement.id} must be disputed`);
      }
    }

    if (authoritative.length > 1) {
      throw new OpsInvariantError(`statement series ${seriesId} has multiple authoritative revisions`);
    }
    if (suspended.length > 0 && authoritative.length > 0) {
      throw new OpsInvariantError(`statement series ${seriesId} cannot be both suspended and authoritative`);
    }
  }

  for (const grant of data.creditGrants) {
    if (!accountIds.has(grant.accountId)) {
      throw new OpsInvariantError(`credit grant ${grant.id} references missing account`);
    }
    const issueEntry = data.walletEntries.find((entry) => entry.id === grant.issuedWalletEntryId);
    if (!issueEntry || issueEntry.entryType !== "credit_issue" || issueEntry.walletType !== "credit" || issueEntry.status !== "posted") {
      throw new OpsInvariantError(`credit grant ${grant.id} must originate from a posted credit_issue wallet entry`);
    }
    const allocations = data.ticketCreditAllocations.filter((allocation) => allocation.creditGrantId === grant.id);
    const allocated = allocations.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0);
    if (allocated > grant.originalAmount) {
      throw new OpsInvariantError(`credit grant ${grant.id} allocates more than original amount`);
    }
    if (grant.status === "fully_wagered" && allocated !== grant.originalAmount) {
      throw new OpsInvariantError(`credit grant ${grant.id} marked fully_wagered without full allocation`);
    }
    if (grant.status === "partially_wagered" && (allocated <= 0 || allocated >= grant.originalAmount)) {
      throw new OpsInvariantError(`credit grant ${grant.id} marked partially_wagered with invalid allocation state`);
    }
  }

  for (const allocation of data.ticketCreditAllocations) {
    if (!creditGrantIds.has(allocation.creditGrantId)) {
      throw new OpsInvariantError(`credit allocation ${allocation.id} references missing grant`);
    }
    const ticket = data.tickets.find((item) => item.id === allocation.ticketId);
    if (!ticket) {
      throw new OpsInvariantError(`credit allocation ${allocation.id} references missing ticket`);
    }
  }

  for (const run of data.reconciliationRuns) {
    if (!accountIds.has(run.accountId) || !payoutPeriodIds.has(run.payoutPeriodId)) {
      throw new OpsInvariantError(`reconciliation run ${run.id} references missing account or payout period`);
    }
    const payoutPeriod = data.payoutPeriods.find((period) => period.id === run.payoutPeriodId)!;
    if (run.lockedAt && run.status !== "clean") {
      throw new OpsInvariantError(`reconciliation run ${run.id} cannot be locked unless clean`);
    }
    if (payoutPeriod.lockedAt) {
      const lockedAt = +new Date(payoutPeriod.lockedAt);
      const periodStart = +new Date(payoutPeriod.periodStart);
      const periodEnd = +new Date(payoutPeriod.periodEnd);

      for (const entry of data.walletEntries.filter((entry) => entry.accountId === run.accountId)) {
        const occurredAt = +new Date(entry.occurredAt);
        if (
          occurredAt >= periodStart &&
          occurredAt <= periodEnd &&
          occurredAt > lockedAt &&
          entry.entryType !== "correction_reverse" &&
          entry.entryType !== "manual_adjustment"
        ) {
          throw new OpsInvariantError(`locked payout period ${payoutPeriod.id} has mutable wallet entry ${entry.id}`);
        }
      }
    }
  }

  const openIssuesByAccountPeriod = new Map<string, OpsReconciliationIssue[]>();
  for (const issue of data.reconciliationIssues) {
    const key = `${issue.accountId}:${issue.payoutPeriodId}`;
    const issues = openIssuesByAccountPeriod.get(key) ?? [];
    if (issue.status === "open" || issue.status === "disputed") {
      issues.push(issue);
    }
    openIssuesByAccountPeriod.set(key, issues);
  }

  for (const statement of data.periodStatements) {
    const variance = getStatementVariance(statement.authority === "authoritative" ? statement : undefined, data.walletEntries);
    const key = `${statement.accountId}:${statement.payoutPeriodId}`;
    const issues = openIssuesByAccountPeriod.get(key) ?? [];
    if (variance !== null && variance !== 0) {
      const hasVarianceIssue = issues.some((issue) => issue.relatedEntityId === statement.id && issue.issueType === "statement_shortfall");
      if (!hasVarianceIssue) {
        throw new OpsInvariantError(`statement ${statement.id} has variance ${variance} without reconciliation issue`);
      }
    }
  }
}
