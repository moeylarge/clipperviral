/* eslint-disable no-console */

const BASE_URL = process.env.LOAD_TEST_BASE_URL ?? "http://localhost:3000";
const CONCURRENCY = Number(process.env.LOAD_TEST_CONCURRENCY ?? 50);
const HEARTBEAT_ROUNDS = Number(process.env.LOAD_TEST_HEARTBEATS ?? 5);
const HEARTBEAT_INTERVAL_MS = Number(process.env.LOAD_TEST_HEARTBEAT_INTERVAL_MS ?? 1000);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runClient(index) {
  const userId = crypto.randomUUID();
  const personaSlug = index % 3 === 0 ? "rabbi" : index % 3 === 1 ? "businessman" : "moses";

  const createRes = await fetch(`${BASE_URL}/api/sessions/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, personaSlug }),
  });

  if (!createRes.ok) {
    throw new Error(`create failed: ${createRes.status}`);
  }

  const created = await createRes.json();
  const sessionId = created.sessionId;

  for (let i = 0; i < HEARTBEAT_ROUNDS; i += 1) {
    const hbRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userUtterance: `load-${index}-${i}` }),
    });

    if (!hbRes.ok) {
      throw new Error(`heartbeat failed: ${hbRes.status}`);
    }

    await sleep(HEARTBEAT_INTERVAL_MS);
  }

  const endRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}/end`, {
    method: "POST",
  });

  if (!endRes.ok) {
    throw new Error(`end failed: ${endRes.status}`);
  }

  return sessionId;
}

async function main() {
  const started = Date.now();
  const jobs = Array.from({ length: CONCURRENCY }, (_, i) => runClient(i));
  const results = await Promise.allSettled(jobs);

  const success = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - success;
  const elapsed = ((Date.now() - started) / 1000).toFixed(2);

  console.log("Load test complete");
  console.log(`baseUrl=${BASE_URL}`);
  console.log(`concurrency=${CONCURRENCY}`);
  console.log(`success=${success}`);
  console.log(`failed=${failed}`);
  console.log(`elapsedSeconds=${elapsed}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
