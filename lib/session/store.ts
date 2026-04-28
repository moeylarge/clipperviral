import { randomUUID } from "crypto";

import type { PostgrestSingleResponse } from "@supabase/supabase-js";

import { VISIT_RATE_CENTS_PER_MINUTE } from "@/lib/billing/packages";
import { centsToGoldCoins, GOLD_COINS_PER_PAID_MINUTE, type WalletSummary } from "@/lib/billing/wallet";
import { getPersonaBySlug } from "@/lib/personas";
import { getRedisClient } from "@/lib/redis/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AccessState, HeartbeatResult, LiveSessionRecord, SessionEndedReason, SessionMessage } from "@/lib/session/types";

type DbUser = {
  id: string;
  external_user_id: string;
  email?: string | null;
  credits_cents: number;
  free_trial_used_at?: string | null;
  updated_at?: string | null;
};

function guestHandleForExternalUserId(externalUserId: string) {
  return `guest-${externalUserId}`.toLowerCase();
}

type DbPersona = {
  id: string;
  slug: string;
  display_name: string;
  value_line: string;
  description: string;
  avatar_id: string;
  voice_id: string;
  system_prompt: string;
  moderation_profile: string;
  price_cents_per_minute: number;
  free_seconds: number;
};

type DbLiveSession = {
  id: string;
  user_id: string;
  persona_id: string;
  status: LiveSessionRecord["status"];
  ended_reason: SessionEndedReason;
  connection_state: LiveSessionRecord["connectionState"];
  started_at: string;
  free_ends_at: string;
  ended_at: string | null;
  last_heartbeat_at: string;
  billable_ms: number;
  charged_cents: number;
  summary_points: string[];
};

const REDIS_TTL_SECONDS = 60 * 30;
const HEARTBEAT_TIMEOUT_SECONDS = Number(process.env.SESSION_HEARTBEAT_TIMEOUT_SECONDS ?? 20);
const DAILY_TRIAL_CAP_CENTS = Number(process.env.DAILY_TRIAL_CAP_CENTS ?? 0);
const LIVEAVATAR_TRIAL_COST_CENTS = Number(process.env.LIVEAVATAR_TRIAL_COST_CENTS ?? 20);

function nowIso() {
  return new Date().toISOString();
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function floorCostForMs(ms: number, centsPerMinute: number) {
  return Math.floor((ms * centsPerMinute) / 60000);
}

function getElapsedMs(startedAt: string, endedAt: string | null) {
  const startMs = new Date(startedAt).getTime();
  const endMs = endedAt ? new Date(endedAt).getTime() : Date.now();
  return Math.max(0, endMs - startMs);
}

function getFreeRemainingMs(freeEndsAt: string, endedAt: string | null) {
  const freeEndMs = new Date(freeEndsAt).getTime();
  const anchorMs = endedAt ? new Date(endedAt).getTime() : Date.now();
  return Math.max(0, freeEndMs - anchorMs);
}

function heartbeatTimeoutBoundaryMs(lastHeartbeatAt: string) {
  return new Date(lastHeartbeatAt).getTime() + HEARTBEAT_TIMEOUT_SECONDS * 1000;
}

function hotStateKey(sessionId: string) {
  return `live:session:${sessionId}`;
}

function dailyTrialSpendKey() {
  return `fwtov:trial-spend:${new Date().toISOString().slice(0, 10)}`;
}

async function ensureDailyTrialSpendAvailable() {
  if (DAILY_TRIAL_CAP_CENTS <= 0 || LIVEAVATAR_TRIAL_COST_CENTS <= 0) {
    return;
  }

  const redis = await getRedisClient();
  const key = dailyTrialSpendKey();
  const currentSpend = Number(await redis.get(key)) || 0;
  const nextSpend = currentSpend + LIVEAVATAR_TRIAL_COST_CENTS;

  if (nextSpend > DAILY_TRIAL_CAP_CENTS) {
    throw new Error("daily free trial limit reached");
  }
}

async function recordDailyTrialSpend() {
  if (DAILY_TRIAL_CAP_CENTS <= 0 || LIVEAVATAR_TRIAL_COST_CENTS <= 0) {
    return;
  }

  const redis = await getRedisClient();
  const key = dailyTrialSpendKey();
  await redis.incrBy(key, LIVEAVATAR_TRIAL_COST_CENTS);
  await redis.expire(key, 60 * 60 * 36);
}

async function writeHotState(session: DbLiveSession) {
  try {
    const redis = await getRedisClient();
    await redis.set(
      hotStateKey(session.id),
      JSON.stringify({
        status: session.status,
        endedReason: session.ended_reason,
        connectionState: session.connection_state,
        lastHeartbeatAt: session.last_heartbeat_at,
        billableMs: session.billable_ms,
        chargedCents: session.charged_cents,
        endedAt: session.ended_at,
        updatedAt: nowIso(),
      }),
      {
        EX: REDIS_TTL_SECONDS,
      },
    );
  } catch (error) {
    // Durable state is persisted in Supabase; don't block session lifecycle on transient Redis outages.
    console.error("writeHotState failed", error);
  }
}

async function ensurePersonaRow(slug: string): Promise<DbPersona> {
  const configured = getPersonaBySlug(slug);
  if (!configured) {
    throw new Error("invalid persona");
  }

  const supabase = getSupabaseAdmin();

  const payload = {
    slug: configured.slug,
    display_name: configured.name,
    value_line: configured.valueLine,
    description: configured.description,
    avatar_id: configured.avatarId,
    voice_id: configured.voiceId,
    system_prompt: configured.systemPrompt,
    moderation_profile: configured.moderationProfile,
    price_cents_per_minute: configured.priceCentsPerMinute,
    free_seconds: configured.freeSeconds,
    is_active: true,
    updated_at: nowIso(),
  };

  const upsert = await supabase
    .from("personas")
    .upsert(payload, { onConflict: "slug" })
    .select(
      "id, slug, display_name, value_line, description, avatar_id, voice_id, system_prompt, moderation_profile, price_cents_per_minute, free_seconds",
    )
    .single();

  if (upsert.error || !upsert.data) {
    throw new Error(upsert.error?.message ?? "failed to ensure persona");
  }

  return upsert.data as DbPersona;
}

async function ensureUser(externalUserId: string): Promise<DbUser> {
  const supabase = getSupabaseAdmin();

  const existing = (await supabase
    .from("users")
    .select("id, external_user_id, email, credits_cents, free_trial_used_at, updated_at")
    .eq("external_user_id", externalUserId)
    .maybeSingle()) as PostgrestSingleResponse<DbUser | null>;

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  if (existing.data) {
    return {
      ...existing.data,
      credits_cents: asNumber(existing.data.credits_cents),
    };
  }

  const created = await supabase
    .from("users")
    .insert({
      id: randomUUID(),
      auth_user_id: null,
      handle: guestHandleForExternalUserId(externalUserId),
      external_user_id: externalUserId,
      credits_cents: 0,
      created_at: nowIso(),
      updated_at: nowIso(),
    })
    .select("id, external_user_id, email, credits_cents, free_trial_used_at, updated_at")
    .single();

  if (created.error || !created.data) {
    throw new Error(created.error?.message ?? "failed to create user");
  }

  return {
    ...created.data,
    credits_cents: asNumber(created.data.credits_cents),
  };
}

async function getUserByDbId(userDbId: string): Promise<DbUser> {
  const supabase = getSupabaseAdmin();
  const user = (await supabase
    .from("users")
    .select("id, external_user_id, email, credits_cents, free_trial_used_at, updated_at")
    .eq("id", userDbId)
    .single()) as PostgrestSingleResponse<DbUser>;

  if (user.error || !user.data) {
    throw new Error(user.error?.message ?? "user not found");
  }

  return {
    ...user.data,
    credits_cents: asNumber(user.data.credits_cents),
  };
}

async function getUserByExternalId(externalUserId: string): Promise<DbUser | null> {
  const supabase = getSupabaseAdmin();
  const user = (await supabase
    .from("users")
    .select("id, external_user_id, email, credits_cents, free_trial_used_at, updated_at")
    .eq("external_user_id", externalUserId)
    .maybeSingle()) as PostgrestSingleResponse<DbUser | null>;

  if (user.error) {
    throw new Error(user.error.message);
  }

  if (!user.data) return null;

  return {
    ...user.data,
    credits_cents: asNumber(user.data.credits_cents),
  };
}

async function getDbSession(sessionId: string): Promise<(DbLiveSession & { persona: DbPersona }) | null> {
  const supabase = getSupabaseAdmin();
  const response = await supabase
    .from("live_sessions")
    .select(
      "id, user_id, persona_id, status, ended_reason, connection_state, started_at, free_ends_at, ended_at, last_heartbeat_at, billable_ms, charged_cents, summary_points, personas!inner(id, slug, display_name, value_line, description, avatar_id, voice_id, system_prompt, moderation_profile, price_cents_per_minute, free_seconds)",
    )
    .eq("id", sessionId)
    .maybeSingle();

  if (response.error) {
    throw new Error(response.error.message);
  }

  if (!response.data) return null;

  const row = response.data as unknown as DbLiveSession & { personas: DbPersona };

  return {
    id: row.id,
    user_id: row.user_id,
    persona_id: row.persona_id,
    status: row.status,
    ended_reason: row.ended_reason,
    connection_state: row.connection_state,
    started_at: row.started_at,
    free_ends_at: row.free_ends_at,
    ended_at: row.ended_at,
    last_heartbeat_at: row.last_heartbeat_at,
    billable_ms: asNumber(row.billable_ms),
    charged_cents: asNumber(row.charged_cents),
    summary_points: Array.isArray(row.summary_points) ? row.summary_points : [],
    persona: row.personas,
  };
}

function toLiveSessionRecord(db: DbLiveSession & { persona: DbPersona }): LiveSessionRecord {
  return {
    id: db.id,
    userId: db.user_id,
    personaSlug: db.persona.slug,
    status: db.status,
    endedReason: db.ended_reason,
    startedAt: db.started_at,
    freeEndsAt: db.free_ends_at,
    endedAt: db.ended_at,
    lastHeartbeatAt: db.last_heartbeat_at,
    connectionState: db.connection_state,
    billableMs: db.billable_ms,
    chargedCents: db.charged_cents,
    durationMs: getElapsedMs(db.started_at, db.ended_at),
    summaryPoints: db.summary_points,
  };
}

async function updateSessionState(
  sessionId: string,
  updates: Partial<
    Pick<DbLiveSession, "status" | "ended_reason" | "connection_state" | "last_heartbeat_at" | "ended_at" | "billable_ms" | "charged_cents" | "summary_points">
  >,
) {
  const supabase = getSupabaseAdmin();
  const update = await supabase
    .from("live_sessions")
    .update({
      ...updates,
      updated_at: nowIso(),
    })
    .eq("id", sessionId);

  if (update.error) {
    throw new Error(update.error.message);
  }
}

async function settleBillingToAnchor(
  dbSession: DbLiveSession & { persona: DbPersona },
  anchorMs: number,
  options: { pauseWhenInsufficient: boolean },
) {
  if (dbSession.status !== "active") return dbSession;

  const freeEndsAtMs = new Date(dbSession.free_ends_at).getTime();
  const boundedAnchor = Math.max(0, anchorMs);
  const lastHeartbeatMs = new Date(dbSession.last_heartbeat_at).getTime();
  const incrementalStartMs = Math.max(freeEndsAtMs, lastHeartbeatMs);
  const incrementalBillableMs = Math.max(0, boundedAnchor - incrementalStartMs);
  const totalBillableMs = dbSession.billable_ms + incrementalBillableMs;

  const shouldHaveCharged = floorCostForMs(totalBillableMs, dbSession.persona.price_cents_per_minute);
  const deltaCents = shouldHaveCharged - dbSession.charged_cents;

  let nextStatus: DbLiveSession["status"] = dbSession.status;
  let nextCharged = dbSession.charged_cents;

  if (deltaCents > 0) {
    const user = await getUserByDbId(dbSession.user_id);
    const collectible = Math.min(deltaCents, user.credits_cents);

    if (collectible > 0) {
      const supabase = getSupabaseAdmin();
      const userUpdate = await supabase
        .from("users")
        .update({
          credits_cents: user.credits_cents - collectible,
          updated_at: nowIso(),
        })
        .eq("id", user.id);

      if (userUpdate.error) {
        throw new Error(userUpdate.error.message);
      }
    }

    nextCharged = dbSession.charged_cents + collectible;
    if (options.pauseWhenInsufficient && collectible < deltaCents) {
      nextStatus = "paused_for_payment";
    }
  }

  await updateSessionState(dbSession.id, {
    status: nextStatus,
    billable_ms: totalBillableMs,
    charged_cents: nextCharged,
  });

  return {
    ...dbSession,
    status: nextStatus,
    billable_ms: totalBillableMs,
    charged_cents: nextCharged,
  };
}

async function enforceTimeoutIfNeeded(dbSession: DbLiveSession & { persona: DbPersona }) {
  if (dbSession.status === "ended") return dbSession;
  if (dbSession.status === "paused_for_payment") return dbSession;
  if (!(dbSession.status === "active" || dbSession.status === "reconnecting")) return dbSession;

  const boundaryMs = heartbeatTimeoutBoundaryMs(dbSession.last_heartbeat_at);
  if (Date.now() <= boundaryMs) return dbSession;

  let settled = dbSession;
  if (dbSession.status === "active") {
    settled = await settleBillingToAnchor(dbSession, boundaryMs, { pauseWhenInsufficient: false });
  }

  const timeoutEndedAt = new Date(boundaryMs).toISOString();
  await updateSessionState(dbSession.id, {
    status: "ended",
    ended_reason: "ended_timeout",
    connection_state: "disconnected",
    ended_at: timeoutEndedAt,
    billable_ms: settled.billable_ms,
    charged_cents: settled.charged_cents,
  });

  const reloaded = await getDbSession(dbSession.id);
  if (!reloaded) throw new Error("session not found after timeout enforcement");

  await writeHotState(reloaded);
  return reloaded;
}

async function buildSummaryPoints(dbSession: DbLiveSession & { persona: DbPersona }) {
  const transcript = await getTranscript(dbSession.id);
  return [
    `Discussed ${dbSession.persona.display_name} themes in a private live session.`,
    `Visit length: ${Math.round(getElapsedMs(dbSession.started_at, dbSession.ended_at) / 1000)} seconds.`,
    transcript.length
      ? `Transcript highlight: ${transcript
          .map((item) => item.content)
          .join(" ")
          .slice(0, 220)}`
      : "Transcript collected for post-session review.",
  ];
}

function materializeHeartbeat(session: LiveSessionRecord, balanceCents: number): HeartbeatResult {
  const durationMs = getElapsedMs(session.startedAt, session.endedAt);
  const freeRemainingMs = getFreeRemainingMs(session.freeEndsAt, session.endedAt);
  const freeRemainingSeconds = Math.ceil(freeRemainingMs / 1000);
  const warning = freeRemainingMs > 0 && freeRemainingMs <= 10000;
  const accessState: AccessState =
    freeRemainingSeconds > 0
      ? "trial_active"
      : session.status === "paused_for_payment"
        ? "trial_expired"
        : balanceCents > 0 || session.chargedCents > 0
          ? "paid"
          : "trial_expired";

  return {
    session: {
      ...session,
      durationMs,
    },
    accessState,
    durationSeconds: Math.floor(durationMs / 1000),
    trialSecondsRemaining: freeRemainingSeconds,
    freeRemainingSeconds,
    shouldShowFreeEndingWarning: warning,
    requiresPayment: session.status === "paused_for_payment",
    balanceCents,
    effectiveCostCents: session.chargedCents,
  };
}

async function getBalanceBySessionUserId(userDbId: string) {
  const user = await getUserByDbId(userDbId);
  return user.credits_cents;
}

async function consumeFreeTrialForUser(userDbId: string) {
  const supabase = getSupabaseAdmin();
  const usedAt = nowIso();
  const update = await supabase
    .from("users")
    .update({
      free_trial_used_at: usedAt,
      updated_at: usedAt,
    })
    .eq("id", userDbId)
    .is("free_trial_used_at", null)
    .select("id")
    .maybeSingle();

  if (update.error) {
    throw new Error(update.error.message);
  }

  return Boolean(update.data);
}

export async function createSession(input: { userId: string; personaSlug: string }) {
  const persona = await ensurePersonaRow(input.personaSlug);
  const user = await ensureUser(input.userId);

  let trialSeconds = 0;
  let shouldConsumeTrial = false;

  if (!user.free_trial_used_at) {
    await ensureDailyTrialSpendAvailable();
    shouldConsumeTrial = true;
    trialSeconds = persona.free_seconds;
  }

  if (trialSeconds <= 0 && user.credits_cents <= 0) {
    throw new Error("free trial already used; purchase Gold Coins to start another visit");
  }

  const startedAt = nowIso();
  const freeEndsAt = new Date(Date.now() + trialSeconds * 1000).toISOString();
  const supabase = getSupabaseAdmin();

  let createdSessionId: string | null = null;
  const created = await supabase
    .from("live_sessions")
    .insert({
      id: randomUUID(),
      user_id: user.id,
      persona_id: persona.id,
      status: "active",
      ended_reason: null,
      connection_state: "connected",
      started_at: startedAt,
      free_ends_at: freeEndsAt,
      ended_at: null,
      last_heartbeat_at: startedAt,
      billable_ms: 0,
      charged_cents: 0,
      summary_points: [],
      created_at: startedAt,
      updated_at: startedAt,
    })
    .select(
      "id, user_id, persona_id, status, ended_reason, connection_state, started_at, free_ends_at, ended_at, last_heartbeat_at, billable_ms, charged_cents, summary_points",
    )
    .single();

  if (created.error || !created.data) {
    throw new Error(created.error?.message ?? "failed to create session");
  }
  createdSessionId = (created.data as { id: string }).id;

  const session = {
    ...(created.data as unknown as DbLiveSession),
    persona,
  };

  const messageInsert = await supabase.from("session_messages").insert({
    id: randomUUID(),
    session_id: session.id,
    role: "system",
    content:
      trialSeconds > 0
        ? `${persona.display_name} visit started. The first ${trialSeconds} seconds are included.`
        : `${persona.display_name} paid visit started using Gold Coins.`,
    created_at: startedAt,
  });

  if (messageInsert.error) {
    if (createdSessionId) {
      await supabase.from("live_sessions").delete().eq("id", createdSessionId);
    }
    throw new Error(messageInsert.error.message);
  }

  if (shouldConsumeTrial) {
    const consumed = await consumeFreeTrialForUser(user.id);
    if (!consumed) {
      await supabase.from("live_sessions").delete().eq("id", session.id);
      throw new Error("free trial already used; purchase Gold Coins to start another visit");
    }
    await recordDailyTrialSpend();
  }

  await writeHotState(session);
  return toLiveSessionRecord(session);
}

export async function getSession(id: string) {
  let session = await getDbSession(id);
  if (!session) return null;

  session = await enforceTimeoutIfNeeded(session);
  return toLiveSessionRecord(session);
}

export async function getBalanceCents(externalUserId: string) {
  const user = await getUserByExternalId(externalUserId);
  return user?.credits_cents ?? 0;
}

export async function getWalletSummaryForUserDbId(userDbId: string): Promise<WalletSummary> {
  const user = await getUserByDbId(userDbId);

  return {
    userDbId: user.id,
    externalUserId: user.external_user_id,
    email: user.email ?? null,
    balanceCents: user.credits_cents,
    goldCoins: centsToGoldCoins(user.credits_cents),
    rateCentsPerMinute: VISIT_RATE_CENTS_PER_MINUTE,
    coinsPerPaidMinute: GOLD_COINS_PER_PAID_MINUTE,
    updatedAt: user.updated_at ?? null,
  };
}

export async function getSessionCheckoutContext(sessionId: string) {
  let loaded = await getDbSession(sessionId);
  if (!loaded) return null;

  loaded = await enforceTimeoutIfNeeded(loaded);
  const user = await getUserByDbId(loaded.user_id);

  return {
    session: toLiveSessionRecord(loaded),
    personaName: loaded.persona.display_name,
    userDbId: loaded.user_id,
    externalUserId: user.external_user_id,
    balanceCents: user.credits_cents,
    priceCentsPerMinute: loaded.persona.price_cents_per_minute,
  };
}

export async function applyStripeWalletCredit(input: {
  userDbId: string;
  checkoutSessionId: string;
  purchaseAmountCents: number;
  creditedCents: number;
  currency: string;
  metadata: Record<string, unknown>;
}) {
  const supabase = getSupabaseAdmin();
  const result = await supabase.rpc("apply_wallet_credit", {
    p_user_id: input.userDbId,
    p_provider: "stripe-checkout",
    p_provider_payment_id: input.checkoutSessionId,
    p_amount_cents: Math.floor(input.purchaseAmountCents),
    p_credited_cents: Math.floor(input.creditedCents),
    p_currency: input.currency,
    p_metadata: input.metadata,
  });

  if (result.error) {
    throw new Error(result.error.message);
  }

  return asNumber(result.data);
}

export async function topUpBalance(input: { userId: string; amountCents: number }) {
  if (input.amountCents <= 0) throw new Error("amount must be positive");

  const user = await ensureUser(input.userId);
  const nextCredits = user.credits_cents + Math.floor(input.amountCents);
  const supabase = getSupabaseAdmin();

  const updated = await supabase
    .from("users")
    .update({
      credits_cents: nextCredits,
      updated_at: nowIso(),
    })
    .eq("id", user.id)
    .select("credits_cents")
    .single();

  if (updated.error || !updated.data) {
    throw new Error(updated.error?.message ?? "failed to top up balance");
  }

  await supabase.from("payments").insert({
    id: randomUUID(),
    user_id: user.id,
    provider: "manual-topup",
    amount_cents: Math.floor(input.amountCents),
    currency: "usd",
    status: "succeeded",
    metadata: { source: "api/billing/top-up" },
    created_at: nowIso(),
  });

  return asNumber(updated.data.credits_cents);
}

export async function appendTranscriptMessage(sessionId: string, role: SessionMessage["role"], content: string) {
  const supabase = getSupabaseAdmin();
  const inserted = await supabase.from("session_messages").insert({
    id: randomUUID(),
    session_id: sessionId,
    role,
    content,
    created_at: nowIso(),
  });

  if (inserted.error) {
    throw new Error(inserted.error.message);
  }
}

export async function getTranscript(sessionId: string): Promise<SessionMessage[]> {
  const supabase = getSupabaseAdmin();
  const messages = await supabase
    .from("session_messages")
    .select("id, session_id, role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  if (messages.error) {
    throw new Error(messages.error.message);
  }

  return (messages.data ?? []).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    role: row.role as SessionMessage["role"],
    content: row.content,
    createdAt: row.created_at,
  }));
}

export async function heartbeatSession(input: { sessionId: string; reconnecting?: boolean; resume?: boolean }): Promise<HeartbeatResult> {
  let loaded = await getDbSession(input.sessionId);
  if (!loaded) throw new Error("session not found");

  loaded = await enforceTimeoutIfNeeded(loaded);
  if (loaded.status === "ended") {
    const balance = await getBalanceBySessionUserId(loaded.user_id);
    return materializeHeartbeat(toLiveSessionRecord(loaded), balance);
  }

  if (loaded.status === "active") {
    loaded = await settleBillingToAnchor(loaded, Date.now(), { pauseWhenInsufficient: true });
  }

  let nextStatus = loaded.status;
  let nextConnection = loaded.connection_state;

  if (input.reconnecting) {
    nextConnection = "reconnecting";
    nextStatus = loaded.status === "paused_for_payment" ? "paused_for_payment" : "reconnecting";
  } else if (loaded.status !== "paused_for_payment") {
    nextConnection = "connected";
    nextStatus = "active";
  }

  if (input.resume && nextStatus === "paused_for_payment") {
    const user = await getUserByDbId(loaded.user_id);
    if (user.credits_cents > 0) {
      nextStatus = "active";
      nextConnection = "connected";
    }
  }

  const heartbeatAt = nowIso();

  await updateSessionState(loaded.id, {
    status: nextStatus,
    ended_reason: null,
    connection_state: nextConnection,
    last_heartbeat_at: heartbeatAt,
  });

  const refreshed = (await getDbSession(loaded.id)) as DbLiveSession & { persona: DbPersona };

  await writeHotState(refreshed);
  const balance = await getBalanceBySessionUserId(refreshed.user_id);
  return materializeHeartbeat(toLiveSessionRecord(refreshed), balance);
}

export async function endSession(sessionId: string, endedReason: Exclude<SessionEndedReason, null> = "ended_user"): Promise<HeartbeatResult> {
  let loaded = await getDbSession(sessionId);
  if (!loaded) throw new Error("session not found");

  loaded = await enforceTimeoutIfNeeded(loaded);

  if (loaded.status !== "ended") {
    let settled = loaded;
    if (loaded.status === "active") {
      settled = await settleBillingToAnchor(loaded, Date.now(), { pauseWhenInsufficient: false });
    }

    const endedAt = nowIso();
    await updateSessionState(loaded.id, {
      ended_at: endedAt,
      status: "ended",
      ended_reason: endedReason,
      connection_state: "disconnected",
      billable_ms: settled.billable_ms,
      charged_cents: settled.charged_cents,
    });

    const afterEnd = (await getDbSession(loaded.id)) as DbLiveSession & { persona: DbPersona };
    const summaryPoints = await buildSummaryPoints(afterEnd);

    await updateSessionState(loaded.id, {
      summary_points: summaryPoints,
    });
  }

  const finalSession = await getDbSession(loaded.id);
  if (!finalSession) throw new Error("session not found after end");

  await writeHotState(finalSession);
  const balance = await getBalanceBySessionUserId(finalSession.user_id);
  return materializeHeartbeat(toLiveSessionRecord(finalSession), balance);
}

export function materializeSession(session: LiveSessionRecord, balanceCents = 0) {
  return materializeHeartbeat(session, balanceCents);
}
