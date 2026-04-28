import { OpsShell } from "@/app/ops/_components/ops-shell";
import { OpsSection } from "@/app/ops/_components/ops-primitives";
import { QuickAddForm } from "@/app/ops/quick-add/quick-add-form";
import { getOpsAccessState } from "@/lib/auth/manual-session";
import { getOpsDatasetFromSource } from "@/lib/ops/metrics";

const validKinds = new Set([
  "deposit",
  "withdrawal",
  "ticket",
  "settlement",
  "payout_receipt",
  "credit",
  "note",
  "manual_adjustment",
]);

export default async function QuickAddPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const explicitKind = typeof params.kind === "string" && validKinds.has(params.kind) ? params.kind : undefined;
  const accountParam = typeof params.account === "string" ? params.account : undefined;
  const data = await getOpsDatasetFromSource();
  const access = await getOpsAccessState();

  return (
    <OpsShell
      currentPath="/ops/quick-add"
      title="Quick Add"
      description="Fast entry for the records you add every day. Pick the account, choose the record type, fill only the fields that matter."
    >
      <OpsSection title="Add Record" description="Built for speed. One form, one account, one clean record at a time.">
        <QuickAddForm
          data={data}
          initialKind={(explicitKind ?? "deposit") as never}
          initialAccountId={accountParam}
          preferRememberedKind={!explicitKind}
          canWrite={access.mode === "owner"}
        />
      </OpsSection>
    </OpsShell>
  );
}
