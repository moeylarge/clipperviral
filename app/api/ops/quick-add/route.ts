import { NextResponse } from "next/server";

import type { QuickAddKind, QuickAddReview } from "@/lib/ops/fast-entry";
import { validateQuickAddReview } from "@/lib/ops/fast-entry";
import { loadOpsDatasetStrict } from "@/lib/ops/data";
import { getOpsAccessState } from "@/lib/auth/manual-session";

type QuickAddRequest = {
  kind: QuickAddKind;
  accountId: string;
  values: Record<string, string>;
  fieldMeta?: QuickAddReview["fieldMeta"];
  rawInput?: string;
  inferenceNotes?: string[];
};

const supportedKinds = new Set<QuickAddKind>(["deposit", "withdrawal", "ticket", "settlement", "payout_receipt"]);

function parseTimestamp(input?: string) {
  const trimmed = (input ?? "").trim();
  if (!trimmed || trimmed.toLowerCase() === "now") {
    return new Date().toISOString();
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.valueOf())) {
    throw new Error(`Invalid time value "${trimmed}".`);
  }
  return parsed.toISOString();
}

function parseAmount(input: string) {
  const numeric = Number((input ?? "").replace(/,/g, ""));
  if (!Number.isFinite(numeric)) {
    throw new Error(`Invalid amount "${input}".`);
  }
  return numeric;
}

function parseOddsToDecimal(input: string) {
  const trimmed = input.trim();
  if (/^[+-]\d+$/.test(trimmed)) {
    const american = Number(trimmed);
    if (american === 0) {
      throw new Error(`Invalid odds "${input}".`);
    }
    return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
  }

  const decimal = Number(trimmed);
  if (!Number.isFinite(decimal) || decimal <= 1) {
    throw new Error(`Invalid odds "${input}".`);
  }
  return decimal;
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function buildAuditDetail(review: QuickAddRequest, detail: string) {
  const parserText = review.rawInput ? ` Raw command: ${review.rawInput}.` : "";
  const inferenceText = review.inferenceNotes?.length ? ` Inference: ${review.inferenceNotes.join(" ")}` : "";
  return `${detail}${parserText}${inferenceText}`.trim();
}

function getErrorDetail(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Could not load live ops data.";
  }
}

async function getAdminClient() {
  const { getSupabaseAdmin } = await import("@/lib/supabase/admin");
  return getSupabaseAdmin();
}

export async function POST(request: Request) {
  const access = await getOpsAccessState();
  if (access.mode === "none") {
    return NextResponse.json({ error: "Unauthorized", details: "Owner sign-in is required for ops writes." }, { status: 401 });
  }
  if (access.mode !== "owner" || !access.email) {
    return NextResponse.json({ error: "Forbidden", details: "Shared preview is read-only. Sign in as owner to record ops changes." }, { status: 403 });
  }
  const ownerEmail = access.email;

  const review = (await request.json().catch(() => null)) as QuickAddRequest | null;
  if (!review?.kind || !review.accountId || !supportedKinds.has(review.kind)) {
    return NextResponse.json({ error: "Bad request", details: "Unsupported or missing quick-add payload." }, { status: 400 });
  }

  let dataset;
  try {
    dataset = await loadOpsDatasetStrict();
  } catch (error) {
    return NextResponse.json(
      {
        error: "Ops data unavailable",
        details: getErrorDetail(error),
      },
      { status: 500 },
    );
  }

  const checked = validateQuickAddReview({
    data: dataset,
    kind: review.kind,
    accountId: review.accountId,
    values: review.values,
    fieldMeta: review.fieldMeta,
    rawInput: review.rawInput,
    inferenceNotes: review.inferenceNotes,
  });

  if (checked.errors.length > 0) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: checked.errors.map((item) => item.message),
      },
      { status: 400 },
    );
  }

  const supabase = await getAdminClient();
  const occurredAt = parseTimestamp(review.values.when);

  try {
    if (review.kind === "deposit" || review.kind === "withdrawal") {
      const amount = parseAmount(review.values.amount ?? "");
      const entryId = buildId(review.kind === "deposit" ? "we-deposit" : "we-withdrawal");
      const reference = (review.values.reference ?? "").trim();
      const signedAmount = review.kind === "deposit" ? amount : -amount;
      const dedupeKey = reference ? `${review.accountId}|${review.kind}|${reference}|${amount}` : null;
      const { error: entryError } = await supabase.from("ops_wallet_entries").insert({
        id: entryId,
        account_id: review.accountId,
        wallet_type: "cash",
        entry_type: review.kind,
        source_of_entry: "manual",
        signed_amount: signedAmount,
        status: "posted",
        occurred_at: occurredAt,
        posted_at: occurredAt,
        external_ref: reference || null,
        dedupe_key: dedupeKey,
        description: (review.values.note ?? "").trim() || `${review.kind === "deposit" ? "Manual deposit" : "Manual withdrawal"} quick add`,
      });
      if (entryError) {
        throw entryError;
      }

      await supabase.from("ops_audit_events").insert({
        id: buildId("ae"),
        entity_type: "wallet_entry",
        entity_id: entryId,
        action: "quick_add_recorded",
        actor: ownerEmail,
        detail: buildAuditDetail(review, `${review.kind} recorded from quick add.`),
      });

      return NextResponse.json({ ok: true, message: `${review.kind} recorded.`, entityId: entryId });
    }

    if (review.kind === "payout_receipt") {
      const statement = dataset.periodStatements.find(
        (item) =>
          item.accountId === review.accountId &&
          item.authority === "authoritative" &&
          normalize(item.statementRef ?? "") === normalize(review.values.statement_ref ?? ""),
      );

      if (!statement) {
        return NextResponse.json({ error: "Validation failed", details: ["Payout needs a valid authoritative statement."] }, { status: 400 });
      }

      const insertedIds: string[] = [];
      const note = (review.values.note ?? "").trim();
      const cashReceived = parseAmount(review.values.cash_received ?? "0");
      const creditReceived = parseAmount(review.values.credit_received ?? "0");

      if (cashReceived > 0) {
        const cashId = buildId("we-payout-cash");
        insertedIds.push(cashId);
        const { error } = await supabase.from("ops_wallet_entries").insert({
          id: cashId,
          account_id: review.accountId,
          wallet_type: "cash",
          entry_type: "payout_cash_receipt",
          source_of_entry: "manual",
          signed_amount: cashReceived,
          status: "posted",
          occurred_at: occurredAt,
          posted_at: occurredAt,
          statement_id: statement.id,
          description: note || "Manual payout cash receipt",
        });
        if (error) throw error;
      }

      if (creditReceived > 0) {
        const creditId = buildId("we-payout-credit");
        insertedIds.push(creditId);
        const { error } = await supabase.from("ops_wallet_entries").insert({
          id: creditId,
          account_id: review.accountId,
          wallet_type: "credit",
          entry_type: "payout_credit_receipt",
          source_of_entry: "manual",
          signed_amount: creditReceived,
          status: "posted",
          occurred_at: occurredAt,
          posted_at: occurredAt,
          statement_id: statement.id,
          description: note || "Manual payout credit receipt",
        });
        if (error) {
          if (insertedIds.length > 0) {
            await supabase.from("ops_wallet_entries").delete().in("id", insertedIds);
          }
          throw error;
        }
      }

      const { error: auditError } = await supabase.from("ops_audit_events").insert({
        id: buildId("ae"),
        entity_type: "statement",
        entity_id: statement.id,
        action: "quick_add_payout_recorded",
        actor: ownerEmail,
        detail: buildAuditDetail(review, "Payout receipt recorded from quick add."),
      });
      if (auditError) {
        await supabase.from("ops_wallet_entries").delete().in("id", insertedIds);
        throw auditError;
      }

      return NextResponse.json({ ok: true, message: "Payout receipt recorded.", entityIds: insertedIds });
    }

    if (review.kind === "ticket") {
      const ticketId = buildId("tk");
      const eventId = buildId("evt");
      const entryId = buildId("we-stake");
      const stake = parseAmount(review.values.stake ?? "");
      const oddsDecimal = parseOddsToDecimal(review.values.odds ?? "");
      const wallet = normalize(review.values.wallet ?? "cash") === "credit" ? "credit" : "cash";
      const eventName = (review.values.event ?? "").trim();
      const matchingEvent = eventName
        ? dataset.marketEvents.find((item) => normalize(item.eventName) === normalize(eventName))
        : undefined;
      const createdEventId = matchingEvent ? null : eventId;
      const marketEventId = matchingEvent?.id ?? eventId;

      if (!matchingEvent) {
        const { error: eventError } = await supabase.from("ops_market_events").insert({
          id: eventId,
          sport: "Manual",
          event_name: eventName || `Manual event for ${review.values.ticket_ref}`,
          starts_at: occurredAt,
          status: "scheduled",
        });
        if (eventError) throw eventError;
      }

      const { error: ticketError } = await supabase.from("ops_tickets").insert({
        id: ticketId,
        account_id: review.accountId,
        market_event_id: marketEventId,
        ticket_ref: review.values.ticket_ref,
        market: (review.values.event ?? "").trim() || "Manual",
        side: review.values.pick,
        odds_decimal: oddsDecimal,
        stake_cash: wallet === "cash" ? stake : 0,
        stake_credit: wallet === "credit" ? stake : 0,
        placed_at: occurredAt,
        accepted_at: occurredAt,
        status: "open",
      });
      if (ticketError) {
        if (createdEventId) {
          await supabase.from("ops_market_events").delete().eq("id", createdEventId);
        }
        throw ticketError;
      }

      const { error: stakeError } = await supabase.from("ops_wallet_entries").insert({
        id: entryId,
        account_id: review.accountId,
        wallet_type: wallet,
        entry_type: "wager_stake",
        source_of_entry: "manual",
        signed_amount: -stake,
        status: "posted",
        occurred_at: occurredAt,
        posted_at: occurredAt,
        ticket_id: ticketId,
        description: (review.values.note ?? "").trim() || `Stake for ${review.values.pick}`,
      });
      if (stakeError) {
        await supabase.from("ops_tickets").delete().eq("id", ticketId);
        if (createdEventId) {
          await supabase.from("ops_market_events").delete().eq("id", createdEventId);
        }
        throw stakeError;
      }

      const { error: auditError } = await supabase.from("ops_audit_events").insert({
        id: buildId("ae"),
        entity_type: "ticket",
        entity_id: ticketId,
        action: "quick_add_ticket_recorded",
        actor: ownerEmail,
        detail: buildAuditDetail(review, "Ticket recorded from quick add."),
      });
      if (auditError) {
        await supabase.from("ops_wallet_entries").delete().eq("id", entryId);
        await supabase.from("ops_tickets").delete().eq("id", ticketId);
        if (createdEventId) {
          await supabase.from("ops_market_events").delete().eq("id", createdEventId);
        }
        throw auditError;
      }

      return NextResponse.json({ ok: true, message: "Ticket recorded.", entityId: ticketId });
    }

    if (review.kind === "settlement") {
      const ticket = dataset.tickets.find(
        (item) => item.accountId === review.accountId && normalize(item.ticketRef) === normalize(review.values.ticket_ref ?? ""),
      );
      if (!ticket) {
        return NextResponse.json({ error: "Validation failed", details: ["Ticket could not be found for settlement."] }, { status: 400 });
      }

      const outcome = normalize(review.values.result_type ?? "");
      if (outcome === "partial") {
        return NextResponse.json(
          {
            error: "Settlement not supported",
            details: ["Partial settlements still need stake-allocation fields before they can be recorded safely."],
          },
          { status: 400 },
        );
      }

      const priorSettlements = dataset.ticketSettlements.filter((item) => item.ticketId === ticket.id && item.status === "posted");
      const settledCashStake = priorSettlements.reduce((sum, item) => sum + item.settledCashStake, 0);
      const settledCreditStake = priorSettlements.reduce((sum, item) => sum + item.settledCreditStake, 0);
      const remainingCashStake = Math.max(ticket.stakeCash - settledCashStake, 0);
      const remainingCreditStake = Math.max(ticket.stakeCredit - settledCreditStake, 0);
      const cashReturn = parseAmount(review.values.cash_return ?? "0");
      const creditReturn = parseAmount(review.values.credit_return ?? "0");
      const settlementId = buildId("ts");
      const payoutEntryIds: string[] = [];

      if (cashReturn > 0) {
        const cashEntryId = buildId("we-payout");
        payoutEntryIds.push(cashEntryId);
        const { error } = await supabase.from("ops_wallet_entries").insert({
          id: cashEntryId,
          account_id: review.accountId,
          wallet_type: "cash",
          entry_type: "wager_payout",
          source_of_entry: "manual",
          signed_amount: cashReturn,
          status: "posted",
          occurred_at: occurredAt,
          posted_at: occurredAt,
          ticket_id: ticket.id,
          description: (review.values.note ?? "").trim() || `Settlement payout for ${ticket.ticketRef}`,
        });
        if (error) throw error;
      }

      if (creditReturn > 0) {
        const creditEntryId = buildId("we-credit-payout");
        payoutEntryIds.push(creditEntryId);
        const { error } = await supabase.from("ops_wallet_entries").insert({
          id: creditEntryId,
          account_id: review.accountId,
          wallet_type: "credit",
          entry_type: "wager_payout",
          source_of_entry: "manual",
          signed_amount: creditReturn,
          status: "posted",
          occurred_at: occurredAt,
          posted_at: occurredAt,
          ticket_id: ticket.id,
          description: (review.values.note ?? "").trim() || `Settlement credit payout for ${ticket.ticketRef}`,
        });
        if (error) {
          await supabase.from("ops_wallet_entries").delete().in("id", payoutEntryIds);
          throw error;
        }
      }

      const { error: settlementError } = await supabase.from("ops_ticket_settlements").insert({
        id: settlementId,
        ticket_id: ticket.id,
        source_of_entry: "manual",
        settlement_type: outcome === "cashout" ? "cashout" : "final",
        status: "posted",
        settled_cash_stake: remainingCashStake,
        settled_credit_stake: remainingCreditStake,
        cash_return: cashReturn,
        credit_return: creditReturn,
        pnl_cash: cashReturn - remainingCashStake,
        pnl_credit: creditReturn - remainingCreditStake,
        effective_at: occurredAt,
        payout_wallet_entry_id: payoutEntryIds.length === 1 ? payoutEntryIds[0] : null,
      });
      if (settlementError) {
        if (payoutEntryIds.length > 0) {
          await supabase.from("ops_wallet_entries").delete().in("id", payoutEntryIds);
        }
        throw settlementError;
      }

      const nextStatus = outcome === "cashout" ? "cashout" : "settled";
      const { error: updateError } = await supabase.from("ops_tickets").update({ status: nextStatus }).eq("id", ticket.id);
      if (updateError) {
        await supabase.from("ops_ticket_settlements").delete().eq("id", settlementId);
        if (payoutEntryIds.length > 0) {
          await supabase.from("ops_wallet_entries").delete().in("id", payoutEntryIds);
        }
        throw updateError;
      }

      const { error: auditError } = await supabase.from("ops_audit_events").insert({
        id: buildId("ae"),
        entity_type: "ticket",
        entity_id: ticket.id,
        action: "quick_add_settlement_recorded",
        actor: ownerEmail,
        detail: buildAuditDetail(review, "Settlement recorded from quick add."),
      });
      if (auditError) {
        await supabase.from("ops_tickets").update({ status: ticket.status }).eq("id", ticket.id);
        await supabase.from("ops_ticket_settlements").delete().eq("id", settlementId);
        if (payoutEntryIds.length > 0) {
          await supabase.from("ops_wallet_entries").delete().in("id", payoutEntryIds);
        }
        throw auditError;
      }

      return NextResponse.json({ ok: true, message: "Settlement recorded.", entityId: settlementId });
    }

    return NextResponse.json({ error: "Unsupported", details: "This quick-add mode is not writable yet." }, { status: 400 });
  } catch (error) {
    const message =
      typeof error === "object" && error && "message" in error && typeof error.message === "string"
        ? error.message
        : "Could not record the entry.";
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const details =
      code === "23505"
        ? "This looks like a duplicate or conflicts with an existing unique record."
        : message;
    return NextResponse.json({ error: "Write failed", details }, { status: 400 });
  }
}
