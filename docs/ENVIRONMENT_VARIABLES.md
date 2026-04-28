# Environment Variables

## Required (production)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `REDIS_URL`
- `REDIS_TOKEN` (if provider requires token auth)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `OPENAI_REALTIME_MODEL`
- `LIVEAVATAR_API_KEY`
- `LIVEAVATAR_BASE_URL`
- `LIVEAVATAR_AVATAR_ID_RABBI`
- `LIVEAVATAR_AVATAR_ID_BUSINESSMAN`
- `LIVEAVATAR_AVATAR_ID_MOSES`
- `LIVEAVATAR_ENABLED` (real LiveAvatar sessions are enabled only when this is exactly `true`; any other value, including empty/unset, disables real LiveAvatar)

## Optional (integration stubs)
- `HEYGEN_API_KEY`
- `NEXT_PUBLIC_OPENAI_REALTIME_MODEL`
- `LIVEAVATAR_MOCK` (`true` to bypass real LiveAvatar API for local/proof runs)
- `LIVEAVATAR_MOCK_STREAM_URL` (optional iframe URL used in mock mode; defaults to `about:blank`)
- Legacy fallback still accepted in code:
  - `HEYGEN_AVATAR_TEMPLATE_RABBI`
  - `HEYGEN_AVATAR_TEMPLATE_BUSINESSMAN`
  - `HEYGEN_AVATAR_TEMPLATE_MOSES`

## Notes
- Current code runs in memory without Supabase/Redis for local scaffolding.
- For production, replace in-memory stores with Supabase + Redis adapters.
- Stripe Checkout MVP runtime requires only:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - webhook endpoint: `/api/webhooks/stripe`
- Credit discipline policy:
  - Set `LIVEAVATAR_ENABLED=false` for automation, UI debugging, lifecycle tests, and load tests.
  - Set `LIVEAVATAR_ENABLED=true` only for controlled manual validation and production smoke checks.
  - If `LIVEAVATAR_ENABLED` is empty, unset, or any value other than `true`, runtime behaves as disabled/simulated mode.
