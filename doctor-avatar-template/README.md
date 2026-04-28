# For Mark

Standalone private LiveAvatar deployment.

## What it does

- runs as a separate Next.js app
- exposes one private route: `/private/<PRIVATE_ROUTE_KEY>`
- boots one LiveAvatar FULL-mode voice and video session for one configured avatar
- does not share routing or deployment state with the main kids app

## Required environment variables

- `PRIVATE_ROUTE_KEY`
- `LIVEAVATAR_ENABLED`
- `LIVEAVATAR_API_KEY`
- `LIVEAVATAR_BASE_URL`
- `LIVEAVATAR_AVATAR_ID`
- `LIVEAVATAR_CONTEXT_ID` (optional; if omitted, one is created from the prompt)
- `LIVEAVATAR_VOICE_ID` (optional)
- `CHARACTER_NAME`
- `CHARACTER_TAGLINE`
- `CHARACTER_OPENING_TEXT`
- `CHARACTER_SYSTEM_PROMPT`

## Safety note

This template should be framed as AI support, not medical advice. Keep the prompt conservative and route emergencies to real care.
