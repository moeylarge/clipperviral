# Scale TODO (500+ / 2500+)

1. Replace in-memory session store with Redis hot-state + Supabase durability writes.
2. Move heartbeat billing calc to idempotent service with monotonic billed checkpoints.
3. Add session worker for timeout cleanup and heartbeat-loss end policies.
4. Add distributed locks per session id for concurrent heartbeat safety.
5. Add rate limiting and abuse controls on session create and heartbeat endpoints.
6. Add structured logging + traces for session lifecycle and billing mismatch detection.
7. Add persona-level autoscaling orchestration for LiveAvatar sessions.
8. Add queue-based transcript chunk compaction and summary generation.
9. Add webhook reconciliation pipeline for Stripe payment events.
10. Run k6 load tests for 100/500/2500 concurrent isolated sessions.
