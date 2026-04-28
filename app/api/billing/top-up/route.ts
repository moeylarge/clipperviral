import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "manual top-up is disabled; use checkout to add Gold Coins" },
    { status: 403 },
  );
}
