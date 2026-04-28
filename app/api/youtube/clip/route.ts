import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs, constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { NextRequest, NextResponse } from "next/server";

import { getYoutubeJob, touchYoutubeJob } from "@/lib/youtube-job-store";
import { requireAllowedApiUser } from "@/lib/auth/api-access";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

const ffmpegStatic = (() => {
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


function getCandidates() {
  return [
    process.env.FFMPEG_PATH?.trim(),
    ffmpegStatic,
    "ffmpeg",
    "/usr/local/bin/ffmpeg",
    "/opt/homebrew/bin/ffmpeg",
    "/usr/bin/ffmpeg",
  ].filter((item): item is string => typeof item === "string" && item.length > 0);
}

async function runFfmpeg(args: string[]) {
  const candidates = getCandidates();
  let lastError: unknown = null;
  for (const command of candidates) {
    try {
      await execFileAsync(command, args, {
        timeout: 10 * 60 * 1000,
        maxBuffer: 20 * 1024 * 1024,
      });
      return { ok: true as const, command };
    } catch (error) {
      lastError = error;
      const code = (error as { code?: string })?.code;
      if (code === "ENOENT") {
        continue;
      }
      return { ok: false as const, command, error };
    }
  }
  return { ok: false as const, command: candidates[0] || "ffmpeg", error: lastError };
}

function filenameSafe(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function getYtDlpProxyUrl() {
  return (
    process.env.YTDLP_PROXY_URL?.trim() ||
    process.env.YTDLP_DOWNLOADER_URL?.trim() ||
    ""
  );
}

function getYtDlpProxyUrls() {
  const urls = [
    process.env.YTDLP_PROXY_URL?.trim() || "",
    process.env.YTDLP_DOWNLOADER_URL?.trim() || "",
  ].filter((value) => value.length > 0);
  return [...new Set(urls)];
}

function detectSourceKind(url: string) {
  const value = url.toLowerCase();
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "youtube";
  if (value.includes("kick.com")) return "kick";
  return "generic";
}

function getProxyFormatPref(sourceKind: string, forThumbnail = false) {
  if (sourceKind === "youtube") {
    return "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best";
  }
  if (sourceKind === "kick") {
    const configured = process.env.KICK_PROXY_FORMAT?.trim();
    if (configured) return configured;
    return forThumbnail ? "best[height<=540]/best" : "best[height<=720]/best";
  }
  return "best";
}

function parseProxyError(payload: Record<string, unknown>) {
  const error = typeof payload.error === "string" ? payload.error.trim() : "";
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const details = typeof payload.details === "string" ? payload.details.trim() : "";
  if (details && (!error || /^yt-dlp failed\.?$/i.test(error))) return details;
  const value = error || message || details;
  return value.length ? value : null;
}

async function extractThumbnailFromVideoFile(videoPath: string, outputPath: string) {
  return runFfmpeg([
    "-y",
    "-ss",
    "0.4",
    "-i",
    videoPath,
    "-frames:v",
    "1",
    "-vf",
    "scale=min(640\\,iw):-2",
    "-q:v",
    "5",
    outputPath,
  ]);
}

async function renderClipViaProxy(sourceUrl: string, start: number, duration: number) {
  const proxyUrls = getYtDlpProxyUrls();
  if (!proxyUrls.length) {
    return NextResponse.json(
      {
        error: "YouTube preview job is not available.",
        details: "Re-run Analyze URL. If this keeps happening, YTDLP_PROXY_URL must be configured and reachable for expired jobs.",
      },
      { status: 404 },
    );
  }

  const authToken = process.env.YTDLP_PROXY_TOKEN?.trim();
  const authHeader = process.env.YTDLP_PROXY_AUTH_HEADER?.trim() || "x-api-key";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "video/*,application/octet-stream,application/json",
  };
  if (authToken) {
    headers[authHeader] = authToken;
    headers.authorization = `Bearer ${authToken}`;
  }

  const sourceKind = detectSourceKind(sourceUrl);
  let response: Response | null = null;
  let networkError: string | null = null;
  for (const proxyUrl of proxyUrls) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetch(proxyUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            sourceUrl,
            sourceKind,
            formatPref: getProxyFormatPref(sourceKind, false),
            clipStart: start,
            clipDuration: duration,
          }),
          signal: AbortSignal.timeout(20_000),
        });
        break;
      } catch (error) {
        networkError = error instanceof Error ? error.message : "Unknown network error while contacting downloader.";
      }
    }
    if (response) break;
  }
  if (!response) {
    return NextResponse.json(
      {
        error: "Could not reach external downloader.",
        details: networkError || "No reachable downloader endpoint.",
      },
      { status: 502 },
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const rawText = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = rawText ? JSON.parse(rawText) as Record<string, unknown> : {};
    } catch {
      // keep text fallback below
    }
    return NextResponse.json(
      {
        error: "Could not render clip via external downloader.",
        details: parseProxyError(payload) || rawText || `${response.status} ${response.statusText}`,
      },
      { status: 502 },
    );
  }

  if (contentType.toLowerCase().includes("application/json")) {
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json(
      {
        error: "External downloader did not return a clip file.",
        details: parseProxyError(payload) || "Proxy returned JSON instead of media.",
      },
      { status: 502 },
    );
  }

  const clipBuffer = Buffer.from(await response.arrayBuffer());
  if (!clipBuffer.byteLength) {
    return NextResponse.json({ error: "External downloader returned an empty clip." }, { status: 502 });
  }
  const base = filenameSafe((sourceUrl || "stream").split("/").pop() || "clip");
  const outName = `clipperviral-${base}-${String(start).replace(".", "-")}s-${String(start + duration).replace(".", "-")}s.mp4`;
  return new NextResponse(clipBuffer, {
    headers: {
      "Content-Type": contentType || "video/mp4",
      "Content-Disposition": `attachment; filename="${outName}"`,
    },
    status: 200,
  });
}

async function renderThumbnailViaProxy(sourceUrl: string, start: number, duration: number) {
  const proxyUrls = getYtDlpProxyUrls();
  if (!proxyUrls.length) {
    return NextResponse.json(
      {
        error: "YouTube preview job is not available.",
        details: "Re-run Analyze URL. If this keeps happening, YTDLP_PROXY_URL must be configured and reachable for expired jobs.",
      },
      { status: 404 },
    );
  }

  const authToken = process.env.YTDLP_PROXY_TOKEN?.trim();
  const authHeader = process.env.YTDLP_PROXY_AUTH_HEADER?.trim() || "x-api-key";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "video/*,application/octet-stream,application/json",
  };
  if (authToken) {
    headers[authHeader] = authToken;
    headers.authorization = `Bearer ${authToken}`;
  }

  const sourceKind = detectSourceKind(sourceUrl);
  let response: Response | null = null;
  let networkError: string | null = null;
  for (const proxyUrl of proxyUrls) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        response = await fetch(proxyUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            sourceUrl,
            sourceKind,
            formatPref: getProxyFormatPref(sourceKind, true),
            clipStart: start,
            clipDuration: Math.max(2, Math.min(duration, 4)),
          }),
          signal: AbortSignal.timeout(20_000),
        });
        break;
      } catch (error) {
        networkError = error instanceof Error ? error.message : "Unknown network error while contacting downloader.";
      }
    }
    if (response) break;
  }
  if (!response) {
    return NextResponse.json(
      {
        error: "Could not reach external downloader for thumbnail.",
        details: networkError || "No reachable downloader endpoint.",
      },
      { status: 502 },
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const rawText = await response.text();
    let payload: Record<string, unknown> = {};
    try {
      payload = rawText ? JSON.parse(rawText) as Record<string, unknown> : {};
    } catch {
      // keep text fallback below
    }
    return NextResponse.json(
      {
        error: "Could not render thumbnail via external downloader.",
        details: parseProxyError(payload) || rawText || `${response.status} ${response.statusText}`,
      },
      { status: 502 },
    );
  }

  if (contentType.toLowerCase().includes("application/json")) {
    const payload = await response.json().catch(() => ({}));
    return NextResponse.json(
      {
        error: "External downloader did not return a preview file.",
        details: parseProxyError(payload) || "Proxy returned JSON instead of media.",
      },
      { status: 502 },
    );
  }

  const clipBuffer = Buffer.from(await response.arrayBuffer());
  if (!clipBuffer.byteLength) {
    return NextResponse.json({ error: "External downloader returned an empty preview clip." }, { status: 502 });
  }

  const outputDir = os.tmpdir();
  const tempVideoPath = path.join(outputDir, `youtube-thumb-proxy-${randomUUID()}.mp4`);
  const thumbPath = path.join(outputDir, `youtube-thumb-proxy-${randomUUID()}.jpg`);
  try {
    await fs.writeFile(tempVideoPath, clipBuffer);
    const frameResult = await extractThumbnailFromVideoFile(tempVideoPath, thumbPath);
    if (!frameResult.ok) {
      return NextResponse.json(
        { error: "Could not extract thumbnail frame from preview clip." },
        { status: 500 },
      );
    }
    const imageBuffer = await fs.readFile(thumbPath);
    if (!imageBuffer.byteLength) {
      return NextResponse.json({ error: "Thumbnail image is empty." }, { status: 500 });
    }
    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
      status: 200,
    });
  } finally {
    await fs.rm(tempVideoPath, { force: true }).catch(() => {});
    await fs.rm(thumbPath, { force: true }).catch(() => {});
  }
}

export async function GET(req: NextRequest) {
  try {
    const access = await requireAllowedApiUser();
    if (!access.ok) {
      return access.response;
    }

  const params = new URL(req.url).searchParams;
  const jobId = params.get("jobId") || "";
  const clipIndexRaw = params.get("index");
  const clipIndex = Number(clipIndexRaw);
  const sourceUrl = params.get("sourceUrl") || "";
  const start = Number(params.get("start"));
  const duration = Number(params.get("duration"));
  const wantsThumbnail =
    params.get("thumbnail") === "1" ||
    params.get("thumbnail") === "true" ||
    params.get("mode") === "thumbnail";
  const canUseProxyFallback =
    /^https?:\/\/.+/i.test(sourceUrl) &&
    Number.isFinite(start) &&
    start >= 0 &&
    Number.isFinite(duration) &&
    duration > 0;

    if (!jobId && !canUseProxyFallback) {
      return NextResponse.json({ error: "jobId is required." }, { status: 400 });
    }

    if (!Number.isInteger(clipIndex) || clipIndex < 0) {
      return NextResponse.json({ error: "index must be a non-negative integer." }, { status: 400 });
    }

    const job = getYoutubeJob(jobId);
    if (!job) {
      if (canUseProxyFallback) {
        if (wantsThumbnail) {
          return renderThumbnailViaProxy(sourceUrl, start, duration);
        }
        return renderClipViaProxy(sourceUrl, start, duration);
      }
      return NextResponse.json({ error: "Job not found or expired." }, { status: 404 });
    }

    if (!job.clips[clipIndex]) {
      return NextResponse.json({ error: "Clip not found." }, { status: 404 });
    }
    touchYoutubeJob(jobId);

    const clip = job.clips[clipIndex];
    const outputDir = job.workdir || os.tmpdir();
    const outputPath = path.join(outputDir, `youtube-clip-${clipIndex}-${randomUUID()}.mp4`);
    const thumbnailPath = path.join(outputDir, `youtube-thumb-${clipIndex}-${randomUUID()}.jpg`);
    const sourcePath = job.sourcePath;

    if (job.proxyOnly || !sourcePath) {
      if (wantsThumbnail) {
        return renderThumbnailViaProxy(job.sourceUrl, clip.start, clip.duration);
      }
      return renderClipViaProxy(job.sourceUrl, clip.start, clip.duration);
    }

    const localSourceReady = await fs.access(sourcePath, fsConstants.R_OK).then(() => true).catch(() => false);
    if (!localSourceReady) {
      if (job.sourceUrl && getYtDlpProxyUrl()) {
        if (wantsThumbnail) {
          return renderThumbnailViaProxy(job.sourceUrl, clip.start, clip.duration);
        }
        return renderClipViaProxy(job.sourceUrl, clip.start, clip.duration);
      }
      return NextResponse.json(
        {
          error: "Source media is no longer available for this clip.",
          details: "Re-run Find clips and try loading again.",
        },
        { status: 500 },
      );
    }

    if (wantsThumbnail) {
      const frameResult = await runFfmpeg([
      "-y",
      "-ss",
      String(Math.max(0, clip.start + 0.4)),
      "-i",
      sourcePath,
      "-frames:v",
      "1",
      "-vf",
      "scale=min(640\\,iw):-2",
      "-q:v",
      "5",
      thumbnailPath,
    ]);

      if (!frameResult.ok) {
        const message =
          frameResult.error instanceof Error ? frameResult.error.message : `Could not render thumbnail for clip ${clipIndex}.`;
        const errorCode = (frameResult.error as { code?: string })?.code;
        const unavailable = errorCode === "ENOENT" || !frameResult.command;
        const shouldProxyRetry = (unavailable || job.sourceKind === "kick") && job.sourceUrl && getYtDlpProxyUrl();
        if (shouldProxyRetry) {
          return renderThumbnailViaProxy(job.sourceUrl, clip.start, clip.duration);
        }
        return NextResponse.json({ error: message }, { status: 500 });
      }

      try {
        const imageBuffer = await fs.readFile(thumbnailPath);
        if (!imageBuffer.byteLength) {
          return NextResponse.json({ error: "No output thumbnail generated." }, { status: 500 });
        }
        return new NextResponse(imageBuffer, {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=300, s-maxage=300",
          },
          status: 200,
        });
      } finally {
        await fs.rm(thumbnailPath, { force: true }).catch(() => {});
      }
    }

    const ffmpegResult = await runFfmpeg([
    "-y",
    "-ss",
    String(clip.start),
    "-i",
    sourcePath,
    "-t",
    String(clip.duration),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    outputPath,
  ]);

    if (!ffmpegResult.ok) {
      const message =
        ffmpegResult.error instanceof Error ? ffmpegResult.error.message : `Could not render clip ${clipIndex}.`;
      const errorCode = (ffmpegResult.error as { code?: string })?.code;
      const unavailable = errorCode === "ENOENT" || !ffmpegResult.command;
      if (unavailable) {
        if (job.sourceUrl && getYtDlpProxyUrl()) {
          return renderClipViaProxy(job.sourceUrl, clip.start, clip.duration);
        }
        return NextResponse.json(
          {
            error: "FFmpeg is not installed on this machine.",
            details: `Set FFMPEG_PATH or install ffmpeg-static.`,
          },
          { status: 500 },
        );
      }
      if (job.sourceKind === "kick" && job.sourceUrl && getYtDlpProxyUrl()) {
        return renderClipViaProxy(job.sourceUrl, clip.start, clip.duration);
      }
      return NextResponse.json({ error: message }, { status: 500 });
    }

    try {
      const clipBuffer = await fs.readFile(outputPath);
      if (!clipBuffer.byteLength) {
        return NextResponse.json({ error: "No output clip generated." }, { status: 500 });
      }
      const base = filenameSafe((job.sourceUrl || "stream").split("/").pop() || "clip");
      const outName = `kick-clips-${base}-${String(clip.start).replace(".", "-")}s-${String(clip.end).replace(".", "-")}s.mp4`;
      return new NextResponse(clipBuffer, {
        headers: {
          "Content-Type": "video/mp4",
          "Content-Disposition": `attachment; filename="${outName}"`,
        },
        status: 200,
      });
    } finally {
      await fs.rm(outputPath, { force: true }).catch(() => {});
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "Unexpected clip render failure.",
        details: error instanceof Error ? error.message : "Unknown server error.",
      },
      { status: 500 },
    );
  }
}
