import { execFile } from "node:child_process";
import { NextRequest, NextResponse } from "next/server";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 300 * 1024 * 1024;
const SINGLE_REQUEST_MAX_BYTES = 25 * 1024 * 1024;
const CHUNK_DURATION_SECONDS = 120;
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const bundledFfmpegPath = (() => {
  try {
    const resolved = require("ffmpeg-static");
    if (typeof resolved === "string") return resolved;
    if (resolved && typeof resolved === "object") {
      if (typeof resolved.ffmpeg === "string") return resolved.ffmpeg;
      if (typeof resolved.path === "string") return resolved.path;
    }
    return null;
  } catch {
    return null;
  }
})();

const installerFfmpegPath = (() => {
  try {
    const installer = require("@ffmpeg-installer/ffmpeg");
    return installer && typeof installer.path === "string" ? installer.path : null;
  } catch {
    return null;
  }
})();

function getFfmpegCandidates() {
  const candidates = [
    process.env.FFMPEG_PATH?.trim(),
    bundledFfmpegPath?.trim(),
    installerFfmpegPath?.trim(),
    "ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ];

  return [...new Set(candidates.filter((item): item is string => typeof item === "string" && item.length > 0))];
}

function describeFfmpegCandidates() {
  return getFfmpegCandidates()
    .map((candidate, index) => `${index + 1}. ${candidate}`)
    .join(" | ");
}

async function runFfmpegWithFallback(args: string[]) {
  const candidates = getFfmpegCandidates();
  let lastError: unknown = null;

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, args);
      return { ok: true as const, command: candidate };
    } catch (error) {
      lastError = error;
      const e = error as { code?: unknown; message?: unknown };
      if (e.code === "ENOENT") {
        continue;
      }
      return {
        ok: false as const,
        command: candidate,
        error,
      };
    }
  }

  return {
    ok: false as const,
    command: candidates[0] || "ffmpeg",
    error: lastError,
    attempted: candidates,
  };
}

function parseSafeSegments(result: WhisperResponse) {
  if (!Array.isArray(result.segments)) {
    return [];
  }

  return result.segments
    .map((segment) => ({
      start: Number(segment.start),
      end: Number(segment.end),
      text: `${segment.text || ""}`.trim(),
    }))
    .filter((segment) => segment.text.length > 0 && Number.isFinite(segment.start) && Number.isFinite(segment.end));
}

async function transcribeSingle(file: File, apiKey: string, language: string | null) {
  const whisperForm = new FormData();
  whisperForm.append("file", file, file.name || "clip");
  whisperForm.append("model", "whisper-1");
  whisperForm.append("response_format", "verbose_json");
  if (language) {
    whisperForm.append("language", language);
  }

  const whisper = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: whisperForm,
  });

  if (!whisper.ok) {
    const bodyText = await whisper.text();
    return {
      ok: false as const,
      status: whisper.status,
      error: {
        error: "Whisper API error",
        details: bodyText || "No details from upstream.",
        status: whisper.status,
        statusText: whisper.statusText,
      },
    };
  }

  const result = (await whisper.json()) as WhisperResponse;
  return { ok: true as const, result };
}

function normalizeLanguage(value: unknown) {
  if (typeof value !== "string") return null;
  const next = value.trim().toLowerCase();
  return next && next !== "auto" ? next : null;
}

async function transcribeByChunking(file: File, apiKey: string, language: string | null) {
  const workdir = path.join(os.tmpdir(), `spotlight-caption-split-${randomUUID()}`);
  let cumulativeOffset = 0;
  const combinedSegments: WhisperSegment[] = [];
  const textParts: string[] = [];

  try {
    await fs.mkdir(workdir, { recursive: true });
    const sourcePath = path.join(workdir, file.name || "upload.mp4");
    await fs.writeFile(sourcePath, Buffer.from(await file.arrayBuffer()));

    const segmentPattern = path.join(workdir, "segment_%03d.m4a");
    const splitArgs = [
      "-y",
      "-i",
      sourcePath,
      "-vn",
      "-map",
      "0:a?",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "aac",
      "-b:a",
      "64k",
      "-f",
      "segment",
      "-segment_time",
      String(CHUNK_DURATION_SECONDS),
      "-reset_timestamps",
      "1",
      segmentPattern,
    ];

    const splitResult = await runFfmpegWithFallback(splitArgs);
    if (!splitResult.ok) {
      const typed = splitResult.error as {
        code?: unknown;
        message?: string;
        stderr?: string;
      };
      const message = typeof typed.message === "string" ? typed.message : "Failed to split clip into chunks.";
      const stderr = typeof typed.stderr === "string" ? typed.stderr : null;
      const detail =
        message === "Failed to split clip into chunks." && !stderr && splitResult.attempted
          ? `No ffmpeg binary worked. Attempted: ${describeFfmpegCandidates()}`
          : `${message}${stderr ? `\n${stderr}` : ""}`;

      const commandNotFound = typed.code === "ENOENT" || message.includes("spawn") && message.includes("ENOENT");
      if (splitResult.attempted && commandNotFound) {
        return {
          ok: false as const,
          error: {
            error: "FFmpeg is not installed on this machine.",
            details:
              `Large-file captioning needs ffmpeg to split chunks. Attempted binaries: ${describeFfmpegCandidates()}. Install one of: ` +
              "`npm install @ffmpeg-installer/ffmpeg ffmpeg-static`, then restart `npm run dev`, or set FFMPEG_PATH in .env.local.",
            status: 500,
          },
        };
      }

      return {
        ok: false as const,
        error: {
          error: "Failed to split clip into chunks.",
          details:
            detail +
            (splitResult.command ? `\nTried ffmpeg: ${splitResult.command}` : ""),
          status: 500,
        },
      };
    }

    const files = (await fs.readdir(workdir)).filter((name) => /^segment_\d+\.m4a$/.test(name)).sort();
    if (!files.length) {
      return { ok: false as const, error: { error: "Could not split the clip into smaller files.", status: 500 } };
    }

    for (const name of files) {
      const segmentPath = path.join(workdir, name);
      const buffer = await fs.readFile(segmentPath);
      const chunk = new File([buffer], name, { type: "audio/m4a" });
      const response = await transcribeSingle(chunk, apiKey, language);
      if (!response.ok) {
        const { error, status, details, statusText } = response.error;
        return {
          ok: false as const,
          error: {
            error,
            details: statusText ? `${details || ""} (${status} ${statusText})` : details,
            status,
          },
        };
      }

      const result = response.result;
      const safeSegments = parseSafeSegments(result);
      const offsetted = safeSegments.map((segment) => ({
        start: segment.start + cumulativeOffset,
        end: segment.end + cumulativeOffset,
        text: segment.text,
      }));
      combinedSegments.push(...offsetted);

      if (result.text && `${result.text}`.trim()) {
        textParts.push(`${result.text}`.trim());
      }

      const segmentEnd = safeSegments.length ? safeSegments[safeSegments.length - 1].end : CHUNK_DURATION_SECONDS;
      cumulativeOffset += Math.max(CHUNK_DURATION_SECONDS, segmentEnd);
    }
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }

  return {
    ok: true as const,
    result: {
      text: textParts.join(" ").trim(),
      segments: combinedSegments,
    },
  };
}

type WhisperSegment = {
  start: number;
  end: number;
  text: string;
};

type WhisperResponse = {
  text?: string;
  segments?: WhisperSegment[];
};

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY. Add it to .env.local and restart dev server." },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const uploaded = formData.get("clip");

    if (!(uploaded instanceof File)) {
      return NextResponse.json({ error: "No clip uploaded. Attach a .mp4, .mov, .m4a, .mp3, .wav, etc file in field 'clip'." }, { status: 400 });
    }

    const language = normalizeLanguage(formData.get("language"));

    if (uploaded.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File is too large. Keep it at 300MB or smaller for now." },
        { status: 413 }
      );
    }

    if (uploaded.size > SINGLE_REQUEST_MAX_BYTES) {
      const splitResult = await transcribeByChunking(uploaded, apiKey, language);
      if (!splitResult.ok) {
        return NextResponse.json(splitResult.error, { status: splitResult.error.status === 413 ? 413 : 502 });
      }
      return NextResponse.json({
        text: splitResult.result.text,
        segments: splitResult.result.segments,
      });
    }

    const resultData = await transcribeSingle(uploaded, apiKey, language);
    if (!resultData.ok) {
      const errorPayload = resultData.error;
      return NextResponse.json(
        {
          error: errorPayload.error,
          details: errorPayload.details,
          status: errorPayload.status,
          statusText: errorPayload.statusText,
        },
        { status: 502 }
      );
    }

    const result = resultData.result;
    return NextResponse.json({
      text: (result.text || "").trim(),
      segments: parseSafeSegments(result),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error while transcribing.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
