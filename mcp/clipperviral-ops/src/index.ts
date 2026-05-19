#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

type StreamerRosterItem = {
  id: string;
  name: string;
  rate?: number;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(packageRoot, "../..");

loadEnv({ path: path.join(repoRoot, ".env.local"), quiet: true });
loadEnv({ path: path.join(packageRoot, ".env.local"), override: true, quiet: true });

const DEFAULT_STREAMERS_DIR = path.join(repoRoot, "public/brand/kick/streamers");
const DEFAULT_EDITOR_HTML = path.join(repoRoot, "public/editor.html");
const DEFAULT_EFFECTS_DIR = path.join(repoRoot, "public/brand/effects");
const DEFAULT_TEMPLATE = path.join(DEFAULT_STREAMERS_DIR, "ryangarcia.png");
const SEEDANCE_MODEL = "bytedance/seedance-2.0";

function env(name: string) {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function requireEnv(name: string) {
  const value = env(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function text(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function errorText(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

function safeHandle(handle: string) {
  return handle.trim().toLowerCase().replace(/^@/, "").replace(/^kick\.com\//i, "").replace(/[^a-z0-9_-]/g, "");
}

function parseKickStreamers(editorHtmlPath = DEFAULT_EDITOR_HTML): StreamerRosterItem[] {
  const html = readFileSync(editorHtmlPath, "utf8");
  const start = html.indexOf("const KICK_STREAMERS = [");
  if (start === -1) throw new Error(`KICK_STREAMERS array not found in ${editorHtmlPath}`);
  const end = html.indexOf("].map((s)", start);
  if (end === -1) throw new Error(`KICK_STREAMERS array end not found in ${editorHtmlPath}`);
  const block = html.slice(start, end);
  const items: StreamerRosterItem[] = [];
  const re = /\{\s*id:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"\s*,\s*rate:\s*(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) {
    items.push({ id: match[1], name: match[2], rate: Number(match[3]) });
  }
  return items;
}

async function runPythonOverlay(input: {
  template: string;
  handle: string;
  output: string;
  fontPath?: string;
}) {
  const script = path.join(packageRoot, "scripts/generate_streamer_overlay.py");
  const args = [script, "--template", input.template, "--handle", input.handle, "--output", input.output];
  if (input.fontPath) args.push("--font-path", input.fontPath);
  return new Promise<void>((resolve, reject) => {
    const child = spawn("python3", args, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `python3 exited with ${code}`));
    });
  });
}

async function replicateRequest(method: string, pathname: string, body?: unknown) {
  const payload = body ? JSON.stringify(body) : undefined;
  const res = await fetch(`https://api.replicate.com/v1${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${requireEnv("REPLICATE_API_TOKEN")}`,
      "user-agent": "clipperviral-ops-mcp/0.1.0",
      ...(payload ? { "content-type": "application/json" } : {}),
    },
    body: payload,
  });
  const raw = await res.text();
  const json = raw ? JSON.parse(raw) : {};
  if (!res.ok) throw new Error(`Replicate API ${method} ${pathname} failed: ${res.status} ${raw}`);
  return json as Record<string, unknown>;
}

async function downloadFile(url: string, outputPath: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${await res.text()}`);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, Buffer.from(await res.arrayBuffer()));
  return statSync(outputPath).size;
}

function outputUrl(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string");
    return typeof first === "string" ? first : null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return outputUrl(obj.url ?? obj.video ?? obj.output);
  }
  return null;
}

function slug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "effect";
}

async function pollPrediction(id: string, timeoutMs = 10 * 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const prediction = await replicateRequest("GET", `/predictions/${encodeURIComponent(id)}`);
    const status = String(prediction.status ?? "unknown");
    if (["succeeded", "failed", "canceled"].includes(status)) return prediction;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error(`Timed out waiting for prediction ${id}`);
}

function manualKickProgramStats(period: string) {
  return {
    period,
    status: "not_implemented",
    views_counted: null,
    revenue_estimated_usd: null,
    submissions: null,
    pending_payout: null,
    paid_to_date: null,
    manual_steps: [
      "Open https://kick.com/program while logged in.",
      "Review dashboard totals for the selected period.",
      "Paste or export the stats back into your tracking sheet.",
    ],
    note: "Kick Content Program does not currently expose a public API in this MCP. Add KICK_PROGRAM_API_BASE and KICK_PROGRAM_API_KEY if Kick or a partner endpoint becomes available.",
  };
}

async function maybeLogSubmission(row: Record<string, unknown>) {
  const url = env("SUPABASE_URL");
  const key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return { logged: false, reason: "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured." };
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const inserted = await supabase.from("clipperviral_submissions").insert(row).select("id").maybeSingle();
    if (inserted.error) return { logged: false, reason: inserted.error.message };
    return { logged: true, id: inserted.data?.id ?? null };
  } catch (err) {
    return { logged: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

async function kickApiRequest(method: string, pathname: string, body?: unknown) {
  const base = env("KICK_PROGRAM_API_BASE");
  const key = env("KICK_PROGRAM_API_KEY");
  if (!base || !key) return { configured: false };
  const payload = body ? JSON.stringify(body) : undefined;
  const res = await fetch(`${base.replace(/\/$/, "")}${pathname}`, {
    method,
    headers: {
      authorization: `Bearer ${key}`,
      ...(payload ? { "content-type": "application/json" } : {}),
    },
    body: payload,
  });
  const raw = await res.text();
  const json = raw ? JSON.parse(raw) : {};
  if (!res.ok) throw new Error(`Kick Program API ${method} ${pathname} failed: ${res.status} ${raw}`);
  return { configured: true, response: json };
}

const server = new McpServer({
  name: "clipperviral-ops",
  version: "0.1.0",
});

server.registerTool(
  "clipper_generate_streamer_overlay",
  {
    title: "Clipper Generate Streamer Overlay",
    description: "Generate official Kick streamer overlay PNGs from the 1082x108 template.",
    inputSchema: {
      streamer_handles: z.array(z.string().min(1)).min(1).max(200),
      output_dir: z.string().default(DEFAULT_STREAMERS_DIR),
      overwrite: z.boolean().default(false),
      font_path: z.string().optional(),
    },
  },
  async ({ streamer_handles, output_dir, overwrite, font_path }) => {
    if (!existsSync(DEFAULT_TEMPLATE)) return errorText(`Missing template: ${DEFAULT_TEMPLATE}`);
    mkdirSync(output_dir, { recursive: true });
    const generated = [];
    const skipped = [];
    const failed = [];
    for (const rawHandle of streamer_handles) {
      const handle = safeHandle(rawHandle);
      if (!handle) {
        failed.push({ handle: rawHandle, error: "Handle is empty after normalization." });
        continue;
      }
      const output = path.join(output_dir, `${handle}.png`);
      if (existsSync(output) && !overwrite) {
        skipped.push({ handle, path: output, reason: "exists" });
        continue;
      }
      try {
        await runPythonOverlay({ template: DEFAULT_TEMPLATE, handle, output, fontPath: font_path });
        generated.push({ handle, path: output, size_bytes: statSync(output).size });
      } catch (err) {
        failed.push({ handle, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return text({ generated, skipped, failed });
  },
);

server.registerTool(
  "clipper_generate_seedance_effect",
  {
    title: "Clipper Generate Seedance Effect",
    description: "Generate ClipperViral effect videos through Replicate Seedance. confirm=true required because this can cost money.",
    inputSchema: {
      effects: z.array(z.object({
        name: z.string().min(1),
        prompt: z.string().min(1),
      })).min(1).max(20),
      resolution: z.enum(["480p", "720p", "1080p"]).default("720p"),
      aspect_ratio: z.enum(["9:16", "3:4", "16:9", "1:1"]).default("9:16"),
      duration: z.number().int().min(1).max(15).default(5),
      output_dir: z.string().default(DEFAULT_EFFECTS_DIR),
      wait_for_completion: z.boolean().default(false),
      confirm: z.boolean().default(false),
    },
  },
  async ({ effects, resolution, aspect_ratio, duration, output_dir, wait_for_completion, confirm }) => {
    const estimatedCostUsd = Number((effects.length * (resolution === "1080p" ? 2 : resolution === "720p" ? 1.25 : 0.75)).toFixed(2));
    if (!confirm) {
      return errorText(`Cost guard: estimated ${estimatedCostUsd} USD for ${effects.length} video(s). Re-run with confirm=true to start Replicate predictions.`);
    }
    const fired = [];
    const downloaded = [];
    for (const effect of effects) {
      const prediction = await replicateRequest("POST", "/models/bytedance/seedance-2.0/predictions", {
        input: {
          prompt: effect.prompt,
          resolution,
          aspect_ratio,
          duration,
        },
      });
      const id = String(prediction.id ?? "");
      fired.push({ name: effect.name, prediction_id: id, status: prediction.status, model: SEEDANCE_MODEL });
      if (wait_for_completion && id) {
        const finished = await pollPrediction(id);
        const url = outputUrl(finished.output);
        if (String(finished.status) === "succeeded" && url) {
          const out = path.join(output_dir, `${slug(effect.name)}.mp4`);
          const size = await downloadFile(url, out);
          downloaded.push({ name: effect.name, prediction_id: id, path: out, size_bytes: size });
        }
      }
    }
    return text({ fired, downloaded: downloaded.length ? downloaded : undefined, estimated_cost_usd: estimatedCostUsd });
  },
);

server.registerTool(
  "clipper_check_seedance_run",
  {
    title: "Clipper Check Seedance Run",
    description: "Poll a Replicate prediction and optionally download completed Seedance MP4 output.",
    inputSchema: {
      prediction_id: z.string().min(1),
      name: z.string().optional(),
      output_dir: z.string().default(DEFAULT_EFFECTS_DIR),
      download: z.boolean().default(true),
    },
  },
  async ({ prediction_id, name, output_dir, download }) => {
    const prediction = await replicateRequest("GET", `/predictions/${encodeURIComponent(prediction_id)}`);
    const url = outputUrl(prediction.output);
    let downloaded = null;
    if (download && String(prediction.status) === "succeeded" && url) {
      const out = path.join(output_dir, `${slug(name ?? prediction_id)}.mp4`);
      downloaded = { path: out, size_bytes: await downloadFile(url, out) };
    }
    return text({ prediction_id, status: prediction.status, output_url: url, downloaded, prediction });
  },
);

server.registerTool(
  "clipper_list_missing_streamers",
  {
    title: "Clipper List Missing Streamers",
    description: "Compare Kick roster in public/editor.html against local streamer overlay PNGs.",
    inputSchema: {
      streamers_dir: z.string().default(DEFAULT_STREAMERS_DIR),
      editor_html_path: z.string().default(DEFAULT_EDITOR_HTML),
    },
  },
  async ({ streamers_dir, editor_html_path }) => {
    const roster = parseKickStreamers(editor_html_path);
    const pngIds = existsSync(streamers_dir)
      ? new Set((await import("node:fs")).readdirSync(streamers_dir).filter((file) => file.endsWith(".png")).map((file) => path.basename(file, ".png").toLowerCase()))
      : new Set<string>();
    const rosterIds = new Set(roster.map((item) => item.id));
    const missing = roster.map((item) => item.id).filter((id) => !pngIds.has(id)).sort();
    const extra = [...pngIds].filter((id) => !rosterIds.has(id)).sort();
    return text({ roster_count: roster.length, png_count: pngIds.size, missing, extra });
  },
);

server.registerTool(
  "clipper_get_program_stats",
  {
    title: "Clipper Get Program Stats",
    description: "Fetch Kick Content Program stats if an API is configured, otherwise return manual scrape steps.",
    inputSchema: {
      period: z.enum(["today", "week", "month", "all"]).default("month"),
    },
  },
  async ({ period }) => {
    const api = await kickApiRequest("GET", `/stats?period=${encodeURIComponent(period)}`);
    if (!api.configured) return text(manualKickProgramStats(period));
    return text({ period, ...(api.response as Record<string, unknown>) });
  },
);

server.registerTool(
  "clipper_submit_post_for_payout",
  {
    title: "Clipper Submit Post For Payout",
    description: "Submit a social post URL to Kick Content Program if API exists, otherwise return manual submission steps and optional local Supabase logging.",
    inputSchema: {
      post_url: z.string().url(),
      platform: z.enum(["x", "tiktok", "youtube", "instagram"]),
      streamer_clipped: z.string().min(1),
      confirm: z.boolean().default(false),
    },
  },
  async ({ post_url, platform, streamer_clipped, confirm }) => {
    const normalizedStreamer = safeHandle(streamer_clipped);
    const api = confirm ? await kickApiRequest("POST", "/submissions", { post_url, platform, streamer_clipped: normalizedStreamer }) : { configured: false };
    const status = api.configured ? "submitted" : "manual_required";
    const log = await maybeLogSubmission({
      post_url,
      platform,
      streamer_clipped: normalizedStreamer,
      submission_status: status,
      submission_id: api.configured ? (api.response as Record<string, unknown>).id ?? null : null,
      created_at: new Date().toISOString(),
    });
    return text({
      post_url,
      submission_status: status,
      submission_id: api.configured ? (api.response as Record<string, unknown>).id ?? null : null,
      log,
      manual_steps: api.configured ? [] : [
        "Open https://kick.com/program while logged in.",
        "Choose the clip submission form.",
        `Paste URL: ${post_url}`,
        `Select platform: ${platform}`,
        `Select streamer: ${normalizedStreamer}`,
        "Submit and copy the confirmation ID back into your records.",
      ],
      note: confirm ? null : "Dry run/manual mode. If Kick API becomes available, configure KICK_PROGRAM_API_BASE and KICK_PROGRAM_API_KEY and re-run with confirm=true.",
    });
  },
);

server.registerTool(
  "clipper_get_viralclips_analytics",
  {
    title: "Clipper Get Viralclips Analytics",
    description: "Pull @VlRALCLIPS analytics from configured APIs, or return exact missing-key setup requirements.",
    inputSchema: {
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      platform: z.enum(["x", "tiktok", "all"]).default("all"),
    },
  },
  async ({ date_from, date_to, platform }) => {
    const range = { date_from: date_from ?? null, date_to: date_to ?? null };
    const response: Record<string, unknown> = { range, platform, sources: {} };
    if (platform === "x" || platform === "all") {
      const token = env("X_API_BEARER_TOKEN");
      if (!token) {
        (response.sources as Record<string, unknown>).x = {
          configured: false,
          required_env: ["X_API_BEARER_TOKEN"],
          note: "X analytics require Allan's Premium+/developer bearer token and account/tweet endpoint access.",
        };
      } else {
        const userRes = await fetch("https://api.x.com/2/users/by/username/VlRALCLIPS?user.fields=public_metrics", {
          headers: { authorization: `Bearer ${token}` },
        });
        const userRaw = await userRes.text();
        const userJson = userRaw ? JSON.parse(userRaw) : {};
        if (!userRes.ok) throw new Error(`X API user lookup failed: ${userRes.status} ${userRaw}`);
        const userId = userJson.data?.id;
        const tweetsRes = await fetch(`https://api.x.com/2/users/${userId}/tweets?max_results=20&tweet.fields=created_at,public_metrics,organic_metrics,non_public_metrics`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const tweetsRaw = await tweetsRes.text();
        const tweetsJson = tweetsRaw ? JSON.parse(tweetsRaw) : {};
        if (!tweetsRes.ok) throw new Error(`X API tweets lookup failed: ${tweetsRes.status} ${tweetsRaw}`);
        const tweets = Array.isArray(tweetsJson.data) ? tweetsJson.data as Record<string, unknown>[] : [];
        const topPosts = tweets.map((tweet) => {
          const metrics = (tweet.public_metrics ?? tweet.organic_metrics ?? {}) as Record<string, unknown>;
          const views = Number(metrics.impression_count ?? 0);
          return {
            url: `https://x.com/VlRALCLIPS/status/${tweet.id}`,
            views,
            likes: metrics.like_count ?? null,
            shares: metrics.retweet_count ?? null,
            posted_at: tweet.created_at ?? null,
          };
        }).sort((a, b) => b.views - a.views);
        const totalImpressions = topPosts.reduce((sum, post) => sum + post.views, 0);
        (response.sources as Record<string, unknown>).x = {
          configured: true,
          follower_count: userJson.data?.public_metrics?.followers_count ?? null,
          follower_growth_period: null,
          top_posts: topPosts,
          avg_views: topPosts.length ? Math.round(totalImpressions / topPosts.length) : 0,
          total_impressions: totalImpressions,
          viral_rate: topPosts.length ? topPosts.filter((post) => post.views > 50_000).length / topPosts.length : 0,
        };
      }
    }
    if (platform === "tiktok" || platform === "all") {
      (response.sources as Record<string, unknown>).tiktok = env("TIKTOK_API_KEY")
        ? { configured: false, note: "TikTok key is present, but official analytics endpoint/account mapping is not configured in this MCP yet." }
        : { configured: false, required_env: ["TIKTOK_API_KEY"], note: "TikTok official API access is required for analytics." };
    }
    return text(response);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("clipperviral-ops MCP running on stdio");
