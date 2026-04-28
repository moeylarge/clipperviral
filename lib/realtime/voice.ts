import { getPersonaBySlug } from "@/lib/personas";

export type RealtimeVoiceSession = {
  provider: "openai-realtime";
  model: string;
  clientSecret: string;
  expiresAt?: number;
  instructions: string;
  voice: string;
};

function getVoiceModel() {
  return process.env.OPENAI_REALTIME_MODEL ?? "";
}

function getVoiceNameForPersona(personaSlug: string) {
  const configured = getPersonaBySlug(personaSlug);
  if (!configured) return "alloy";
  return configured.slug === "santa" ? "verse" : configured.slug === "toothfairy" ? "coral" : "sage";
}

export async function createOpenAiRealtimeVoiceSession(input: {
  personaSlug: string;
  continuationContext?: string;
}): Promise<RealtimeVoiceSession> {
  const startedAt = Date.now();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const model = getVoiceModel();
  if (!model) {
    throw new Error("OPENAI_REALTIME_MODEL is missing");
  }

  const persona = getPersonaBySlug(input.personaSlug);
  if (!persona) {
    throw new Error("invalid persona");
  }

  const instructions = input.continuationContext
    ? `${persona.systemPrompt}\n\n${input.continuationContext}`
    : persona.systemPrompt;

  console.info("[voice-bootstrap]", {
    ts: new Date().toISOString(),
    event: "session_create_start",
    personaSlug: persona.slug,
    model,
  });

  const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice: getVoiceNameForPersona(persona.slug),
      instructions,
      modalities: ["audio", "text"],
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.info("[voice-bootstrap]", {
      ts: new Date().toISOString(),
      event: "session_create_failed",
      personaSlug: persona.slug,
      model,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      body: text,
    });
    throw new Error(`OpenAI realtime session creation failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    client_secret?: { value?: string; expires_at?: number };
  };
  const secret = payload.client_secret?.value;
  if (!secret) {
    throw new Error("OpenAI realtime session did not return client secret");
  }

  console.info("[voice-bootstrap]", {
    ts: new Date().toISOString(),
    event: "session_create_success",
    personaSlug: persona.slug,
    model,
    expiresAt: payload.client_secret?.expires_at ?? null,
    elapsedMs: Date.now() - startedAt,
  });

  return {
    provider: "openai-realtime",
    model,
    clientSecret: secret,
    expiresAt: payload.client_secret?.expires_at,
    instructions,
    voice: getVoiceNameForPersona(persona.slug),
  };
}
