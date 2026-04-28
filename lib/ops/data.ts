import { opsMockData } from "@/lib/ops/mock-data";
import type { OpsDataset } from "@/lib/ops/types";

declare const process: { env: Record<string, string | undefined> };

function hasOpsSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function mapOperator(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    name: String(row.name),
    category: row.category as OpsDataset["operators"][number]["category"],
  };
}

function mapAccount(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    operatorId: String(row.operator_id),
    label: String(row.label),
    status: row.status as OpsDataset["accounts"][number]["status"],
    openedAt: String(row.opened_at),
    closedAt: row.closed_at ? String(row.closed_at) : undefined,
    externalAccountRef: row.external_account_ref ? String(row.external_account_ref) : undefined,
  };
}

function mapWalletEntry(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    walletType: row.wallet_type as OpsDataset["walletEntries"][number]["walletType"],
    entryType: row.entry_type as OpsDataset["walletEntries"][number]["entryType"],
    sourceOfEntry: row.source_of_entry as OpsDataset["walletEntries"][number]["sourceOfEntry"],
    signedAmount: Number(row.signed_amount),
    status: row.status as OpsDataset["walletEntries"][number]["status"],
    occurredAt: String(row.occurred_at),
    postedAt: row.posted_at ? String(row.posted_at) : undefined,
    externalRef: row.external_ref ? String(row.external_ref) : undefined,
    dedupeKey: row.dedupe_key ? String(row.dedupe_key) : undefined,
    ticketId: row.ticket_id ? String(row.ticket_id) : undefined,
    statementId: row.statement_id ? String(row.statement_id) : undefined,
    noteId: row.note_id ? String(row.note_id) : undefined,
    description: String(row.description),
  };
}

function mapMarketEvent(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    sport: String(row.sport),
    eventName: String(row.event_name),
    startsAt: String(row.starts_at),
    status: row.status as OpsDataset["marketEvents"][number]["status"],
  };
}

function mapTicket(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    marketEventId: String(row.market_event_id),
    ticketRef: String(row.ticket_ref),
    market: String(row.market),
    side: String(row.side),
    oddsDecimal: Number(row.odds_decimal),
    stakeCash: Number(row.stake_cash),
    stakeCredit: Number(row.stake_credit),
    placedAt: String(row.placed_at),
    acceptedAt: row.accepted_at ? String(row.accepted_at) : undefined,
    status: row.status as OpsDataset["tickets"][number]["status"],
  };
}

function mapTicketSettlement(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    ticketId: String(row.ticket_id),
    sourceOfEntry: row.source_of_entry as OpsDataset["ticketSettlements"][number]["sourceOfEntry"],
    settlementType: row.settlement_type as OpsDataset["ticketSettlements"][number]["settlementType"],
    status: row.status as OpsDataset["ticketSettlements"][number]["status"],
    settledCashStake: Number(row.settled_cash_stake),
    settledCreditStake: Number(row.settled_credit_stake),
    cashReturn: Number(row.cash_return),
    creditReturn: Number(row.credit_return),
    pnlCash: Number(row.pnl_cash),
    pnlCredit: Number(row.pnl_credit),
    effectiveAt: String(row.effective_at),
    externalRef: row.external_ref ? String(row.external_ref) : undefined,
    payoutWalletEntryId: row.payout_wallet_entry_id ? String(row.payout_wallet_entry_id) : undefined,
  };
}

function mapPayoutPeriod(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    operatorId: String(row.operator_id),
    periodType: row.period_type as OpsDataset["payoutPeriods"][number]["periodType"],
    periodStart: String(row.period_start),
    periodEnd: String(row.period_end),
    dueAt: String(row.due_at),
    status: row.status as OpsDataset["payoutPeriods"][number]["status"],
    lockedAt: row.locked_at ? String(row.locked_at) : undefined,
  };
}

function mapPeriodStatement(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    payoutPeriodId: String(row.payout_period_id),
    sourceOfEntry: row.source_of_entry as OpsDataset["periodStatements"][number]["sourceOfEntry"],
    source: row.source as OpsDataset["periodStatements"][number]["source"],
    status: row.status as OpsDataset["periodStatements"][number]["status"],
    statementSeriesId: String(row.statement_series_id),
    versionNo: Number(row.version_no),
    authority: row.authority as OpsDataset["periodStatements"][number]["authority"],
    supersedesStatementId: row.supersedes_statement_id ? String(row.supersedes_statement_id) : undefined,
    supersededByStatementId: row.superseded_by_statement_id ? String(row.superseded_by_statement_id) : undefined,
    statementRef: row.statement_ref ? String(row.statement_ref) : undefined,
    expectedCashDue: Number(row.expected_cash_due),
    expectedCreditDue: Number(row.expected_credit_due),
    postedAt: row.posted_at ? String(row.posted_at) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
  };
}

function mapCreditGrant(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    issuedWalletEntryId: String(row.issued_wallet_entry_id),
    grantRef: String(row.grant_ref),
    originalAmount: Number(row.original_amount),
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    rolloverRequirement: typeof row.rollover_requirement === "number" ? row.rollover_requirement : row.rollover_requirement ? Number(row.rollover_requirement) : undefined,
    status: row.status as OpsDataset["creditGrants"][number]["status"],
  };
}

function mapTicketCreditAllocation(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    ticketId: String(row.ticket_id),
    creditGrantId: String(row.credit_grant_id),
    allocatedAmount: Number(row.allocated_amount),
  };
}

function mapReconciliationRun(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    payoutPeriodId: String(row.payout_period_id),
    statementId: row.statement_id ? String(row.statement_id) : undefined,
    runType: row.run_type as OpsDataset["reconciliationRuns"][number]["runType"],
    status: row.status as OpsDataset["reconciliationRuns"][number]["status"],
    runAt: String(row.run_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
    actor: String(row.actor),
    lockedAt: row.locked_at ? String(row.locked_at) : undefined,
  };
}

function mapReconciliationIssue(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    reconciliationRunId: String(row.reconciliation_run_id),
    accountId: String(row.account_id),
    payoutPeriodId: String(row.payout_period_id),
    issueType: row.issue_type as OpsDataset["reconciliationIssues"][number]["issueType"],
    severity: row.severity as OpsDataset["reconciliationIssues"][number]["severity"],
    status: row.status as OpsDataset["reconciliationIssues"][number]["status"],
    amount: typeof row.amount === "number" ? row.amount : row.amount ? Number(row.amount) : undefined,
    relatedEntityType: row.related_entity_type ? String(row.related_entity_type) as OpsDataset["reconciliationIssues"][number]["relatedEntityType"] : undefined,
    relatedEntityId: row.related_entity_id ? String(row.related_entity_id) : undefined,
    openedAt: String(row.opened_at),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
  };
}

function mapTask(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : undefined,
    payoutPeriodId: row.payout_period_id ? String(row.payout_period_id) : undefined,
    reconciliationIssueId: row.reconciliation_issue_id ? String(row.reconciliation_issue_id) : undefined,
    noteId: row.note_id ? String(row.note_id) : undefined,
    taskType: row.task_type as OpsDataset["tasks"][number]["taskType"],
    status: row.status as OpsDataset["tasks"][number]["status"],
    priority: row.priority as OpsDataset["tasks"][number]["priority"],
    title: String(row.title),
    dueAt: String(row.due_at),
    createdAt: String(row.created_at),
    closedAt: row.closed_at ? String(row.closed_at) : undefined,
  };
}

function mapAccountNote(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    accountId: String(row.account_id),
    noteType: row.note_type as OpsDataset["accountNotes"][number]["noteType"],
    platform: row.platform as OpsDataset["accountNotes"][number]["platform"],
    subject: String(row.subject),
    body: String(row.body),
    affectsCollections: Boolean(row.affects_collections),
    affectsState: Boolean(row.affects_state),
    createdAt: String(row.created_at),
  };
}

function mapAuditEvent(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    entityType: row.entity_type as OpsDataset["auditEvents"][number]["entityType"],
    entityId: String(row.entity_id),
    action: String(row.action),
    actor: String(row.actor),
    detail: String(row.detail),
    createdAt: String(row.created_at),
  };
}

async function fetchOpsDatasetFromSupabase(): Promise<OpsDataset> {
  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  const supabase = getSupabaseAdmin();
  const [
    operatorsResult,
    accountsResult,
    walletEntriesResult,
    marketEventsResult,
    ticketsResult,
    ticketSettlementsResult,
    payoutPeriodsResult,
    periodStatementsResult,
    creditGrantsResult,
    ticketCreditAllocationsResult,
    reconciliationRunsResult,
    reconciliationIssuesResult,
    tasksResult,
    accountNotesResult,
    auditEventsResult,
  ] = await Promise.all([
    supabase.from("ops_operators").select("*").order("id"),
    supabase.from("ops_accounts").select("*").order("id"),
    supabase.from("ops_wallet_entries").select("*").order("occurred_at", { ascending: true }),
    supabase.from("ops_market_events").select("*").order("starts_at", { ascending: true }),
    supabase.from("ops_tickets").select("*").order("placed_at", { ascending: true }),
    supabase.from("ops_ticket_settlements").select("*").order("effective_at", { ascending: true }),
    supabase.from("ops_payout_periods").select("*").order("period_start", { ascending: true }),
    supabase.from("ops_period_statements").select("*").order("version_no", { ascending: true }),
    supabase.from("ops_credit_grants").select("*").order("id"),
    supabase.from("ops_ticket_credit_allocations").select("*").order("id"),
    supabase.from("ops_reconciliation_runs").select("*").order("run_at", { ascending: true }),
    supabase.from("ops_reconciliation_issues").select("*").order("opened_at", { ascending: true }),
    supabase.from("ops_tasks").select("*").order("due_at", { ascending: true }),
    supabase.from("ops_account_notes").select("*").order("created_at", { ascending: true }),
    supabase.from("ops_audit_events").select("*").order("created_at", { ascending: true }),
  ]);

  const results = [
    operatorsResult,
    accountsResult,
    walletEntriesResult,
    marketEventsResult,
    ticketsResult,
    ticketSettlementsResult,
    payoutPeriodsResult,
    periodStatementsResult,
    creditGrantsResult,
    ticketCreditAllocationsResult,
    reconciliationRunsResult,
    reconciliationIssuesResult,
    tasksResult,
    accountNotesResult,
    auditEventsResult,
  ];

  const failed = results.find((result) => result.error);
  if (failed?.error) {
    throw failed.error;
  }

  return {
    operators: (operatorsResult.data ?? []).map((row) => mapOperator(row as Record<string, unknown>)),
    accounts: (accountsResult.data ?? []).map((row) => mapAccount(row as Record<string, unknown>)),
    walletEntries: (walletEntriesResult.data ?? []).map((row) => mapWalletEntry(row as Record<string, unknown>)),
    marketEvents: (marketEventsResult.data ?? []).map((row) => mapMarketEvent(row as Record<string, unknown>)),
    tickets: (ticketsResult.data ?? []).map((row) => mapTicket(row as Record<string, unknown>)),
    ticketSettlements: (ticketSettlementsResult.data ?? []).map((row) => mapTicketSettlement(row as Record<string, unknown>)),
    payoutPeriods: (payoutPeriodsResult.data ?? []).map((row) => mapPayoutPeriod(row as Record<string, unknown>)),
    periodStatements: (periodStatementsResult.data ?? []).map((row) => mapPeriodStatement(row as Record<string, unknown>)),
    creditGrants: (creditGrantsResult.data ?? []).map((row) => mapCreditGrant(row as Record<string, unknown>)),
    ticketCreditAllocations: (ticketCreditAllocationsResult.data ?? []).map((row) =>
      mapTicketCreditAllocation(row as Record<string, unknown>),
    ),
    reconciliationRuns: (reconciliationRunsResult.data ?? []).map((row) => mapReconciliationRun(row as Record<string, unknown>)),
    reconciliationIssues: (reconciliationIssuesResult.data ?? []).map((row) => mapReconciliationIssue(row as Record<string, unknown>)),
    tasks: (tasksResult.data ?? []).map((row) => mapTask(row as Record<string, unknown>)),
    accountNotes: (accountNotesResult.data ?? []).map((row) => mapAccountNote(row as Record<string, unknown>)),
    auditEvents: (auditEventsResult.data ?? []).map((row) => mapAuditEvent(row as Record<string, unknown>)),
  };
}

export async function loadOpsDatasetStrict(): Promise<OpsDataset> {
  if (!hasOpsSupabaseConfig()) {
    throw new Error("Supabase ops data is not configured. Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return fetchOpsDatasetFromSupabase();
}

export async function loadOpsDataset(): Promise<OpsDataset> {
  if (!hasOpsSupabaseConfig()) {
    return opsMockData;
  }

  try {
    return await fetchOpsDatasetFromSupabase();
  } catch (error) {
    console.error("Falling back to local ops dataset because Supabase load failed.", error);
    return opsMockData;
  }
}
