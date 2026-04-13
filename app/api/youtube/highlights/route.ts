import { execFile } from "node:child_process";
import { promises as fs, constants as fsConstants } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { NextRequest, NextResponse } from "next/server";

import { registerYoutubeJob } from "@/lib/youtube-job-store";
import { requireAllowedApiUser } from "@/lib/auth/api-access";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const DEFAULT_COMMAND_TIMEOUT_MS = 45 * 60 * 1000;
const YTDLP_DOWNLOAD_TIMEOUT_MS = 45 * 60 * 1000;
const YTDLP_RUNTIME_BINARY_PATH = path.join(os.tmpdir(), "clipperviral-yt-dlp");
let ytdlpBootstrapPromise: Promise<string | null> | null = null;

const requireFfmpegPath = () => {
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
};

const requireInstallerFfmpegPath = () => {
  try {
    const installer = require("@ffmpeg-installer/ffmpeg");
    return installer && typeof installer.path === "string" ? installer.path : null;
  } catch {
    return null;
  }
};

type CommandCandidate = {
  command: string;
  args?: string[];
};

type SourceKind = "youtube" | "kick" | "generic";

function detectSourceKind(url: string): SourceKind {
  const value = url.toLowerCase();
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "youtube";
  if (value.includes("kick.com")) return "kick";
  return "generic";
}

function getBinaryCandidates() {
  const ffmpegPath = process.env.FFMPEG_PATH?.trim();
  return [
    ffmpegPath,
    requireFfmpegPath(),
    requireInstallerFfmpegPath(),
    "ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ].filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
}

function getYtDlpFfmpegLocation() {
  const candidates = getBinaryCandidates();
  const absolute = candidates.find((entry) => entry.startsWith("/"));
  return absolute || null;
}

const YTDLP_COOKIES_TMP_PATH = path.join(os.tmpdir(), "clipperviral-ytdlp-cookies.txt");
let ytdlpCookiesPromise: Promise<string | null> | null = null;

async function resolveYtDlpCookieFile() {
  if (ytdlpCookiesPromise) {
    return ytdlpCookiesPromise;
  }

  ytdlpCookiesPromise = (async () => {
    const configuredPath = process.env.YTDLP_COOKIE_FILE?.trim();
    if (configuredPath) {
      try {
        await fs.access(configuredPath, fsConstants.R_OK);
        return configuredPath;
      } catch {
        // fall through to env payload options
      }
    }

    const cookieText = process.env.YTDLP_COOKIES?.trim();
    if (cookieText) {
      await fs.writeFile(YTDLP_COOKIES_TMP_PATH, cookieText, "utf8");
      return YTDLP_COOKIES_TMP_PATH;
    }

    const cookieB64 = process.env.YTDLP_COOKIES_B64?.trim();
    if (cookieB64) {
      const decoded = Buffer.from(cookieB64, "base64").toString("utf8");
      if (decoded.trim().length) {
        await fs.writeFile(YTDLP_COOKIES_TMP_PATH, decoded, "utf8");
        return YTDLP_COOKIES_TMP_PATH;
      }
    }

    return null;
  })();

  return ytdlpCookiesPromise;
}

function getYtDlpReleaseUrls() {
  const configured = process.env.YTDLP_BINARY_URL?.trim();
  if (configured) return [configured];

  const urls: string[] = [];
  if (process.platform === "linux") {
    if (process.arch === "x64") {
      urls.push("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux");
    }
    if (process.arch === "arm64") {
      urls.push("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux_aarch64");
    }
  } else if (process.platform === "darwin") {
    if (process.arch === "arm64") {
      urls.push("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos");
    } else {
      urls.push("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos_legacy");
    }
  }

  // Do not fallback to the generic "yt-dlp" script URL since Vercel has no python runtime.
  return [...new Set(urls)];
}

function looksLikePythonScript(bytes: Uint8Array) {
  if (!bytes.length) return false;
  const header = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 256))).toString("utf8");
  return header.startsWith("#!") && /python/i.test(header);
}

async function tryDownloadYtDlpBinary(targetPath: string) {
  const urls = getYtDlpReleaseUrls();
  for (const url of urls) {
    try {
      const response = await fetch(url, { redirect: "follow" });
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length) continue;
      if (looksLikePythonScript(bytes)) continue;
      await fs.writeFile(targetPath, bytes);
      await fs.chmod(targetPath, 0o755);
      await fs.access(targetPath, fsConstants.X_OK);
      return true;
    } catch {
      // try next url
    }
  }
  return false;
}

async function ensureYtDlpRuntimeBinary() {
  if (ytdlpBootstrapPromise) {
    return ytdlpBootstrapPromise;
  }

  ytdlpBootstrapPromise = (async () => {
    try {
      await fs.access(YTDLP_RUNTIME_BINARY_PATH, fsConstants.X_OK);
      return YTDLP_RUNTIME_BINARY_PATH;
    } catch {
      // continue to download
    }

    try {
      const downloaded = await tryDownloadYtDlpBinary(YTDLP_RUNTIME_BINARY_PATH);
      if (downloaded) return YTDLP_RUNTIME_BINARY_PATH;
    } catch {
      // fall through
    }

    return null;
  })();

  return ytdlpBootstrapPromise;
}

function parseConfiguredYtDlpCommand(value: string | undefined): CommandCandidate[] {
  const configured = value?.trim();
  if (!configured) return [];
  const tokens = configured.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const [command, ...args] = tokens;
    return [{ command, args }];
  }
  return [{ command: configured }];
}

async function getYtDlpCandidates(): Promise<CommandCandidate[]> {
  let runtimeYtDlp: string | null = null;
  const bundledYtDlp = path.join(process.cwd(), "bin", "yt-dlp");
  try {
    await fs.access(bundledYtDlp, fsConstants.X_OK);
    runtimeYtDlp = bundledYtDlp;
  } catch {
    runtimeYtDlp = await ensureYtDlpRuntimeBinary();
  }
  const configured = parseConfiguredYtDlpCommand(process.env.YTDLP_PATH);
  const rawCandidates: CommandCandidate[] = [
    ...configured,
    ...(runtimeYtDlp ? [{ command: runtimeYtDlp }] : []),
    { command: "yt-dlp" },
    { command: "youtube-dl" },
    { command: "/opt/homebrew/bin/yt-dlp" },
    { command: "/usr/local/bin/yt-dlp" },
    { command: process.env.YTDLP_PYTHON?.trim() || "python3", args: ["-m", "yt_dlp"] },
    { command: "python3.12", args: ["-m", "yt_dlp"] },
    { command: "python3.11", args: ["-m", "yt_dlp"] },
    { command: "python3.10", args: ["-m", "yt_dlp"] },
    { command: "python3", args: ["-m", "yt_dlp"] },
  ];

  const deduped = new Map<string, CommandCandidate>();
  for (const candidate of rawCandidates) {
    if (!candidate.command?.trim()) continue;
    const key = `${candidate.command}::${(candidate.args || []).join(" ")}`;
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  }

  return [...deduped.values()];
}

function ytDlpDownloadAttempts(
  formatPref: string,
  outputTemplate: string,
  sourceKind: SourceKind,
  ffmpegLocation: string | null,
  cookieFile: string | null,
) {
  const userAgent = process.env.YTDLP_USER_AGENT?.trim() || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
  const country = process.env.YTDLP_GEO_BYPASS?.trim();
  const attempts: string[][] = [];
  const baseArgs = [
    "--no-playlist",
    "--no-warnings",
    "--no-check-certificate",
    "--retry-sleep",
    "2",
    "--retries",
    "2",
    "--fragment-retries",
    "2",
    "--socket-timeout",
    "20",
    "-f",
    formatPref,
    "--merge-output-format",
    "mp4",
    "--user-agent",
    userAgent,
  ];
  if (ffmpegLocation) {
    baseArgs.push("--ffmpeg-location", ffmpegLocation);
  }

  if (sourceKind === "youtube") {
    const commonHeaders = [
      "--add-header",
      "Accept-Language: en-US,en;q=0.9",
      "--add-header",
      "Origin: https://www.youtube.com",
      "--add-header",
      "Referer: https://www.youtube.com/",
    ];
    const youtubeBase = [...baseArgs, "--geo-bypass", ...commonHeaders, "-o", outputTemplate];
    const youtubeFallback = [
      "-f",
      "best",
      "--merge-output-format",
      "mp4",
      "--user-agent",
      userAgent,
      ...commonHeaders,
      "-o",
      outputTemplate,
    ];

    attempts.push(youtubeBase);
    attempts.push([...youtubeBase, "--extractor-args", "youtube:player_client=android"]);
    attempts.push([...youtubeBase, "--extractor-args", "youtube:player_client=ios"]);
    attempts.push([...youtubeBase, "--extractor-args", "youtube:player_client=web"]);
    attempts.push([...youtubeBase, "--extractor-args", "youtube:player_client=tv_embedded"]);
    attempts.push([...youtubeBase, "--extractor-args", "youtube:player_client=mweb"]);

    if (cookieFile) {
      attempts.push([...youtubeBase, "--cookies", cookieFile]);
      attempts.push([...youtubeBase, "--cookies", cookieFile, "--extractor-args", "youtube:player_client=android"]);
      attempts.push([...youtubeBase, "--cookies", cookieFile, "--extractor-args", "youtube:player_client=ios"]);
      attempts.push([...youtubeBase, "--cookies", cookieFile, "--extractor-args", "youtube:player_client=web"]);
      attempts.push([...youtubeBase, "--cookies", cookieFile, "--extractor-args", "youtube:player_client=tv_embedded"]);
      attempts.push([...youtubeBase, "--cookies", cookieFile, "--extractor-args", "youtube:player_client=mweb"]);
    }

    if (country) {
      attempts.push([...youtubeBase, `--geo-bypass-country`, country]);
      attempts.push([...youtubeBase, `--geo-bypass-ip-block`, country]);
    }

    attempts.push(youtubeFallback);
    attempts.push([...youtubeFallback, "--extractor-args", "youtube:player_client=android"]);
  } else {
    const genericBase = [...baseArgs, "-o", outputTemplate];
    const genericFallback = [
      "-f",
      "bestvideo+bestaudio/best",
      "--merge-output-format",
      "mp4",
      "--user-agent",
      userAgent,
      "-o",
      outputTemplate,
    ];
    attempts.push(genericBase);
    attempts.push(genericFallback);
    attempts.push(["-f", "best", "--merge-output-format", "mp4", "--user-agent", userAgent, "-o", outputTemplate]);
    if (cookieFile) {
      attempts.push([...genericBase, "--cookies", cookieFile]);
    }
  }

  return attempts;
}

async function runYtDlpWithFallback(
  ytdlpCandidates: CommandCandidate[],
  formatPref: string,
  outputTemplate: string,
  sourceUrl: string,
  sourceKind: SourceKind,
  ffmpegLocation: string | null,
  cookieFile: string | null,
) {
  const failureMessages: string[] = [];
  const attempts = ytDlpDownloadAttempts(formatPref, outputTemplate, sourceKind, ffmpegLocation, cookieFile);
  let lastError: unknown = null;
  let saw403 = false;
  const shouldRetryYoutubeAuthGate = (message: string) => {
    const lower = message.toLowerCase();
    return (
      lower.includes("http error 403") ||
      lower.includes("sign in to confirm you're not a bot") ||
      lower.includes("sign in to confirm you’re not a bot") ||
      lower.includes("use --cookies-from-browser or --cookies")
    );
  };

  for (const candidate of ytdlpCandidates) {
    for (const attempt of attempts) {
      const args = [...attempt, sourceUrl];
      const result = await runCommand(candidate, args, YTDLP_DOWNLOAD_TIMEOUT_MS);
      if (result.ok) return result;

      const error = result.error as { code?: string; message?: string };
      lastError = result.error;
      failureMessages.push(`${result.command} ${attempt.join(" ")}`.trim());
      if (error?.code !== "ENOENT") {
        const message = error.message || "yt-dlp command failed.";
        if (sourceKind === "youtube" && shouldRetryYoutubeAuthGate(message)) {
          saw403 = true;
          continue;
        }
        return result;
      }
    }
  }

  return {
    ok: false as const,
    command: ytdlpCandidates[0]?.command || "yt-dlp",
    error: lastError,
    attempted: failureMessages,
    saw403,
  };
}

function toCommandCandidates(commands: string[]): CommandCandidate[] {
  return commands.filter((command): command is string => command.length > 0).map((command) => ({ command }));
}

async function runCommand(
  candidateOrCommand: CommandCandidate | string,
  args: string[],
  timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
) {
  const candidate =
    typeof candidateOrCommand === "string" ? ({ command: candidateOrCommand } as CommandCandidate) : candidateOrCommand;
  const mergedArgs = [...(candidate.args || []), ...args];
  try {
    const { stdout, stderr } = await execFileAsync(candidate.command, mergedArgs, {
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
    });
    return { ok: true as const, command: candidate.command, stdout, stderr, candidate };
  } catch (error) {
    return { ok: false as const, command: candidate.command, error };
  }
}

async function runWithFallback(binarySelector: () => CommandCandidate[], args: string[]) {
  const candidates = binarySelector();
  let lastError: unknown = null;
  for (const candidate of candidates) {
    const result = await runCommand(candidate, args);
    if (result.ok) return result;
    const error = result.error as { code?: string };
    lastError = result.error;
    if (error?.code !== "ENOENT") {
      return result;
    }
  }
  const fallbackCommand = candidates[0]?.command || "ffmpeg";
  return { ok: false as const, command: fallbackCommand, attempted: candidates, error: lastError };
}

async function getDurationSeconds(ffmpegCommand: string, inputPath: string) {
  const ffprobeCandidates = getBinaryCandidates().map((command) =>
    command === "ffmpeg" ? "ffprobe" : command.replace(/ffmpeg$/i, "ffprobe"),
  );
  const selected = ffprobeCandidates.includes("ffprobe") ? ffprobeCandidates : ["ffprobe", ...ffprobeCandidates];
  const unique = [...new Set(selected.filter((entry) => entry && entry.length > 0))];
  const args = ["-v", "error", "-show_entries", "format=duration", "-of", "json", inputPath];

  for (const command of unique) {
    const result = await runCommand(command, args);
    if (!result.ok) continue;
    const text = String(result.stdout || "").trim();
    const errText = String(result.stderr || "").trim();
    try {
      const parsed = JSON.parse(text);
      const duration = Number(parsed?.format?.duration);
      if (Number.isFinite(duration) && duration > 0) return duration;
    } catch {
      // ignore parse failures
    }

    const fallbackMatch = errText.match(/Duration:\s+(\d{2}):(\d{2}):(\d+(?:\.\d+)?)/);
    if (fallbackMatch) {
      const h = Number(fallbackMatch[1]);
      const m = Number(fallbackMatch[2]);
      const s = Number(fallbackMatch[3]);
      const maybe = h * 3600 + m * 60 + s;
      if (Number.isFinite(maybe) && maybe > 0) return maybe;
    }
  }

  const ffmpegProbe = await runCommand(ffmpegCommand, ["-i", inputPath]);
  if (!ffmpegProbe.ok) return null;
  const probeText = `${String(ffmpegProbe.stderr || "")} ${String(ffmpegProbe.stdout || "")}`;
  const match = probeText.match(/Duration:\s+(\d{2}):(\d{2}):(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const [, h, m, s] = match;
  const duration = Number(h) * 3600 + Number(m) * 60 + Number(s);

  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function parseDurationValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

function parseDurationFromClock(value: string) {
  const match = /^(\d{2}):(\d{2}):(\d+(?:\.\d+)?)$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  const s = Number(match[3]);
  const duration = h * 3600 + m * 60 + s;
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function estimateYoutubeTotalSeconds(videoDurationSeconds: number | null, clipDuration: number, maxClips: number) {
  if (videoDurationSeconds === null || !Number.isFinite(videoDurationSeconds) || videoDurationSeconds <= 0) {
    return null;
  }
  const safeClipDuration = Number.isFinite(clipDuration) ? Math.min(Math.max(clipDuration, 10), 120) : 30;
  const safeMaxClips = Number.isFinite(maxClips) ? Math.min(Math.max(Math.round(maxClips), 1), 20) : 8;

  const min = 60;
  const max = 60 * 45; // keep estimate usable
  const clipDurationPenalty = safeClipDuration * 1.1;
  const clipCountPenalty = safeMaxClips * 8;
  const estimate = Math.round(90 + videoDurationSeconds * 0.78 + clipDurationPenalty + clipCountPenalty);
  return Math.max(min, Math.min(max, estimate));
}

async function getDurationFromSourceMetadata(
  sourceUrl: string,
  ytdlpCandidates: CommandCandidate[],
  cookieFile: string | null,
) {
  const attempts = [
    ["--skip-download", "--no-playlist", "--no-warnings", "-J"],
    ["--skip-download", "--no-playlist", "--no-warnings", "--print", "duration"],
  ];
  for (const candidate of ytdlpCandidates) {
    for (const baseArgs of attempts) {
      const args = [...baseArgs];
      if (cookieFile) {
        args.push("--cookies", cookieFile);
      }
      const result = await runCommand(candidate, [...args, sourceUrl]);
      if (!result.ok) continue;

      const stdout = `${result.stdout || ""}`.trim();
      if (!stdout) continue;

      const firstLine = stdout.split(/\r?\n/)[0]?.trim();
      if (firstLine && firstLine.startsWith("{")) {
        try {
          const payload = JSON.parse(firstLine);
          const parsed = parseDurationValue((payload as { duration?: unknown })?.duration);
          if (parsed) return parsed;
        } catch {
          // continue
        }
      }

      const durationMatch = stdout.match(/\n\s*"duration"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)"?/);
      if (durationMatch) {
        const parsed = parseDurationValue(durationMatch[1]);
        if (parsed) return parsed;
      }

      const durationLineMatch = stdout.match(/duration:\s*(\d{2}:\d{2}:\d+(?:\.\d+)?)/i);
      if (durationLineMatch) {
        const parsed = parseDurationFromClock(durationLineMatch[1]);
        if (parsed) return parsed;
      }

      const printMatch = stdout.match(/(\d+(?:\.\d+)?)/);
      if (printMatch) {
        const parsed = parseDurationValue(printMatch[1]);
        if (parsed) return parsed;
      }
    }
  }
  return null;
}

async function normalizeSourceForProbe(ffmpegCommand: string, sourcePath: string, workdir: string) {
  const normalizedPath = path.join(workdir, "source-normalized.mp4");
  const result = await runCommand(ffmpegCommand, [
    "-y",
    "-i",
    sourcePath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    normalizedPath,
  ]);
  if (!result.ok) return null;
  return normalizedPath;
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

function parseSegments(result: WhisperResponse): WhisperSegment[] {
  if (!Array.isArray(result.segments)) return [];
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
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: whisperForm,
  });

  if (!response.ok) {
    const bodyText = await response.text();
    return {
      ok: false as const,
      error: `${response.status} ${response.statusText}: ${bodyText || "Whisper failed."}`,
      status: response.status,
    };
  }

  const payload = (await response.json()) as WhisperResponse;
  return { ok: true as const, result: payload };
}

async function transcribeAudio(filePath: string, apiKey: string, language: string | null) {
  const CHUNK_SIZE_SECONDS = 120;
  const MAX_SINGLE_BYTES = 25 * 1024 * 1024;
  const workdir = path.join(os.tmpdir(), `spotlight-youtube-transcribe-${randomUUID()}`);
  const out: WhisperSegment[] = [];
  let fullText = "";

  try {
    await fs.mkdir(workdir, { recursive: true });
    const buffer = await fs.readFile(filePath);
    if (buffer.length <= MAX_SINGLE_BYTES) {
      const fileName = path.basename(filePath);
      const response = await transcribeSingle(new File([buffer], fileName), apiKey, language);
      if (!response.ok) {
        return {
          ok: false as const,
          error: response.error,
          status: response.status || 502,
        };
      }
      const safe = parseSegments(response.result);
      out.push(...safe);
      fullText = `${response.result.text || ""}`.trim();
      return { ok: true as const, segments: out, text: fullText };
    }

    const segmentPattern = path.join(workdir, "chunk_%03d.m4a");
    const splitArgs = [
      "-y",
      "-i",
      filePath,
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
      String(CHUNK_SIZE_SECONDS),
      "-reset_timestamps",
      "1",
      segmentPattern,
    ];

      const splitResult = await runWithFallback(() => toCommandCandidates(getBinaryCandidates()), splitArgs);
    if (!splitResult.ok) {
      const typed = splitResult.error as { message?: string; code?: string; stderr?: string };
      const message = typed?.message || "Failed to split clip into chunks.";
      return {
        ok: false as const,
        status: 500,
        error:
          `${message}` + (typed?.stderr ? `\n${typed.stderr}` : splitResult.command ? `\nTried ffmpeg: ${splitResult.command}` : ""),
      };
    }

    const files = (await fs.readdir(workdir))
      .filter((name) => /^chunk_\d+\.m4a$/.test(name))
      .sort();
    if (!files.length) {
      return { ok: false as const, status: 500, error: "No audio chunks generated from this file." };
    }

    let offset = 0;
    for (const name of files) {
      const chunkPath = path.join(workdir, name);
      const chunkBytes = await fs.readFile(chunkPath);
      const response = await transcribeSingle(new File([chunkBytes], name, { type: "audio/m4a" }), apiKey, language);
      if (!response.ok) {
        return {
          ok: false as const,
          status: response.status || 500,
          error: response.error,
        };
      }
      const parsed = parseSegments(response.result);
      for (const segment of parsed) {
        out.push({
          start: segment.start + offset,
          end: segment.end + offset,
          text: segment.text,
        });
      }
      if (response.result.text) {
        fullText = `${fullText} ${response.result.text || ""}`.trim();
      }
      const lastEnd = parsed.length ? parsed[parsed.length - 1].end : CHUNK_SIZE_SECONDS;
      offset += Math.max(lastEnd, CHUNK_SIZE_SECONDS);
    }
    return { ok: true as const, segments: out, text: fullText };
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
}

function normalizeInputLanguage(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed && trimmed !== "auto" ? trimmed : null;
}

type Window = {
  index: number;
  start: number;
  end: number;
  duration: number;
  text: string;
  score: number;
  reason: string;
};

function buildWindows(segments: WhisperSegment[], clipDuration: number, overlap: number, totalDuration: number | null) {
  const fallbackEnd = segments.length ? Math.max(0, ...segments.map((s) => s.end)) : 0;
  const safeTotalDuration = typeof totalDuration === "number" ? totalDuration : null;
  const maxEnd =
    safeTotalDuration && Number.isFinite(safeTotalDuration) && safeTotalDuration > 0 ? safeTotalDuration : fallbackEnd;
  const step = Math.max(8, Math.round(clipDuration - overlap));
  const windows: { start: number; end: number; text: string }[] = [];

  for (let start = 0; start + clipDuration <= maxEnd; start += step) {
    const end = Math.min(start + clipDuration, maxEnd);
    const words = segments
      .filter((segment) => segment.end >= start && segment.start <= end)
      .map((segment) => segment.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!words) continue;
    windows.push({ start, end, text: words });
  }

  return windows;
}

function localScore(text: string, duration: number) {
  const normalized = text.toLowerCase();
  const words = normalized.match(/[a-z0-9']+/gi) || [];
  const wordCount = words.length;
  const uniqueWords = new Set(words).size;

  const highIntent = ["reveal", "watch", "check", "must", "wait", "crazy", "important", "best", "truth", "secret", "craziest", "amazing", "insane", "big", "shocking"];
  const attention = ["you", "look", "listen", "don’t", "dont", "actually", "seriously", "crazy", "this is", "wait", "hold on", "proof", "proof"];
  const callToAction = ["sub", "comment", "like", "smash", "follow", "link", "drop", "share", "subscribe", "save"];
  const questionMarkRatio = (normalized.match(/\?/g) || []).length / Math.max(1, wordCount);
  const excitement = (normalized.match(/[!?]/g) || []).length;
  const filler = ["um", "uh", "like", "you know", "so", "actually", "i mean", "okay", "right"];
  const fillerCount = filler.reduce((acc, token) => acc + normalized.split(token).length - 1, 0);

  let score = 22;
  const signal =
    highIntent.reduce((acc, token) => acc + (normalized.includes(token) ? 1 : 0), 0) +
    callToAction.reduce((acc, token) => acc + (normalized.includes(token) ? 1 : 0), 0) * 1.2 +
    attention.reduce((acc, token) => acc + (normalized.includes(token) ? 1 : 0), 0) * 0.8;
  score += Math.min(signal * 4, 26);
  score += Math.min(wordCount * 1.1, 24);
  score += Math.min(uniqueWords * 0.4, 10);
  score += Math.min(questionMarkRatio * 40, 9);
  score += Math.min((excitement / Math.max(1, wordCount)) * 200, 7);
  score -= Math.min(fillerCount * 1.4, 12);
  score += Math.min(Math.max(1, duration), 30) * 0.2;
  score = Math.max(10, Math.min(100, Math.round(score)));

  const top = normalized.includes("?")
    ? "contains a hook/question + high-intent phrases"
    : "dialogue-heavy and clip-friendly";

  return { score, reason: top };
}

function rankWindowsByLocalHeuristic(windows: { start: number; end: number; text: string; }[]) {
  return windows
    .map((window, index) => {
      const { score, reason } = localScore(window.text, window.end - window.start);
      return {
        index,
        start: Number(window.start.toFixed(2)),
        end: Number(window.end.toFixed(2)),
        duration: Number((window.end - window.start).toFixed(2)),
        score,
        reason,
        text: window.text,
      };
    })
    .sort((a, b) => b.score - a.score);
}

function clipDurationSafe(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  if (parsed < 10) return 10;
  if (parsed > 120) return 120;
  return parsed;
}

function maxClipsSafe(value: string | undefined) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 8;
  if (parsed < 1) return 1;
  if (parsed > 20) return 20;
  return Math.floor(parsed);
}

function parseBoolean(value: unknown) {
  if (typeof value !== "string") return true;
  return value === "1" || value.toLowerCase() === "true";
}

async function askGptToScore(
  apiKey: string,
  candidates: Omit<Window, "score" | "reason">[],
): Promise<Map<number, { score: number; reason: string }>> {
  if (!candidates.length) {
    return new Map();
  }
  const promptCandidates = candidates.map((clip) => ({
    index: clip.index,
    start: clip.start,
    end: clip.end,
    duration: clip.duration,
    text: clip.text.slice(0, 1600),
  }));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.YOUTUBE_SCORE_MODEL || "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Score each clip from 0-100 for potential viral/attention/informative value, and give a very short reason. " +
            "Prioritize hooks, unique moments, conflict, payoff, and concise language. Return strict JSON: {\"clips\":[{\"index\":0,\"score\":82,\"reason\":\"...\"}]}",
        },
        {
          role: "user",
          content: JSON.stringify({
            criteria: "viral, attentive, informative clip strength (short-form, social-ready)",
            clips: promptCandidates,
          }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI scoring failed: ${response.status} ${response.statusText} ${text}`);
  }

  const payload = await response.json();
  const raw = payload?.choices?.[0]?.message?.content;
  if (!raw) throw new Error("AI scoring returned no content.");
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(parsed?.clips)) throw new Error("AI scoring response missing clips array.");

  const parsedMap = new Map<number, { score: number; reason: string }>();
  for (const item of parsed.clips) {
    if (!item || typeof item.index !== "number") continue;
    const score = Number(item.score);
    if (!Number.isFinite(score)) continue;
    parsedMap.set(item.index, {
      score: Math.max(0, Math.min(100, Math.round(score))),
      reason: typeof item.reason === "string" && item.reason.trim().length ? item.reason.trim() : "AI-selected candidate",
    });
  }
  return parsedMap;
}

export async function POST(req: NextRequest) {
  try {
    const access = await requireAllowedApiUser();
    if (!access.ok) {
      return access.response;
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY. Add it to .env.local and restart dev server." },
        { status: 500 },
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body. Send JSON with url." }, { status: 400 });
    }

    const sourceUrl = `${body.youtubeUrl || body.sourceUrl || body.url || ""}`.trim();
    const sourceKind = detectSourceKind(sourceUrl);
    const clipDuration = clipDurationSafe(body.clipDuration as string | undefined);
    const maxClips = maxClipsSafe(body.maxClips as string | undefined);
    const overlap = 8;
    const useAiScoring = parseBoolean(body.useAiScoring);
    const language = normalizeInputLanguage(body.language);

    if (!sourceUrl || !/^https?:\/\/.+/i.test(sourceUrl)) {
      return NextResponse.json({ error: "A valid YouTube or Kick URL is required." }, { status: 400 });
    }

    const ffmpegCommand = (() => {
      const candidates = getBinaryCandidates();
      return candidates[0];
    })();
    if (!ffmpegCommand) {
      return NextResponse.json(
        { error: "FFmpeg is not installed. Install ffmpeg or set FFMPEG_PATH." },
        { status: 500 },
      );
    }

    const ytdlpCandidates = await getYtDlpCandidates();
    const ytdlpCookieFile = await resolveYtDlpCookieFile();
    const ytdlpCommand = ytdlpCandidates[0];
    if (!ytdlpCommand) {
      return NextResponse.json(
        {
          error:
            "yt-dlp is not installed on this machine. Install it and re-run. Recommended: `brew install yt-dlp` or `python3 -m pip install -U yt-dlp`.",
        },
        { status: 500 },
      );
    }

    const workdir = path.join(os.tmpdir(), `spotlight-youtube-${randomUUID()}`);
    await fs.mkdir(workdir, { recursive: true });
    const sourceOutputTemplate = path.join(workdir, "source.%(ext)s");
    const ytdlpFfmpegLocation = getYtDlpFfmpegLocation();
    const formatPref =
      process.env.YOUTUBE_FORMAT ||
      (sourceKind === "youtube" ? "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" : "bestvideo+bestaudio/best");

    try {
      const downloadResult = await runYtDlpWithFallback(
        ytdlpCandidates,
        formatPref,
        sourceOutputTemplate,
        sourceUrl,
        sourceKind,
        ytdlpFfmpegLocation,
        ytdlpCookieFile,
      );
      if (!downloadResult.ok) {
        const failedCommand = `${ytdlpCommand.command}${(ytdlpCommand.args || []).join(" ") ? " " + ytdlpCommand.args?.join(" ") : ""}`;
        const suggestions: string[] = [];
        if ((downloadResult as { saw403?: boolean }).saw403 && sourceKind === "youtube") {
          suggestions.push("YouTube blocked this request (403). Add cookies: set YTDLP_COOKIES_B64 in Vercel from a YouTube cookie export.");
          suggestions.push("Also try setting YTDLP_USER_AGENT to a recent Chrome user agent.");
          suggestions.push("Optional: set YTDLP_PYTHON to a Python 3.10+ binary (python3.12 recommended).");
        } else if (sourceKind === "kick") {
          suggestions.push("For private/protected Kick VODs, set YTDLP_COOKIE_FILE from your browser session.");
          suggestions.push("For live channels, use a replay/VOD URL for best results.");
        }
        if (!ytdlpFfmpegLocation) {
          suggestions.push("FFmpeg path is missing for yt-dlp. Set FFMPEG_PATH in .env.local and restart `npm run dev`.");
        }
        const details =
          `${downloadResult.error instanceof Error ? downloadResult.error.message : "Failed to fetch source content."} ${
            (downloadResult.error as { code?: string })?.code === "ENOENT" ? `${failedCommand} command not found.` : ""
          }` +
          `${(downloadResult as { attempted?: string[] }).attempted?.length ? `\nAttempts: ${(downloadResult as { attempted?: string[] }).attempted?.join(" | ")}` : ""}` +
          `${suggestions.length ? `\nTips: ${suggestions.join(" | ")}` : ""}`;
        return NextResponse.json({ error: "Failed to download source URL.", details }, { status: 500 });
      }

      const sourceFiles = (await fs.readdir(workdir)).filter((name) => /^source\./.test(name));
      if (!sourceFiles.length) {
        return NextResponse.json({ error: "Could not find downloaded source file." }, { status: 500 });
      }
      const sourcePath = path.join(workdir, sourceFiles[0]);
      const sourceStats = await fs.stat(sourcePath);
      if (!sourceStats.size) {
        return NextResponse.json({ error: "Downloaded file is empty." }, { status: 500 });
      }
      let duration = await getDurationSeconds(ffmpegCommand, sourcePath);
      if (!duration || !Number.isFinite(duration)) {
        const normalized = await normalizeSourceForProbe(ffmpegCommand, sourcePath, workdir);
        if (normalized) {
          const normalizedDuration = await getDurationSeconds(ffmpegCommand, normalized);
          if (normalizedDuration && Number.isFinite(normalizedDuration)) {
            duration = normalizedDuration;
          }
        }
      }
      if (!duration || !Number.isFinite(duration)) {
        duration = (await getDurationFromSourceMetadata(sourceUrl, ytdlpCandidates, ytdlpCookieFile)) || 0;
      }

      const audioPath = path.join(workdir, "audio_for_transcript.m4a");
      const extractResult = await runWithFallback(() => toCommandCandidates([ffmpegCommand]), [
        "-y",
        "-i",
        sourcePath,
        "-vn",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        audioPath,
      ]);
      if (!extractResult.ok) {
        const message = `${(extractResult.error as Error)?.message || "Audio extraction failed."} ${
          (extractResult.error as { code?: string })?.code === "ENOENT" ? "FFmpeg not available." : ""
        }`;
        return NextResponse.json({ error: "Could not extract audio for transcription.", details: message }, { status: 500 });
      }

      const transcripts = await transcribeAudio(audioPath, apiKey, language);
      if (!transcripts.ok) {
        return NextResponse.json(
          { error: "Transcription failed.", details: transcripts.error },
          { status: 502 },
        );
      }

      if (!transcripts.segments.length) {
        return NextResponse.json({ error: "No transcript text was extracted from this clip." }, { status: 400 });
      }

      const windows = buildWindows(transcripts.segments, clipDuration, overlap, duration);
      if (!windows.length) {
        return NextResponse.json({ error: "No 30-second segments found in this video transcript." }, { status: 400 });
      }

      const baseWindows = rankWindowsByLocalHeuristic(windows);
      const limitedForReview = Math.max(1, Math.min(24, windows.length));
      let ranked = baseWindows.slice(0, limitedForReview);
      if (useAiScoring) {
        const candidatesForAi = ranked.map((item) => ({
          index: item.index,
          start: item.start,
          end: item.end,
          duration: item.duration,
          text: item.text,
        }));
        try {
          const aiScores = await askGptToScore(apiKey, candidatesForAi);
          ranked = ranked
            .map((item) => {
              const ai = aiScores.get(item.index);
              if (!ai) return item;
              return {
                ...item,
                score: ai.score,
                reason: ai.reason,
              };
            })
            .sort((a, b) => b.score - a.score);
        } catch {
          // keep local scoring if AI call fails
        }
      }

      const selected = ranked.slice(0, maxClips).map((item, rankedIndex) => ({
        ...item,
        index: rankedIndex,
      }));

      const jobId = registerYoutubeJob({
        sourceUrl,
        sourcePath,
        workdir,
        clipDuration,
        maxClips,
        duration,
        clips: selected,
      });

      return NextResponse.json({
        jobId,
        clipDuration,
        maxClips: selected.length,
        duration,
        sourceUrl,
        sourceKind,
        clips: selected,
      });
    } catch (error) {
      await fs.rm(workdir, { recursive: true, force: true });
      const message = error instanceof Error ? error.message : "Failed to analyze source URL.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process URL request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const mode = `${params.get("mode") || ""}`.trim().toLowerCase();
    if (mode !== "estimate") {
      return NextResponse.json({ error: "GET is only supported for estimate mode." }, { status: 405 });
    }

    const sourceUrl = `${params.get("youtubeUrl") || params.get("url") || ""}`.trim();
    const clipDuration = Number(params.get("clipDuration") || 30);
    const maxClips = Number(params.get("maxClips") || 8);

    if (!sourceUrl || !/^https?:\/\/.+/i.test(sourceUrl)) {
      return NextResponse.json({ error: "A valid YouTube or Kick URL is required." }, { status: 400 });
    }

    const ytdlpCandidates = await getYtDlpCandidates();
    const ytdlpCookieFile = await resolveYtDlpCookieFile();
    if (!ytdlpCandidates.length) {
      return NextResponse.json(
        {
          error:
            "yt-dlp is not installed on this machine. Install it and re-run. Recommended: `brew install yt-dlp` or `python3 -m pip install -U yt-dlp`.",
        },
        { status: 500 },
      );
    }

    const duration = await getDurationFromSourceMetadata(sourceUrl, ytdlpCandidates, ytdlpCookieFile);

    const estimatedTotalSeconds = estimateYoutubeTotalSeconds(duration, clipDuration, maxClips);

    return NextResponse.json({
      mode: "estimate",
      sourceUrl,
      durationSeconds: duration,
      estimatedTotalSeconds,
      maxClips: Math.min(Math.max(Math.round(Number.isFinite(maxClips) ? maxClips : 8), 1), 20),
      clipDuration: Math.min(Math.max(Number.isFinite(clipDuration) ? clipDuration : 30, 10), 120),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to estimate analysis duration.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
