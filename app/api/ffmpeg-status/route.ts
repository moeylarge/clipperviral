import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { accessSync, constants } from "node:fs";
import { createRequire } from "node:module";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

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


function ffmpegCandidates() {
  return [
    { label: "FFMPEG_PATH", value: process.env.FFMPEG_PATH },
    { label: "ffmpeg-static", value: bundledFfmpegPath },
    { label: "ffmpeg", value: "ffmpeg" },
    { label: "/usr/local/bin/ffmpeg", value: "/usr/local/bin/ffmpeg" },
    { label: "/opt/homebrew/bin/ffmpeg", value: "/opt/homebrew/bin/ffmpeg" },
    { label: "/usr/bin/ffmpeg", value: "/usr/bin/ffmpeg" },
  ].filter((candidate): candidate is { label: string; value: string } =>
    typeof candidate.value === "string" && candidate.value.trim().length > 0,
  );
}

async function testFfmpegCommand(command: string) {
  try {
    await execFileAsync(command, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

function canRunBinaryPath(filePath: string) {
  try {
    accessSync(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function detectFfmpeg() {
  const candidates = ffmpegCandidates();

  for (const candidate of candidates) {
    const value = candidate.value.trim();

    if (value === "ffmpeg") {
      const ok = await testFfmpegCommand(value);
      if (ok) {
        return { installed: true, source: candidate.label, command: value };
      }
      continue;
    }

    if (!canRunBinaryPath(value)) {
      continue;
    }

    const ok = await testFfmpegCommand(value);
    if (ok) {
      return { installed: true, source: candidate.label, command: value };
    }
  }

  return {
    installed: false,
    source: "none",
    command: null,
    tried: candidates.map((candidate) => candidate.value),
  };
}

export async function GET() {
  const ffmpeg = await detectFfmpeg();

  if (!ffmpeg.installed) {
    return NextResponse.json(
      {
        installed: false,
        source: ffmpeg.source,
        command: ffmpeg.command,
        tried: ffmpeg.tried || ffmpegCandidates().map((candidate) => candidate.value),
        message:
          "FFmpeg command not found. Set FFMPEG_PATH to a working ffmpeg binary or install ffmpeg-static.",
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      installed: true,
      source: ffmpeg.source,
      command: ffmpeg.command,
      message: "FFmpeg is available for captioning and exports.",
      tried: ffmpegCandidates().map((candidate) => candidate.value),
    },
    { status: 200 }
  );
}
