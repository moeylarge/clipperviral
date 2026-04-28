import type { FastEntryFieldMeta, QuickAddKind } from "@/lib/ops/fast-entry";

export type FastEntryAuditRecord = {
  id: string;
  createdAt: string;
  phase: "parse_preview" | "parse_rejected" | "review_ready";
  detail: string;
  rawInput?: string;
  kind?: QuickAddKind;
  accountId?: string;
  accountLabel?: string;
  values?: Record<string, string>;
  fieldMeta?: Record<string, FastEntryFieldMeta>;
  inferenceNotes?: string[];
  errors?: string[];
  warnings?: string[];
};

const STORAGE_KEY = "ops-fast-entry-audit";

export function readFastEntryAudit(): FastEntryAuditRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(raw) as FastEntryAuditRecord[];
  } catch {
    return [];
  }
}

export function appendFastEntryAudit(record: Omit<FastEntryAuditRecord, "id" | "createdAt">): FastEntryAuditRecord | null {
  if (typeof window === "undefined") {
    return null;
  }

  const nextRecord: FastEntryAuditRecord = {
    ...record,
    id: `audit-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  const current = readFastEntryAudit();
  const next = [nextRecord, ...current].slice(0, 30);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return nextRecord;
}
