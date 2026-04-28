import { NextResponse } from "next/server";

import { requireFwtovUserForRequest } from "@/lib/auth/fwtov-user";
import { getWalletSummaryForUserDbId } from "@/lib/session/store";

export async function GET() {
  try {
    const user = await requireFwtovUserForRequest();
    const wallet = await getWalletSummaryForUserDbId(user.id);

    return NextResponse.json({ wallet });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 401 });
  }
}
