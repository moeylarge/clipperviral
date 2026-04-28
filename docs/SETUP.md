# Setup

## 1) Install
```bash
npm install
```

## 2) Configure environment
Create `.env.local` with values from [ENVIRONMENT_VARIABLES.md](/Users/allanneyman/Documents/New project/docs/ENVIRONMENT_VARIABLES.md).

## 3) Run local app
```bash
npm run dev
```

## 4) Apply Supabase migrations (when project is ready)
```bash
supabase db push
```

## 5) Run Vercel-linked local env
```bash
vercel env pull .env.local
vercel dev
```
