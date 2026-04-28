import { getPersonaBySlug } from "@/lib/personas";

export type LiveAvatarBootstrap = {
  provider: "liveavatar-full";
  sessionId: string;
  streamUrl?: string;
  token?: string;
  expiresAt?: string;
  disabled?: boolean;
  disabledReason?: string;
};

export class LiveAvatarProviderError extends Error {
  status: number;
  providerCode?: number;
  providerMessage?: string;

  constructor(message: string, status: number, providerCode?: number, providerMessage?: string) {
    super(message);
    this.name = "LiveAvatarProviderError";
    this.status = status;
    this.providerCode = providerCode;
    this.providerMessage = providerMessage;
  }
}

function logAvatarBootstrap(event: string, details: Record<string, unknown>) {
  console.info("[avatar-bootstrap]", {
    ts: new Date().toISOString(),
    event,
    ...details,
  });
}

function envValue(name: string) {
  return process.env[name]?.trim();
}

function getAvatarIdEnvForPersona(slug: string) {
  if (slug === "santa") {
    return envValue("LIVEAVATAR_SANTA_AVATAR_ID") ?? envValue("LIVEAVATAR_AVATAR_ID_RABBI") ?? envValue("HEYGEN_AVATAR_TEMPLATE_RABBI");
  }
  if (slug === "toothfairy") {
    return envValue("LIVEAVATAR_TOOTHFAIRY_AVATAR_ID") ?? envValue("LIVEAVATAR_AVATAR_ID_BUSINESSMAN") ?? envValue("HEYGEN_AVATAR_TEMPLATE_BUSINESSMAN");
  }
  return envValue("LIVEAVATAR_AVATAR_ID_MOSES") ?? envValue("HEYGEN_AVATAR_TEMPLATE_MOSES");
}

function getVoiceIdEnvForPersona(slug: string) {
  if (slug === "santa") return envValue("LIVEAVATAR_SANTA_VOICE_ID");
  if (slug === "toothfairy") return envValue("LIVEAVATAR_TOOTHFAIRY_VOICE_ID");
  return envValue("LIVEAVATAR_EASTERBUNNY_VOICE_ID");
}

function getContextIdEnvForPersona(slug: string) {
  if (slug === "santa") return envValue("LIVEAVATAR_SANTA_CONTEXT_ID");
  if (slug === "toothfairy") return envValue("LIVEAVATAR_TOOTHFAIRY_CONTEXT_ID");
  return envValue("LIVEAVATAR_EASTERBUNNY_CONTEXT_ID");
}

async function parseLiveAvatarFailure(response: Response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as {
      code?: number;
      message?: string;
    };
    const providerCode = typeof parsed.code === "number" ? parsed.code : undefined;
    const providerMessage = parsed.message;
    return {
      providerCode,
      providerMessage,
      raw: text,
    };
  } catch {
    return {
      providerCode: undefined,
      providerMessage: undefined,
      raw: text,
    };
  }
}

export async function createLiveAvatarSession(input: {
  personaSlug: string;
  conversationSessionId: string;
  reason?: string;
}): Promise<LiveAvatarBootstrap> {
  const startMs = Date.now();

  const liveAvatarEnabled = envValue("LIVEAVATAR_ENABLED") === "true";
  if (!liveAvatarEnabled) {
    logAvatarBootstrap("disabled_bootstrap", {
      conversationSessionId: input.conversationSessionId,
      personaSlug: input.personaSlug,
      reason: input.reason ?? null,
      liveAvatarEnabledRaw: process.env.LIVEAVATAR_ENABLED ?? null,
    });
    return {
      provider: "liveavatar-full",
      sessionId: `disabled-${input.conversationSessionId}`,
      disabled: true,
      disabledReason: 'LIVEAVATAR_ENABLED must be exactly "true"',
    };
  }

  if (envValue("LIVEAVATAR_MOCK") === "true") {
    logAvatarBootstrap("mock_bootstrap", {
      conversationSessionId: input.conversationSessionId,
      personaSlug: input.personaSlug,
      reason: input.reason ?? null,
    });
    const streamUrl = envValue("LIVEAVATAR_MOCK_STREAM_URL") ?? "about:blank";
    return {
      provider: "liveavatar-full",
      sessionId: `mock-${input.conversationSessionId}`,
      streamUrl,
      token: "mock-liveavatar-token",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
  }

  const apiKey = envValue("LIVEAVATAR_API_KEY");
  const baseUrl = envValue("LIVEAVATAR_BASE_URL");
  if (!apiKey || !baseUrl) {
    throw new Error("LIVEAVATAR_API_KEY or LIVEAVATAR_BASE_URL is missing");
  }

  const persona = getPersonaBySlug(input.personaSlug);
  if (!persona) throw new Error("invalid persona");

  const avatarId = getAvatarIdEnvForPersona(persona.slug);
  if (!avatarId) {
    throw new Error(`Missing LiveAvatar avatar id for persona ${persona.slug}`);
  }

  const voiceId = getVoiceIdEnvForPersona(persona.slug);
  const contextId = getContextIdEnvForPersona(persona.slug);
  if (!voiceId || !contextId) {
    throw new Error(`Missing LiveAvatar voice_id or context_id for persona ${persona.slug}`);
  }

  const origin = baseUrl.replace(/\/$/, "");
  logAvatarBootstrap("token_request_start", {
    conversationSessionId: input.conversationSessionId,
    personaSlug: persona.slug,
    avatarId,
    voiceId,
    contextId,
    baseUrl: origin,
    reason: input.reason ?? null,
  });

  const tokenResponse = await fetch(`${origin}/v1/sessions/token`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "FULL",
      avatar_id: avatarId,
      avatar_persona: {
        voice_id: voiceId,
        context_id: contextId,
        language: "en",
      },
      session_external_id: input.conversationSessionId,
    }),
  });

  if (!tokenResponse.ok) {
    const failure = await parseLiveAvatarFailure(tokenResponse);
    logAvatarBootstrap("token_request_failed", {
      conversationSessionId: input.conversationSessionId,
      personaSlug: persona.slug,
      avatarId,
      status: tokenResponse.status,
      providerCode: failure.providerCode,
      providerMessage: failure.providerMessage,
      raw: failure.raw,
      elapsedMs: Date.now() - startMs,
    });
    throw new LiveAvatarProviderError(
      `LiveAvatar token creation failed (${tokenResponse.status}): ${failure.raw}`,
      tokenResponse.status,
      failure.providerCode,
      failure.providerMessage,
    );
  }

  const tokenPayload = (await tokenResponse.json()) as {
    data?: {
      session_id?: string;
      session_token?: string;
      expires_at?: string;
    };
    session_id?: string;
    session_token?: string;
    expires_at?: string;
  };
  const sessionToken = tokenPayload.data?.session_token ?? tokenPayload.session_token;
  const sessionId = tokenPayload.data?.session_id ?? tokenPayload.session_id;
  const expiresAt = tokenPayload.data?.expires_at ?? tokenPayload.expires_at;
  logAvatarBootstrap("token_request_success", {
    conversationSessionId: input.conversationSessionId,
    personaSlug: persona.slug,
    avatarId,
    voiceId,
    contextId,
    status: tokenResponse.status,
    sessionId,
    hasSessionToken: Boolean(sessionToken),
    expiresAt: expiresAt ?? null,
    elapsedMs: Date.now() - startMs,
  });

  if (!sessionToken) {
    throw new Error("LiveAvatar token creation returned no session token");
  }

  logAvatarBootstrap("start_request_start", {
    conversationSessionId: input.conversationSessionId,
    personaSlug: persona.slug,
    avatarId,
    sessionId: sessionId ?? null,
  });
  const startResponse = await fetch(`${origin}/v1/sessions/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      session_id: sessionId,
    }),
  });

  if (!startResponse.ok) {
    const failure = await parseLiveAvatarFailure(startResponse);
    logAvatarBootstrap("start_request_failed", {
      conversationSessionId: input.conversationSessionId,
      personaSlug: persona.slug,
      avatarId,
      status: startResponse.status,
      providerCode: failure.providerCode,
      providerMessage: failure.providerMessage,
      raw: failure.raw,
      elapsedMs: Date.now() - startMs,
    });
    throw new LiveAvatarProviderError(
      `LiveAvatar session start failed (${startResponse.status}): ${failure.raw}`,
      startResponse.status,
      failure.providerCode,
      failure.providerMessage,
    );
  }

  const startPayload = (await startResponse.json()) as {
    data?: {
      session_id?: string;
      livekit_url?: string;
      livekit_client_token?: string;
      expires_at?: string;
    };
    session_id?: string;
    livekit_url?: string;
    livekit_client_token?: string;
    expires_at?: string;
  };

  const startedSessionId = startPayload.data?.session_id ?? startPayload.session_id ?? sessionId ?? input.conversationSessionId;
  const streamUrl = startPayload.data?.livekit_url ?? startPayload.livekit_url;
  const token = startPayload.data?.livekit_client_token ?? startPayload.livekit_client_token ?? sessionToken;
  logAvatarBootstrap("start_request_success", {
    conversationSessionId: input.conversationSessionId,
    personaSlug: persona.slug,
    avatarId,
    status: startResponse.status,
    startedSessionId,
    streamUrl: streamUrl ?? null,
    hasLivekitToken: Boolean(token),
    expiresAt: startPayload.data?.expires_at ?? startPayload.expires_at ?? expiresAt ?? null,
    elapsedMs: Date.now() - startMs,
  });

  return {
    provider: "liveavatar-full",
    sessionId: startedSessionId,
    streamUrl,
    token,
    expiresAt: startPayload.data?.expires_at ?? startPayload.expires_at ?? expiresAt,
  };
}
