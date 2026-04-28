export type OpsOperatorCategory = "sportsbook" | "casino";
export type OpsAccountStatus = "active" | "paused" | "collections" | "closed";
export type OpsWalletType = "cash" | "credit";
export type OpsWalletEntryType =
  | "opening_balance"
  | "deposit"
  | "withdrawal"
  | "wager_stake"
  | "wager_payout"
  | "credit_issue"
  | "credit_forfeit"
  | "payout_cash_receipt"
  | "payout_credit_receipt"
  | "manual_adjustment"
  | "correction_reverse";
export type OpsWalletEntryStatus = "pending" | "posted" | "void" | "duplicate" | "disputed";
export type OpsSourceOfEntry = "manual" | "import" | "system";
export type OpsEventStatus = "scheduled" | "live" | "final" | "canceled";
export type OpsTicketStatus = "open" | "partially_settled" | "settled" | "void" | "cashout" | "disputed";
export type OpsTicketSettlementType = "partial" | "final" | "void" | "resettle" | "cashout";
export type OpsTicketSettlementStatus = "posted" | "void" | "disputed";
export type OpsPayoutPeriodType = "weekly" | "monthly";
export type OpsPayoutPeriodStatus = "scheduled" | "open" | "statement_posted" | "partially_paid" | "paid" | "disputed" | "locked";
export type OpsStatementSource = "operator_statement" | "internal_calc" | "manual";
export type OpsStatementStatus = "draft" | "posted" | "revised" | "disputed" | "void";
export type OpsStatementAuthority = "authoritative" | "superseded" | "suspended" | "void";
export type OpsReconciliationRunType = "manual" | "scheduled";
export type OpsReconciliationStatus = "clean" | "attention" | "blocked" | "disputed";
export type OpsIssueType =
  | "missing_opening_balance"
  | "unmatched_deposit"
  | "unmatched_withdrawal"
  | "open_ticket"
  | "late_settlement"
  | "statement_missing"
  | "statement_shortfall"
  | "duplicate_entry"
  | "manual_adjustment_unreviewed"
  | "disputed_entry"
  | "settlement_wallet_mismatch";
export type OpsIssueSeverity = "low" | "medium" | "high";
export type OpsIssueStatus = "open" | "resolved" | "waived" | "disputed";
export type OpsTaskType =
  | "claim_payout"
  | "verify_receipt"
  | "resolve_duplicate"
  | "investigate_ticket"
  | "review_adjustment"
  | "collections_followup";
export type OpsTaskStatus = "open" | "in_progress" | "done" | "canceled";
export type OpsTaskPriority = "low" | "medium" | "high";
export type OpsNoteType = "collections" | "payout_followup" | "state_change" | "internal";
export type OpsNotePlatform = "telegram" | "whatsapp" | "internal";
export type OpsCreditGrantStatus = "issued" | "partially_wagered" | "fully_wagered" | "settled" | "expired" | "forfeited";
export type OpsAuditEntityType =
  | "account"
  | "wallet_entry"
  | "ticket"
  | "statement"
  | "reconciliation_issue"
  | "task"
  | "note";

export type OpsOperator = {
  id: string;
  name: string;
  category: OpsOperatorCategory;
};

export type OpsAccount = {
  id: string;
  operatorId: string;
  label: string;
  status: OpsAccountStatus;
  openedAt: string;
  closedAt?: string;
  externalAccountRef?: string;
};

export type OpsWalletEntry = {
  id: string;
  accountId: string;
  walletType: OpsWalletType;
  entryType: OpsWalletEntryType;
  sourceOfEntry: OpsSourceOfEntry;
  signedAmount: number;
  status: OpsWalletEntryStatus;
  occurredAt: string;
  postedAt?: string;
  externalRef?: string;
  dedupeKey?: string;
  ticketId?: string;
  statementId?: string;
  noteId?: string;
  description: string;
};

export type OpsMarketEvent = {
  id: string;
  sport: string;
  eventName: string;
  startsAt: string;
  status: OpsEventStatus;
};

export type OpsTicket = {
  id: string;
  accountId: string;
  marketEventId: string;
  ticketRef: string;
  market: string;
  side: string;
  oddsDecimal: number;
  stakeCash: number;
  stakeCredit: number;
  placedAt: string;
  acceptedAt?: string;
  status: OpsTicketStatus;
};

export type OpsTicketSettlement = {
  id: string;
  ticketId: string;
  sourceOfEntry: OpsSourceOfEntry;
  settlementType: OpsTicketSettlementType;
  status: OpsTicketSettlementStatus;
  settledCashStake: number;
  settledCreditStake: number;
  cashReturn: number;
  creditReturn: number;
  pnlCash: number;
  pnlCredit: number;
  effectiveAt: string;
  externalRef?: string;
  payoutWalletEntryId?: string;
};

export type OpsPayoutPeriod = {
  id: string;
  operatorId: string;
  periodType: OpsPayoutPeriodType;
  periodStart: string;
  periodEnd: string;
  dueAt: string;
  status: OpsPayoutPeriodStatus;
  lockedAt?: string;
};

export type OpsPeriodStatement = {
  id: string;
  accountId: string;
  payoutPeriodId: string;
  sourceOfEntry: OpsSourceOfEntry;
  source: OpsStatementSource;
  status: OpsStatementStatus;
  statementSeriesId: string;
  versionNo: number;
  authority: OpsStatementAuthority;
  supersedesStatementId?: string;
  supersededByStatementId?: string;
  statementRef?: string;
  expectedCashDue: number;
  expectedCreditDue: number;
  postedAt?: string;
  notes?: string;
};

export type OpsCreditGrant = {
  id: string;
  accountId: string;
  issuedWalletEntryId: string;
  grantRef: string;
  originalAmount: number;
  expiresAt?: string;
  rolloverRequirement?: number;
  status: OpsCreditGrantStatus;
};

export type OpsTicketCreditAllocation = {
  id: string;
  ticketId: string;
  creditGrantId: string;
  allocatedAmount: number;
};

export type OpsReconciliationRun = {
  id: string;
  accountId: string;
  payoutPeriodId: string;
  statementId?: string;
  runType: OpsReconciliationRunType;
  status: OpsReconciliationStatus;
  runAt: string;
  completedAt?: string;
  actor: string;
  lockedAt?: string;
};

export type OpsReconciliationIssue = {
  id: string;
  reconciliationRunId: string;
  accountId: string;
  payoutPeriodId: string;
  issueType: OpsIssueType;
  severity: OpsIssueSeverity;
  status: OpsIssueStatus;
  amount?: number;
  relatedEntityType?: OpsAuditEntityType | "payout_period";
  relatedEntityId?: string;
  openedAt: string;
  resolvedAt?: string;
  notes?: string;
};

export type OpsTask = {
  id: string;
  accountId?: string;
  payoutPeriodId?: string;
  reconciliationIssueId?: string;
  noteId?: string;
  taskType: OpsTaskType;
  status: OpsTaskStatus;
  priority: OpsTaskPriority;
  title: string;
  dueAt: string;
  createdAt: string;
  closedAt?: string;
};

export type OpsAccountNote = {
  id: string;
  accountId: string;
  noteType: OpsNoteType;
  platform: OpsNotePlatform;
  subject: string;
  body: string;
  affectsCollections: boolean;
  affectsState: boolean;
  createdAt: string;
};

export type OpsAuditEvent = {
  id: string;
  entityType: OpsAuditEntityType;
  entityId: string;
  action: string;
  actor: string;
  createdAt: string;
  detail: string;
};

export type OpsDataset = {
  operators: OpsOperator[];
  accounts: OpsAccount[];
  walletEntries: OpsWalletEntry[];
  marketEvents: OpsMarketEvent[];
  tickets: OpsTicket[];
  ticketSettlements: OpsTicketSettlement[];
  payoutPeriods: OpsPayoutPeriod[];
  periodStatements: OpsPeriodStatement[];
  creditGrants: OpsCreditGrant[];
  ticketCreditAllocations: OpsTicketCreditAllocation[];
  reconciliationRuns: OpsReconciliationRun[];
  reconciliationIssues: OpsReconciliationIssue[];
  tasks: OpsTask[];
  accountNotes: OpsAccountNote[];
  auditEvents: OpsAuditEvent[];
};
