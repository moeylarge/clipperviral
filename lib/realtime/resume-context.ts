import type { SessionMessage } from "../session/types";

function compactTranscriptLine(role: "user" | "assistant" | "system", content: string) {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  if (role === "system") return null;
  if (role === "assistant" && /visit started|first minute is included|first \\d+ seconds are included/i.test(normalized)) {
    return null;
  }
  const clipped = normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
  return `${role === "user" ? "Child" : "Character"}: ${clipped}`;
}

export function buildResumeContextFromTranscript(transcript: SessionMessage[]) {
  const recentLines = transcript
    .slice(-6)
    .map((message) => compactTranscriptLine(message.role, message.content))
    .filter((line): line is string => Boolean(line));

  if (!recentLines.length) return null;

  return [
    "This is the same live visit continuing after a short parent payment pause.",
    "Continue naturally from the existing conversation.",
    "Do not restart cold or re-introduce yourself unless the child directly asks.",
    "If needed, pick up gently from the recent exchange below.",
    "",
    "Recent conversation:",
    ...recentLines,
  ].join("\n");
}
