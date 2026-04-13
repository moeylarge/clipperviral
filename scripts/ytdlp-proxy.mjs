#!/usr/bin/env node

import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || "0.0.0.0";
const TOKEN = (process.env.YTDLP_PROXY_TOKEN || "").trim();
const YTDLP_BIN = (process.env.YTDLP_BIN || "yt-dlp").trim();
const FFMPEG_PATH = (process.env.FFMPEG_PATH || "").trim();
const USER_AGENT =
  (process.env.YTDLP_USER_AGENT || "").trim() ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const COOKIE_FILE = (process.env.YTDLP_COOKIE_FILE || "").trim();

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

function buildYtDlpArgs({ sourceUrl, sourceKind, outputTemplate, formatPref, audioOnly }) {
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
    const language = `${payload.language || "en"}`.trim();
    const formatPref = `${payload.formatPref || ""}`.trim();
    const workdir = path.join(tmpdir(), `ytdlp-proxy-${randomUUID()}`);
    await mkdir(workdir, { recursive: true });
    const outputTemplate = transcriptOnly
      ? path.join(workdir, "subtitle.%(ext)s")
      : path.join(workdir, "source.%(ext)s");
    const args = transcriptOnly
      ? buildTranscriptArgs({ sourceUrl, sourceKind, outputTemplate, language })
      : buildYtDlpArgs({ sourceUrl, sourceKind, outputTemplate, formatPref, audioOnly });
    const result = await runCommand(YTDLP_BIN, args);

    if (!result.ok) {
      console.error("[ytdlp-proxy] yt-dlp failed", {
        sourceUrl,
        sourceKind,
        audioOnly,
        transcriptOnly,
        code: result.code,
        timedOut: result.timedOut,
        stderr: (result.stderr || "").slice(0, 800),
      });
      await rm(workdir, { recursive: true, force: true });
      return sendJson(res, 502, {
        error: "yt-dlp failed.",
        details: result.timedOut
          ? "yt-dlp timed out."
          : result.stderr || result.stdout || `exit code ${result.code}`,
      });
    }

    if (transcriptOnly) {
      const subtitleFiles = (await readdir(workdir)).filter((name) => name.toLowerCase().endsWith(".vtt"));
      if (!subtitleFiles.length) {
        await rm(workdir, { recursive: true, force: true });
        return sendJson(res, 502, { error: "No subtitles were generated by yt-dlp." });
      }
      const subtitlePath = path.join(workdir, subtitleFiles[0]);
      const subtitleText = await readFile(subtitlePath, "utf8");
      const segments = parseVttSegments(subtitleText);
      const text = segments.map((s) => s.text).join(" ").trim();
      await rm(workdir, { recursive: true, force: true });
      return sendJson(res, 200, { text, segments });
    }

    const files = (await readdir(workdir)).filter((name) => name.startsWith("source."));
    if (!files.length) {
      await rm(workdir, { recursive: true, force: true });
      return sendJson(res, 502, { error: "yt-dlp finished but source file was not found." });
    }

    const sourceFile = path.join(workdir, files[0]);
    const fileStats = await stat(sourceFile);
    if (!fileStats.size) {
      await rm(workdir, { recursive: true, force: true });
      return sendJson(res, 502, { error: "Downloaded file is empty." });
    }

    res.statusCode = 200;
    res.setHeader("content-type", contentTypeForExtension(sourceFile));
    res.setHeader("content-length", String(fileStats.size));
    res.setHeader("x-ytdlp-source", sourceKind);

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
