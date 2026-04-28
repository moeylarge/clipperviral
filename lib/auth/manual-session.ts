import { createHash } from "node:crypto";
import { cookies } from "next/headers";

export const OWNER_SESSION_COOKIE = "clipperviral_owner_session";
export const SHARE_SESSION_COOKIE = "clipperviral_ops_share_session";
export type OpsAccessMode = "owner" | "shared-preview" | "none";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getOwnerConfig() {
  const ownerEmail = (process.env.OWNER_EMAIL || process.env.ALLOWED_EMAIL || "").trim();
  const ownerPassword = (process.env.OWNER_PASSWORD || "").trim();
  const secret = (process.env.OWNER_SESSION_SECRET || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "clipperviral-secret").trim();

  return {
    ownerEmail: normalizeEmail(ownerEmail),
    ownerPassword,
    secret,
  };
}

function signSession(email: string, password: string, secret: string) {
  return createHash("sha256").update(`${normalizeEmail(email)}::${password}::${secret}`).digest("hex");
}

function signShareSession(token: string, secret: string) {
  return createHash("sha256").update(`ops-share::${token}::${secret}`).digest("hex");
}

function getShareConfig() {
  const token = (process.env.OPS_SHARE_TOKEN || "").trim();
  const secret = (process.env.OWNER_SESSION_SECRET || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "clipperviral-secret").trim();

  return { token, secret };
}

export function verifyManualCredentials(email: string, password: string) {
  const config = getOwnerConfig();
  if (!config.ownerEmail || !config.ownerPassword) {
    return { ok: false as const, reason: "missing_config" as const };
  }

  if (normalizeEmail(email) !== config.ownerEmail || password !== config.ownerPassword) {
    return { ok: false as const, reason: "invalid_credentials" as const };
  }

  return { ok: true as const, email: config.ownerEmail };
}

export function createManualSessionToken(email: string) {
  const config = getOwnerConfig();
  return signSession(email, config.ownerPassword, config.secret);
}

export async function getManualSessionEmail() {
  const config = getOwnerConfig();
  if (!config.ownerEmail || !config.ownerPassword) return null;

  const cookieStore = await cookies();
  const token = cookieStore.get(OWNER_SESSION_COOKIE)?.value;
  if (!token) return null;

  const expected = signSession(config.ownerEmail, config.ownerPassword, config.secret);
  return token === expected ? config.ownerEmail : null;
}

export async function hasShareSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SHARE_SESSION_COOKIE)?.value;
  if (!token) return false;

  const shareConfig = getShareConfig();
  if (!shareConfig.token) return false;

  const expected = signShareSession(shareConfig.token, shareConfig.secret);
  return token === expected;
}

export function createShareSessionToken() {
  const shareConfig = getShareConfig();
  if (!shareConfig.token) {
    throw new Error("Missing OPS_SHARE_TOKEN env configuration.");
  }

  return signShareSession(shareConfig.token, shareConfig.secret);
}

export async function getOpsAccessState(): Promise<{ mode: OpsAccessMode; email: string | null }> {
  const ownerEmail = await getManualSessionEmail();
  if (ownerEmail) {
    return { mode: "owner", email: ownerEmail };
  }

  if (await hasShareSession()) {
    return { mode: "shared-preview", email: null };
  }

  return { mode: "none", email: null };
}
