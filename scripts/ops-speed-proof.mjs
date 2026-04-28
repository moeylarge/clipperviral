import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import process from "node:process";
import { chromium } from "playwright";

const port = 3010;
const baseUrl = `http://127.0.0.1:${port}`;
const ownerEmail = "ops-owner@example.com";
const ownerPassword = "ops-owner-pass";
const ownerSecret = "ops-owner-secret";
const ownerCookieName = "clipperviral_owner_session";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(`${baseUrl}/ops`);
      if (response.ok) {
        return;
      }
    } catch {}
    await wait(1000);
  }
  throw new Error("dev server did not start in time");
}

async function typeHuman(page, selector, text, delay = 55) {
  const field = page.locator(selector);
  await field.click();
  await page.keyboard.type(text, { delay });
}

async function openQuickAdd(page, query) {
  await page.goto(`${baseUrl}/ops/quick-add${query}`);
  await page.evaluate(() => window.localStorage.removeItem("ops-fast-entry-audit"));
}

const devServer = spawn("npm", ["run", "dev", "--", "--port", String(port)], {
  stdio: "pipe",
  cwd: process.cwd(),
  shell: false,
  env: {
    ...process.env,
    OWNER_EMAIL: ownerEmail,
    OWNER_PASSWORD: ownerPassword,
    OWNER_SESSION_SECRET: ownerSecret,
  },
});

devServer.stdout.on("data", () => {});
devServer.stderr.on("data", () => {});

try {
  await waitForServer();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const token = createHash("sha256").update(`${ownerEmail.toLowerCase()}::${ownerPassword}::${ownerSecret}`).digest("hex");

  await context.addCookies([
    {
      name: ownerCookieName,
      value: token,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  const page = await context.newPage();

  async function measure(name, runner) {
    const start = performance.now();
    const result = await runner();
    const end = performance.now();
    return {
      name,
      seconds: Number(((end - start) / 1000).toFixed(2)),
      ...result,
    };
  }

  await page.goto(`${baseUrl}/ops/quick-add?kind=deposit&account=acct-charlie`);
  await page.evaluate(() => {
    window.localStorage.clear();
  });

  const firstTime = await measure("first-time", async () => {
    await page.goto(`${baseUrl}/ops/quick-add?kind=deposit&account=acct-charlie`);
    await page.getByLabel("Amount").fill("");
    await typeHuman(page, 'input[placeholder="1000"]', "4000");
    await page.getByRole("button", { name: "Review deposit" }).click();
    await page.getByText("Review Before Record").waitFor();
    return { detail: "Manual first deposit on an account with no remembered values." };
  });

  const repeatedUse = await measure("repeated-use", async () => {
    await page.goto(`${baseUrl}/ops/quick-add?account=acct-charlie`);
    await page.getByLabel("Amount").fill("");
    await typeHuman(page, 'input[placeholder="1000"]', "4200");
    await page.getByRole("button", { name: "Review deposit" }).click();
    await page.getByText("Review Before Record").waitFor();
    return { detail: "Same account, remembered deposit mode and remembered time reused automatically." };
  });

  const errorCorrection = await measure("error-correction", async () => {
    await page.goto(`${baseUrl}/ops/quick-add?account=acct-alpha`);
    await page.locator('[data-fast-entry="true"]').fill("");
    await typeHuman(page, '[data-fast-entry="true"]', "+10000 deposit alpha");
    await page.getByRole("button", { name: "Parse", exact: true }).click();
    await page.getByText("Duplicate-looking deposit").waitFor();
    await page.locator('[data-fast-entry="true"]').fill("");
    await typeHuman(page, '[data-fast-entry="true"]', "+9999 deposit alpha");
    await page.getByRole("button", { name: "Parse", exact: true }).click();
    await page.getByRole("button", { name: /Use parsed values/ }).click();
    await page.locator('input[placeholder="1000"]').waitFor();
    await page.locator('input[placeholder="1000"]').fill("");
    await typeHuman(page, 'input[placeholder="1000"]', "9999");
    await page.getByRole("button", { name: "Review deposit" }).click();
    await page.getByText("Review Before Record").waitFor();
    return { detail: "Started with an unsafe duplicate-looking deposit and corrected it to a safe amount." };
  });

  const parserFailure = await measure("parser-failure", async () => {
    await page.goto(`${baseUrl}/ops/quick-add?account=acct-alpha`);
    await page.locator('[data-fast-entry="true"]').fill("");
    await typeHuman(page, '[data-fast-entry="true"]', "settle missing-ticket win 1900");
    await page.getByRole("button", { name: "Parse", exact: true }).click();
    await page.getByText('Unknown ticket "missing-ticket".').waitFor();
    return { detail: "Parser rejected an unknown ticket before any form state was applied." };
  });

  const ticketWithoutId = await measure("ticket-without-id", async () => {
    await page.goto(`${baseUrl}/ops/quick-add?account=acct-alpha`);
    await page.locator('[data-fast-entry="true"]').fill("");
    await typeHuman(page, '[data-fast-entry="true"]', "ticket alpha lakers -110 1000");
    await page.getByRole("button", { name: "Parse", exact: true }).click();
    await page.getByText("Ticket ID is still needed before review.").waitFor();
    await page.getByRole("button", { name: /Use parsed values and fix/ }).click();
    await page.getByLabel("Ticket ID").fill("alpha-fast-1");
    await page.getByRole("button", { name: "Review ticket" }).click();
    await page.getByText("Review Before Record").waitFor();
    return { detail: "Parsed account, pick, odds, and stake from one line, then required only the missing ticket ID." };
  });

  async function captureFailure(name, query, commandOrAction, expectedText) {
    await page.goto(`${baseUrl}${query}`);

    if (typeof commandOrAction === "string") {
      await page.locator('[data-fast-entry="true"]').fill("");
      await typeHuman(page, '[data-fast-entry="true"]', commandOrAction);
      await page.getByRole("button", { name: "Parse", exact: true }).click();
    } else {
      await commandOrAction();
    }

    await page.getByText(expectedText).waitFor();
    return { name, message: expectedText };
  }

  const failures = [
    await captureFailure("unknown-account", "/ops/quick-add", "+500 deposit nobody", 'Unknown account "nobody".'),
    await captureFailure("unknown-ticket", "/ops/quick-add?account=acct-alpha", "settle missing-ticket win 1900", 'Unknown ticket "missing-ticket".'),
    await captureFailure(
      "invalid-statement",
      "/ops/quick-add?account=acct-bravo",
      "payout bravo bravo-stmt-2026-03-v2 100",
      'Statement "bravo-stmt-2026-03-v2" is not valid for payout entry because it is disputed.',
    ),
    await captureFailure("negative-amount", "/ops/quick-add?kind=deposit&account=acct-alpha", async () => {
      await page.getByLabel("Amount").fill("-50");
      await page.getByRole("button", { name: "Review deposit" }).click();
    }, "Amount must be a positive number."),
    await captureFailure("duplicate-looking-deposit", "/ops/quick-add?account=acct-alpha", "+10000 deposit alpha", "Duplicate-looking deposit"),
    await captureFailure("settlement-mismatch", "/ops/quick-add?account=acct-alpha", "settle alpha-open-1 win 9000", "Settlement mismatch"),
  ];

  console.log(
    JSON.stringify(
      {
        timings: {
          firstTime,
          repeatedUse,
          errorCorrection,
          parserFailure,
          ticketWithoutId,
        },
        failureCases: failures,
      },
      null,
      2,
    ),
  );

  await context.close();
  await browser.close();
} finally {
  devServer.kill("SIGINT");
}
