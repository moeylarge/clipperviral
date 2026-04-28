"use client";

import { useEffect, useState } from "react";

import { readFastEntryAudit, type FastEntryAuditRecord } from "@/lib/ops/fast-entry-audit";

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function LocalFastEntryHistory() {
  const [items, setItems] = useState<FastEntryAuditRecord[]>([]);

  useEffect(() => {
    setItems(readFastEntryAudit());
  }, []);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No parser activity in this browser yet.</p>;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border/70 bg-white/80">
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-muted/80 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-bold">When</th>
              <th className="px-4 py-3 font-bold">Phase</th>
              <th className="px-4 py-3 font-bold">Account</th>
              <th className="px-4 py-3 font-bold">Detail</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-4 py-3 text-muted-foreground">{formatWhen(item.createdAt)}</td>
                <td className="px-4 py-3 text-foreground">{item.phase.replaceAll("_", " ")}</td>
                <td className="px-4 py-3 text-foreground">{item.accountLabel ?? "Unresolved"}</td>
                <td className="px-4 py-3 text-foreground">{item.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
