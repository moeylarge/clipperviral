import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/cv/admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }

  try {
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const safeName = pathname.split("/").pop() || "clip.mp4";
        return {
          allowedContentTypes: ALLOWED_VIDEO_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          validUntil: Date.now() + 60 * 60 * 1000,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            adminUserId: auth.user.id,
            email: auth.user.email ?? null,
            originalName: safeName,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = tokenPayload ? JSON.parse(tokenPayload) : {};
        console.log("CV auto-combo blob upload completed", {
          pathname: blob.pathname,
          contentType: blob.contentType,
          adminUserId: payload.adminUserId,
        });
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Blob upload token failed." },
      { status: 400 },
    );
  }
}
