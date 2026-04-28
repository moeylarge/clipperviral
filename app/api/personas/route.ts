import { NextResponse } from "next/server";

import { PERSONAS } from "@/lib/personas";

export async function GET() {
  return NextResponse.json({ personas: PERSONAS });
}
