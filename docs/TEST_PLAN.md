# MVP Test Plan

## Functional
1. Landing page renders hero + 3 personas + minimal footer only.
2. Clicking each persona creates a unique session id.
3. Session page heartbeat updates timer and cost.
4. Free minute warning appears around 50-60s.
5. Insufficient credits after free minute triggers payment overlay.
6. Continue button tops up credits and resumes session.
7. End button finalizes session and opens end screen.
8. End screen shows duration, cost, transcript, summary.

## Isolation
1. Open 3 browsers with same persona.
2. Verify different `sessionId` for each user.
3. Add transcript events in one session and ensure others are unchanged.
4. Verify billing pause in one session does not impact others.

## Failure handling
1. Simulate heartbeat interruption and verify reconnect state.
2. Verify no further charges while paused for payment.
3. Verify end always moves to `ended` and no zombie billing.
