"use client";

import type { Ref } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { appendFastEntryAudit } from "@/lib/ops/fast-entry-audit";
import type {
  FastEntryFieldMeta,
  FastEntryFieldSource,
  FastEntryPreview,
  QuickAddKind,
  QuickAddReview,
} from "@/lib/ops/fast-entry";
import { parseFastEntryCommand, quickAddKinds, validateQuickAddReview } from "@/lib/ops/fast-entry";
import type { OpsDataset } from "@/lib/ops/types";

const entryTypes = [
  { value: "deposit", label: "Deposit" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "ticket", label: "Ticket" },
  { value: "settlement", label: "Settlement" },
  { value: "payout_receipt", label: "Payout Receipt" },
  { value: "credit", label: "Free Play / Credit" },
  { value: "note", label: "Note" },
  { value: "manual_adjustment", label: "Manual Adjustment" },
] as const satisfies ReadonlyArray<{ value: QuickAddKind; label: string }>;

const modeConfig: Record<
  QuickAddKind,
  {
    intro: string;
    primaryFields: string[];
    extraFields: string[];
    submitLabel: string;
  }
> = {
  deposit: {
    intro: "Use this when money was added to the account.",
    primaryFields: ["amount", "when"],
    extraFields: ["reference", "note"],
    submitLabel: "Review deposit",
  },
  withdrawal: {
    intro: "Use this when money left the account.",
    primaryFields: ["amount", "when"],
    extraFields: ["reference", "note"],
    submitLabel: "Review withdrawal",
  },
  ticket: {
    intro: "Keep this as short as possible while still identifying the ticket.",
    primaryFields: ["ticket_ref", "pick", "odds", "stake"],
    extraFields: ["event", "wallet", "when"],
    submitLabel: "Review ticket",
  },
  settlement: {
    intro: "Post the result that closed or partly closed a ticket.",
    primaryFields: ["ticket_ref", "result_type", "cash_return"],
    extraFields: ["credit_return", "when", "note"],
    submitLabel: "Review result",
  },
  payout_receipt: {
    intro: "Record money or credit that came in for a statement.",
    primaryFields: ["statement_ref", "cash_received"],
    extraFields: ["credit_received", "when", "note"],
    submitLabel: "Review payout",
  },
  credit: {
    intro: "Record a new free-play or credit grant.",
    primaryFields: ["amount", "grant_ref"],
    extraFields: ["expires_at", "rollover", "when", "note"],
    submitLabel: "Review credit",
  },
  note: {
    intro: "Add a note that explains account state, payout follow-up, or collections.",
    primaryFields: ["subject", "body"],
    extraFields: ["platform", "when"],
    submitLabel: "Review note",
  },
  manual_adjustment: {
    intro: "Use only when a correction is truly needed and can be explained.",
    primaryFields: ["amount", "reason"],
    extraFields: ["when", "note_link"],
    submitLabel: "Review correction",
  },
};

const sourceTone: Record<FastEntryFieldSource, string> = {
  typed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  remembered: "bg-sky-50 text-sky-700 ring-1 ring-sky-200",
  default: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
  inferred: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
};

function labelFor(field: string) {
  const labelMap: Record<string, string> = {
    amount: "Amount",
    when: "Time",
    reference: "Reference",
    note: "Note",
    ticket_ref: "Ticket ID",
    event: "Game / event",
    pick: "Pick",
    odds: "Odds",
    stake: "Stake",
    wallet: "Cash or credit",
    result_type: "Result",
    cash_return: "Cash back",
    credit_return: "Credit back",
    statement_ref: "Statement ID",
    cash_received: "Cash received",
    credit_received: "Credit received",
    grant_ref: "Credit ID",
    expires_at: "Expires",
    rollover: "Rollover",
    subject: "Title",
    platform: "Source",
    body: "Details",
    reason: "Reason",
    note_link: "Linked note",
  };

  return labelMap[field] ?? field.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function placeholderFor(field: string) {
  const placeholderMap: Record<string, string> = {
    amount: "1000",
    when: "Now",
    reference: "Optional reference",
    note: "Short reason or context",
    ticket_ref: "alpha-open-2",
    event: "Warriors @ Suns",
    pick: "Suns +4.5",
    odds: "-110",
    stake: "3500",
    wallet: "cash",
    result_type: "win / loss / push / partial / cashout",
    cash_return: "2220",
    credit_return: "0",
    statement_ref: "alpha-stmt-2026w15",
    cash_received: "900",
    credit_received: "0",
    grant_ref: "credit-2026-04-1",
    expires_at: "2026-04-30",
    rollover: "1",
    subject: "Payout follow-up",
    platform: "telegram",
    body: "Operator said the rest lands tomorrow.",
    reason: "Correction needed after review",
    note_link: "note-alpha-adjustment",
  };

  return placeholderMap[field] ?? labelFor(field);
}

function defaultValueFor(field: string) {
  const defaults: Record<string, string> = {
    when: "Now",
    wallet: "cash",
    result_type: "win",
    credit_return: "0",
    credit_received: "0",
    platform: "internal",
    rollover: "1",
  };

  return defaults[field] ?? "";
}

function sourceLabel(source: FastEntryFieldSource) {
  if (source === "remembered") return "remembered";
  if (source === "default") return "default";
  if (source === "inferred") return "inferred";
  return "typed";
}

function getFieldsForKind(kind: QuickAddKind) {
  return [...modeConfig[kind].primaryFields, ...modeConfig[kind].extraFields];
}

function readMemory(key: string) {
  const raw = window.localStorage.getItem(key);
  return raw ? (JSON.parse(raw) as Record<string, string>) : {};
}

function buildSeedForKind(kind: QuickAddKind, memory: Record<string, string>) {
  const nextValues: Record<string, string> = {};
  const nextMeta: Record<string, FastEntryFieldMeta> = {};

  for (const field of getFieldsForKind(kind)) {
    if (memory[field]) {
      nextValues[field] = memory[field];
      nextMeta[field] = { source: "remembered", detail: `Reused from the last ${kind.replaceAll("_", " ")} entry on this account.` };
    } else {
      nextValues[field] = defaultValueFor(field);
      nextMeta[field] = { source: "default", detail: `Standard ${labelFor(field).toLowerCase()} default.` };
    }
  }

  return { nextValues, nextMeta };
}

function mergePreviewWithSeed(preview: FastEntryPreview, seedValues: Record<string, string>, seedMeta: Record<string, FastEntryFieldMeta>) {
  const mergedValues = { ...seedValues, ...preview.values };
  const mergedMeta = { ...seedMeta, ...preview.fieldMeta };
  return { mergedValues, mergedMeta };
}

function renderFieldRows(values: Record<string, string>, fieldMeta: Record<string, FastEntryFieldMeta>, fields: string[]) {
  return fields
    .filter((field) => (values[field] ?? "").trim() !== "")
    .map((field) => (
      <div key={field} className="flex flex-col gap-2 rounded-lg border border-border/70 bg-white/80 p-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{labelFor(field)}</p>
          <p className="truncate text-sm text-muted-foreground">{values[field]}</p>
          {fieldMeta[field]?.detail ? <p className="mt-1 text-xs text-muted-foreground">{fieldMeta[field].detail}</p> : null}
        </div>
        <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-semibold ${sourceTone[fieldMeta[field]?.source ?? "typed"]}`}>
          {sourceLabel(fieldMeta[field]?.source ?? "typed")}
        </span>
      </div>
    ));
}

function ErrorList({ title, messages }: { title: string; messages: string[] }) {
  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50/90 p-4">
      <p className="text-sm font-semibold text-rose-700">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-rose-700">
        {messages.map((message) => (
          <li key={message}>• {message}</li>
        ))}
      </ul>
    </div>
  );
}

export function QuickAddForm({
  data,
  initialKind,
  initialAccountId,
  embedded = false,
  preferRememberedKind = false,
  canWrite = true,
}: {
  data: OpsDataset;
  initialKind: QuickAddKind;
  initialAccountId?: string;
  embedded?: boolean;
  preferRememberedKind?: boolean;
  canWrite?: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<QuickAddKind>(initialKind);
  const [accountId, setAccountId] = useState(initialAccountId ?? data.accounts[0]?.id ?? "");
  const [showMore, setShowMore] = useState(false);
  const [fastEntry, setFastEntry] = useState("");
  const [fastPreview, setFastPreview] = useState<FastEntryPreview | null>(null);
  const [pendingPreview, setPendingPreview] = useState<FastEntryPreview | null>(null);
  const [review, setReview] = useState<QuickAddReview | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldMeta, setFieldMeta] = useState<Record<string, FastEntryFieldMeta>>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [parserOrigin, setParserOrigin] = useState<{ rawInput: string; inferenceNotes: string[] } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firstPrimaryFieldRef = useRef<HTMLElement | null>(null);
  const accountLocked = Boolean(initialAccountId);
  const account = data.accounts.find((item) => item.id === accountId);
  const config = useMemo(() => modeConfig[kind], [kind]);
  const defaultMemoryKey = `ops-quick-add-defaults:${accountId}`;
  const writableKinds = useMemo(() => new Set<QuickAddKind>(["deposit", "withdrawal", "ticket", "settlement", "payout_receipt"]), []);

  useEffect(() => {
    setReview(null);
    setFormErrors([]);
    setSubmitError(null);
    setSubmitSuccess(null);
  }, [kind, accountId]);

  useEffect(() => {
    const memory = readMemory(defaultMemoryKey);
    if (
      preferRememberedKind &&
      !pendingPreview &&
      memory.lastActionType &&
      quickAddKinds.includes(memory.lastActionType as QuickAddKind) &&
      memory.lastActionType !== kind
    ) {
      setKind(memory.lastActionType as QuickAddKind);
      return;
    }

    const { nextValues, nextMeta } = buildSeedForKind(kind, memory);

    if (pendingPreview && pendingPreview.kind === kind && pendingPreview.accountId === accountId) {
      const { mergedValues, mergedMeta } = mergePreviewWithSeed(pendingPreview, nextValues, nextMeta);
      setValues(mergedValues);
      setFieldMeta(mergedMeta);
      setParserOrigin({ rawInput: pendingPreview.rawInput, inferenceNotes: pendingPreview.inferenceNotes });
      setPendingPreview(null);
      setFastPreview(null);
      return;
    }

    setValues(nextValues);
    setFieldMeta(nextMeta);
  }, [accountId, defaultMemoryKey, kind, pendingPreview, preferRememberedKind]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName;
      const inTypingField = tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";

      if (!inTypingField) {
        if (event.key === "d" || event.key === "D") setKind("deposit");
        if (event.key === "t" || event.key === "T") setKind("ticket");
        if (event.key === "s" || event.key === "S") setKind("settlement");
        if (event.key === "p" || event.key === "P") setKind("payout_receipt");
        if (event.key === "n" || event.key === "N") setKind("note");
      }

      if (event.key === "Enter" && target?.dataset.fastEntry === "true") {
        event.preventDefault();
        handleFastEntry();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function setField(field: string, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldMeta((current) => ({ ...current, [field]: { source: "typed" } }));
    setReview(null);
    setFormErrors([]);
    setSubmitError(null);
    setSubmitSuccess(null);
  }

  function saveMemory(kindToSave: QuickAddKind, accountIdToSave: string, currentValues: Record<string, string>) {
    const key = `ops-quick-add-defaults:${accountIdToSave}`;
    const memory = {
      lastActionType: kindToSave,
      stake: currentValues.stake,
      odds: currentValues.odds,
      wallet: currentValues.wallet,
      amount: currentValues.amount,
      when: currentValues.when,
      ticket_ref: currentValues.ticket_ref,
      statement_ref: currentValues.statement_ref,
    };

    window.localStorage.setItem(key, JSON.stringify(memory));
  }

  function handleFastEntry() {
    const parsed = parseFastEntryCommand(fastEntry, data);
    if (parsed.requiresCorrection) {
      setFastPreview(parsed);
      appendFastEntryAudit({
        phase: "parse_rejected",
        detail: parsed.errors.map((item) => item.message).join(" "),
        rawInput: parsed.rawInput,
        errors: parsed.errors.map((item) => item.message),
      });
      return;
    }

    const memory = readMemory(`ops-quick-add-defaults:${parsed.accountId}`);
    const { nextValues, nextMeta } = buildSeedForKind(parsed.kind, memory);
    const { mergedValues, mergedMeta } = mergePreviewWithSeed(parsed, nextValues, nextMeta);
    const checked = validateQuickAddReview({
      data,
      kind: parsed.kind,
      accountId: parsed.accountId,
      values: mergedValues,
      fieldMeta: mergedMeta,
      rawInput: parsed.rawInput,
      inferenceNotes: parsed.inferenceNotes,
    });
    const preview: FastEntryPreview = {
      ...parsed,
      values: mergedValues,
      fieldMeta: mergedMeta,
      errors: checked.errors,
      warnings: checked.warnings,
      requiresCorrection: checked.errors.length > 0,
    };

    setFastPreview(preview);
    appendFastEntryAudit({
      phase: preview.requiresCorrection ? "parse_rejected" : "parse_preview",
      detail: preview.requiresCorrection
        ? preview.errors.map((item) => item.message).join(" ")
        : `Parsed ${preview.kind.replaceAll("_", " ")} for ${preview.accountLabel}.`,
      rawInput: preview.rawInput,
      kind: preview.kind,
      accountId: preview.accountId,
      accountLabel: preview.accountLabel,
      values: preview.values,
      fieldMeta: preview.fieldMeta,
      inferenceNotes: preview.inferenceNotes,
      errors: preview.errors.map((item) => item.message),
      warnings: preview.warnings.map((item) => item.message),
    });
  }

  function applyParsedPreview() {
    if (!fastPreview || !fastPreview.accountId) {
      return;
    }

    setPendingPreview(fastPreview);
    setKind(fastPreview.kind);
    setAccountId(fastPreview.accountId);
    setReview(null);
    setFormErrors([]);
    setSubmitError(null);
    setSubmitSuccess(null);
    setTimeout(() => firstPrimaryFieldRef.current?.focus(), 0);
  }

  async function handleCommit() {
    if (!review || !writableKinds.has(review.kind) || !canWrite) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      const response = await fetch("/api/ops/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: review.kind,
          accountId: review.accountId,
          values: review.values,
          fieldMeta: review.fieldMeta,
          rawInput: review.rawInput,
          inferenceNotes: review.inferenceNotes,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = Array.isArray(payload?.details)
          ? payload.details.join(" ")
          : payload?.details || payload?.error || "Could not record this entry.";
        setSubmitError(message);
        return;
      }

      setSubmitSuccess(payload?.message || "Recorded.");
      setReview(null);
      setFastPreview(null);
      setFastEntry("");
      setParserOrigin(null);
      router.refresh();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Could not record this entry.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderField(field: string) {
    const focusRef =
      field === config.primaryFields[0]
        ? (node: HTMLElement | null) => {
            firstPrimaryFieldRef.current = node;
          }
        : undefined;

    const helper = fieldMeta[field]?.source && values[field]
      ? `${sourceLabel(fieldMeta[field].source)}${fieldMeta[field].detail ? ` · ${fieldMeta[field].detail}` : ""}`
      : null;

    if (field === "body") {
      return (
        <div className="space-y-2">
          <textarea
            ref={focusRef as Ref<HTMLTextAreaElement> | undefined}
            value={values[field] ?? ""}
            onChange={(event) => setField(field, event.target.value)}
            className="min-h-28 w-full rounded-lg border border-border bg-white px-3 py-3 text-sm text-foreground"
            placeholder={placeholderFor(field)}
          />
          {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <input
          ref={focusRef as Ref<HTMLInputElement> | undefined}
          value={values[field] ?? ""}
          onChange={(event) => setField(field, event.target.value)}
          className="w-full rounded-lg border border-border bg-white px-3 py-3 text-sm text-foreground"
          placeholder={placeholderFor(field)}
        />
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </div>
    );
  }

  const previewFields = fastPreview ? Array.from(new Set([...getFieldsForKind(fastPreview.kind), "accountId"])) : [];
  const reviewFields = Array.from(new Set([...getFieldsForKind(kind), "accountId"]));

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-border/70 bg-white/80 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Fast Entry</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Parse first, then review. Examples: <span className="font-semibold text-foreground">+500 deposit alpha</span>,{" "}
              <span className="font-semibold text-foreground">ticket alpha lakers -110 1000</span> or{" "}
              <span className="font-semibold text-foreground">ticket alpha ref:t500 lakers -110 1000</span>,{" "}
              <span className="font-semibold text-foreground">settle alpha-open-1 win 1900</span>.
            </p>
          </div>
          <div className="flex min-w-0 flex-1 gap-2">
            <input
              data-fast-entry="true"
              value={fastEntry}
              onChange={(event) => setFastEntry(event.target.value)}
              placeholder="Type a fast command"
              className="min-w-0 flex-1 rounded-lg border border-border bg-white px-3 py-3 text-sm text-foreground"
            />
            <button
              type="button"
              onClick={handleFastEntry}
              className="rounded-lg border border-border bg-white px-4 py-3 text-sm font-semibold text-foreground"
            >
              Parse
            </button>
          </div>
        </div>
      </div>

      {fastPreview ? (
        <div className={`rounded-lg border p-4 ${fastPreview.requiresCorrection ? "border-rose-200 bg-rose-50/80" : "border-border/70 bg-white/80"}`}>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Parsed Preview</p>
              <h3 className="mt-2 text-xl font-semibold text-foreground">
                {fastPreview.accountLabel ? `${entryTypes.find((item) => item.value === fastPreview.kind)?.label} for ${fastPreview.accountLabel}` : "Needs correction"}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Raw command: <span className="font-semibold text-foreground">{fastPreview.rawInput || "None"}</span>
              </p>
            </div>
            {fastPreview.accountId ? (
              <button
                type="button"
                onClick={applyParsedPreview}
                className="inline-flex rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
              >
                {fastPreview.requiresCorrection ? "Use parsed values and fix fields" : "Use parsed values"}
              </button>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            <ErrorList title="Fix this before using the parser result" messages={fastPreview.errors.map((item) => item.message)} />
            {fastPreview.inferenceNotes.length > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4">
                <p className="text-sm font-semibold text-amber-700">Inference used</p>
                <ul className="mt-2 space-y-1 text-sm text-amber-700">
                  {fastPreview.inferenceNotes.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="grid gap-3">
              {renderFieldRows(
                { ...fastPreview.values, accountId: fastPreview.accountLabel },
                { ...fastPreview.fieldMeta, accountId: fastPreview.fieldMeta.accountId ?? { source: "typed" } },
                previewFields,
              )}
            </div>
          </div>
        </div>
      ) : null}

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const nextReview = validateQuickAddReview({
            data,
            kind,
            accountId,
            values,
            fieldMeta,
            rawInput: parserOrigin?.rawInput,
            inferenceNotes: parserOrigin?.inferenceNotes ?? [],
          });

          if (nextReview.errors.length > 0) {
            setReview(null);
            setFormErrors(nextReview.errors.map((item) => item.message));
            return;
          }

          saveMemory(kind, accountId, values);
          setFormErrors([]);
          setReview(nextReview);
          appendFastEntryAudit({
            phase: "review_ready",
            detail: parserOrigin?.rawInput
              ? `Parser-reviewed ${kind.replaceAll("_", " ")} for ${nextReview.accountLabel}.`
              : `Manual review ready for ${kind.replaceAll("_", " ")} on ${nextReview.accountLabel}.`,
            rawInput: parserOrigin?.rawInput,
            kind,
            accountId,
            accountLabel: nextReview.accountLabel,
            values,
            fieldMeta,
            inferenceNotes: parserOrigin?.inferenceNotes ?? [],
            warnings: nextReview.warnings.map((item) => item.message),
          });
        }}
      >
        {!embedded ? (
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-foreground">
              Add this
              <select
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as QuickAddKind);
                  setReview(null);
                  setFastPreview(null);
                  setShowMore(false);
                  setParserOrigin(null);
                }}
                className="w-full rounded-lg border border-border bg-white px-3 py-3 text-sm text-foreground"
              >
                {entryTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-semibold text-foreground">
              Account
              {accountLocked ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-3 text-sm text-foreground">
                  <span>{account?.label}</span>
                  <span className="text-xs text-muted-foreground">Prefilled from account page</span>
                </div>
              ) : (
                <select
                  value={accountId}
                  onChange={(event) => {
                    setAccountId(event.target.value);
                    setReview(null);
                    setFastPreview(null);
                    setParserOrigin(null);
                  }}
                  className="w-full rounded-lg border border-border bg-white px-3 py-3 text-sm text-foreground"
                >
                  {data.accounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>
        ) : null}

        <div className="rounded-lg border border-border/70 bg-white/80 p-4">
          <p className="text-sm text-muted-foreground">{config.intro}</p>
          <p className="mt-2 text-xs text-muted-foreground">Shortcuts: D deposit, T ticket, S settlement, P payout, N note.</p>
        </div>

        {!canWrite ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50/90 p-4">
            <p className="text-sm font-semibold text-amber-800">Read-only preview</p>
            <p className="mt-1 text-sm text-amber-700">
              You can review fields and parser output here, but recording changes is locked to the owner session.
            </p>
          </div>
        ) : null}

        <ErrorList title="This entry needs correction" messages={formErrors} />
        {submitError ? <ErrorList title="Write failed" messages={[submitError]} /> : null}
        {submitSuccess ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/90 p-4">
            <p className="text-sm font-semibold text-emerald-700">{submitSuccess}</p>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          {config.primaryFields.map((field) => (
            <label key={field} className="space-y-2 text-sm font-semibold text-foreground">
              {labelFor(field)}
              {renderField(field)}
            </label>
          ))}
        </div>

        {config.extraFields.length > 0 ? (
          <div className="space-y-3">
            <button type="button" onClick={() => setShowMore((value) => !value)} className="text-sm font-semibold text-primary">
              {showMore ? "Hide more details" : "More details"}
            </button>

            {showMore ? (
              <div className="grid gap-4 md:grid-cols-2">
                {config.extraFields.map((field) => (
                  <label key={field} className="space-y-2 text-sm font-semibold text-foreground">
                    {labelFor(field)}
                    {renderField(field)}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <button type="submit" className="inline-flex rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
          {config.submitLabel}
        </button>
      </form>

      {review ? (
        <div className="rounded-lg border border-border/70 bg-white/80 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Review Before Record</p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">
            {entryTypes.find((type) => type.value === kind)?.label} for {review.accountLabel}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Source of entry: <span className="font-semibold text-foreground">{review.rawInput ? "manual · parser" : "manual"}</span>
          </p>

          {review.rawInput ? (
            <div className="mt-4 rounded-lg border border-border/70 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-foreground">Audit preview</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Raw command: <span className="font-semibold text-foreground">{review.rawInput}</span>
              </p>
              {review.inferenceNotes.length > 0 ? (
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {review.inferenceNotes.map((note) => (
                    <li key={note}>• {note}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3">
            {renderFieldRows(
              { ...review.values, accountId: review.accountLabel },
              { ...review.fieldMeta, accountId: review.fieldMeta.accountId ?? { source: "typed" } },
              reviewFields,
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            {writableKinds.has(review.kind) && canWrite ? (
              <button
                type="button"
                onClick={handleCommit}
                disabled={isSubmitting}
                className="inline-flex rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "Recording..." : "Record now"}
              </button>
            ) : writableKinds.has(review.kind) ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                Shared preview is read-only. Sign in as owner to record this.
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                This mode is still review-only. Write path is not wired yet.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
