import { NextRequest, NextResponse } from "next/server";

import { getSession, materializeSession } from "@/lib/session/store";

export async function GET(_: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = await getSession(id);
  if (!session) {
    return NextResponse.json({ error: "session not found" }, { status: 404 });
  }

  return NextResponse.json(materializeSession(session));
}
