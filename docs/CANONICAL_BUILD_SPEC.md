# Face2Face AI MVP — Canonical Build Spec (Merged, Non-Overlapping)

This document is the single source of truth for implementation. It merges both user prompts and removes overlap, ambiguity, and loops.

## 1) Product Intent
Build a production-minded MVP of a webcam-style paid AI conversation app with one primary outcome:

`land -> choose persona -> start live conversation immediately -> stay past free minute -> pay`

This is not a dashboard, not a SaaS app shell, and not a generic chatbot page.

## 2) Hard Scope Boundaries
### In scope
- Mobile-first, conversion-first landing page
- 3 persona selection cards
- Immediate session creation and transition to live call screen
- First 60 seconds free
- Paid continuation at `$1.99/min`
- End screen with duration, total cost, transcript, and short summary
- Isolated parallel session architecture
- Server-side source of truth for billing timing

### Out of scope (for MVP)
- Social/community features
- Persona detail page maze
- Dashboard panels / admin-style home
- Heavy onboarding before session start
- WebRTC deep debugging optimization (do last phase)

## 3) Non-Overlapping Requirement Resolution
When similar rules appear multiple times, enforce once as below:

1. **UX priority:** zero-friction start flow takes precedence over added explanations.
2. **Architecture priority:** isolated per-session state is mandatory; persona-level shared runtime state is forbidden.
3. **Billing priority:** server truth for free-minute boundary and billable duration; client timers are display-only.
4. **Page hierarchy priority:** only three landing sections are allowed.
5. **Execution priority:** implement in required order (Section 11), with WebRTC debugging deferred to final phase.

## 4) Personas
Shared persona configuration only (template-level):
- `slug`, `displayName`, `valueLine`
- avatar config (placeholder now; swappable later for HeyGen outputs)
- voice config
- system prompt
- pricing rule (`1.99/min`, `60s free`)
- moderation profile

Launch personas:
1. Rabbi — "Life, family, clarity"
2. Businessman — "Money, deals, discipline"
3. Moses — "Leadership, wisdom, hard decisions"

## 5) UX and Screen Contract
## 5.1 Landing Page (`/app/page.tsx`)
Exact section hierarchy only:
1. `HeroSection`
2. `PersonaSelectionSection`
3. `MinimalFooter`

Hero must include:
- Headline: `Talk face-to-face with AI mentors`
- Subheadline: `Ask anything. First minute free.`
- Primary CTA: `Start Talking` (jumps to personas on same page)
- Subtext: `No signup required`

Persona cards:
- Entire card clickable
- No nested secondary buttons
- Hover/tap feedback
- Clicking card calls session create and transitions immediately

## 5.2 Live Session Page (`/app/session/[id]/page.tsx`)
Component tree:
- `SessionHeader` (persona name + LIVE)
- `AvatarViewport` (dominant area)
- `SessionControls` (timer, free-minute label, mute, end)
- `SessionOverlays` (`FreeEndingWarning`, `PaymentOverlay`, `ReconnectOverlay`)

Rules:
- No sidebars
- No chat panel dominance
- Minimal chrome

## 5.3 End Screen (`/app/session/[id]/end/page.tsx`)
Must show:
- total duration
- total cost
- transcript
- 3-point summary

Actions:
- `Talk again`
- `Try another`

## 6) Session Isolation Model (Critical)
Personas are reusable templates; every user conversation is a private isolated session.

Per-session isolation requirements:
- unique `session_id`
- transcript state
- billing/timer state
- connection/reconnect/heartbeat state
- rolling memory and summary
- final session output

Forbidden:
- shared persona chatroom state
- transcript/context leakage between users
- persona-level singleton runtime that couples users

Concurrency target model:
- Same persona must support many simultaneous private sessions (10, 50, 100, 500, 2500+)

## 7) Architecture Contract
Stack:
- Next.js + TypeScript + Tailwind
- Supabase for durable records
- Redis for hot ephemeral session state
- Stripe for top-up payments and ledger events
- HeyGen + LiveAvatar LITE integration points (real-time layer)

Persistence split:
- Supabase: durable truth (sessions, messages, usage events, payments, metrics)
- Redis: active in-memory live state (heartbeat, connection, rolling summary, temporary flags)

## 8) API Contract (Required)
Implement:
- `POST /api/sessions/create`
- `POST /api/sessions/:id/heartbeat`
- `POST /api/sessions/:id/end`
- `GET /api/sessions/:id`
- `GET /api/sessions/:id/transcript`
- `GET /api/personas`
- `POST /api/billing/top-up`
- `GET /api/billing/balance`
- `POST /api/webhooks/stripe`

## 9) Data Models (Required)
Durable models/tables:
- `personas`
- `users`
- `live_sessions`
- `session_messages`
- `session_transcript_chunks`
- `session_usage_events`
- `payments`
- `persona_metrics_daily`

Separation requirements:
- persona config != session data != billing ledger != metrics

## 10) Billing Logic Contract
- Free window: first 60s per session
- After 60s: charge by elapsed billable time at `$1.99/min`
- Prepaid credits burn down server-side only
- If insufficient balance after free minute: pause and show continue overlay
- Critical realtime failure must stop billing progression

Server is source of truth for:
- free-minute expiration
- billable start
- billable seconds
- final cost

## 11) Build Order (Locked)
1. Schema + session model
2. Persona config system
3. Session creation flow
4. Landing page + selection
5. Live session UI + state machine
6. Server-side prepaid billing
7. Transcript persistence
8. End screen summary flow
9. Heartbeat/reconnect/failure handling
10. Observability metrics
11. Load tests for isolated parallel sessions
12. WebRTC/avatar deep debugging (last)

## 12) Failure Handling Rules
Handle explicitly:
- mic disconnect
- avatar disconnect
- realtime connection drop
- insufficient balance
- tab close
- idle timeout
- heartbeat loss

Guarantees:
- stop billing on critical pipeline failure
- end/cleanup zombie sessions
- preserve transcript when possible
- support reconnect path when valid

## 13) Metrics Contract
Track at minimum:
- landing -> persona click
- persona click -> session start
- 15s and 60s retention
- free->paid conversion
- average paid duration
- revenue/session, revenue/persona
- disconnect rate
- reconnect success
- billing mismatch
- transcript completion

## 14) Visual Workflow Rule
- Use Grok Imagine for initial concept generation
- Use HeyGen for avatar implementation
- Keep persona visual config swappable
- Do not block architecture/UI progress on final art quality

## 15) Deliverables Checklist
- Full folder structure
- Schema files
- API route files
- Session state machine
- Env var list
- Setup and local run instructions
- Test plan
- Load test scripts for parallel isolated sessions
- Scale TODOs for 500+ and 2500+

---

## Implementation Note (Loop Prevention)
If any new instruction duplicates an existing requirement, keep this document unchanged unless the new instruction introduces a strict contradiction. If contradictory, apply the precedence from Section 3 and update only one canonical location.
