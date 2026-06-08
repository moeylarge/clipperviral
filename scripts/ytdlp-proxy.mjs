#!/usr/bin/env node

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const TOKEN = (process.env.YTDLP_PROXY_TOKEN || "").trim();
const YTDLP_BIN = (process.env.YTDLP_BIN || "yt-dlp").trim();
const PYTHON_BIN = (process.env.PYTHON_BIN || "python3").trim();
const USER_AGENT =
  (process.env.YTDLP_USER_AGENT || "").trim() ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const COOKIE_FILE_ENV = (process.env.YTDLP_COOKIE_FILE || "").trim();
const COOKIE_PAYLOAD = (process.env.YTDLP_COOKIES_B64 || process.env.YTDLP_COOKIES || "").trim();

function looksLikeNetscapeCookieText(text) {
  return text.includes("# Netscape HTTP Cookie File") || text.split("\n").some((line) => line.split("\t").length >= 7);
}

function normalizeCookieText(text) {
  return `${text || ""}`
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\r\n/g, "\n")
    .trim();
}

async function resolveCookieFile() {
  if (COOKIE_FILE_ENV) return COOKIE_FILE_ENV;
  if (!COOKIE_PAYLOAD) return "";
  let text = normalizeCookieText(COOKIE_PAYLOAD);
  try {
    const decoded = normalizeCookieText(Buffer.from(COOKIE_PAYLOAD, "base64").toString("utf8"));
    if (looksLikeNetscapeCookieText(decoded)) text = decoded;
  } catch {}
  if (!looksLikeNetscapeCookieText(text)) return "";
  const file = path.join(tmpdir(), "clipperviral-ytdlp-cookies.txt");
  await writeFile(file, text.endsWith("\n") ? text : `${text}\n`, "utf8");
  return file;
}

const COOKIE_FILE = await resolveCookieFile();

function resolveBundledFfmpegPath() {
  const explicit = (process.env.FFMPEG_PATH || "").trim();
  const candidates = [
    explicit,
    path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    path.join(process.cwd(), "node_modules", "@ffmpeg-installer", `${process.platform}-${process.arch}`, "ffmpeg"),
    path.join(process.cwd(), "node_modules", "@ffmpeg-installer", "darwin-arm64", "ffmpeg"),
    path.join(process.cwd(), "node_modules", "@ffmpeg-installer", "linux-x64", "ffmpeg"),
    "ffmpeg",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === "ffmpeg" || existsSync(candidate)) return candidate;
  }
  return "";
}

const FFMPEG_PATH = resolveBundledFfmpegPath();
const MIN_VIDEO_BYTES = Number(process.env.YTDLP_MIN_VIDEO_BYTES || 64 * 1024);

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(payload));
}

function parseAuthToken(req) {
  const bearer = req.headers.authorization || "";
  if (typeof bearer === "string" && bearer.toLowerCase().startsWith("bearer ")) {
    return bearer.slice(7).trim();
  }
  const apiKey = req.headers["x-api-key"];
  return typeof apiKey === "string" ? apiKey.trim() : "";
}

function normalizeSourceKind(value) {
  const kind = `${value || ""}`.toLowerCase();
  if (kind === "youtube" || kind === "kick") return kind;
  return "generic";
}

function detectSourceKind(url) {
  const value = `${url || ""}`.toLowerCase();
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "youtube";
  if (value.includes("kick.com")) return "kick";
  return "generic";
}

function parseKickVodUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "kick.com" && parsed.hostname !== "www.kick.com") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 3 && parts[1] === "videos") {
      return {
        channelSlug: parts[0],
        videoId: parts[2],
      };
    }
  } catch {}
  return null;
}

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function runCommand(command, args, timeoutMs = 15 * 60 * 1000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        ok: !timedOut && code === 0,
        code,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}

function parseDurationSeconds(ffmpegOutput) {
  const match = `${ffmpegOutput || ""}`.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) ? total : null;
}

async function validateMediaFile(filePath, { audioOnly = false } = {}) {
  const fileStats = await stat(filePath);
  if (!fileStats.size) {
    return { ok: false, size: fileStats.size, reason: "Downloaded file is empty." };
  }

  if (!audioOnly && fileStats.size < MIN_VIDEO_BYTES) {
    return {
      ok: false,
      size: fileStats.size,
      reason: `Downloaded clip is too small to be valid media (${fileStats.size} bytes).`,
    };
  }

  if (!FFMPEG_PATH || audioOnly) {
    return { ok: true, size: fileStats.size };
  }

  const probe = await runCommand(FFMPEG_PATH, ["-hide_banner", "-i", filePath], 15_000);
  const output = `${probe.stderr || ""}\n${probe.stdout || ""}`;
  const hasVideoStream = /Stream\s+#\S+:\s*Video:/i.test(output);
  if (!hasVideoStream) {
    return {
      ok: false,
      size: fileStats.size,
      reason: "Downloaded clip does not contain a video stream.",
      details: output.slice(0, 800),
    };
  }

  const duration = parseDurationSeconds(output);
  if (duration != null && duration <= 0.1) {
    return {
      ok: false,
      size: fileStats.size,
      reason: `Downloaded clip has invalid duration (${duration}s).`,
      details: output.slice(0, 800),
    };
  }

  return { ok: true, size: fileStats.size, duration };
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }
  return response.text();
}

function parseHlsMediaPlaylist(playlistUrl, playlistText) {
  const baseUrl = new URL(playlistUrl);
  const lines = `${playlistText || ""}`.replace(/\r\n/g, "\n").split("\n");
  const segments = [];
  let elapsed = 0;
  let programDateTime = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.startsWith("#EXT-X-PROGRAM-DATE-TIME:")) {
      programDateTime = line;
      continue;
    }

    if (!line.startsWith("#EXTINF:")) continue;
    const duration = Number(line.slice("#EXTINF:".length).split(",", 1)[0]);
    const uri = (lines[index + 1] || "").trim();
    if (!Number.isFinite(duration) || duration <= 0 || !uri || uri.startsWith("#")) continue;

    segments.push({
      start: elapsed,
      duration,
      extinf: line,
      programDateTime,
      uri: new URL(uri, baseUrl).toString(),
    });
    elapsed += duration;
    index += 1;
  }

  return { segments, duration: elapsed };
}

function chooseHlsVariant(playlistUrl, playlistText, maxHeight = 720) {
  const baseUrl = new URL(playlistUrl);
  const lines = `${playlistText || ""}`.replace(/\r\n/g, "\n").split("\n");
  const variants = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;

    const uri = (lines[index + 1] || "").trim();
    if (!uri || uri.startsWith("#")) continue;
    const resolutionMatch = line.match(/RESOLUTION=(\d+)x(\d+)/i);
    const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/i);
    const width = resolutionMatch ? Number(resolutionMatch[1]) : 0;
    const height = resolutionMatch ? Number(resolutionMatch[2]) : 0;
    const bandwidth = bandwidthMatch ? Number(bandwidthMatch[1]) : 0;
    variants.push({
      uri: new URL(uri, baseUrl).toString(),
      width,
      height,
      bandwidth,
    });
  }

  if (!variants.length) return "";
  const withinLimit = variants.filter((variant) => variant.height > 0 && variant.height <= maxHeight);
  const candidates = withinLimit.length ? withinLimit : variants;
  candidates.sort((a, b) => (b.height - a.height) || (b.bandwidth - a.bandwidth));
  return candidates[0].uri;
}

async function renderKickHlsWindow({ playlistUrl, workdir, clipStart, clipDuration }) {
  if (!FFMPEG_PATH) {
    return { ok: false, reason: "ffmpeg is not available for Kick HLS window rendering." };
  }

  const start = Number(clipStart);
  const duration = Number(clipDuration);
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration <= 0) {
    return { ok: false, reason: "Kick HLS window rendering requires a valid clipStart and clipDuration." };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(playlistUrl);
  } catch {
    return { ok: false, reason: "Kick HLS window rendering requires a valid playlist URL." };
  }
  if (!parsedUrl.pathname.toLowerCase().endsWith(".m3u8")) {
    return { ok: false, reason: "Kick HLS window rendering requires a direct m3u8 playlist URL." };
  }

  let mediaPlaylistUrl = parsedUrl.toString();
  let playlistText = await fetchText(mediaPlaylistUrl);
  if (!playlistText.includes("#EXTINF")) {
    const variantUri = chooseHlsVariant(mediaPlaylistUrl, playlistText);
    if (!variantUri) return { ok: false, reason: "Kick HLS master playlist did not contain a media playlist." };
    mediaPlaylistUrl = variantUri;
    playlistText = await fetchText(mediaPlaylistUrl);
  }

  const parsed = parseHlsMediaPlaylist(mediaPlaylistUrl, playlistText);
  if (!parsed.segments.length) {
    return { ok: false, reason: "Kick HLS playlist did not contain media segments." };
  }
  if (start >= parsed.duration) {
    return {
      ok: false,
      reason: `Clip start ${start}s is outside the Kick VOD duration ${parsed.duration.toFixed(3)}s.`,
    };
  }

  const padding = 20;
  const selected = parsed.segments.filter((segment) => {
    const segmentEnd = segment.start + segment.duration;
    return segmentEnd >= start - padding && segment.start <= start + duration + padding;
  });
  if (!selected.length) {
    return { ok: false, reason: "No Kick HLS segments overlap the requested clip window." };
  }

  const innerSeek = Math.max(0, start - selected[0].start);
  const windowPlaylist = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:13",
    "#EXT-X-MEDIA-SEQUENCE:0",
  ];
  for (const segment of selected) {
    if (segment.programDateTime) windowPlaylist.push(segment.programDateTime);
    windowPlaylist.push(segment.extinf, segment.uri);
  }
  windowPlaylist.push("#EXT-X-ENDLIST");

  const windowPlaylistPath = path.join(workdir, "kick-window.m3u8");
  const outputPath = path.join(workdir, "source-kick-window.mp4");
  await writeFile(windowPlaylistPath, `${windowPlaylist.join("\n")}\n`, "utf8");

  const result = await runCommand(
    FFMPEG_PATH,
    [
      "-y",
      "-hide_banner",
      "-protocol_whitelist",
      "file,http,https,tcp,tls,crypto",
      "-ss",
      String(innerSeek),
      "-i",
      windowPlaylistPath,
      "-t",
      String(duration),
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    180_000,
  );
  if (!result.ok) {
    return {
      ok: false,
      reason: result.timedOut
        ? "Kick HLS window render timed out."
        : result.stderr || result.stdout || `ffmpeg exited with ${result.code}`,
    };
  }

  return { ok: true, outputPath, segmentCount: selected.length, innerSeek, duration: parsed.duration };
}

function uniqueAttempts(attempts) {
  const seen = new Set();
  return attempts.filter((attempt) => {
    const key = `${attempt.label}:${attempt.formatPref || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildDownloadAttempts({ sourceKind, formatPref, audioOnly, transcriptOnly }) {
  if (transcriptOnly || audioOnly) {
    return [{ label: transcriptOnly ? "transcript" : "audio", formatPref }];
  }

  const attempts = [{ label: "primary", formatPref }];
  if (sourceKind === "kick") {
    attempts.push(
      { label: "kick-best", formatPref: "best" },
      { label: "kick-720p", formatPref: "best[height<=720]/best" },
      { label: "kick-540p", formatPref: "best[height<=540]/best" },
      { label: "kick-360p", formatPref: "best[height<=360]/best" },
    );
  }
  return uniqueAttempts(attempts);
}

const KICK_VOD_RESOLVER_SCRIPT = String.raw`
import http.cookiejar as cj
import json
import sys
import urllib.parse

from curl_cffi import requests

channel_slug, video_id, cookie_file, referer, user_agent = sys.argv[1:6]
cookies = {}
if cookie_file:
    try:
        jar = cj.MozillaCookieJar(cookie_file)
        jar.load(ignore_discard=True, ignore_expires=True)
        cookies = {c.name: c.value for c in jar if "kick.com" in c.domain}
    except Exception:
        cookies = {}

headers = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "referer": referer,
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": user_agent,
}
xsrf = urllib.parse.unquote(cookies.get("XSRF-TOKEN", ""))
if xsrf:
    headers["x-xsrf-token"] = xsrf
session_token = urllib.parse.unquote(cookies.get("session_token", ""))
if session_token:
    headers["authorization"] = f"Bearer {session_token}"

url = f"https://kick.com/api/v2/channels/{channel_slug}/videos"
response = requests.get(url, headers=headers, cookies=cookies, impersonate="chrome136", timeout=25)
body = response.text
if response.status_code != 200:
    print(json.dumps({
        "ok": False,
        "status": response.status_code,
        "error": body[:500],
    }))
    sys.exit(0)

try:
    videos = response.json()
except Exception:
    print(json.dumps({"ok": False, "status": response.status_code, "error": "Kick videos response was not JSON."}))
    sys.exit(0)

match = None
for item in videos if isinstance(videos, list) else []:
    video = item.get("video") if isinstance(item, dict) else None
    if isinstance(video, dict) and video.get("uuid") == video_id:
        match = item
        break

if not match:
    print(json.dumps({
        "ok": False,
        "status": response.status_code,
        "error": f"Kick VOD {video_id} was not found in the latest channel videos.",
        "count": len(videos) if isinstance(videos, list) else None,
    }))
    sys.exit(0)

video = match.get("video") if isinstance(match.get("video"), dict) else {}
duration_ms = match.get("duration")
try:
    duration = float(duration_ms) / 1000 if duration_ms is not None else None
except Exception:
    duration = None

print(json.dumps({
    "ok": True,
    "id": video.get("uuid") or video_id,
    "title": match.get("session_title"),
    "duration": duration,
    "source": match.get("source"),
    "status": video.get("status"),
    "channel": channel_slug,
}))
`;

async function resolveKickVodFromChannelVideos(sourceUrl, sourceKind) {
  if (sourceKind !== "kick") return null;
  const parsed = parseKickVodUrl(sourceUrl);
  if (!parsed) return null;

  const result = await runCommand(
    PYTHON_BIN,
    [
      "-c",
      KICK_VOD_RESOLVER_SCRIPT,
      parsed.channelSlug,
      parsed.videoId,
      COOKIE_FILE,
      sourceUrl,
      USER_AGENT,
    ],
    45_000,
  );

  if (!result.ok) {
    return {
      ok: false,
      error: result.stderr || result.stdout || `Kick resolver exited with ${result.code}`,
    };
  }

  try {
    const payload = JSON.parse(result.stdout || "{}");
    if (!payload.ok || !payload.source) {
      return {
        ok: false,
        error: payload.error || "Kick VOD source was not found.",
        details: payload,
      };
    }
    return { ok: true, ...payload };
  } catch {
    return {
      ok: false,
      error: "Kick resolver response was not valid JSON.",
      details: (result.stdout || "").slice(0, 500),
    };
  }
}

function parseBoolean(value) {
  return value === true || value === 1 || `${value || ""}`.toLowerCase() === "true";
}

function parseVttTimestamp(value) {
  const token = `${value || ""}`.trim();
  const match = token.match(/^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/);
  if (!match) return null;
  const h = Number(match[1] || 0);
  const m = Number(match[2] || 0);
  const s = Number(match[3] || 0);
  const ms = Number(match[4] || 0);
  const total = h * 3600 + m * 60 + s + ms / 1000;
  return Number.isFinite(total) ? total : null;
}

function stripCueMarkup(text) {
  return `${text || ""}`
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseVttSegments(vttText) {
  const lines = `${vttText || ""}`.replace(/\r\n/g, "\n").split("\n");
  const segments = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line || line === "WEBVTT") {
      i += 1;
      continue;
    }

    const timestampLine = line.includes("-->") ? line : (lines[i + 1] || "").trim();
    if (!timestampLine.includes("-->")) {
      i += 1;
      continue;
    }

    const [rawStart, rawEndPart] = timestampLine.split("-->");
    const rawEnd = (rawEndPart || "").trim().split(/\s+/)[0];
    const start = parseVttTimestamp(rawStart.trim());
    const end = parseVttTimestamp(rawEnd);
    i += line.includes("-->") ? 1 : 2;

    const cueLines = [];
    while (i < lines.length && lines[i].trim()) {
      cueLines.push(lines[i]);
      i += 1;
    }

    const text = stripCueMarkup(cueLines.join(" "));
    if (start != null && end != null && text.length) {
      const last = segments[segments.length - 1];
      if (last && last.text === text && Math.abs(last.end - start) < 0.15) {
        last.end = end;
      } else {
        segments.push({ start, end, text });
      }
    }
  }
  return segments;
}

function buildMetadataArgs({ sourceUrl, sourceKind }) {
  const args = ["--dump-single-json", "--skip-download", "--no-playlist", "--no-warnings", "--user-agent", USER_AGENT];
  if (COOKIE_FILE) {
    args.push("--cookies", COOKIE_FILE);
  }
  if (sourceKind === "youtube") {
    args.push("--geo-bypass");
    args.push("--extractor-args", "youtube:player_client=android");
  }
  args.push(sourceUrl);
  return args;
}

function pickCaptionTrack(metadata, language) {
  const preferred = `${language || "en"}`.toLowerCase();
  const pools = [metadata?.subtitles, metadata?.automatic_captions].filter(Boolean);
  const keysToTry = [];
  for (const pool of pools) {
    const keys = Object.keys(pool || {});
    keysToTry.push(...keys.filter((key) => key.toLowerCase() === preferred));
    keysToTry.push(...keys.filter((key) => key.toLowerCase().startsWith(`${preferred}-`)));
    keysToTry.push(...keys.filter((key) => key.toLowerCase().startsWith("en")));
  }

  for (const pool of pools) {
    for (const key of keysToTry) {
      const tracks = Array.isArray(pool?.[key]) ? pool[key] : [];
      const vtt = tracks.find((track) => track?.url && `${track.ext || ""}`.toLowerCase() === "vtt");
      if (vtt?.url) return vtt.url;
      const json3 = tracks.find((track) => track?.url && `${track.ext || ""}`.toLowerCase() === "json3");
      if (json3?.url) return json3.url;
      const any = tracks.find((track) => track?.url);
      if (any?.url) return any.url;
    }
  }
  return null;
}

function parseJson3Segments(payload) {
  const events = Array.isArray(payload?.events) ? payload.events : [];
  return events
    .map((event) => {
      const start = Number(event.tStartMs || 0) / 1000;
      const duration = Number(event.dDurationMs || 0) / 1000;
      const text = Array.isArray(event.segs)
        ? event.segs.map((seg) => `${seg.utf8 || ""}`).join("")
        : "";
      return {
        start,
        end: start + Math.max(duration, 0.1),
        text: stripCueMarkup(text),
      };
    })
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.text.length > 0);
}

async function fetchTranscriptFromMetadata({ sourceUrl, sourceKind, language }) {
  const metadataResult = await runCommand(YTDLP_BIN, buildMetadataArgs({ sourceUrl, sourceKind }));
  if (!metadataResult.ok) {
    return {
      ok: false,
      error: metadataResult.stderr || metadataResult.stdout || "Could not read caption metadata.",
    };
  }

  let metadata;
  try {
    metadata = JSON.parse(metadataResult.stdout);
  } catch {
    return { ok: false, error: "Caption metadata was not valid JSON." };
  }

  const captionUrl = pickCaptionTrack(metadata, language);
  if (!captionUrl) {
    return { ok: false, error: "No caption tracks found in YouTube metadata." };
  }

  const response = await fetch(captionUrl, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) {
    return { ok: false, error: `Caption track fetch failed: ${response.status} ${response.statusText}` };
  }
  const contentType = response.headers.get("content-type") || "";
  const body = await response.text();
  let segments = [];
  if (contentType.includes("json") || body.trim().startsWith("{")) {
    try {
      segments = parseJson3Segments(JSON.parse(body));
    } catch {
      segments = [];
    }
  } else {
    segments = parseVttSegments(body);
  }
  const text = segments.map((segment) => segment.text).join(" ").trim();
  return segments.length
    ? { ok: true, text, segments }
    : { ok: false, error: "Caption track contained no parseable text." };
}

function buildYtDlpArgs({ sourceUrl, sourceKind, outputTemplate, formatPref, audioOnly, clipStart, clipDuration }) {
  const args = [
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
    "--user-agent",
    USER_AGENT,
    "-o",
    outputTemplate,
  ];

  if (FFMPEG_PATH) {
    args.push("--ffmpeg-location", FFMPEG_PATH);
  }
  if (COOKIE_FILE) {
    args.push("--cookies", COOKIE_FILE);
  }

  if (!audioOnly) {
    args.push("--merge-output-format", "mp4");
  }

  if (sourceKind === "youtube") {
    args.push("--geo-bypass");
    args.push(
      "-f",
      audioOnly
        ? "worstaudio[abr<=64]/worstaudio/worst"
        : formatPref || "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
    );
    args.push("--extractor-args", "youtube:player_client=android");
  } else {
    args.push("-f", audioOnly ? "worstaudio/worst" : formatPref || "bestvideo+bestaudio/best");
  }

  if (audioOnly && FFMPEG_PATH) {
    args.push("--extract-audio", "--audio-format", "m4a", "--postprocessor-args", "ffmpeg:-ar 16000 -ac 1 -b:a 24k");
  }

  const start = Number(clipStart);
  const duration = Number(clipDuration);
  if (!audioOnly && FFMPEG_PATH && Number.isFinite(start) && start >= 0 && Number.isFinite(duration) && duration > 0) {
    const end = start + duration;
    args.push("--download-sections", `*${start}-${end}`);
    if (sourceKind !== "kick" && !/\/\/(?:www\.)?kick\.com\//i.test(sourceUrl)) {
      args.push("--force-keyframes-at-cuts");
    }
  }

  args.push(sourceUrl);
  return args;
}

function buildTranscriptArgs({ sourceUrl, sourceKind, outputTemplate, language }) {
  const lang = `${language || ""}`.trim().toLowerCase() || "en";
  const langSpec = `${lang}.*,${lang},en.*,en`;
  const args = [
    "--skip-download",
    "--no-playlist",
    "--no-warnings",
    "--user-agent",
    USER_AGENT,
    "--write-auto-subs",
    "--write-subs",
    "--sub-langs",
    langSpec,
    "--sub-format",
    "vtt",
    "-o",
    outputTemplate,
  ];

  if (COOKIE_FILE) {
    args.push("--cookies", COOKIE_FILE);
  }
  if (sourceKind === "youtube") {
    args.push("--geo-bypass");
    args.push("--extractor-args", "youtube:player_client=android");
  }
  args.push(sourceUrl);
  return args;
}

function contentTypeForExtension(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".m4a") return "audio/mp4";
  return "application/octet-stream";
}

async function tryKickHlsWindow({ sourceUrl, sourceKind, effectiveSourceUrl, workdir, clipStart, clipDuration, audioOnly, attemptFailures }) {
  if (sourceKind !== "kick" || audioOnly) return { ok: false };
  try {
    const windowRender = await renderKickHlsWindow({
      playlistUrl: effectiveSourceUrl,
      workdir,
      clipStart,
      clipDuration,
    });
    if (!windowRender.ok) {
      attemptFailures.push({ label: "kick-hls-window", details: windowRender.reason });
      return { ok: false };
    }

    const validation = await validateMediaFile(windowRender.outputPath, { audioOnly });
    if (!validation.ok) {
      attemptFailures.push({
        label: "kick-hls-window",
        details: validation.reason,
        size: validation.size,
      });
      return { ok: false };
    }

    console.error("[ytdlp-proxy] kick hls window fallback produced valid media", {
      sourceUrl,
      sourceKind,
      size: validation.size,
      duration: validation.duration,
      segmentCount: windowRender.segmentCount,
      innerSeek: windowRender.innerSeek,
    });
    return { ok: true, sourceFile: windowRender.outputPath, validMedia: validation };
  } catch (error) {
    attemptFailures.push({
      label: "kick-hls-window",
      details: error instanceof Error ? error.message : "Kick HLS window render failed.",
    });
    return { ok: false };
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/healthz") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method !== "POST" || req.url !== "/download") {
      return sendJson(res, 404, { error: "Not found" });
    }

    if (TOKEN) {
      const presented = parseAuthToken(req);
      if (!presented || presented !== TOKEN) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }
    }

    const rawBody = await collectRequestBody(req);
    let payload = {};
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return sendJson(res, 400, { error: "Invalid JSON body" });
    }

    const sourceUrl = `${payload.sourceUrl || payload.url || ""}`.trim();
    if (!/^https?:\/\/.+/i.test(sourceUrl)) {
      return sendJson(res, 400, { error: "A valid sourceUrl is required." });
    }

    const sourceKind = normalizeSourceKind(payload.sourceKind || detectSourceKind(sourceUrl));
    const audioOnly = parseBoolean(payload.audioOnly);
    const transcriptOnly = parseBoolean(payload.transcriptOnly);
    const metadataOnly = parseBoolean(payload.metadataOnly);
    const language = `${payload.language || "en"}`.trim();
    const formatPref = `${payload.formatPref || ""}`.trim();
    const clipStart = Number(payload.clipStart ?? payload.start);
    const clipDuration = Number(payload.clipDuration ?? payload.duration);
    const kickVodRequest = parseKickVodUrl(sourceUrl);

    if (metadataOnly) {
      const kickVod = await resolveKickVodFromChannelVideos(sourceUrl, sourceKind);
      if (kickVod?.ok) {
        return sendJson(res, 200, {
          duration: Number.isFinite(Number(kickVod.duration)) && Number(kickVod.duration) > 0 ? Number(kickVod.duration) : null,
          title: typeof kickVod.title === "string" ? kickVod.title : null,
          id: typeof kickVod.id === "string" ? kickVod.id : null,
        });
      }
      if (kickVodRequest && kickVod && !kickVod.ok) {
        console.error("[ytdlp-proxy] kick v2 metadata failed", {
          sourceUrl,
          sourceKind,
          error: kickVod.error,
          details: kickVod.details || null,
        });
      }

      const result = await runCommand(YTDLP_BIN, buildMetadataArgs({ sourceUrl, sourceKind }), 90_000);
      if (!result.ok) {
        console.error("[ytdlp-proxy] metadata failed", {
          sourceUrl,
          sourceKind,
          code: result.code,
          timedOut: result.timedOut,
          stderr: (result.stderr || "").slice(0, 800),
        });
        return sendJson(res, 502, {
          error: "yt-dlp metadata failed.",
          details: result.timedOut
            ? "yt-dlp metadata timed out."
            : result.stderr || result.stdout || `exit code ${result.code}`,
        });
      }
      let metadata = {};
      try {
        metadata = JSON.parse(result.stdout || "{}");
      } catch {
        return sendJson(res, 502, { error: "yt-dlp metadata was not valid JSON." });
      }
      const duration = Number(metadata.duration);
      return sendJson(res, 200, {
        duration: Number.isFinite(duration) && duration > 0 ? duration : null,
        title: typeof metadata.title === "string" ? metadata.title : null,
        id: typeof metadata.id === "string" ? metadata.id : null,
      });
    }

    let effectiveSourceUrl = sourceUrl;
    let resolvedKickVod = null;
    if (kickVodRequest && sourceKind === "kick") {
      resolvedKickVod = await resolveKickVodFromChannelVideos(sourceUrl, sourceKind);
      if (!resolvedKickVod?.ok) {
        console.error("[ytdlp-proxy] kick v2 source resolve failed", {
          sourceUrl,
          sourceKind,
          error: resolvedKickVod?.error || "unknown",
          details: resolvedKickVod?.details || null,
        });
        return sendJson(res, 502, {
          error: "Kick VOD lookup failed.",
          details: resolvedKickVod?.error || "Could not resolve Kick VOD source.",
        });
      }
      effectiveSourceUrl = resolvedKickVod.source;
    }

    const workdir = path.join(tmpdir(), `ytdlp-proxy-${randomUUID()}`);
    await mkdir(workdir, { recursive: true });
    const outputTemplate = transcriptOnly
      ? path.join(workdir, "subtitle.%(ext)s")
      : path.join(workdir, "source.%(ext)s");
    const attempts = buildDownloadAttempts({ sourceKind, formatPref, audioOnly, transcriptOnly });
    let sourceFile = "";
    let validMedia = null;
    const attemptFailures = [];
    let usedAttempt = "";

    const deepKickClip = sourceKind === "kick"
      && !audioOnly
      && !transcriptOnly
      && Number.isFinite(clipStart)
      && clipStart >= Number(process.env.KICK_HLS_WINDOW_FASTPATH_START_SECONDS || 60 * 60);

    if (deepKickClip) {
      const windowAttempt = await tryKickHlsWindow({
        sourceUrl,
        sourceKind,
        effectiveSourceUrl,
        workdir,
        clipStart,
        clipDuration,
        audioOnly,
        attemptFailures,
      });
      if (windowAttempt.ok) {
        sourceFile = windowAttempt.sourceFile;
        validMedia = windowAttempt.validMedia;
        usedAttempt = "kick-hls-window";
      }
    }

    for (let attemptIndex = 0; !sourceFile && attemptIndex < attempts.length; attemptIndex += 1) {
      const attempt = attempts[attemptIndex];
      const attemptTemplate = transcriptOnly
        ? outputTemplate
        : path.join(workdir, `source-${attemptIndex}.%(ext)s`);
      const args = transcriptOnly
        ? buildTranscriptArgs({ sourceUrl: effectiveSourceUrl, sourceKind, outputTemplate: attemptTemplate, language })
        : buildYtDlpArgs({
            sourceUrl: effectiveSourceUrl,
            sourceKind,
            outputTemplate: attemptTemplate,
            formatPref: attempt.formatPref,
            audioOnly,
            clipStart,
            clipDuration,
          });
      const result = await runCommand(YTDLP_BIN, args);
      usedAttempt = attempt.label;

      if (!result.ok) {
        const details = result.timedOut
          ? "yt-dlp timed out."
          : result.stderr || result.stdout || `exit code ${result.code}`;
        attemptFailures.push({ label: attempt.label, details: details.slice(0, 800) });
        console.error("[ytdlp-proxy] yt-dlp attempt failed", {
          sourceUrl,
          sourceKind,
          audioOnly,
          transcriptOnly,
          attempt: attempt.label,
          code: result.code,
          timedOut: result.timedOut,
          stderr: (result.stderr || "").slice(0, 800),
        });
        continue;
      }

      if (transcriptOnly) {
        break;
      }

      const attemptPrefix = `source-${attemptIndex}.`;
      const files = (await readdir(workdir)).filter((name) => name.startsWith(attemptPrefix));
      if (!files.length) {
        attemptFailures.push({ label: attempt.label, details: "yt-dlp finished but source file was not found." });
        continue;
      }

      const candidateFile = path.join(workdir, files[0]);
      const validation = await validateMediaFile(candidateFile, { audioOnly });
      if (!validation.ok) {
        attemptFailures.push({
          label: attempt.label,
          details: validation.reason,
          size: validation.size,
        });
        console.error("[ytdlp-proxy] yt-dlp attempt produced invalid media", {
          sourceUrl,
          sourceKind,
          attempt: attempt.label,
          reason: validation.reason,
          size: validation.size,
        });
        continue;
      }

      sourceFile = candidateFile;
      validMedia = validation;
      break;
    }

    if (!transcriptOnly && !sourceFile && sourceKind === "kick" && !audioOnly && !deepKickClip) {
      const windowAttempt = await tryKickHlsWindow({
        sourceUrl,
        sourceKind,
        effectiveSourceUrl,
        workdir,
        clipStart,
        clipDuration,
        audioOnly,
        attemptFailures,
      });
      if (windowAttempt.ok) {
        sourceFile = windowAttempt.sourceFile;
        validMedia = windowAttempt.validMedia;
        usedAttempt = "kick-hls-window";
      }
    }

    if (!transcriptOnly && !sourceFile) {
      await rm(workdir, { recursive: true, force: true });
      return sendJson(res, 502, {
        error: "Could not produce a valid clip.",
        reason: attemptFailures[attemptFailures.length - 1]?.details || "All downloader attempts failed.",
        attempts: attemptFailures,
        hint: sourceKind === "kick"
          ? "Kick deep VOD extraction can return an empty HLS container for some offsets. Try a nearby moment or retry after the downloader refreshes."
          : "The downloader finished without a valid media stream.",
      });
    }

    if (transcriptOnly) {
      const subtitleFiles = (await readdir(workdir)).filter((name) => name.toLowerCase().endsWith(".vtt"));
      if (!subtitleFiles.length) {
        const metadataTranscript = await fetchTranscriptFromMetadata({ sourceUrl, sourceKind, language });
        await rm(workdir, { recursive: true, force: true });
        if (metadataTranscript.ok) {
          return sendJson(res, 200, {
            text: metadataTranscript.text,
            segments: metadataTranscript.segments,
          });
        }
        return sendJson(res, 502, {
          error: "No subtitles were generated by yt-dlp.",
          details: metadataTranscript.error,
        });
      }
      const subtitlePath = path.join(workdir, subtitleFiles[0]);
      const subtitleText = await readFile(subtitlePath, "utf8");
      const segments = parseVttSegments(subtitleText);
      const text = segments.map((s) => s.text).join(" ").trim();
      await rm(workdir, { recursive: true, force: true });
      return sendJson(res, 200, { text, segments });
    }

    const fileStats = validMedia || await validateMediaFile(sourceFile, { audioOnly });

    res.statusCode = 200;
    res.setHeader("content-type", contentTypeForExtension(sourceFile));
    res.setHeader("content-length", String(fileStats.size));
    res.setHeader("x-ytdlp-source", sourceKind);
    if (usedAttempt) res.setHeader("x-ytdlp-attempt", usedAttempt);
    if (resolvedKickVod?.ok) res.setHeader("x-ytdlp-kick-resolved", "v2-channel-videos");

    const stream = createReadStream(sourceFile);
    stream.pipe(res);
    stream.on("close", async () => {
      await rm(workdir, { recursive: true, force: true }).catch(() => {});
    });
    stream.on("error", async (error) => {
      console.error("stream error", error);
      await rm(workdir, { recursive: true, force: true }).catch(() => {});
    });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Internal proxy error." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`yt-dlp proxy listening on http://${HOST}:${PORT}`);
});
