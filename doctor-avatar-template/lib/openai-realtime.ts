import { getCharacterConfig, getRequiredEnv } from "@/lib/config";

export type RealtimeVoiceSession = {
  provider: "openai-realtime";
  model: string;
  clientSecret: string;
  expiresAt?: number;
  instructions: string;
  voice: string;
};

export async function createOpenAiRealtimeVoiceSession(accessKey: string): Promise<RealtimeVoiceSession> {
  const apiKey = getRequiredEnv("OPENAI_API_KEY");
  const model = getRequiredEnv("OPENAI_REALTIME_MODEL");
  const voice = process.env.OPENAI_REALTIME_VOICE ?? "cedar";
  const character = getCharacterConfig(accessKey);

  const response = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      voice,
      instructions: character.prompt,
      modalities: ["audio", "text"],
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI realtime session creation failed (${response.status}): ${text}`);
  }

  const payload = (await response.json()) as {
    client_secret?: { value?: string; expires_at?: number };
  };
  const secret = payload.client_secret?.value;
  if (!secret) {
    throw new Error("OpenAI realtime session did not return client secret");
  }

  return {
    provider: "openai-realtime",
    model,
    clientSecret: secret,
    expiresAt: payload.client_secret?.expires_at,
    instructions: character.prompt,
    voice,
  };
}
