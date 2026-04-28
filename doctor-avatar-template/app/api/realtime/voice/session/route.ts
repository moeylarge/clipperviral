import { NextResponse } from "next/server";

import { createOpenAiRealtimeVoiceSession } from "@/lib/openai-realtime";
import { routeKeyMatches } from "@/lib/config";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { accessKey?: string };
    if (!body.accessKey || !routeKeyMatches(body.accessKey)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const voice = await createOpenAiRealtimeVoiceSession(body.accessKey);
    return NextResponse.json({ ok: true, voice });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }
}
