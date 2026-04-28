import { writeFile } from "node:fs/promises";

import { opsMockData } from "../lib/ops/mock-data.ts";

function sqlLiteral(value) {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function insertStatements(tableName, columns, rows) {
  return rows
    .map((row) => {
      const values = columns.map((column) => sqlLiteral(row[column]));
      const updates = columns
        .filter((column) => column !== "id")
        .map((column) => `${column} = excluded.${column}`)
        .join(", ");

      return `insert into ${tableName} (${columns.join(", ")}) values (${values.join(", ")}) on conflict (id) do update set ${updates};`;
    })
    .join("\n");
}

function updateStatements(tableName, columns, rows) {
  return rows
    .map((row) => {
      const assignments = columns.map((column) => `${column} = ${sqlLiteral(row[column])}`).join(", ");
      return `update ${tableName} set ${assignments} where id = ${sqlLiteral(row.id)};`;
    })
    .join("\n");
}

const seedData = {
  operators: opsMockData.operators.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
  })),
  accounts: opsMockData.accounts.map((item) => ({
    id: item.id,
    operator_id: item.operatorId,
    label: item.label,
    status: item.status,
    opened_at: item.openedAt,
    closed_at: item.closedAt ?? null,
    external_account_ref: item.externalAccountRef ?? null,
  })),
  market_events: opsMockData.marketEvents.map((item) => ({
    id: item.id,
    sport: item.sport,
    event_name: item.eventName,
    starts_at: item.startsAt,
    status: item.status,
    external_event_ref: null,
  })),
  payout_periods: opsMockData.payoutPeriods.map((item) => ({
    id: item.id,
    operator_id: item.operatorId,
    period_type: item.periodType,
    period_start: item.periodStart,
    period_end: item.periodEnd,
    due_at: item.dueAt,
    status: item.status,
    locked_at: item.lockedAt ?? null,
  })),
  period_statements: opsMockData.periodStatements.map((item) => ({
    id: item.id,
    account_id: item.accountId,
    payout_period_id: item.payoutPeriodId,
    source_of_entry: item.sourceOfEntry,
    source: item.source,
    status: item.status,
    statement_series_id: item.statementSeriesId,
    version_no: item.versionNo,
    authority: item.authority,
    supersedes_statement_id: item.supersedesStatementId ?? null,
    superseded_by_statement_id: item.supersededByStatementId ?? null,
    statement_ref: item.statementRef ?? null,
    expected_cash_due: item.expectedCashDue,
    expected_credit_due: item.expectedCreditDue,
    posted_at: item.postedAt ?? null,
    notes: item.notes ?? null,
  })),
  account_notes: opsMockData.accountNotes.map((item) => ({
    id: item.id,
    account_id: item.accountId,
    note_type: item.noteType,
    platform: item.platform,
    subject: item.subject,
    body: item.body,
    affects_collections: item.affectsCollections,
    affects_state: item.affectsState,
    created_at: item.createdAt,
  })),
  tickets: opsMockData.tickets.map((item) => ({
    id: item.id,
    account_id: item.accountId,
    market_event_id: item.marketEventId,
    ticket_ref: item.ticketRef,
    market: item.market,
    side: item.side,
    odds_decimal: item.oddsDecimal,
    stake_cash: item.stakeCash,
    stake_credit: item.stakeCredit,
    placed_at: item.placedAt,
    accepted_at: item.acceptedAt ?? null,
    status: item.status,
  })),
  wallet_entries: opsMockData.walletEntries.map((item) => ({
    id: item.id,
    account_id: item.accountId,
    wallet_type: item.walletType,
    entry_type: item.entryType,
    source_of_entry: item.sourceOfEntry,
    signed_amount: item.signedAmount,
    status: item.status,
    occurred_at: item.occurredAt,
    posted_at: item.postedAt ?? null,
    external_ref: item.externalRef ?? null,
    dedupe_key: item.dedupeKey ?? null,
    ticket_id: item.ticketId ?? null,
    statement_id: item.statementId ?? null,
    note_id: item.noteId ?? null,
    description: item.description,
  })),
  ticket_settlements: opsMockData.ticketSettlements.map((item) => ({
    id: item.id,
    ticket_id: item.ticketId,
    source_of_entry: item.sourceOfEntry,
    settlement_type: item.settlementType,
    status: item.status,
    settled_cash_stake: item.settledCashStake,
    settled_credit_stake: item.settledCreditStake,
    cash_return: item.cashReturn,
    credit_return: item.creditReturn,
    pnl_cash: item.pnlCash,
    pnl_credit: item.pnlCredit,
    effective_at: item.effectiveAt,
    external_ref: item.externalRef ?? null,
    payout_wallet_entry_id: item.payoutWalletEntryId ?? null,
  })),
  credit_grants: opsMockData.creditGrants.map((item) => ({
    id: item.id,
    account_id: item.accountId,
    issued_wallet_entry_id: item.issuedWalletEntryId,
    grant_ref: item.grantRef,
    original_amount: item.originalAmount,
    expires_at: item.expiresAt ?? null,
    rollover_requirement: item.rolloverRequirement ?? null,
    status: item.status,
  })),
  ticket_credit_allocations: opsMockData.ticketCreditAllocations.map((item) => ({
    id: item.id,
    ticket_id: item.ticketId,
    credit_grant_id: item.creditGrantId,
    allocated_amount: item.allocatedAmount,
  })),
  reconciliation_runs: opsMockData.reconciliationRuns.map((item) => ({
    id: item.id,
    account_id: item.accountId,
    payout_period_id: item.payoutPeriodId,
    statement_id: item.statementId ?? null,
    run_type: item.runType,
    status: item.status,
    run_at: item.runAt,
    completed_at: item.completedAt ?? null,
    actor: item.actor,
    locked_at: item.lockedAt ?? null,
  })),
  reconciliation_issues: opsMockData.reconciliationIssues.map((item) => ({
    id: item.id,
    reconciliation_run_id: item.reconciliationRunId,
    account_id: item.accountId,
    payout_period_id: item.payoutPeriodId,
    issue_type: item.issueType,
    severity: item.severity,
    status: item.status,
    amount: item.amount ?? null,
    related_entity_type: item.relatedEntityType ?? null,
    related_entity_id: item.relatedEntityId ?? null,
    opened_at: item.openedAt,
    resolved_at: item.resolvedAt ?? null,
    notes: item.notes ?? null,
  })),
  tasks: opsMockData.tasks.map((item) => ({
    id: item.id,
    account_id: item.accountId ?? null,
    payout_period_id: item.payoutPeriodId ?? null,
    reconciliation_issue_id: item.reconciliationIssueId ?? null,
    note_id: item.noteId ?? null,
    task_type: item.taskType,
    status: item.status,
    priority: item.priority,
    title: item.title,
    due_at: item.dueAt,
    created_at: item.createdAt,
    closed_at: item.closedAt ?? null,
  })),
  audit_events: opsMockData.auditEvents.map((item) => ({
    id: item.id,
    entity_type: item.entityType,
    entity_id: item.entityId,
    action: item.action,
    actor: item.actor,
    detail: item.detail,
    created_at: item.createdAt,
  })),
};

const tableSpecs = [
  ["public.ops_operators", seedData.operators],
  ["public.ops_accounts", seedData.accounts],
  ["public.ops_market_events", seedData.market_events],
  ["public.ops_payout_periods", seedData.payout_periods],
  [
    "public.ops_period_statements",
    seedData.period_statements.map((row) => ({
      ...row,
      supersedes_statement_id: null,
      superseded_by_statement_id: null,
    })),
  ],
  ["public.ops_account_notes", seedData.account_notes],
  ["public.ops_tickets", seedData.tickets],
  ["public.ops_wallet_entries", seedData.wallet_entries],
  ["public.ops_ticket_settlements", seedData.ticket_settlements],
  ["public.ops_credit_grants", seedData.credit_grants],
  ["public.ops_ticket_credit_allocations", seedData.ticket_credit_allocations],
  ["public.ops_reconciliation_runs", seedData.reconciliation_runs],
  ["public.ops_reconciliation_issues", seedData.reconciliation_issues],
  ["public.ops_tasks", seedData.tasks],
  ["public.ops_audit_events", seedData.audit_events],
];

const truncateOrder = [...tableSpecs].reverse().map(([tableName]) => tableName);
const statementRelationUpdates = seedData.period_statements.filter(
  (row) => row.supersedes_statement_id || row.superseded_by_statement_id,
);

const sql = [
  "-- generated by scripts/generate-ops-seed.mjs",
  "begin;",
  `truncate ${truncateOrder.join(", ")} cascade;`,
  ...tableSpecs.map(([tableName, rows]) => insertStatements(tableName, Object.keys(rows[0] ?? { id: null }), rows)),
  updateStatements(
    "public.ops_period_statements",
    ["supersedes_statement_id", "superseded_by_statement_id"],
    statementRelationUpdates,
  ),
  "commit;",
  "",
].join("\n\n");

await writeFile(new URL("../supabase/seed.sql", import.meta.url), sql, "utf8");
console.log("wrote supabase/seed.sql");
