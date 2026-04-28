import { NextResponse } from "next/server";

import { endSession } from "@/lib/session/store";
import type { SessionEndedReason } from "@/lib/session/types";

const endAttemptBySession = new Map<string, number>();

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  try {
    const { id } = await context.params;
    const attempt = (endAttemptBySession.get(id) ?? 0) + 1;
    endAttemptBySession.set(id, attempt);

    const body = (await request.json().catch(() => ({}))) as {
      reason?: SessionEndedReason;
    };

    const allowed = new Set<Exclude<SessionEndedReason, null>>([
      "ended_user",
      "ended_payment_required",
      "ended_timeout",
      "ended_failure",
    ]);
    const reason =
      body.reason && allowed.has(body.reason as Exclude<SessionEndedReason, null>)
        ? (body.reason as Exclude<SessionEndedReason, null>)
        : "ended_user";

    console.info("[session-end-route]", {
      ts: new Date().toISOString(),
      event: "request_received",
      sessionId: id,
      reason,
      attempt,
    });
    const result = await endSession(id, reason);
    console.info("[session-end-route]", {
      ts: new Date().toISOString(),
      event: "request_completed",
      sessionId: id,
      reason,
      attempt,
      finalStatus: result.session.status,
      finalEndedReason: result.session.endedReason,
      finalCostCents: result.effectiveCostCents,
      elapsedMs: Date.now() - startedAt,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.info("[session-end-route]", {
      ts: new Date().toISOString(),
      event: "request_failed",
      message: (error as Error).message,
      elapsedMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
