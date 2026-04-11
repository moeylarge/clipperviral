import {
  type DbUser,
  type Profile,
  type Show,
  type ShowParticipant,
  type QueueEntry,
  type Round,
  type Vote,
  type Result,
  type Clip,
  type Ranking,
} from "@/lib/types/spotlight";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SpotlightQueryError = {
  message: string;
};

function unwrap<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

function hasSupabaseConfig() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export async function getCurrentSessionIdentity(): Promise<{ user: DbUser | null; profile: Profile | null }> {
  if (!hasSupabaseConfig()) {
    return { user: null, profile: null };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { user: null, profile: null };
  }

  const { data: appUser, error: appUserError } = await supabase
    .from("users")
    .select("id,auth_user_id,handle,display_name,created_at,updated_at")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (appUserError) {
    console.error("Failed to load users row", appUserError);
  }

  const mappedUser: DbUser = appUser
    ? (appUser as DbUser)
    : {
        id: user.id,
        auth_user_id: user.id,
        handle: user.user_metadata?.handle ?? user.email ?? user.id,
        display_name: user.user_metadata?.name ?? null,
        created_at: user.created_at,
        updated_at: user.updated_at ?? user.created_at,
      };

  const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", mappedUser.id).maybeSingle();

  return { user: mappedUser, profile: unwrap(profile as Profile | null) };
}

export async function getAuthenticatedUser() {
  const supabase = await createServerSupabaseClient();
  return supabase.auth.getUser();
}

export async function getCurrentProfile(): Promise<{ profile: Profile | null; user: DbUser | null }> {
  const data = await getCurrentSessionIdentity();
  return { profile: data.profile, user: data.user };
}

export async function getShows(): Promise<Show[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("shows")
    .select("*")
    .order("starts_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Show[];
}

export async function getShowBySlug(slug: string): Promise<Show | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("shows").select("*").eq("slug", slug).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return unwrap(data as Show | null);
}

export async function getQueueForShow(showId: string): Promise<QueueEntry[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("queue_entries")
    .select("*")
    .eq("show_id", showId)
    .order("position", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as QueueEntry[];
}

export async function getParticipants(showId: string): Promise<ShowParticipant[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("show_participants").select("*").eq("show_id", showId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as ShowParticipant[];
}

export async function getRoundByShow(showId: string): Promise<Round | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("rounds")
    .select("*")
    .eq("show_id", showId)
    .in("state", ["live", "waiting"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return unwrap(data as Round | null);
}

export async function getVotesForRound(roundId: string): Promise<Vote[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("votes").select("*").eq("round_id", roundId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Vote[];
}

export async function getResultForRound(roundId: string): Promise<Result | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("results").select("*").eq("round_id", roundId).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return unwrap(data as Result | null);
}

export async function getClipsByShow(showId: string): Promise<Clip[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("clips")
    .select("*")
    .eq("show_id", showId)
    .order("published_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Clip[];
}

export async function getRanking(userId?: string): Promise<Ranking[]> {
  const supabase = await createServerSupabaseClient();
  let query = supabase.from("rankings").select("*");

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query.order("rank", { ascending: true }).limit(20);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Ranking[];
}
