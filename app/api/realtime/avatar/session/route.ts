import { NextResponse } from "next/server";

import { LiveAvatarProviderError, createLiveAvatarSession } from "@/lib/realtime/avatar";
import { getSession } from "@/lib/session/store";

const bootstrapAttemptBySession = new Map<string, number>();

export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  try {
    const body = (await request.json()) as { sessionId?: string; reason?: string };
    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }
    const attempt = (bootstrapAttemptBySession.get(body.sessionId) ?? 0) + 1;
    bootstrapAttemptBySession.set(body.sessionId, attempt);
    console.info("[avatar-bootstrap-route]", {
      ts: new Date().toISOString(),
      event: "request_received",
      sessionId: body.sessionId,
      attempt,
      reason: body.reason ?? null,
    });

    const session = await getSession(body.sessionId);
    if (!session) {
      console.info("[avatar-bootstrap-route]", {
        ts: new Date().toISOString(),
        event: "session_not_found",
        sessionId: body.sessionId,
        attempt,
        elapsedMs: Date.now() - requestStartedAt,
      });
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }
    if (session.status !== "active" && session.status !== "reconnecting") {
      console.info("[avatar-bootstrap-route]", {
        ts: new Date().toISOString(),
        event: "session_not_bootstrappable",
        sessionId: body.sessionId,
        attempt,
        sessionStatus: session.status,
        endedReason: session.endedReason,
        elapsedMs: Date.now() - requestStartedAt,
      });
      return NextResponse.json(
        { error: "session is not active", status: session.status, endedReason: session.endedReason },
        { status: 409 },
      );
    }

    const avatar = await createLiveAvatarSession({
      personaSlug: session.personaSlug,
      conversationSessionId: session.id,
      reason: body.reason,
    });
    console.info("[avatar-bootstrap-route]", {
      ts: new Date().toISOString(),
      event: "request_completed",
      sessionId: body.sessionId,
      attempt,
      reason: body.reason ?? null,
      providerSessionId: avatar.sessionId,
      hasStreamUrl: Boolean(avatar.streamUrl),
      hasToken: Boolean(avatar.token),
      disabled: avatar.disabled ?? false,
      disabledReason: avatar.disabledReason ?? null,
      elapsedMs: Date.now() - requestStartedAt,
    });

    return NextResponse.json({
      ok: true,
      sessionId: body.sessionId,
      avatar,
    });
  } catch (error) {
    if (error instanceof LiveAvatarProviderError) {
      console.info("[avatar-bootstrap-route]", {
        ts: new Date().toISOString(),
        event: "provider_error",
        status: error.status,
        providerCode: error.providerCode,
        providerMessage: error.providerMessage,
        message: error.message,
        elapsedMs: Date.now() - requestStartedAt,
      });
      return NextResponse.json(
        {
          error: error.message,
          provider: {
            status: error.status,
            code: error.providerCode,
            message: error.providerMessage,
          },
        },
        { status: error.status >= 400 ? error.status : 503 },
      );
    }

    console.info("[avatar-bootstrap-route]", {
      ts: new Date().toISOString(),
      event: "unexpected_error",
      message: (error as Error).message,
      elapsedMs: Date.now() - requestStartedAt,
    });
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }
}
