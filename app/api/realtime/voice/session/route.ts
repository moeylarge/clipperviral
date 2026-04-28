import { NextResponse } from "next/server";

import { buildResumeContextFromTranscript } from "@/lib/realtime/resume-context";
import { createOpenAiRealtimeVoiceSession } from "@/lib/realtime/voice";
import { getSession, getTranscript } from "@/lib/session/store";

async function buildResumeContext(sessionId: string) {
  const transcript = await getTranscript(sessionId);
  return buildResumeContextFromTranscript(transcript);
}

export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  try {
    const body = (await request.json()) as { sessionId?: string; resume?: boolean };
    if (!body.sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }
    console.info("[voice-bootstrap-route]", {
      ts: new Date().toISOString(),
      event: "request_received",
      sessionId: body.sessionId,
    });

    const session = await getSession(body.sessionId);
    if (!session) {
      console.info("[voice-bootstrap-route]", {
        ts: new Date().toISOString(),
        event: "session_not_found",
        sessionId: body.sessionId,
        elapsedMs: Date.now() - requestStartedAt,
      });
      return NextResponse.json({ error: "session not found" }, { status: 404 });
    }
    if (session.status !== "active" && session.status !== "reconnecting") {
      console.info("[voice-bootstrap-route]", {
        ts: new Date().toISOString(),
        event: "session_not_bootstrappable",
        sessionId: body.sessionId,
        status: session.status,
        endedReason: session.endedReason,
        elapsedMs: Date.now() - requestStartedAt,
      });
      return NextResponse.json(
        { error: "session is not active", status: session.status, endedReason: session.endedReason },
        { status: 409 },
      );
    }

    const continuationContext = body.resume ? await buildResumeContext(body.sessionId) : null;
    const voice = await createOpenAiRealtimeVoiceSession({
      personaSlug: session.personaSlug,
      continuationContext: continuationContext ?? undefined,
    });
    console.info("[voice-bootstrap-route]", {
      ts: new Date().toISOString(),
      event: "request_success",
      sessionId: body.sessionId,
      resume: Boolean(body.resume),
      resumeContextApplied: Boolean(continuationContext),
      model: voice.model,
      voice: voice.voice,
      expiresAt: voice.expiresAt ?? null,
      elapsedMs: Date.now() - requestStartedAt,
    });

    return NextResponse.json({
      ok: true,
      sessionId: body.sessionId,
      resumeContextApplied: Boolean(continuationContext),
      voice,
    });
  } catch (error) {
    console.info("[voice-bootstrap-route]", {
      ts: new Date().toISOString(),
      event: "request_failed",
      message: (error as Error).message,
      elapsedMs: Date.now() - requestStartedAt,
    });
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }
}
