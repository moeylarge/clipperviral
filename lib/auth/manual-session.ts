import { createHash } from "node:crypto";
import { cookies } from "next/headers";

export const OWNER_SESSION_COOKIE = "clipperviral_owner_session";

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
