# clipperviral-ops MCP

ClipperViral-specific MCP server for Kick streamer overlays, Seedance effect generation, payout submission helpers, and social analytics fallbacks.

## Setup

```bash
cd "/Users/allanneyman/Documents/New project/mcp/clipperviral-ops"
npm install
npm run build
claude mcp add --scope user clipperviral-ops node "/Users/allanneyman/Documents/New project/mcp/clipperviral-ops/dist/index.js"
```

Then fully quit and reopen Claude Code.

## Environment

Copy `.env.example` to `.env.local` if you need API-backed tools:

- `REPLICATE_API_TOKEN`
- `KICK_PROGRAM_API_KEY`
- `KICK_PROGRAM_API_BASE`
- `X_API_BEARER_TOKEN`
- `TIKTOK_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The local overlay and roster tools work without env vars.

## Tools

- `clipper_generate_streamer_overlay`
- `clipper_generate_seedance_effect`
- `clipper_check_seedance_run`
- `clipper_list_missing_streamers`
- `clipper_get_program_stats`
- `clipper_submit_post_for_payout`
- `clipper_get_viralclips_analytics`

`clipper_generate_seedance_effect` is cost-gated with `confirm=true`. If `wait_for_completion=false`, use `clipper_check_seedance_run` later to poll and download outputs.

Kick Content Program tools currently return manual steps unless Kick provides an API endpoint/key. This is intentional so the MCP is useful now without pretending undocumented endpoints exist.
