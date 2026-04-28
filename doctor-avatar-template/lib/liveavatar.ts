import { getCharacterConfig, getRequiredEnv } from "@/lib/config";

export type LiveAvatarBootstrap = {
  provider: "liveavatar-lite";
  sessionId: string;
  streamUrl?: string;
  token?: string;
  expiresAt?: string;
  disabled?: boolean;
  disabledReason?: string;
};

async function parseFailure(response: Response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { code?: number; message?: string };
    return {
      providerCode: parsed.code,
      providerMessage: parsed.message,
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

async function createContext(apiKey: string, baseUrl: string, conversationId: string, accessKey: string) {
  const character = getCharacterConfig(accessKey);

  const response = await fetch(`${baseUrl}/v1/contexts`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: `${character.name} ${conversationId}`,
      opening_text: character.openingText,
      prompt: character.prompt,
    }),
  });

  if (!response.ok) {
    const failure = await parseFailure(response);
    throw new Error(`LiveAvatar context creation failed (${response.status}): ${failure.raw}`);
  }

  const payload = (await response.json()) as {
    data?: { context_id?: string; id?: string };
    context_id?: string;
    id?: string;
  };

  return payload.data?.context_id ?? payload.context_id ?? payload.data?.id ?? payload.id;
}

export async function createLiveAvatarSession(conversationId: string, accessKey: string): Promise<LiveAvatarBootstrap> {
  if (process.env.LIVEAVATAR_ENABLED !== "true") {
    return {
      provider: "liveavatar-lite",
      sessionId: `disabled-${conversationId}`,
      disabled: true,
      disabledReason: 'LIVEAVATAR_ENABLED must be exactly "true"',
    };
  }

  const apiKey = getRequiredEnv("LIVEAVATAR_API_KEY");
  const baseUrl = getRequiredEnv("LIVEAVATAR_BASE_URL").replace(/\/$/, "");
  const character = getCharacterConfig(accessKey);
  const avatarId = character.avatarId;
  const contextId = process.env.LIVEAVATAR_CONTEXT_ID || (await createContext(apiKey, baseUrl, conversationId, accessKey));

  if (!contextId) {
    throw new Error("LiveAvatar context creation returned no context_id");
  }

  const tokenResponse = await fetch(`${baseUrl}/v1/sessions/token`, {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: "FULL",
      avatar_id: avatarId,
      avatar_persona: {
        name: character.name,
        description: character.tagline,
        role: "guide",
        context_id: contextId,
        voice_id: process.env.LIVEAVATAR_VOICE_ID || undefined,
      },
      session_external_id: conversationId,
    }),
  });

  if (!tokenResponse.ok) {
    const failure = await parseFailure(tokenResponse);
    throw new Error(`LiveAvatar token creation failed (${tokenResponse.status}): ${failure.raw}`);
  }

  const tokenPayload = (await tokenResponse.json()) as {
    data?: { session_id?: string; session_token?: string; expires_at?: string };
    session_id?: string;
    session_token?: string;
    expires_at?: string;
  };

  const sessionToken = tokenPayload.data?.session_token ?? tokenPayload.session_token;
  const sessionId = tokenPayload.data?.session_id ?? tokenPayload.session_id;
  const expiresAt = tokenPayload.data?.expires_at ?? tokenPayload.expires_at;

  if (!sessionToken) {
    throw new Error("LiveAvatar token creation returned no session token");
  }

  const startResponse = await fetch(`${baseUrl}/v1/sessions/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session_id: sessionId }),
  });

  if (!startResponse.ok) {
    const failure = await parseFailure(startResponse);
    throw new Error(`LiveAvatar session start failed (${startResponse.status}): ${failure.raw}`);
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

  return {
    provider: "liveavatar-lite",
    sessionId: startPayload.data?.session_id ?? startPayload.session_id ?? sessionId ?? conversationId,
    streamUrl: startPayload.data?.livekit_url ?? startPayload.livekit_url,
    token: startPayload.data?.livekit_client_token ?? startPayload.livekit_client_token ?? sessionToken,
    expiresAt: startPayload.data?.expires_at ?? startPayload.expires_at ?? expiresAt,
  };
}
