import type { User } from "@supabase/supabase-js";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type FwtovUserRow = {
  id: string;
  auth_user_id: string | null;
  external_user_id: string;
  email: string | null;
  credits_cents: number;
  free_trial_used_at: string | null;
};

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

function handleFromEmail(email: string | null, userId: string) {
  const base = email?.split("@")[0]?.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
  return base ? `parent-${base}-${userId.slice(0, 8)}` : `parent-${userId.slice(0, 12)}`;
}

export async function ensureFwtovUserForAuth(authUser: User): Promise<FwtovUserRow> {
  const supabase = getSupabaseAdmin();
  const email = normalizeEmail(authUser.email);
  const externalUserId = `auth:${authUser.id}`;

  const ensured = await supabase
    .rpc("ensure_fwtov_user", {
      p_auth_user_id: authUser.id,
      p_external_user_id: externalUserId,
      p_email: email,
      p_handle: handleFromEmail(email, authUser.id),
    })
    .single();

  if (ensured.error || !ensured.data) {
    throw new Error(ensured.error?.message ?? "failed to ensure authenticated user");
  }

  return ensured.data as FwtovUserRow;
}

export async function requireFwtovUserForRequest(): Promise<FwtovUserRow> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("sign-in is required");
  }

  return ensureFwtovUserForAuth(user);
}
