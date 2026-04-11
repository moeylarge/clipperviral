import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { accessSync, constants } from "node:fs";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const MAX_FILE_SIZE_BYTES = 300 * 1024 * 1024;
const bundledFfmpegPath = (() => {
  try {
    const resolved = require("ffmpeg-static");
    if (typeof resolved === "string") {
      return resolved;
    }
    if (resolved && typeof resolved === "object") {
      if (typeof resolved.ffmpeg === "string") return resolved.ffmpeg;
      if (typeof resolved.path === "string") return resolved.path;
    }
    return null;
  } catch {
    return null;
  }
})();
const fallbackInstallerFfmpegPath = (() => {
  try {
    const installer = require("@ffmpeg-installer/ffmpeg");
    return installer && typeof installer.path === "string" ? installer.path : null;
  } catch {
    return null;
  }
})();

function getAvailableFfmpegCommand() {
  const candidates = [
    { label: "FFMPEG_PATH", value: process.env.FFMPEG_PATH },
    { label: "ffmpeg-static", value: bundledFfmpegPath },
    { label: "@ffmpeg-installer/ffmpeg", value: fallbackInstallerFfmpegPath },
    { label: "ffmpeg", value: "ffmpeg" },
  ];

  for (const candidate of candidates) {
    const value = candidate.value;
    if (!value) continue;
    try {
      if (value === "ffmpeg") {
        return { command: "ffmpeg", source: candidate.label };
      }
      accessSync(value, constants.X_OK);
      return { command: value, source: candidate.label };
    } catch {
      // continue
    }
  }

  const checks = candidates
    .map((candidate) => `${candidate.label}: ${candidate.value || "not configured"}`)
    .join("\n");
  return { command: null as null, source: "none", diagnostic: `No executable ffmpeg found. Checked:\n${checks}` };
}

type ResponseJSON = {
  error?: string;
  details?: string;
  status?: number;
};

function filenameSafe(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function asPlainText(input: FormDataEntryValue | null) {
  return typeof input === "string" ? input : null;
}

export async function POST(req: NextRequest): Promise<NextResponse<ResponseJSON | Uint8Array>> {
  const workdir = path.join(os.tmpdir(), `spotlight-captions-${randomUUID()}`);
  let clipFilePath = "";
  let subtitlesPath = "";
  let outputPath = "";

  try {
    const ffmpegCheck = getAvailableFfmpegCommand();
    const ffmpegCommand = ffmpegCheck.command;
    if (!ffmpegCommand) {
      return NextResponse.json(
        {
          error: "FFmpeg is not installed on this machine.",
          details: `${ffmpegCheck.diagnostic}.`,
          status: 500,
        },
        { status: 500 }
      );
    }
    const body = await req.formData();
    const clip = body.get("clip");
    const subtitleText = asPlainText(body.get("subtitles"));

    if (!(clip instanceof File)) {
      return NextResponse.json({ error: "Clip file missing. Send the original upload as field `clip`." }, { status: 400 });
    }

    if (!subtitleText || !subtitleText.trim()) {
      return NextResponse.json({ error: "Subtitle text missing. Generate subtitles first." }, { status: 400 });
    }

    if (clip.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "File too large. Keep clip 300MB or smaller for burned export." },
        { status: 413 }
      );
    }

    await fs.mkdir(workdir, { recursive: true });
    const originalName = filenameSafe(clip.name || "clip");
    const extension = path.extname(originalName) || ".mp4";
    clipFilePath = path.join(workdir, `input${extension}`);
    subtitlesPath = path.join(workdir, "captions.ass");
    outputPath = path.join(workdir, "output.mp4");

    const buffer = Buffer.from(await clip.arrayBuffer());
    await fs.writeFile(clipFilePath, buffer);
    await fs.writeFile(subtitlesPath, subtitleText);

    const args = [
      "-y",
      "-i",
      clipFilePath,
      "-vf",
      `ass=${subtitlesPath}`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      outputPath,
    ];

    try {
      await execFileAsync(ffmpegCommand, args);
    } catch (error) {
      const typed = error as {
        code?: string;
        message?: string;
        stderr?: string;
      };

      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return NextResponse.json(
          {
            error: "FFmpeg is not installed on this machine.",
            details:
              `No executable ffmpeg detected at runtime. Checked:\nFFMPEG_PATH: ${process.env.FFMPEG_PATH || "not set"}\nffmpeg-static: ${bundledFfmpegPath || "not available"}\n@ffmpeg-installer/ffmpeg: ${fallbackInstallerFfmpegPath || "not available"}\nffmpeg fallback: not checked here`,
            status: 500,
          },
          { status: 500 }
        );
      }
      const stderr = typed.stderr && String(typed.stderr).trim();
      const err = typed.message || (error instanceof Error ? error.message : "ffmpeg failed");
      return NextResponse.json(
        { error: "Failed to burn subtitles in mp4.", details: stderr || err },
        { status: 500 }
      );
    }

    const video = await fs.readFile(outputPath);
    if (!video || video.byteLength === 0) {
      return NextResponse.json(
        { error: "MP4 export completed with no output. Try a smaller clip or a different subtitle style." },
        { status: 500 }
      );
    }
    const baseName = originalName.replace(path.extname(originalName), "");
    const outName = `${baseName}-with-captions.mp4`;

    return new NextResponse(video, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${outName}"`,
      },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Burn export failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await fs.rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}
