import { getLedgerSettledNetForStatement, getTicketPayoutExposure } from "@/lib/ops/invariants";
import type { OpsDataset, OpsPeriodStatement, OpsTicket, OpsWalletEntry } from "@/lib/ops/types";

export const quickAddKinds = [
  "deposit",
  "withdrawal",
  "ticket",
  "settlement",
  "payout_receipt",
  "credit",
  "note",
  "manual_adjustment",
] as const;

export type QuickAddKind = (typeof quickAddKinds)[number];
export type FastEntryFieldSource = "typed" | "remembered" | "default" | "inferred";

export type FastEntryFieldMeta = {
  source: FastEntryFieldSource;
  detail?: string;
};

export type FastEntryIssue = {
  field?: string;
  message: string;
};

export type FastEntryPreview = {
  rawInput: string;
  kind: QuickAddKind;
  accountId: string;
  accountLabel: string;
  values: Record<string, string>;
  fieldMeta: Record<string, FastEntryFieldMeta>;
  inferenceNotes: string[];
  errors: FastEntryIssue[];
  warnings: FastEntryIssue[];
  requiresCorrection: boolean;
};

export type QuickAddReview = {
  kind: QuickAddKind;
  accountId: string;
  accountLabel: string;
  values: Record<string, string>;
  fieldMeta: Record<string, FastEntryFieldMeta>;
  rawInput?: string;
  inferenceNotes: string[];
  errors: FastEntryIssue[];
  warnings: FastEntryIssue[];
};

type AccountResolution =
  | { ok: true; accountId: string; accountLabel: string; inferred: boolean; detail?: string }
  | { ok: false; message: string };

type TicketResolution =
  | { ok: true; ticket: OpsTicket; inferred: boolean; detail?: string }
  | { ok: false; message: string };

type StatementResolution =
  | { ok: true; statement: OpsPeriodStatement; inferred: boolean; detail?: string }
  | { ok: false; message: string };

type ParseCommandResult =
  | {
      ok: true;
      kind: QuickAddKind;
      accountId: string;
      accountLabel: string;
      values: Record<string, string>;
      fieldMeta: Record<string, FastEntryFieldMeta>;
      inferenceNotes: string[];
    }
  | {
      ok: false;
      errors: FastEntryIssue[];
    };

const outcomeToSettlementKind: Record<string, string> = {
  win: "final",
  loss: "final",
  push: "final",
  partial: "partial",
  cashout: "cashout",
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCompact(value: string): string {
  return normalize(value).replaceAll(" ", "");
}

function tokenize(input: string): string[] {
  return Array.from(input.matchAll(/"([^"]+)"|(\S+)/g), (match) => match[1] ?? match[2] ?? "").filter(Boolean);
}

function parseSignedAmount(value: string): number | null {
  const numeric = Number(value.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function parseOddsValue(value: string): number | null {
  const trimmed = value.trim();
  if (/^[+-]\d+$/.test(trimmed)) {
    const american = Number(trimmed);
    if (american === 0) {
      return null;
    }
    return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
  }

  const decimal = Number(trimmed);
  if (!Number.isFinite(decimal) || decimal <= 1) {
    return null;
  }
  return decimal;
}

function isPositiveAmount(value: string): boolean {
  const numeric = parseSignedAmount(value);
  return numeric !== null && numeric > 0;
}

function isNonNegativeAmount(value: string): boolean {
  const numeric = parseSignedAmount(value);
  return numeric !== null && numeric >= 0;
}

function resolveAccount(token: string, data: OpsDataset): AccountResolution {
  const exactMatches = data.accounts.filter((account) => {
    const candidateSet = new Set([
      normalize(account.id),
      normalize(account.label),
      normalizeCompact(account.label),
      normalize(account.externalAccountRef ?? ""),
      normalizeCompact(account.externalAccountRef ?? ""),
    ]);
    return candidateSet.has(normalize(token)) || candidateSet.has(normalizeCompact(token));
  });

  if (exactMatches.length === 1) {
    return {
      ok: true,
      accountId: exactMatches[0].id,
      accountLabel: exactMatches[0].label,
      inferred: false,
    };
  }

  if (exactMatches.length > 1) {
    return { ok: false, message: `Account "${token}" matches more than one account. Use the full account label or ID.` };
  }

  const aliasMatches = data.accounts.filter((account) => {
    const aliases = new Set([
      normalize(account.label.split(" ")[0] ?? ""),
      normalize((account.externalAccountRef ?? "").split("-")[0] ?? ""),
    ]);
    return aliases.has(normalize(token));
  });

  if (aliasMatches.length === 1) {
    return {
      ok: true,
      accountId: aliasMatches[0].id,
      accountLabel: aliasMatches[0].label,
      inferred: true,
      detail: `Matched unique account alias "${token}".`,
    };
  }

  if (aliasMatches.length > 1) {
    return { ok: false, message: `Account alias "${token}" is ambiguous. Use the full account label or ID.` };
  }

  return { ok: false, message: `Unknown account "${token}".` };
}

function resolveTicket(token: string, data: OpsDataset, accountId?: string): TicketResolution {
  const exactMatches = data.tickets.filter((ticket) => {
    if (accountId && ticket.accountId !== accountId) {
      return false;
    }

    const candidates = new Set([normalize(ticket.id), normalize(ticket.ticketRef)]);
    return candidates.has(normalize(token));
  });

  if (exactMatches.length === 1) {
    return { ok: true, ticket: exactMatches[0], inferred: false };
  }

  if (exactMatches.length > 1) {
    return { ok: false, message: `Ticket "${token}" matches more than one record. Use the full ticket ID.` };
  }

  return { ok: false, message: `Unknown ticket "${token}".` };
}

function resolveStatement(token: string, data: OpsDataset, accountId: string): StatementResolution {
  const matches = data.periodStatements.filter((statement) => {
    if (statement.accountId !== accountId) {
      return false;
    }
    const candidates = new Set([normalize(statement.id), normalize(statement.statementRef ?? "")]);
    return candidates.has(normalize(token));
  });

  if (matches.length === 0) {
    return { ok: false, message: `Unknown statement "${token}" for this account.` };
  }

  if (matches.length > 1) {
    return { ok: false, message: `Statement "${token}" matches more than one revision. Use the exact statement ID.` };
  }

  const statement = matches[0];
  if (statement.authority !== "authoritative" || statement.status !== "posted") {
    return {
      ok: false,
      message: `Statement "${token}" is not valid for payout entry because it is ${statement.status}.`,
    };
  }

  return { ok: true, statement, inferred: false };
}

function parseDeposit(tokens: string[], data: OpsDataset): ParseCommandResult {
  if (tokens.length < 3 || tokens[1].toLowerCase() !== "deposit") {
    return { ok: false, errors: [{ message: 'Use "+500 deposit alpha" or "+500 deposit \\"Alpha 07\\"".' }] };
  }

  const amount = tokens[0].startsWith("+") ? tokens[0].slice(1) : tokens[0];
  const accountToken = tokens.slice(2).join(" ");
  const account = resolveAccount(accountToken, data);

  if (!account.ok) {
    return { ok: false, errors: [{ field: "accountId", message: account.message }] };
  }

  const inferenceNotes = account.inferred && account.detail ? [account.detail] : [];
  const fieldMeta: Record<string, FastEntryFieldMeta> = {
    amount: { source: "typed" },
    accountId: {
      source: account.inferred ? "inferred" : "typed",
      detail: account.detail,
    },
  };

  return {
    ok: true,
    kind: "deposit",
    accountId: account.accountId,
    accountLabel: account.accountLabel,
    values: { amount },
    fieldMeta,
    inferenceNotes,
  };
}

function parseTicket(tokens: string[], data: OpsDataset): ParseCommandResult {
  if (tokens.length < 5 || tokens[0].toLowerCase() !== "ticket") {
    return {
      ok: false,
      errors: [{ message: 'Use "ticket alpha lakers -110 1000" or "ticket alpha ref:t500 lakers -110 1000".' }],
    };
  }

  const account = resolveAccount(tokens[1], data);
  if (!account.ok) {
    return { ok: false, errors: [{ field: "accountId", message: account.message }] };
  }

  const bodyTokens = tokens.slice(2);
  if (bodyTokens.length < 3) {
    return {
      ok: false,
      errors: [{ message: 'Ticket command needs a pick, odds, and stake. Example: "ticket alpha lakers -110 1000".' }],
    };
  }

  const stake = tokens.at(-1)!;
  const odds = tokens.at(-2)!;
  const pickTokens = bodyTokens.slice(0, -2);
  const ticketMarker = pickTokens[0]?.match(/^(?:ref|id|ticket):(.+)$/i);
  const ticketHash = pickTokens[0]?.startsWith("#") ? pickTokens[0].slice(1) : "";
  const explicitTicketRef = ticketMarker?.[1] || ticketHash || "";
  const pick = (explicitTicketRef ? pickTokens.slice(1) : pickTokens).join(" ");

  if (!pick) {
    return { ok: false, errors: [{ field: "pick", message: "Ticket command needs a pick before odds and stake." }] };
  }

  const inferenceNotes = account.inferred && account.detail ? [account.detail] : [];
  const fieldMeta: Record<string, FastEntryFieldMeta> = {
    accountId: {
      source: account.inferred ? "inferred" : "typed",
      detail: account.detail,
    },
    ticket_ref: explicitTicketRef
      ? { source: "typed", detail: "Ticket ID was provided in the fast command." }
      : { source: "default", detail: "No ticket ID typed. Parsed the rest of the ticket; add the ID before review." },
    pick: { source: "typed" },
    odds: { source: "typed" },
    stake: { source: "typed" },
  };

  return {
    ok: true,
    kind: "ticket",
    accountId: account.accountId,
    accountLabel: account.accountLabel,
    values: { ticket_ref: explicitTicketRef, pick, odds, stake },
    fieldMeta,
    inferenceNotes,
  };
}

function parseSettlement(tokens: string[], data: OpsDataset): ParseCommandResult {
  if (tokens.length < 4 || tokens[0].toLowerCase() !== "settle") {
    return {
      ok: false,
      errors: [{ message: 'Use "settle alpha-open-1 win 1900". Ticket must be explicit.' }],
    };
  }

  const ticketToken = tokens[1];
  const outcome = tokens[2].toLowerCase();
  const cashReturn = tokens[3];
  const creditReturn = tokens[4] ?? "0";

  const ticket = resolveTicket(ticketToken, data);
  if (!ticket.ok) {
    return { ok: false, errors: [{ field: "ticket_ref", message: ticket.message }] };
  }

  const account = data.accounts.find((item) => item.id === ticket.ticket.accountId);
  const inferenceNotes = [
    `Account inferred from ticket "${ticket.ticket.ticketRef}".`,
    `Settlement kind inferred as "${outcomeToSettlementKind[outcome] ?? "unknown"}" from outcome "${outcome}".`,
  ];

  return {
    ok: true,
    kind: "settlement",
    accountId: ticket.ticket.accountId,
    accountLabel: account?.label ?? ticket.ticket.accountId,
    values: {
      ticket_ref: ticket.ticket.ticketRef,
      result_type: outcome,
      cash_return: cashReturn,
      credit_return: creditReturn,
    },
    fieldMeta: {
      accountId: { source: "inferred", detail: inferenceNotes[0] },
      ticket_ref: {
        source: normalize(ticketToken) === normalize(ticket.ticket.ticketRef) ? "typed" : "inferred",
        detail: normalize(ticketToken) === normalize(ticket.ticket.ticketRef) ? undefined : `Matched ticket "${ticketToken}" to "${ticket.ticket.ticketRef}".`,
      },
      result_type: { source: "typed" },
      cash_return: { source: "typed" },
      credit_return: tokens[4] ? { source: "typed" } : { source: "default", detail: "No credit return typed; defaulted to 0." },
    },
    inferenceNotes,
  };
}

function parsePayout(tokens: string[], data: OpsDataset): ParseCommandResult {
  if (tokens.length < 4 || tokens[0].toLowerCase() !== "payout") {
    return {
      ok: false,
      errors: [{ message: 'Use "payout alpha alpha-stmt-2026w14 900". Account and statement must both be explicit.' }],
    };
  }

  const account = resolveAccount(tokens[1], data);
  if (!account.ok) {
    return { ok: false, errors: [{ field: "accountId", message: account.message }] };
  }

  const statement = resolveStatement(tokens[2], data, account.accountId);
  if (!statement.ok) {
    return { ok: false, errors: [{ field: "statement_ref", message: statement.message }] };
  }

  const inferenceNotes = account.inferred && account.detail ? [account.detail] : [];
  const fieldMeta: Record<string, FastEntryFieldMeta> = {
    accountId: { source: account.inferred ? "inferred" : "typed", detail: account.detail },
    statement_ref: { source: "typed" },
    cash_received: { source: "typed" },
    credit_received: tokens[4] ? { source: "typed" } : { source: "default", detail: "No credit receipt typed; defaulted to 0." },
  };

  return {
    ok: true,
    kind: "payout_receipt",
    accountId: account.accountId,
    accountLabel: account.accountLabel,
    values: {
      statement_ref: statement.statement.statementRef ?? statement.statement.id,
      cash_received: tokens[3],
      credit_received: tokens[4] ?? "0",
    },
    fieldMeta,
    inferenceNotes,
  };
}

export function parseFastEntryCommand(input: string, data: OpsDataset): FastEntryPreview {
  const rawInput = input.trim();
  const emptyFailure: FastEntryPreview = {
    rawInput,
    kind: "deposit",
    accountId: "",
    accountLabel: "",
    values: {},
    fieldMeta: {},
    inferenceNotes: [],
    errors: [{ message: "Type a command to parse." }],
    warnings: [],
    requiresCorrection: true,
  };

  if (!rawInput) {
    return emptyFailure;
  }

  const tokens = tokenize(rawInput);
  const command = tokens[0]?.toLowerCase();

  const parsed =
    command === "ticket"
      ? parseTicket(tokens, data)
      : command === "settle"
        ? parseSettlement(tokens, data)
        : command === "payout"
          ? parsePayout(tokens, data)
          : rawInput.includes(" deposit ")
            ? parseDeposit(tokens, data)
            : { ok: false as const, errors: [{ message: `Could not read "${rawInput}". Use deposit, ticket, settle, or payout.` }] };

  if (!parsed.ok) {
    return {
      ...emptyFailure,
      errors: parsed.errors,
    };
  }

  return {
    rawInput,
    kind: parsed.kind,
    accountId: parsed.accountId,
    accountLabel: parsed.accountLabel,
    values: parsed.values,
    fieldMeta: parsed.fieldMeta,
    inferenceNotes: parsed.inferenceNotes,
    errors: [],
    warnings: [],
    requiresCorrection: false,
  };
}

function findAuthoritativeStatementByRef(data: OpsDataset, accountId: string, token: string) {
  const statement = resolveStatement(token, data, accountId);
  return statement.ok ? statement.statement : undefined;
}

function findDuplicateLookingDeposit(accountId: string, amount: number, entries: OpsWalletEntry[]) {
  return entries.find(
    (entry) =>
      entry.accountId === accountId &&
      entry.entryType === "deposit" &&
      (entry.status === "posted" || entry.status === "duplicate") &&
      entry.signedAmount === amount,
  );
}

export function validateQuickAddReview(input: {
  data: OpsDataset;
  kind: QuickAddKind;
  accountId: string;
  values: Record<string, string>;
  fieldMeta?: Record<string, FastEntryFieldMeta>;
  rawInput?: string;
  inferenceNotes?: string[];
}): QuickAddReview {
  const { data, kind, accountId, values } = input;
  const account = data.accounts.find((item) => item.id === accountId);
  const errors: FastEntryIssue[] = [];
  const warnings: FastEntryIssue[] = [];

  if (!account) {
    errors.push({ field: "accountId", message: "Choose a real account before reviewing this entry." });
  }

  switch (kind) {
    case "deposit":
    case "withdrawal":
    case "credit": {
      if (!isPositiveAmount(values.amount ?? "")) {
        errors.push({ field: "amount", message: "Amount must be a positive number." });
      }
      break;
    }
    case "ticket": {
      if (!(values.ticket_ref ?? "").trim()) {
        errors.push({ field: "ticket_ref", message: "Ticket ID is still needed before review." });
      }
      if (!(values.pick ?? "").trim()) {
        errors.push({ field: "pick", message: "Pick is required." });
      }
      if (parseOddsValue(values.odds ?? "") === null) {
        errors.push({ field: "odds", message: "Odds must be a real American price like -110 or a decimal above 1.00." });
      }
      if (!isPositiveAmount(values.stake ?? "")) {
        errors.push({ field: "stake", message: "Stake must be a positive number." });
      }
      break;
    }
    case "settlement": {
      const ticketResolution = resolveTicket(values.ticket_ref ?? "", data, accountId || undefined);
      if (!ticketResolution.ok) {
        errors.push({ field: "ticket_ref", message: ticketResolution.message });
        break;
      }

      const ticket = ticketResolution.ticket;
      const outcome = (values.result_type ?? "").trim().toLowerCase();
      if (!outcomeToSettlementKind[outcome]) {
        errors.push({ field: "result_type", message: 'Result must be one of: win, loss, push, partial, cashout.' });
      }

      if (!isNonNegativeAmount(values.cash_return ?? "") || !isNonNegativeAmount(values.credit_return ?? "0")) {
        errors.push({ field: "cash_return", message: "Settlement return must be zero or more." });
      }

      if (ticket.status !== "open" && ticket.status !== "partially_settled") {
        errors.push({ field: "ticket_ref", message: `Ticket "${ticket.ticketRef}" is already ${ticket.status} and cannot take another settlement.` });
      }

      const totalReturn = (parseSignedAmount(values.cash_return ?? "0") ?? 0) + (parseSignedAmount(values.credit_return ?? "0") ?? 0);
      const exposure = getTicketPayoutExposure(ticket, data.ticketSettlements);
      const settledCashStake = data.ticketSettlements
        .filter((settlement) => settlement.ticketId === ticket.id && settlement.status === "posted")
        .reduce((sum, settlement) => sum + settlement.settledCashStake, 0);
      const settledCreditStake = data.ticketSettlements
        .filter((settlement) => settlement.ticketId === ticket.id && settlement.status === "posted")
        .reduce((sum, settlement) => sum + settlement.settledCreditStake, 0);
      const remainingStake = Math.max(ticket.stakeCash - settledCashStake, 0) + Math.max(ticket.stakeCredit - settledCreditStake, 0);

      if (outcome === "loss" && totalReturn !== 0) {
        errors.push({ field: "cash_return", message: "Loss result must return 0." });
      }
      if (outcome === "win" && totalReturn <= 0) {
        errors.push({ field: "cash_return", message: "Win result must return more than 0." });
      }
      if (outcome === "push" && totalReturn !== remainingStake) {
        errors.push({ field: "cash_return", message: `Push result must return the remaining stake exactly (${remainingStake}).` });
      }
      if (totalReturn > exposure + 0.01) {
        errors.push({
          field: "cash_return",
          message: `Settlement mismatch: return ${totalReturn} exceeds remaining payout exposure ${exposure.toFixed(2)}.`,
        });
      }

      break;
    }
    case "payout_receipt": {
      const statement = findAuthoritativeStatementByRef(data, accountId, values.statement_ref ?? "");
      if (!statement) {
        errors.push({ field: "statement_ref", message: "Payout needs a valid posted statement for this account." });
        break;
      }

      const cashReceived = parseSignedAmount(values.cash_received ?? "");
      const creditReceived = parseSignedAmount(values.credit_received ?? "0");

      if (cashReceived === null || cashReceived < 0 || creditReceived === null || creditReceived < 0) {
        errors.push({ field: "cash_received", message: "Received amounts must be zero or more." });
      }

      if ((cashReceived ?? 0) + (creditReceived ?? 0) <= 0) {
        errors.push({ field: "cash_received", message: "Payout needs cash, credit, or both." });
      }

      const receipts = getLedgerSettledNetForStatement(statement, data.walletEntries);
      const remainingCashDue = Math.max(statement.expectedCashDue - receipts.cash, 0);
      const remainingCreditDue = Math.max(statement.expectedCreditDue - receipts.credit, 0);
      if ((cashReceived ?? 0) > remainingCashDue || (creditReceived ?? 0) > remainingCreditDue) {
        errors.push({
          field: "cash_received",
          message: `Payout exceeds what is still due (${remainingCashDue} cash, ${remainingCreditDue} credit).`,
        });
      }
      break;
    }
    case "manual_adjustment": {
      const amount = parseSignedAmount(values.amount ?? "");
      if (amount === null || amount === 0) {
        errors.push({ field: "amount", message: "Correction amount must be a real non-zero number." });
      }
      if (!(values.reason ?? "").trim()) {
        errors.push({ field: "reason", message: "Explain the correction before reviewing it." });
      }
      break;
    }
    case "note": {
      if (!(values.subject ?? "").trim()) {
        errors.push({ field: "subject", message: "Title is required." });
      }
      if (!(values.body ?? "").trim()) {
        errors.push({ field: "body", message: "Details are required." });
      }
      break;
    }
  }

  if (kind === "deposit") {
    const amount = parseSignedAmount(values.amount ?? "");
    if (amount !== null) {
      const duplicate = findDuplicateLookingDeposit(accountId, amount, data.walletEntries);
      if (duplicate && !(values.reference ?? "").trim()) {
        errors.push({
          field: "amount",
          message: `Duplicate-looking deposit: ${account?.label ?? accountId} already has a ${amount} deposit. Add a reference in More details or verify the amount.`,
        });
      }
    }
  }

  return {
    kind,
    accountId,
    accountLabel: account?.label ?? accountId,
    values,
    fieldMeta: input.fieldMeta ?? {},
    rawInput: input.rawInput,
    inferenceNotes: input.inferenceNotes ?? [],
    errors,
    warnings,
  };
}
