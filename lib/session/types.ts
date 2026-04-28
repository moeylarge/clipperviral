export type SessionStatus = "active" | "paused_for_payment" | "reconnecting" | "ended";
export type SessionEndedReason = "ended_user" | "ended_payment_required" | "ended_timeout" | "ended_failure" | null;
export type AccessState = "trial_eligible" | "trial_active" | "trial_expired" | "paid";

export type SessionMessage = {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

export type LiveSessionRecord = {
  id: string;
  userId: string;
  personaSlug: string;
  status: SessionStatus;
  endedReason: SessionEndedReason;
  startedAt: string;
  freeEndsAt: string;
  endedAt: string | null;
  lastHeartbeatAt: string;
  connectionState: "connected" | "reconnecting" | "disconnected";
  billableMs: number;
  chargedCents: number;
  durationMs: number;
  summaryPoints: string[];
};

export type HeartbeatResult = {
  session: LiveSessionRecord;
  accessState: AccessState;
  durationSeconds: number;
  trialSecondsRemaining: number;
  freeRemainingSeconds: number;
  shouldShowFreeEndingWarning: boolean;
  requiresPayment: boolean;
  balanceCents: number;
  effectiveCostCents: number;
};
