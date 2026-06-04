import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/cv/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function jsonError(error: string, message: string, status: number) {
  return NextResponse.json({ error, message }, { status });
}

async function readRemoveBgError(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const payload = await response.json().catch(() => null);
    const errors = Array.isArray(payload?.errors) ? payload.errors : [];
    const messages = errors
      .map((item: { title?: string; detail?: string }) => item?.detail || item?.title)
      .filter(Boolean);
    if (messages.length) return messages.join(" ");
    if (payload?.error) return String(payload.error);
  }
  const text = await response.text().catch(() => "");
  return text.trim() || `remove.bg returned ${response.status}.`;
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const apiKey = process.env.REMOVEBG_API_KEY;
  if (!apiKey) {
    return jsonError("removebg-not-configured", "REMOVEBG_API_KEY is not configured.", 500);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("invalid-form", "Upload an image file.", 400);
  }

  const file = formData.get("image") || formData.get("file");
  if (!(file instanceof File)) {
    return jsonError("missing-image", "Upload an image file.", 400);
  }

  if (file.size <= 0) {
    return jsonError("empty-image", "Uploaded image is empty.", 400);
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return jsonError("image-too-large", "Image must be 12MB or smaller.", 413);
  }

  const contentType = file.type || "application/octet-stream";
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    return jsonError("unsupported-image-type", "Use a JPEG, PNG, WebP, HEIC, or HEIF image.", 400);
  }

  const removeBgForm = new FormData();
  removeBgForm.append("image_file", file, file.name || "cutout-upload");
  removeBgForm.append("size", "auto");
  removeBgForm.append("format", "png");

  let response: Response;
  try {
    response = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
      },
      body: removeBgForm,
    });
  } catch (error) {
    return jsonError(
      "removebg-network-error",
      error instanceof Error ? error.message : "Could not reach remove.bg.",
      502,
    );
  }

  if (!response.ok) {
    const message = await readRemoveBgError(response);
    const status = response.status === 402 || response.status === 429 ? response.status : 502;
    return jsonError("removebg-failed", message, status);
  }

  const blob = await response.blob();
  if (!blob.size) {
    return jsonError("removebg-empty-output", "remove.bg returned an empty image.", 502);
  }

  return new NextResponse(blob, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store",
    },
  });
}
