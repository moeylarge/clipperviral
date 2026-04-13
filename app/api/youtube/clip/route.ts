import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
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

export async function GET(req: NextRequest) {
  const access = await requireAllowedApiUser();
  if (!access.ok) {
    return access.response;
  }

  const params = new URL(req.url).searchParams;
  const jobId = params.get("jobId") || "";
  const clipIndexRaw = params.get("index");
  const clipIndex = Number(clipIndexRaw);
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  if (!Number.isInteger(clipIndex) || clipIndex < 0) {
    return NextResponse.json({ error: "index must be a non-negative integer." }, { status: 400 });
  }

  const job = getYoutubeJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found or expired." }, { status: 404 });
  }

  if (!job.clips[clipIndex]) {
    return NextResponse.json({ error: "Clip not found." }, { status: 404 });
  }
  touchYoutubeJob(jobId);

  const clip = job.clips[clipIndex];
  const outputDir = job.workdir || os.tmpdir();
  const outputPath = path.join(outputDir, `youtube-clip-${clipIndex}-${randomUUID()}.mp4`);
  const sourcePath = job.sourcePath;

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
      return NextResponse.json(
        {
          error: "FFmpeg is not installed on this machine.",
          details: `Set FFMPEG_PATH or install one of: ffmpeg-static, @ffmpeg-installer/ffmpeg.`,
        },
        { status: 500 },
      );
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
}
