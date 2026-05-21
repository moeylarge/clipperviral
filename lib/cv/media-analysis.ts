import { execFile } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const preparedFfmpegPaths = new Map<string, Promise<string>>();

export type WhisperSegment = {
  start: number;
  end: number;
  text: string;
};

type WhisperResponse = {
  text?: string;
  segments?: WhisperSegment[];
};

export type ViralWindow = {
  start: number;
  end: number;
  text: string;
  audioRms: number;
  score: number;
  reason: string;
};

export function getFfmpegCandidates() {
  let bundled: string | null = null;
  let staticPackageBinary: string | null = null;
  let installerBinary: string | null = null;
  const installerPackageBinaries: string[] = [];
  try {
    const resolved = require("ffmpeg-static");
    if (typeof resolved === "string") bundled = resolved;
    else if (resolved && typeof resolved === "object" && typeof resolved.path === "string") bundled = resolved.path;
  } catch {
    bundled = null;
  }
  try {
    staticPackageBinary = path.join(path.dirname(require.resolve("ffmpeg-static/package.json")), "ffmpeg");
  } catch {
    staticPackageBinary = null;
  }
  try {
    const resolved = require("@ffmpeg-installer/ffmpeg");
    if (resolved && typeof resolved === "object" && typeof resolved.path === "string") installerBinary = resolved.path;
  } catch {
    installerBinary = null;
  }
  for (const packageName of ["@ffmpeg-installer/linux-x64", "@ffmpeg-installer/linux-arm64"]) {
    try {
      installerPackageBinaries.push(path.join(path.dirname(require.resolve(`${packageName}/package.json`)), "ffmpeg"));
    } catch {
      // Optional platform package is only present for the current install target.
    }
  }

  return [
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    path.join(process.cwd(), "node_modules", "@ffmpeg-installer", "linux-x64", "ffmpeg"),
    path.join(process.cwd(), "node_modules", "@ffmpeg-installer", "linux-arm64", "ffmpeg"),
    staticPackageBinary,
    bundled,
    installerBinary,
    ...installerPackageBinaries,
    process.env.FFMPEG_PATH?.trim(),
    "ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ]
    .filter((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0)
    .filter((candidate) => !path.isAbsolute(candidate) || existsSync(candidate));
}

async function prepareFfmpegCommand(command: string) {
  if (!path.isAbsolute(command)) return command;
  if (command.startsWith(os.tmpdir())) return command;

  let prepared = preparedFfmpegPaths.get(command);
  if (!prepared) {
    prepared = (async () => {
      const target = path.join(os.tmpdir(), `cv-ffmpeg-${Buffer.from(command).toString("base64url").slice(0, 24)}`);
      await fs.copyFile(command, target);
      await fs.chmod(target, 0o755);
      return target;
    })();
    preparedFfmpegPaths.set(command, prepared);
  }
  return prepared;
}

export async function runFfmpeg(args: string[], timeoutMs = 10 * 60 * 1000) {
  let lastError: unknown = null;
  for (const command of [...new Set(getFfmpegCandidates())]) {
    try {
      const executable = await prepareFfmpegCommand(command);
      const result = await execFileAsync(executable, args, {
        timeout: timeoutMs,
        maxBuffer: 50 * 1024 * 1024,
      });
      return { ok: true as const, command: executable, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      lastError = error;
      if ((error as { code?: string })?.code === "ENOENT") continue;
      return { ok: false as const, command, error };
    }
  }
  return { ok: false as const, command: getFfmpegCandidates()[0] || "ffmpeg", error: lastError };
}

export async function getMediaDurationSeconds(filePath: string) {
  const result = await runFfmpeg(["-i", filePath, "-f", "null", "-"], 60_000);
  const stderr = result.ok ? result.stderr : String((result.error as { stderr?: string })?.stderr || "");
  const match = stderr.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export async function extractWhisperAudio(inputPath: string, outputPath: string) {
  const result = await runFfmpeg([
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ar",
    "16000",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);
  if (!result.ok) {
    const error = result.error as { message?: string; stderr?: string };
    throw new Error(`${error?.message || "Failed to extract audio."}${error?.stderr ? `\n${error.stderr}` : ""}`);
  }
}

function parseSegments(result: WhisperResponse): WhisperSegment[] {
  if (!Array.isArray(result.segments)) return [];
  return result.segments
    .map((segment) => ({
      start: Number(segment.start),
      end: Number(segment.end),
      text: `${segment.text || ""}`.trim(),
    }))
    .filter((segment) => segment.text && Number.isFinite(segment.start) && Number.isFinite(segment.end));
}

async function transcribeSingleAudio(filePath: string, apiKey: string, offsetSeconds = 0) {
  const buffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new File([buffer], path.basename(filePath), { type: "audio/wav" }));
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  }

  const payload = (await response.json()) as WhisperResponse;
  return parseSegments(payload).map((segment) => ({
    ...segment,
    start: segment.start + offsetSeconds,
    end: segment.end + offsetSeconds,
  }));
}

export async function transcribeAudioWithWhisper(audioPath: string, apiKey: string) {
  const maxSingleBytes = 25 * 1024 * 1024;
  const stat = await fs.stat(audioPath);
  if (stat.size <= maxSingleBytes) return transcribeSingleAudio(audioPath, apiKey);

  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), "cv-whisper-chunks-"));
  try {
    const chunkPattern = path.join(workdir, "chunk_%03d.wav");
    const split = await runFfmpeg([
      "-y",
      "-i",
      audioPath,
      "-f",
      "segment",
      "-segment_time",
      "120",
      "-reset_timestamps",
      "1",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-c:a",
      "pcm_s16le",
      chunkPattern,
    ]);
    if (!split.ok) throw new Error("Failed to split audio for Whisper.");

    const files = (await fs.readdir(workdir)).filter((name) => /^chunk_\d+\.wav$/.test(name)).sort();
    const segments: WhisperSegment[] = [];
    let offset = 0;
    for (const name of files) {
      const fullPath = path.join(workdir, name);
      const next = await transcribeSingleAudio(fullPath, apiKey, offset);
      segments.push(...next);
      offset += 120;
    }
    return segments;
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
}

export async function readWavMonoRms(audioPath: string) {
  const bytes = await fs.readFile(audioPath);
  if (bytes.toString("ascii", 0, 4) !== "RIFF") return [];
  let offset = 12;
  let sampleRate = 16000;
  let dataStart = -1;
  let dataSize = 0;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (id === "fmt ") sampleRate = bytes.readUInt32LE(offset + 12);
    if (id === "data") {
      dataStart = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataStart < 0 || dataSize <= 0) return [];
  const samples = Math.floor(dataSize / 2);
  const perSecond: number[] = [];
  for (let start = 0; start < samples; start += sampleRate) {
    const end = Math.min(samples, start + sampleRate);
    let sum = 0;
    for (let i = start; i < end; i += 1) {
      const sample = bytes.readInt16LE(dataStart + i * 2) / 32768;
      sum += sample * sample;
    }
    perSecond.push(Math.sqrt(sum / Math.max(1, end - start)));
  }
  const max = Math.max(0.0001, ...perSecond);
  return perSecond.map((value) => Math.max(0, Math.min(1, value / max)));
}

export function buildSlidingWindows(options: {
  durationSeconds: number;
  perClipSeconds: number;
  segments: WhisperSegment[];
  rmsBySecond: number[];
}) {
  const maxStart = Math.max(0, Math.floor(options.durationSeconds - options.perClipSeconds));
  return Array.from({ length: maxStart + 1 }, (_, start) => {
    const end = start + options.perClipSeconds;
    const text = options.segments
      .filter((segment) => segment.end >= start && segment.start <= end)
      .map((segment) => segment.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const rmsSlice = options.rmsBySecond.slice(start, Math.max(start + 1, Math.ceil(end)));
    const audioRms = rmsSlice.length ? rmsSlice.reduce((sum, value) => sum + value, 0) / rmsSlice.length : 0;
    return { start, end, text, audioRms };
  });
}

function parseJsonObject(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as { score?: unknown; reason?: unknown };
  } catch {
    return null;
  }
}

function fallbackViralScore(options: { text: string; audioRms: number }) {
  const words = options.text.split(/\s+/).filter(Boolean);
  const text = options.text.toLowerCase();
  const hookWords = [
    "wait",
    "what",
    "crazy",
    "insane",
    "no way",
    "bro",
    "dude",
    "wow",
    "laugh",
    "lol",
    "kill",
    "win",
    "clutch",
  ];
  const hookHits = hookWords.filter((word) => text.includes(word)).length;
  const score = Math.max(
    1,
    Math.min(100, Math.round(Math.min(35, words.length * 1.6) + Math.min(45, options.audioRms * 55) + hookHits * 6)),
  );
  return {
    score,
    reason: "Local fallback score from transcript density, hook words, and normalized audio energy.",
  };
}

export async function scoreWindowWithClaude(options: {
  perClipSeconds: number;
  text: string;
  audioRms: number;
}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Missing ANTHROPIC_API_KEY.");

  const modelCandidates = [
    process.env.ANTHROPIC_MODEL?.trim(),
    "claude-haiku-4-5-20251001",
  ].filter((model): model is string => Boolean(model));

  let response: Response | null = null;
  let lastErrorText = "";
  for (const model of [...new Set(modelCandidates)]) {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 120,
        temperature: 0.2,
        messages: [
          {
            role: "user",
            content:
              `Rate the viral potential of this ${options.perClipSeconds}-second clip moment from 0-100. ` +
              "Consider hype level, comedic timing, surprise, hookability, and shareability. " +
              "Return ONLY a JSON object: {\"score\": number, \"reason\": string}.\n" +
              `Transcript: ${options.text || "(no clear speech)"}\n` +
              `Audio energy (0-1 normalized): ${options.audioRms.toFixed(3)}`,
          },
        ],
      }),
    });

    if (response.ok) break;
    lastErrorText = await response.text();
    if (response.status !== 404 || !lastErrorText.includes("not_found_error")) break;
  }

  if (!response?.ok) {
    if (response?.status === 404 && lastErrorText.includes("not_found_error")) {
      return fallbackViralScore(options);
    }
    throw new Error(`Claude scoring failed: ${response?.status || "unknown"} ${lastErrorText}`);
  }

  const payload = (await response.json()) as { content?: Array<{ text?: string }> };
  const text = payload.content?.map((item) => item.text || "").join("\n") || "";
  const parsed = parseJsonObject(text);
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed?.score ?? 0))));
  return {
    score: Number.isFinite(score) ? score : 0,
    reason: typeof parsed?.reason === "string" && parsed.reason.trim() ? parsed.reason.trim() : "Claude-selected moment.",
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
