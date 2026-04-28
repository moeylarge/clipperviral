import { NextResponse } from "next/server";

import { createLiveAvatarSession } from "@/lib/liveavatar";
import { routeKeyMatches } from "@/lib/config";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { accessKey?: string; conversationId?: string };
    if (!body.accessKey || !routeKeyMatches(body.accessKey)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (!body.conversationId) {
      return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
    }

    const avatar = await createLiveAvatarSession(body.conversationId, body.accessKey);
    return NextResponse.json({ ok: true, avatar });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }
}
