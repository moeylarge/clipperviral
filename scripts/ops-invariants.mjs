import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const outDir = path.join(os.tmpdir(), "ops-invariants-build");
const tsconfigPath = path.join(os.tmpdir(), "ops-invariants-tsconfig.json");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(
  tsconfigPath,
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2020",
        module: "commonjs",
        moduleResolution: "node",
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
        baseUrl: repoRoot,
        paths: {
          "@/*": ["./*"],
        },
        outDir,
      },
      include: [
        path.join(repoRoot, "lib/ops/types.ts"),
        path.join(repoRoot, "lib/ops/mock-data.ts"),
        path.join(repoRoot, "lib/ops/invariants.ts"),
        path.join(repoRoot, "lib/ops/metrics.ts"),
      ],
    },
    null,
    2,
  ),
);

execSync(`npx tsc -p "${tsconfigPath}"`, { stdio: "inherit", cwd: repoRoot });

const emittedOpsDir = path.join(outDir, "ops");
const emittedSupabaseDir = path.join(outDir, "supabase");
const aliasDir = path.join(outDir, "node_modules", "@", "lib", "ops");
const supabaseAliasDir = path.join(outDir, "node_modules", "@", "lib", "supabase");
fs.mkdirSync(aliasDir, { recursive: true });
fs.mkdirSync(supabaseAliasDir, { recursive: true });
for (const file of ["types", "mock-data", "invariants", "data"]) {
  fs.symlinkSync(path.join(emittedOpsDir, `${file}.js`), path.join(aliasDir, `${file}.js`));
}
fs.symlinkSync(path.join(emittedSupabaseDir, "admin.js"), path.join(supabaseAliasDir, "admin.js"));

const { opsMockData } = await import(`file://${path.join(emittedOpsDir, "mock-data.js")}`);
const { assertOpsInvariants } = await import(`file://${path.join(emittedOpsDir, "invariants.js")}`);
const { buildOpsDashboard } = await import(`file://${path.join(emittedOpsDir, "metrics.js")}`);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectInvariantFailure(name, fn, pattern) {
  let error = null;
  try {
    fn();
  } catch (caught) {
    error = caught;
  }
  assert(error, `${name} should have failed`);
  assert.match(String(error), pattern, `${name} failed for the wrong reason`);
}

assert.doesNotThrow(() => assertOpsInvariants(opsMockData), "base seed data must satisfy invariants");

const dashboard = buildOpsDashboard(opsMockData);
assert.equal(dashboard.metrics.pendingExposureCash, 12200, "payout-based exposure should include odds-based liability");
assert.equal(dashboard.metrics.weeklySettledCashNet, 1020, "weekly settled cash net should trace to the current-week settlement");
assert.equal(dashboard.accountRows.find((row) => row.account.id === "acct-alpha")?.statementVariance, -900, "alpha variance should equal receipts less authoritative statement expected");
assert.equal(dashboard.accountRows.find((row) => row.account.id === "acct-bravo")?.payoutDue.cash, null, "disputed statement revision should suspend authoritative payout due");

const duplicateEntry = clone(opsMockData);
duplicateEntry.walletEntries.push({
  id: "we-alpha-dep-dup-bad",
  accountId: "acct-alpha",
  walletType: "cash",
  entryType: "deposit",
  sourceOfEntry: "import",
  signedAmount: 10000,
  status: "posted",
  occurredAt: "2026-04-07T15:09:00Z",
  postedAt: "2026-04-07T15:09:00Z",
  externalRef: "dep-alpha-1001",
  dedupeKey: "acct-alpha|deposit|dep-alpha-1001|10000",
  description: "Bad duplicate that should fail",
});
expectInvariantFailure("duplicate entry attempt", () => assertOpsInvariants(duplicateEntry), /dedupe_key/);

const payoutMismatch = clone(opsMockData);
const payoutEntry = payoutMismatch.walletEntries.find((entry) => entry.id === "we-alpha-payout-week");
payoutEntry.signedAmount = 2000;
expectInvariantFailure("mismatched settlement payout", () => assertOpsInvariants(payoutMismatch), /cash payout does not match/);

const conflictingStatementRevision = clone(opsMockData);
const bravoV1 = conflictingStatementRevision.periodStatements.find((statement) => statement.id === "stmt-bravo-mar-v1");
bravoV1.authority = "authoritative";
expectInvariantFailure("conflicting statement revision", () => assertOpsInvariants(conflictingStatementRevision), /cannot be both suspended and authoritative/);

const negativeBalance = clone(opsMockData);
negativeBalance.walletEntries.push({
  id: "we-alpha-negative-test",
  accountId: "acct-alpha",
  walletType: "cash",
  entryType: "withdrawal",
  sourceOfEntry: "manual",
  signedAmount: -30000,
  status: "posted",
  occurredAt: "2026-04-17T18:00:00Z",
  postedAt: "2026-04-17T18:00:00Z",
  noteId: "note-alpha-adjustment",
  description: "Negative balance edge case",
});
assert.doesNotThrow(() => assertOpsInvariants(negativeBalance), "negative balance itself should not violate invariants");
assert(buildOpsDashboard(negativeBalance).accountRows.find((row) => row.account.id === "acct-alpha")?.currentBalance.cash < 0, "negative balance should remain visible, not normalized away");

console.log("ops invariants: ok");
