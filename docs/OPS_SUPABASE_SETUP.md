# Ops Supabase Setup

Use a separate free Supabase organization/project first. Upgrade later only if the ops tool actually needs more headroom.

## What is in repo

- Schema migration: `supabase/migrations/20260417143000_ops_system.sql`
- Seed generator: `scripts/generate-ops-seed.mjs`
- Seed file target: `supabase/seed.sql`

## Owner gate env vars

Set these before using the protected ops routes outside local mock mode:

```bash
OWNER_EMAIL=you@example.com
OWNER_PASSWORD=choose-a-strong-password
OWNER_SESSION_SECRET=generate-a-long-random-secret
```

## Point the app at the new Supabase project

Set these in your local env or Vercel project envs:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-new-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-new-project-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-new-project-service-role-key
```

The ops pages now read from Supabase on the server when those values are present. If they are missing or still point at an older project, the app falls back to the local seeded dataset.

## Generate seed file

```bash
npm run ops:seed
```

## Link this repo to the new Supabase project

```bash
npx supabase@latest login
npx supabase@latest link
```

## Push schema only

```bash
npx supabase@latest db push
```

## Push schema and seed data

```bash
npx supabase@latest db push --include-seed
```

## Notes

- `supabase/seed.sql` is generated from the app's current authoritative mock ops dataset.
- Ops table IDs are text IDs on purpose so the seed data and UI traces stay stable across local and Supabase environments.
- If you change the mock dataset, regenerate the seed file before pushing again.
