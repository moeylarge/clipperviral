import { NextResponse } from "next/server";

import { requireAllowedApiUser } from "@/lib/auth/api-access";

export const runtime = "nodejs";

function getProxyUrls() {
  const urls = [
    process.env.YTDLP_PROXY_URL?.trim() || "",
    process.env.YTDLP_DOWNLOADER_URL?.trim() || "",
  ].filter((value) => value.length > 0);
  return [...new Set(urls)];
}

export async function GET() {
  const access = await requireAllowedApiUser();
  if (!access.ok) {
    return access.response;
  }

  const urls = getProxyUrls();
  if (!urls.length) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        reachable: false,
        error: "Downloader URL is not configured.",
        details: "Set YTDLP_PROXY_URL or YTDLP_DOWNLOADER_URL in environment variables.",
      },
      { status: 200 },
    );
  }

  let lastError = "";
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: "OPTIONS",
        signal: AbortSignal.timeout(6000),
        headers: { accept: "application/json,text/plain,*/*" },
      });

      if (response.ok || response.status >= 400) {
        return NextResponse.json(
          {
            ok: true,
            configured: true,
            reachable: true,
            activeUrl: url,
            status: response.status,
          },
          { status: 200 },
        );
      }
      lastError = `${response.status} ${response.statusText}`.trim();
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Unknown network error";
    }
  }

  return NextResponse.json(
    {
      ok: false,
      configured: true,
      reachable: false,
      error: "Downloader endpoint is unreachable.",
      details: lastError || "No response from configured downloader URLs.",
      urls,
    },
    { status: 200 },
  );
}
