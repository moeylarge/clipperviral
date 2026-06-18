import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCvAdminSession } from "@/lib/cv/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = await getCvAdminSession();
  const isAdmin = Boolean(admin);

  return NextResponse.json({
    is_admin: isAdmin,
    isAdmin,
    email: user?.email || null,
  });
}
