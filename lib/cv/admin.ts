import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CvSubscriber } from "@/lib/cv/subscriber";

function getAdminEmails() {
  const configured = process.env.ADMIN_EMAILS || "moeylarge@gmail.com";
  return new Set(
    configured
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function getCvAdminSession(): Promise<{ user: User; subscriber: CvSubscriber } | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const email = user?.email?.trim().toLowerCase();
  if (error || !user || !email || !getAdminEmails().has(email)) {
    return null;
  }

  const admin = getSupabaseAdmin();
  const { data, error: subscriberError } = await admin
    .from("cv_subscribers")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (subscriberError || !data) {
    return null;
  }

  return { user, subscriber: data as CvSubscriber };
}

export async function requireAdmin(): Promise<{ user: User; subscriber: CvSubscriber } | NextResponse> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const email = user.email?.trim().toLowerCase() || "";
  if (!email || !getAdminEmails().has(email)) {
    return NextResponse.json({ error: "not authorized" }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { data, error: subscriberError } = await admin
    .from("cv_subscribers")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (subscriberError || !data) {
    return NextResponse.json({ error: "subscriber not found" }, { status: 403 });
  }

  return { user, subscriber: data as CvSubscriber };
}
