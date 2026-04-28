import { NextRequest, NextResponse } from "next/server";

import { appendTranscriptMessage, heartbeatSession } from "@/lib/session/store";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      reconnecting?: boolean;
      resume?: boolean;
      userUtterance?: string;
      assistantUtterance?: string;
    };

    if (typeof body.userUtterance === "string" && body.userUtterance.trim()) {
      await appendTranscriptMessage(id, "user", body.userUtterance.trim());
    }

    if (typeof body.assistantUtterance === "string" && body.assistantUtterance.trim()) {
      await appendTranscriptMessage(id, "assistant", body.assistantUtterance.trim());
    }

    const result = await heartbeatSession({
      sessionId: id,
      reconnecting: body.reconnecting,
      resume: body.resume,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
