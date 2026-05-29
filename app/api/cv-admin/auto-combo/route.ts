import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";

import { requireAdmin } from "@/lib/cv/admin";
import {
  buildSlidingWindows,
  extractWhisperAudio,
  getMediaDurationSeconds,
  mapWithConcurrency,
  readWavMonoRms,
  runFfmpeg,
  scoreWindowWithClaude,
  transcribeAudioWithWhisper,
  type ViralWindow,
} from "@/lib/cv/media-analysis";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_CLIPS = 5;
const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;
const MAX_BLOB_FILE_SIZE_BYTES = 500 * 1024 * 1024;
const TRANSITION_SECONDS = 0.25;
const WATERMARK_ASSET_DIR = path.join(process.cwd(), "app/api/cv-admin/auto-combo/assets");
const WATERMARK_HANDLE_PATH = path.join(WATERMARK_ASSET_DIR, "clipperviral-handle.png");
const WATERMARK_URL_FONT_PATH = path.join(WATERMARK_ASSET_DIR, "Inter.ttf");
const WATERMARK_BADGES: Record<string, string> = {
  kick: path.join(WATERMARK_ASSET_DIR, "kick-badge.png"),
};

type ProcessedClip = {
  index: number;
  sourcePath: string;
  winningWindow: ViralWindow;
  extractedPath: string;
  normalizedPath: string;
};

type AutoComboWatermark = {
  platform: string;
  streamerUrl: string | null;
};

function jsonError(stage: string, error: unknown, status = 500) {
  return NextResponse.json(
    {
      stage,
      error: error instanceof Error ? error.message : String(error || "Unknown error"),
    },
    { status },
  );
}

function ffmpegFailureDetails(result: Awaited<ReturnType<typeof runFfmpeg>>) {
  if (result.ok) return null;
  const error = result.error as
    | {
        message?: string;
        code?: string | number;
        signal?: string;
        stdout?: string;
        stderr?: string;
      }
    | undefined;
  return {
    command: result.command,
    code: error?.code ?? null,
    signal: error?.signal ?? null,
    message: error?.message ?? String(result.error || "Unknown ffmpeg error"),
    stderr: error?.stderr?.slice(-4000) ?? null,
    stdout: error?.stdout?.slice(-1000) ?? null,
  };
}

function numberField(formData: FormData, key: string, fallback: number, min: number, max: number) {
  const value = Number(formData.get(key));
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizePlatform(value: unknown) {
  const platform = stringValue(value, "kick").toLowerCase();
  if (Object.prototype.hasOwnProperty.call(WATERMARK_BADGES, platform)) return platform;
  return "kick";
}

function normalizeStreamerUrl(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return null;
  return raw
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/[^\w./@-]+/g, "")
    .slice(0, 64) || null;
}

function escapeDrawtext(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

function assertVideoFile(file: File, index: number) {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  const validExt = [".mp4", ".mov", ".webm", ".m4v"].some((ext) => name.endsWith(ext));
  const validType = type.startsWith("video/") || !type;
  if (!validExt || !validType) {
    throw new Error(`Clip ${index + 1} must be an mp4, mov, or webm video.`);
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`Clip ${index + 1} is over 200MB.`);
  }
}

function textForWindow(segments: Array<{ start: number; end: number; text: string }>, start: number, end: number) {
  return segments
    .filter((segment) => segment.end >= start && segment.start <= end)
    .map((segment) => segment.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function scoreClipWindows(options: {
  durationSeconds: number;
  perClipSeconds: number;
  audioPath: string;
  apiKey: string;
}) {
  const [segments, rmsBySecond] = await Promise.all([
    transcribeAudioWithWhisper(options.audioPath, options.apiKey),
    readWavMonoRms(options.audioPath),
  ]);

  const windows = buildSlidingWindows({
    durationSeconds: options.durationSeconds,
    perClipSeconds: options.perClipSeconds,
    segments,
    rmsBySecond,
  });

  const shortlist = windows
    .map((window) => {
      const transcriptWords = window.text.split(/\s+/).filter(Boolean).length;
      const localSignal = Math.min(20, transcriptWords * 1.8) + Math.min(25, window.audioRms * 35);
      return { ...window, localSignal };
    })
    .sort((a, b) => b.localSignal - a.localSignal)
    .slice(0, 12)
    .sort((a, b) => a.start - b.start);

  const scored = await mapWithConcurrency(shortlist, 3, async (window) => {
    const score = await scoreWindowWithClaude({
      perClipSeconds: options.perClipSeconds,
      text: window.text,
      audioRms: window.audioRms,
    });
    return {
      start: window.start,
      end: window.end,
      text: window.text || textForWindow(segments, window.start, window.end),
      audioRms: window.audioRms,
      score: score.score,
      reason: score.reason,
    };
  });

  return scored.sort((a, b) => b.score - a.score)[0];
}

async function extractAndNormalizeWindow(options: {
  clipPath: string;
  start: number;
  duration: number;
  outputPath: string;
  normalizedPath: string;
}) {
  const extract = await runFfmpeg([
    "-y",
    "-ss",
    String(Math.max(0, options.start)),
    "-i",
    options.clipPath,
    "-t",
    String(options.duration),
    "-vf",
    "split=2[bg][fg];[bg]scale=1080:1350:force_original_aspect_ratio=increase,crop=1080:1350,gblur=sigma=24[bg];[fg]scale=1080:1350:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30,format=yuv420p",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-ac",
    "2",
    options.outputPath,
  ]);
  if (!extract.ok) throw new Error("Failed to extract winning clip window.");

  const normalize = await runFfmpeg([
    "-y",
    "-i",
    options.outputPath,
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-ac",
    "2",
    options.normalizedPath,
  ]);
  if (!normalize.ok) throw new Error("Failed to normalize winning clip audio.");
}

function buildAutoComboFilter(inputCount: number, perClipSeconds: number) {
  if (inputCount < 2) {
    return { filter: "[0:v]format=yuv420p[vout];[0:a]anull[aout]", videoLabel: "[vout]", audioLabel: "[aout]" };
  }

  const parts: string[] = [];
  let videoLabel = "[0:v]";
  let audioLabel = "[0:a]";
  for (let i = 1; i < inputCount; i += 1) {
    const nextVideo = `[v${i}]`;
    const nextAudio = `[a${i}]`;
    const transition = i % 2 === 0 ? "zoomin" : "hblur";
    const offset = Math.max(0.1, i * perClipSeconds - i * TRANSITION_SECONDS);
    parts.push(
      `${videoLabel}[${i}:v]xfade=transition=${transition}:duration=${TRANSITION_SECONDS}:offset=${offset.toFixed(2)}${nextVideo}`,
    );
    parts.push(
      `${audioLabel}[${i}:a]acrossfade=d=${TRANSITION_SECONDS}:c1=tri:c2=tri${nextAudio}`,
    );
    videoLabel = nextVideo;
    audioLabel = nextAudio;
  }
  parts.push(`${videoLabel}format=yuv420p[vout]`);
  parts.push(`${audioLabel}anull[aout]`);
  return { filter: parts.join(";"), videoLabel: "[vout]", audioLabel: "[aout]" };
}

async function stitchFinal(processed: ProcessedClip[], perClipSeconds: number, outputPath: string) {
  if (processed.length === 1) {
    await fs.copyFile(processed[0].normalizedPath, outputPath);
    return;
  }

  const { filter, videoLabel, audioLabel } = buildAutoComboFilter(processed.length, perClipSeconds);
  const args = [
    "-y",
    ...processed.flatMap((clip) => ["-i", clip.normalizedPath]),
    "-filter_complex",
    filter,
    "-map",
    videoLabel,
    "-map",
    audioLabel,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath,
  ];
  const result = await runFfmpeg(args, 10 * 60 * 1000);
  if (!result.ok) throw new Error("Failed to stitch final auto-combo MP4.");
}

async function applyWatermark(inputPath: string, outputPath: string, watermark: AutoComboWatermark) {
  const badgePath = WATERMARK_BADGES[watermark.platform];
  const inputArgs = ["-i", inputPath, "-i", WATERMARK_HANDLE_PATH];
  const hasBadge = Boolean(badgePath);
  if (badgePath) inputArgs.push("-i", badgePath);

  const filterParts = [
    "[0:v]format=rgba[base]",
    "[1:v]scale=150:-1[handle]",
  ];
  let currentVideo = "[wm1]";
  filterParts.push("[base][handle]overlay=x=(W-w)/2:y=(H*0.84)-(h/2):format=auto[wm1]");

  if (hasBadge) {
    filterParts.push("[2:v]scale=-1:30[badge]");
    filterParts.push("[wm1][badge]overlay=x=W*0.04:y=H-h-(H*0.025):format=auto[wm2]");
    currentVideo = "[wm2]";
  }

  if (watermark.streamerUrl) {
    filterParts.push(
      `${currentVideo}drawtext=fontfile='${WATERMARK_URL_FONT_PATH}':text='${escapeDrawtext(watermark.streamerUrl)}':fontcolor=white@0.95:fontsize=w*0.028:x=w-text_w-(w*0.04):y=h-text_h-(h*0.035):borderw=2:bordercolor=black@0.4,format=yuv420p[vout]`,
    );
  } else {
    filterParts.push(`${currentVideo}format=yuv420p[vout]`);
  }

  const result = await runFfmpeg([
    "-y",
    ...inputArgs,
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[vout]",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    outputPath,
  ]);
  if (!result.ok) {
    console.error("CV auto-combo watermark failed", ffmpegFailureDetails(result));
    return false;
  }
  return true;
}

async function processClip(file: File, index: number, workdir: string, perClipSeconds: number, apiKey: string) {
  assertVideoFile(file, index);

  const sourcePath = path.join(workdir, `clip-${index}.mp4`);
  const audioPath = path.join(workdir, `audio-${index}.wav`);
  const extractedPath = path.join(workdir, `window-${index}.mp4`);
  const normalizedPath = path.join(workdir, `window-${index}-norm.mp4`);

  await fs.writeFile(sourcePath, Buffer.from(await file.arrayBuffer()));
  await extractWhisperAudio(sourcePath, audioPath);

  const duration = (await getMediaDurationSeconds(sourcePath)) || perClipSeconds;
  const winningWindow = await scoreClipWindows({
    durationSeconds: Math.max(perClipSeconds, duration),
    perClipSeconds,
    audioPath,
    apiKey,
  });

  if (!winningWindow) throw new Error(`No candidate windows found for clip ${index + 1}.`);

  await extractAndNormalizeWindow({
    clipPath: sourcePath,
    start: winningWindow.start,
    duration: perClipSeconds,
    outputPath: extractedPath,
    normalizedPath,
  });

  return { index, sourcePath, winningWindow, extractedPath, normalizedPath };
}

function extensionForBlobUrl(blobUrl: string, contentType: string | null) {
  const pathName = new URL(blobUrl).pathname.toLowerCase();
  const ext = path.extname(pathName);
  if ([".mp4", ".mov", ".webm", ".m4v"].includes(ext)) return ext;
  const normalizedType = `${contentType || ""}`.toLowerCase();
  if (normalizedType.includes("quicktime")) return ".mov";
  if (normalizedType.includes("webm")) return ".webm";
  return ".mp4";
}

function assertBlobUrl(value: unknown, index: number) {
  const blobUrl = `${value || ""}`.trim();
  if (!blobUrl) throw new Error(`Clip ${index + 1} is missing a blob_url.`);
  let parsed: URL;
  try {
    parsed = new URL(blobUrl);
  } catch {
    throw new Error(`Clip ${index + 1} has an invalid blob_url.`);
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".blob.vercel-storage.com")) {
    throw new Error(`Clip ${index + 1} must use a Vercel Blob URL.`);
  }
  return blobUrl;
}

async function downloadBlobClip(blobUrl: string, index: number, workdir: string) {
  const response = await fetch(blobUrl);
  if (!response.ok) {
    throw new Error(`Clip ${index + 1} blob download failed with ${response.status}. Re-upload this clip and try again.`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BLOB_FILE_SIZE_BYTES) {
    throw new Error(`Clip ${index + 1} is over 500MB.`);
  }

  const contentType = response.headers.get("content-type");
  const validType = !contentType || ["video/mp4", "video/quicktime", "video/webm", "application/octet-stream"].some((type) =>
    contentType.toLowerCase().startsWith(type),
  );
  if (!validType) {
    throw new Error(`Clip ${index + 1} blob is not a supported video type.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_BLOB_FILE_SIZE_BYTES) {
    throw new Error(`Clip ${index + 1} is over 500MB.`);
  }
  if (!bytes.length) throw new Error(`Clip ${index + 1} blob is empty.`);

  const sourcePath = path.join(workdir, `clip-${index}${extensionForBlobUrl(blobUrl, contentType)}`);
  await fs.writeFile(sourcePath, bytes);
  return sourcePath;
}

async function processClipPath(clipPath: string, index: number, workdir: string, perClipSeconds: number, apiKey: string) {
  const audioPath = path.join(workdir, `audio-${index}.wav`);
  const extractedPath = path.join(workdir, `window-${index}.mp4`);
  const normalizedPath = path.join(workdir, `window-${index}-norm.mp4`);

  await extractWhisperAudio(clipPath, audioPath);

  const duration = (await getMediaDurationSeconds(clipPath)) || perClipSeconds;
  const winningWindow = await scoreClipWindows({
    durationSeconds: Math.max(perClipSeconds, duration),
    perClipSeconds,
    audioPath,
    apiKey,
  });

  if (!winningWindow) throw new Error(`No candidate windows found for clip ${index + 1}.`);

  await extractAndNormalizeWindow({
    clipPath,
    start: winningWindow.start,
    duration: perClipSeconds,
    outputPath: extractedPath,
    normalizedPath,
  });

  return { index, sourcePath: clipPath, winningWindow, extractedPath, normalizedPath };
}

async function runAutoCombo(processed: ProcessedClip[], workdir: string, perClipSeconds: number, watermark: AutoComboWatermark) {
  const finalPath = path.join(workdir, "auto-combo-final.mp4");
  const watermarkedPath = path.join(workdir, "auto-combo-final-watermarked.mp4");
  const rankedProcessed = [...processed].sort((a, b) => b.winningWindow.score - a.winningWindow.score || a.index - b.index);
  await stitchFinal(rankedProcessed, perClipSeconds, finalPath);
  const watermarked = await applyWatermark(finalPath, watermarkedPath, watermark);
  const output = await fs.readFile(watermarked ? watermarkedPath : finalPath);

  return new Response(output, {
    headers: {
      "content-type": "video/mp4",
      "content-disposition": `attachment; filename="autocombo-${Date.now()}.mp4"`,
      "x-cv-auto-combo-windows": encodeURIComponent(
        JSON.stringify(
          rankedProcessed.map((clip) => ({
            clip: clip.index + 1,
            start: clip.winningWindow.start,
            end: clip.winningWindow.end,
            score: clip.winningWindow.score,
            reason: clip.winningWindow.reason,
          })),
        ),
      ),
    },
  });
}

async function deleteBlobUploads(blobUrls: string[]) {
  if (!blobUrls.length) return;
  await del(blobUrls).catch((error) => {
    console.warn("Failed to delete auto-combo blob uploads", error);
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return jsonError("config", "Missing OPENAI_API_KEY.", 500);

  const workdir = path.join(os.tmpdir(), `cv-auto-combo-${randomUUID()}`);
  const blobUrlsToDelete: string[] = [];
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.toLowerCase().includes("application/json")) {
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== "object") return jsonError("validate", "Invalid JSON body.", 400);
      const clips = Array.isArray((body as { clips?: unknown }).clips)
        ? (body as { clips: Array<{ blob_url?: unknown; platform?: unknown; streamer_url?: unknown }> }).clips
        : [];
      if (!clips.length) return jsonError("validate", "Upload at least one clip.", 400);
      if (clips.length > MAX_CLIPS) return jsonError("validate", "Upload no more than 5 clips.", 400);

      const perClipSeconds = numberValue((body as { per_clip_seconds?: unknown }).per_clip_seconds, 5, 3, 15);
      const totalLengthSeconds = numberValue((body as { total_length_seconds?: unknown }).total_length_seconds, 25, 10, 60);
      const watermark = {
        platform: normalizePlatform((body as { platform?: unknown }).platform ?? clips[0]?.platform),
        streamerUrl: normalizeStreamerUrl((body as { streamer_url?: unknown }).streamer_url ?? clips[0]?.streamer_url),
      };
      if (perClipSeconds * clips.length > totalLengthSeconds) {
        return jsonError("validate", "per_clip_seconds times clip count must be <= total_length_seconds.", 400);
      }

      await fs.mkdir(workdir, { recursive: true });
      const sourcePaths = await mapWithConcurrency(clips, Math.min(2, clips.length), async (clip, index) => {
        const blobUrl = assertBlobUrl(clip?.blob_url, index);
        blobUrlsToDelete.push(blobUrl);
        return downloadBlobClip(blobUrl, index, workdir);
      });
      const processed = await mapWithConcurrency(sourcePaths, Math.min(2, sourcePaths.length), (sourcePath, index) =>
        processClipPath(sourcePath, index, workdir, perClipSeconds, apiKey),
      );

      const response = await runAutoCombo(processed, workdir, perClipSeconds, watermark);
      await deleteBlobUploads(blobUrlsToDelete);
      blobUrlsToDelete.length = 0;
      return response;
    }

    const formData = await req.formData();
    const files = formData.getAll("clips[]").filter((item): item is File => item instanceof File);
    if (!files.length) return jsonError("validate", "Upload at least one clip.", 400);
    if (files.length > MAX_CLIPS) return jsonError("validate", "Upload no more than 5 clips.", 400);

    const perClipSeconds = numberField(formData, "per_clip_seconds", 5, 3, 15);
    const totalLengthSeconds = numberField(formData, "total_length_seconds", 25, 10, 60);
    const watermark = {
      platform: normalizePlatform(formData.get("platform")),
      streamerUrl: normalizeStreamerUrl(formData.get("streamer_url")),
    };
    if (perClipSeconds * files.length > totalLengthSeconds) {
      return jsonError("validate", "per_clip_seconds times clip count must be <= total_length_seconds.", 400);
    }

    await fs.mkdir(workdir, { recursive: true });
    const processed = await mapWithConcurrency(files, Math.min(2, files.length), (file, index) =>
      processClip(file, index, workdir, perClipSeconds, apiKey),
    );

    return await runAutoCombo(processed, workdir, perClipSeconds, watermark);
  } catch (error) {
    console.error("CV auto-combo failed", {
      error: error instanceof Error ? error.message : String(error || "Unknown error"),
    });
    return jsonError("process", error, 500);
  } finally {
    await fs.rm(workdir, { recursive: true, force: true });
  }
}
