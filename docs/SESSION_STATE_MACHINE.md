# Session State Machine

## States
- `active`
- `paused_for_payment`
- `reconnecting`
- `ended`

## Transitions
1. `create -> active`
2. `active -> paused_for_payment` when free minute expired and balance cannot cover additional billable time
3. `active -> reconnecting` on heartbeat reconnect signal
4. `reconnecting -> active` when heartbeat normalizes
5. `paused_for_payment -> active` when user tops up and heartbeat resume is sent
6. `active|paused_for_payment|reconnecting -> ended` on explicit end or enforced cleanup

## Billing Rules
- Free minute is measured server-side from `started_at` to `free_ends_at`.
- Billable cost accrues only while state is `active` and after free window.
- If balance is insufficient, transition immediately to `paused_for_payment`.
- State `reconnecting` and any critical realtime failure should not advance billable state.

## Session Truth
Server heartbeat response is source of truth for:
- duration
- free remaining
- paused-for-payment requirement
- effective charged amount
