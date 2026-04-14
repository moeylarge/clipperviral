"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare,
  HandMetal,
  SendHorizonal,
  Vote,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type Contestant = {
  id: string;
  name: string;
  lane: string;
  genre: string;
  pitchTitle: string;
  pitchSummary: string;
  pitchUrl: string;
  pitchAvatar: string;
  score: number;
  momentum: number;
  status: "waiting" | "live" | "ended";
};

type QueueEntry = {
  id: string;
  name: string;
  lane: string;
  genre: string;
};

type VoteChoice = "keep" | "swap";

type RoundState = "waiting" | "live" | "ended";

type RoundResult = {
  headline: string;
  detail: string;
  outcome: "SPOTLIGHT HELD" | "SPOTLIGHT PASSED";
  winner: {
    id: string;
    name: string;
    lane: string;
    wasActive: boolean;
  };
  votes: {
    winner: number;
    loser: number;
    winnerShare: number;
    margin: number;
  };
};

type CommentEntry = {
  id: string;
  author: string;
  role: string;
  message: string;
};

type AudiencePhase =
  | "joinQueue"
  | "queueWait"
  | "ready"
  | "voteIdle"
  | "voteOpen"
  | "voteLocked"
  | "resultView";

type ShowLobbyClientProps = {
  showId: string;
};

type ViewerPhase = "notInQueue" | "inQueue" | "invited" | "nextUp";

type PrimaryAudienceAction = {
  label: string;
  variant: "cta" | "default" | "outline";
  disabled: boolean;
  onClick?: () => void;
  helper: string;
};

type TransitionTone = {
  label: string;
  detail: string;
  tone: "neutral" | "ready" | "live" | "locked" | "ended" | "result";
};

const BASE_VOTES = { keep: 812, swap: 287 };
const ROUND_SECONDS = 30;
const VIEWER_ID = "viewer-spotlight";

const seedContestants: Contestant[] = [
  {
    id: "c-01",
    name: "LUNA V.",
    lane: "A1",
    genre: "Performance",
    pitchTitle: "LumaBoard — Real-time team dashboards for side-project teams",
    pitchSummary: "A lightweight dashboard that syncs tasks, releases, and goals while teams pitch together in live sync rooms.",
    pitchUrl: "https://example.com/lumaboard",
    pitchAvatar: "🌀",
    score: 248,
    momentum: 19,
    status: "waiting",
  },
  {
    id: "c-02",
    name: "Milo D.",
    lane: "B2",
    genre: "Improv",
    pitchTitle: "LoopHouse — AI first improv rehearsal trainer",
    pitchSummary: "A mock-stage practice app for creators to rehearse product demos and get instant crowd feedback.",
    pitchUrl: "https://example.com/loophouse",
    pitchAvatar: "🎤",
    score: 212,
    momentum: 12,
    status: "waiting",
  },
  {
    id: "c-03",
    name: "Kiara M.",
    lane: "C1",
    genre: "Voice",
    pitchTitle: "PulsePitch — Voice-first creator portfolio",
    pitchSummary: "A portfolio system where creators upload launches and run instant investor-ready pitch previews.",
    pitchUrl: "https://example.com/pulsepitch",
    pitchAvatar: "🎧",
    score: 188,
    momentum: 8,
    status: "waiting",
  },
  {
    id: "c-04",
    name: "Noah R.",
    lane: "B4",
    genre: "Comedy",
    pitchTitle: "ClipOrbit — social proof clips with trust labels",
    pitchSummary: "A fast clip launcher that tags performance moments and shares creator proof in one tap.",
    pitchUrl: "https://example.com/cliporbit",
    pitchAvatar: "🎬",
    score: 181,
    momentum: -1,
    status: "waiting",
  },
];

const seedComments: Record<string, CommentEntry[]> = {
  "c-01": [
    { id: "c1", author: "Rae K", role: "builder", message: "The live sync room concept is strong." },
    { id: "c2", author: "Jon D", role: "founder", message: "What stack are you using for realtime updates?" },
  ],
  "c-02": [{ id: "c3", author: "Mina V", role: "investor", message: "Could this be demoed as a mobile first flow?" }],
  "c-03": [{ id: "c4", author: "Dev P", role: "creator", message: "I like the short form clips idea." }],
  "c-04": [{ id: "c5", author: "Kai R", role: "audience", message: "The proof badge system feels solid." }],
};

const baseQueue: QueueEntry[] = [
  {
    id: "c-02",
    name: "Milo D.",
    lane: "B2",
    genre: "Improv",
  },
  {
    id: "c-03",
    name: "Kiara M.",
    lane: "C1",
    genre: "Voice",
  },
  {
    id: "c-04",
    name: "Noah R.",
    lane: "B4",
    genre: "Comedy",
  },
];

function formatSeconds(seconds: number) {
  const display = Math.max(seconds, 0);
  const mins = Math.floor(display / 60);
  const secs = display % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function ShowLobbyClient({ showId }: ShowLobbyClientProps) {
  const showName = showId.replace(/-/g, " ");
  const [activeContestantId, setActiveContestantId] = useState(seedContestants[0].id);
  const [contestants, setContestants] = useState<Contestant[]>(seedContestants);
  const [queue, setQueue] = useState<QueueEntry[]>(baseQueue);
  const [roundState, setRoundState] = useState<RoundState>("waiting");
  const [secondsLeft, setSecondsLeft] = useState(ROUND_SECONDS);
  const [votes, setVotes] = useState(BASE_VOTES);
  const [viewerVote, setViewerVote] = useState<VoteChoice | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [isVoteArmed, setIsVoteArmed] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [isHostDemoOpen, setIsHostDemoOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentThreads, setCommentThreads] = useState<Record<string, CommentEntry[]>>(seedComments);
  const [transitionPulse, setTransitionPulse] = useState<TransitionTone | null>(null);
  const [transitionCountdown, setTransitionCountdown] = useState(0);
  const transitionTimeoutRef = useRef<number | null>(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const roundTransitionRef = useRef({
    roundState: "waiting" as RoundState,
    viewerState: "notInQueue" as ViewerPhase,
    viewerVote: null as VoteChoice | null,
    hasResult: false,
  });

  const activeContestant = useMemo(
    () => contestants.find((contestant) => contestant.id === activeContestantId) ?? contestants[0],
    [activeContestantId, contestants]
  );
  const activeComments = useMemo(() => commentThreads[activeContestant.id] ?? [], [commentThreads, activeContestant.id]);

  const queuePosition = useMemo(
    () => queue.findIndex((entry) => entry.id === VIEWER_ID),
    [queue]
  );
  const queuePositionLabel = queuePosition >= 0 ? `${queuePosition + 1}/${queue.length}` : null;

  const viewerState: ViewerPhase = useMemo(() => {
    if (queuePosition === -1) {
      return "notInQueue";
    }
    if (queuePosition === 0) {
      return roundState === "live" ? "nextUp" : "invited";
    }
    return "inQueue";
  }, [queuePosition, roundState]);

  const viewerInQueue =
    viewerState === "inQueue" || viewerState === "invited" || viewerState === "nextUp";

  const audiencePhase = useMemo<AudiencePhase>(() => {
    if (roundState === "ended") {
      return "resultView";
    }

    if (roundState === "live") {
      if (viewerVote) return "voteLocked";
      return isVoteArmed ? "voteOpen" : "voteIdle";
    }

    if (viewerState === "inQueue") {
      return "queueWait";
    }

    if (viewerState === "invited" || viewerState === "nextUp") {
      return "ready";
    }

    return "joinQueue";
  }, [isVoteArmed, roundState, viewerState, viewerVote]);

  const viewerReadyMode = viewerState === "invited" || viewerState === "nextUp";

  const joinQueue = useCallback(() => {
    if (viewerInQueue) return;
    setQueue((current) => {
      if (current.some((entry) => entry.id === VIEWER_ID)) return current;
      const lane = `Q${current.length + 1}`;
      return [...current, { id: VIEWER_ID, name: "You", lane, genre: "Live viewer" }];
    });
    setViewerReady(false);
  }, [viewerInQueue]);

  const totalVotes = votes.keep + votes.swap;
  const keepPercent = totalVotes ? clamp(Math.round((votes.keep / totalVotes) * 100), 0, 100) : 0;
  const swapPercent = totalVotes ? 100 - keepPercent : 0;

  const canVote = roundState === "live" && viewerVote === null && isVoteArmed;
  const canStartRound = roundState === "waiting";
  const canAdvanceContestant = queue.length > 0 && roundState !== "live";

  const isLiveRound = roundState === "live";
  const isEndingSoon = isLiveRound && secondsLeft <= 8 && secondsLeft > 0;
  const stateTone = isLiveRound
    ? isEndingSoon
      ? "FINAL SECONDS"
      : "LIVE"
    : roundState === "ended"
      ? "RESULT"
      : viewerState === "notInQueue"
        ? "JOIN"
        : viewerState === "inQueue"
          ? "QUEUED"
          : "READY";
  const stateSubline = isLiveRound
    ? isVoteArmed
      ? "Choose a lane."
      : viewerVote
        ? "Decision locked."
        : "Watch the creator pitch."
    : roundState === "ended"
      ? result
        ? `Result locked · ${result.votes.margin} point spread`
        : "Round sealed."
      : viewerState === "invited" || viewerState === "nextUp"
        ? "You are up next."
        : viewerState === "inQueue"
          ? queuePositionLabel
            ? `Queue position ${queuePositionLabel}`
            : "You are queued."
          : "Join queue to get into the room.";

  const roundPulseClass = isLiveRound
    ? "animate-pulse ring-1 ring-accent/40 shadow-[0_0_45px_rgba(0,214,255,0.45)]"
    : roundState === "ended"
      ? "ring-1 ring-rose-400/30 shadow-[0_0_35px_rgba(245,87,108,0.22)]"
      : "ring-1 ring-white/12";

  const timerTone = isLiveRound
    ? isEndingSoon
      ? "text-rose-300"
      : "text-accent"
    : "text-white/55";
  const statusTextClass =
    roundState === "live"
      ? "text-accent"
      : roundState === "ended"
        ? "text-rose-300"
        : "text-white/60";
  const stageBandTone =
    transitionPulse?.tone === "live"
      ? "from-accent/30 via-cyan-300/20 to-transparent"
      : transitionPulse?.tone === "ended" || transitionPulse?.tone === "result"
        ? "from-rose-400/28 via-amber-300/12 to-transparent"
        : transitionPulse?.tone === "locked"
          ? "from-rose-400/20 via-amber-400/8 to-transparent"
          : isLiveRound
            ? "from-white/16 via-white/6 to-transparent"
            : "from-white/8 via-white/3 to-transparent";
  const timerClass =
    isEndingSoon && isLiveRound
      ? "scale-105 text-rose-300 drop-shadow-[0_0_14px_rgba(251,113,133,0.65)]"
      : timerTone;

  const audienceAction = useMemo<PrimaryAudienceAction>(() => {
    if (audiencePhase === "resultView") {
      return {
        label: "See result",
        variant: "outline",
        disabled: true,
        helper: "Next round starts after you advance from demo controls.",
        onClick: undefined,
      };
    }

    if (audiencePhase === "voteLocked") {
      return {
        label: "Vote locked",
        variant: "outline",
        disabled: true,
        helper: "Waiting for next round.",
        onClick: undefined,
      };
    }

    if (audiencePhase === "voteOpen") {
      return {
        label: "Vote open",
        variant: "cta",
        disabled: true,
        helper: "Open the two options.",
        onClick: undefined,
      };
    }

    if (audiencePhase === "voteIdle") {
      return {
        label: "Vote now",
        variant: "cta",
        disabled: false,
        helper: "Open the decision options.",
        onClick: () => setIsVoteArmed(true),
      };
    }

    if (audiencePhase === "queueWait") {
      return {
        label: "Queued",
        variant: "outline",
        disabled: true,
        helper: queuePositionLabel ? `Queue position ${queuePositionLabel}` : "Waiting for next live slot.",
        onClick: undefined,
      };
    }

    if (audiencePhase === "ready") {
      return {
        label: viewerReady ? "Ready" : "Get ready",
        variant: viewerReady ? "outline" : "cta",
        disabled: viewerReady,
        helper: viewerReady
          ? "Host will open your turn."
          : queuePositionLabel
            ? `Queue position ${queuePositionLabel}`
            : "Confirm to prep for your turn.",
        onClick: viewerReady ? undefined : () => setViewerReady(true),
      };
    }

    return {
      label: "Join queue",
      variant: "cta",
      disabled: false,
      helper: "Enter queue and watch the next creator.",
      onClick: joinQueue,
    };
  }, [audiencePhase, joinQueue, queuePositionLabel, viewerReady]);

  const triggerTransitionPulse = useCallback((next: TransitionTone, ms = 1300) => {
    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }

    setTransitionPulse(next);
    setTransitionCountdown(Math.ceil(ms / 1000));
    transitionTimeoutRef.current = window.setTimeout(() => {
      setTransitionPulse(null);
      setTransitionCountdown(0);
      transitionTimeoutRef.current = null;
    }, ms);
  }, []);

  const clearPulseState = useCallback(() => {
    if (transitionTimeoutRef.current) {
      window.clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    setTransitionPulse(null);
    setTransitionCountdown(0);
  }, []);

  const broadcastComment = useCallback(() => {
    const message = commentDraft.trim();
    if (!message) return;

    const newComment: CommentEntry = {
      id: crypto.randomUUID(),
      author: "You",
      role: "viewer",
      message,
    };

    setCommentThreads((current) => ({
      ...current,
      [activeContestant.id]: [...(current[activeContestant.id] ?? []), newComment],
    }));
    setCommentDraft("");
  }, [commentDraft, activeContestant.id]);

  const focusCommentComposer = useCallback(() => {
    commentInputRef.current?.focus();
  }, []);

  const votePanelVisible = audiencePhase === "voteOpen" && roundState === "live" && !viewerVote;

  useEffect(() => {
    if (transitionCountdown <= 0) return;
    const countdown = setInterval(() => {
      setTransitionCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => clearInterval(countdown);
  }, [transitionCountdown]);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current) {
        window.clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
    };
  }, []);

  const resetContestantStatuses = useCallback(
    (activeId?: string) => {
      setContestants((current) =>
        current.map((contestant) => ({
          ...contestant,
          status: contestant.id === activeId ? "live" : "waiting",
        }))
      );
    },
    []
  );

  const addScore = useCallback((id: string, delta: number) => {
    setContestants((current) =>
      current.map((contestant) =>
        contestant.id === id
          ? {
              ...contestant,
              score: contestant.score + delta,
              momentum: clamp(contestant.momentum + Math.sign(delta), -20, 99),
            }
          : contestant
      )
    );
  }, []);

  const finalizeRound = useCallback(
    (options?: { forcedWinnerId?: string; message?: string }) => {
      if (roundState !== "live") return;

      const queueLeader = queue[0]?.id;
      const autoWinner =
        options?.forcedWinnerId ??
        (queueLeader && swapPercent > keepPercent ? queueLeader : activeContestant.id);
      const resolvedWinnerContestant =
        contestants.find((contestant) => contestant.id === autoWinner) ?? activeContestant;
      const resolvedWinner = resolvedWinnerContestant?.name ?? activeContestant.name;
      const moveForward = autoWinner !== activeContestant.id;
      const winnerVotes = moveForward ? votes.swap : votes.keep;
      const loserVotes = moveForward ? votes.keep : votes.swap;
      const winnerShare = totalVotes ? clamp(Math.round((winnerVotes / totalVotes) * 100), 0, 100) : 0;
      const margin = Math.abs(winnerVotes - loserVotes);
      const resultText = moveForward
        ? `${resolvedWinner} takes the spotlight lane.`
        : `${resolvedWinner} holds the spotlight lane.`;

      setContestants((current) =>
        current.map((contestant) => {
          if (contestant.id === activeContestant.id) {
            return { ...contestant, status: "ended" };
          }
          if (contestant.id === autoWinner) {
            return { ...contestant, status: "ended" };
          }
          return contestant;
        })
      );

      setResult({
        headline: options?.message ?? `${resolvedWinner} ${moveForward ? "wins the handoff" : "protects the lane"}`,
        outcome: moveForward ? "SPOTLIGHT PASSED" : "SPOTLIGHT HELD",
        winner: {
          id: resolvedWinnerContestant?.id ?? activeContestant.id,
          name: resolvedWinner,
          lane: resolvedWinnerContestant?.lane ?? activeContestant.lane,
          wasActive: !moveForward,
        },
        votes: {
          winner: winnerVotes,
          loser: loserVotes,
          winnerShare,
          margin,
        },
        detail: resultText,
      });
      setRoundState("ended");
      setSecondsLeft(0);
      setIsVoteArmed(false);
      setViewerReady(false);
      triggerTransitionPulse(
        {
          label: "Result posted",
          detail: "Result posted.",
          tone: "result",
        },
        1200
      );
      addScore(autoWinner, moveForward ? 8 : 14);
    },
    [activeContestant, addScore, contestants, keepPercent, queue, roundState, swapPercent, totalVotes, triggerTransitionPulse, votes.keep, votes.swap]
  );

  const startRound = useCallback(() => {
    if (!canStartRound) return;

    clearPulseState();
    setResult(null);
    setViewerVote(null);
    setIsVoteArmed(false);
    setViewerReady(false);
    setVotes(BASE_VOTES);
    setSecondsLeft(ROUND_SECONDS);
    resetContestantStatuses(activeContestant.id);
    setRoundState("live");
    triggerTransitionPulse({
      label: "Lights up",
      detail: viewerReadyMode ? "The next performer is live." : "Round started.",
      tone: "live",
    }, 1400);
  }, [activeContestant.id, canStartRound, clearPulseState, resetContestantStatuses, triggerTransitionPulse, viewerReadyMode]);

  const endRound = useCallback(() => {
    finalizeRound({ message: "Host closed the round" });
  }, [finalizeRound]);

  const markWinner = useCallback(() => {
    if (roundState !== "live") return;
    finalizeRound({ forcedWinnerId: activeContestant.id, message: "Host marked winner" });
  }, [activeContestant.id, finalizeRound, roundState]);

  const advanceContestant = useCallback(() => {
    if (!canAdvanceContestant) return;

    const next = queue[0];
    if (!next) return;

    resetContestantStatuses();
    setActiveContestantId(next.id);
    setQueue((current) => current.slice(1));
    setResult(null);
    setViewerVote(null);
    setIsVoteArmed(false);
    setViewerReady(false);
    setVotes(BASE_VOTES);
    setSecondsLeft(ROUND_SECONDS);
    clearPulseState();
    setRoundState("waiting");
    triggerTransitionPulse({
      label: "Next contestant loaded",
      detail: `${next.name} moved to center spotlight lane.`,
      tone: "ready",
    }, 1100);
  }, [canAdvanceContestant, clearPulseState, queue, resetContestantStatuses, triggerTransitionPulse]);

  const resetDemo = useCallback(() => {
    clearPulseState();
    setActiveContestantId(seedContestants[0].id);
    setContestants(seedContestants);
    setQueue(baseQueue);
    setRoundState("waiting");
    setSecondsLeft(ROUND_SECONDS);
    setVotes(BASE_VOTES);
    setViewerVote(null);
    setIsVoteArmed(false);
    setViewerReady(false);
    setResult(null);
    setCommentThreads(seedComments);
    setCommentDraft("");
  }, [clearPulseState]);

  const vote = useCallback(
    (choice: VoteChoice) => {
      if (!canVote) return;
      setViewerVote(choice);
      setIsVoteArmed(false);
      setVotes((current) =>
        choice === "keep" ? { ...current, keep: current.keep + 1 } : { ...current, swap: current.swap + 1 }
      );
      triggerTransitionPulse({
        label: "Vote locked",
        detail: "Your pressure call is locked.",
        tone: "locked",
      });
    },
    [canVote, triggerTransitionPulse]
  );

  useEffect(() => {
    const prev = roundTransitionRef.current;
    if (prev.roundState === "waiting" && viewerState === "invited") {
      triggerTransitionPulse({
        label: "Spotlight queue advanced",
        detail: "You are in the next-up position.",
        tone: "ready",
      });
    }

    if (prev.roundState === "waiting" && roundState === "live" && viewerState === "nextUp") {
      triggerTransitionPulse({
        label: "Go live",
        detail: "The spotlight is live for the active contestant.",
        tone: "live",
      });
    }

    if (prev.roundState === "live" && roundState === "ended") {
      triggerTransitionPulse({
        label: "Round sealed",
        detail: "Round result is calculating.",
        tone: "ended",
      });
    }

    if (!prev.hasResult && !!result) {
      triggerTransitionPulse({
        label: "Result posted",
        detail: "Decision is published.",
        tone: "result",
      });
    }

    if (prev.roundState === "ended" && roundState === "waiting" && prev.hasResult) {
      triggerTransitionPulse({
        label: "Next call loaded",
        detail: "A fresh stage cycle is now ready.",
        tone: "ready",
      });
    }

    roundTransitionRef.current = {
      roundState,
      viewerState,
      viewerVote,
      hasResult: !!result,
    };

    if (viewerState !== "invited" && viewerState !== "nextUp") {
      setViewerReady(false);
    }
  }, [queuePosition, result, roundState, viewerState, viewerVote, triggerTransitionPulse]);

  useEffect(() => {
    if (roundState !== "live") return;
    if (secondsLeft <= 0) {
      finalizeRound({ message: "Time elapsed" });
      return;
    }

    const timer = setTimeout(() => {
      setSecondsLeft((seconds) => seconds - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [roundState, secondsLeft, finalizeRound]);

  useEffect(() => {
    if (roundState !== "live") {
      setIsVoteArmed(false);
    }
  }, [roundState]);

  useEffect(() => {
    setCommentDraft("");
  }, [activeContestant.id]);

  return (
    <section className="space-y-3">
      <div className="relative min-h-[92vh] md:min-h-[78vh] xl:min-h-[74vh] overflow-hidden">
        <div className="xl:grid xl:grid-cols-[1fr_16.5rem] xl:items-start xl:gap-4">
          <section className={`relative isolate min-h-[92vh] md:min-h-[78vh] xl:min-h-[74vh] overflow-hidden ${roundPulseClass}`}>
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,_hsl(226_33%_13%),_hsl(224_21%_7%))]" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_14%_20%,_hsla(14,100%,58%,0.35),_transparent_40%),radial-gradient(circle_at_84%_72%,_hsla(192,100%,55%,0.22),_transparent_54%),radial-gradient(circle_at_35%_0%,rgba(255,255,255,0.08),rgba(0,0,0,0.2)_60%)]" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/35 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent" />

            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1/2 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.04)_0,rgba(255,255,255,0.04)_1px,rgba(255,255,255,0)_13px,rgba(255,255,255,0)_17px)]" />
            <div className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-full bg-gradient-to-b ${stageBandTone} opacity-90`} />
            {queue[0] ? (
              <p className="pointer-events-none absolute left-5 top-24 z-10 rounded-full border border-white/25 bg-black/35 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/80">
                Next up: {queue[0]?.name}
              </p>
            ) : null}

            <div className={`pointer-events-none absolute inset-x-4 bottom-40 z-10 h-10 w-11/12 rounded-full bg-gradient-to-r from-primary/8 via-accent/14 to-primary/8 blur-3xl ${isLiveRound ? "animate-pulse" : ""}`} />

            {transitionPulse ? (
              <div className="pointer-events-none absolute inset-x-4 top-12 z-20 overflow-hidden rounded-xl border border-white/25 bg-black/40 px-4 py-2 backdrop-blur-sm">
                <p className="text-[11px] uppercase tracking-[0.16em] text-accent">
                  {transitionPulse.label}
                </p>
                <p className="mt-0.5 text-xs text-white/85">{transitionPulse.detail}</p>
                {transitionCountdown > 0 ? <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-white/60">{transitionCountdown}s</p> : null}
              </div>
            ) : null}

              <div className="relative z-10 flex h-full flex-col px-5 pb-5 pt-4 md:px-6 md:pt-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.16em] text-white/80">
                  <p className="inline-flex items-center gap-2 text-primary">
                    <span className="inline-flex h-2 w-2 rounded-full bg-primary" />
                    LIVE ROOM
                  </p>
                  <p>{showName}</p>
                </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />

                <div className="mt-auto grid gap-4">
                  <div className="max-w-full space-y-2 md:space-y-3">
                    <p className={`text-xs uppercase tracking-[0.16em] ${statusTextClass}`}>{stateTone}</p>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 flex h-14 w-14 items-center justify-center rounded-full border border-white/20 bg-black/40 text-2xl">
                          {activeContestant.pitchAvatar}
                        </div>
                        <div>
                          <p className="text-[clamp(2rem,7vw,4.6rem)] leading-[0.95] font-semibold uppercase tracking-[0.02em] text-white [text-shadow:_0_30px_65px_rgba(0,0,0,0.6)]">
                            {activeContestant.name}
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-[0.15em] text-white/85">
                            {activeContestant.genre} · Lane {activeContestant.lane}
                          </p>
                        </div>
                      </div>
                    <div className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-right">
                      <p className={`text-[10px] uppercase tracking-[0.16em] ${statusTextClass}`}>Round clock</p>
                      <p className={`mt-0.5 text-2xl font-black leading-none tracking-[0.04em] ${timerClass}`}>
                        {isLiveRound || roundState === "ended" ? formatSeconds(secondsLeft) : "--:--"}
                      </p>
                    </div>
                    </div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-white/60">
                      {stateSubline}
                    </p>
                    <div className="rounded-lg border border-white/15 bg-black/45 px-3 py-2.5">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-accent">Pitch</p>
                      <p className="mt-1 text-sm font-semibold text-white">{activeContestant.pitchTitle}</p>
                      <p className="mt-1 text-xs text-white/75">{activeContestant.pitchSummary}</p>
                    </div>
                    <a
                      href={activeContestant.pitchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 self-start text-xs uppercase tracking-[0.14em] text-emerald-200 transition hover:text-emerald-100"
                    >
                      Open product / website
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={focusCommentComposer}>
                        Comment
                        <MessageSquare className="ml-2 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                {result ? (
                  <div className="relative overflow-hidden rounded-xl border border-emerald-400/35 bg-black/45 px-4 py-3 text-sm">
                    <p className="text-[11px] uppercase tracking-[0.2em] text-emerald-200/85">
                      {result.outcome}
                    </p>
                    <p className="mt-1 text-2xl font-black uppercase leading-tight tracking-[0.01em] text-white">
                      {result.winner.name}
                    </p>
                    <p className="mt-1 text-sm text-white/85">{result.headline}</p>
                    <p className="mt-2 text-xs text-white/70">
                      {result.votes.winner} / {result.votes.loser} · {result.votes.winnerShare}% keep
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <aside className="xl:pt-[4.25rem]">
            <div className="space-y-2 text-sm xl:border-l xl:border-white/12 xl:pl-4">
              <section
                className={`rounded-[0.9rem] border border-white/14 bg-black/22 p-3 backdrop-blur-sm xl:bg-transparent xl:border-white/10 ${
                  roundState === "live" ? "from-accent/8 to-black/20 bg-gradient-to-b" : ""
                } ${roundState === "ended" ? "from-rose-500/8 to-black/20 bg-gradient-to-b" : ""}`}
              >
                <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-[0.16em] text-white/70">
                  <p>Audience action</p>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">{roundState === "live" ? "Live" : "Ready"}</p>
                </div>
                <Button
                  size="sm"
                  variant={audienceAction.variant}
                  className="mt-2 h-11 w-full"
                  onClick={audienceAction.onClick}
                  disabled={audienceAction.disabled}
                >
                  {audienceAction.label}
                </Button>
                <p className="mt-1.5 min-h-[1.2rem] text-[11px] uppercase tracking-[0.14em] text-white/50">{audienceAction.helper}</p>

                {roundState === "live" ? (
                  <p className="mt-2 text-xs text-white/70">
                    {totalVotes} live signals · Keep {keepPercent}% / Pass {swapPercent}%
                  </p>
                ) : null}

                {votePanelVisible ? (
                  <div className="mt-3 grid gap-2">
                    <Button size="sm" variant={viewerVote === "keep" ? "cta" : "outline"} onClick={() => vote("keep")} disabled={!canVote}>
                      Keep it
                      <Vote className="ml-2 h-4 w-4" />
                    </Button>
                    <Button size="sm" variant={viewerVote === "swap" ? "cta" : "outline"} onClick={() => vote("swap")} disabled={!canVote}>
                      Pass
                      <HandMetal className="ml-2 h-4 w-4" />
                    </Button>
                    {viewerVote ? <p className="text-xs text-white/65">Your decision: {viewerVote === "keep" ? "Keep" : "Pass"}</p> : null}
                  </div>
                ) : null}

                <div className="mt-2.5 space-y-2 border-t border-white/10 pt-2">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/50">Queue now</p>
                  <p className="text-xs text-white/75">
                    Next: {queue[0]?.name ? `${queue[0].name}` : "none"} · You: {queuePositionLabel ?? "not in queue"}
                  </p>
                </div>

                <div className="mt-2.5 border-t border-white/10 pt-2">
                  <label className="text-[10px] uppercase tracking-[0.14em] text-white/55" htmlFor="commentDraft">
                    Comment or DM
                  </label>
                  <div className="mt-1.5 flex gap-1">
                    <input
                      ref={commentInputRef}
                      id="commentDraft"
                      value={commentDraft}
                      onChange={(event) => setCommentDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          broadcastComment();
                        }
                      }}
                      placeholder="Type a quick note..."
                      className="h-9 flex-1 rounded-md border border-white/20 bg-black/35 px-2 text-xs text-white outline-none focus:border-accent"
                    />
                    <Button size="sm" variant="default" onClick={broadcastComment} disabled={!commentDraft.trim()}>
                      <SendHorizonal className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button size="sm" variant="outline" className="mt-2 w-full justify-start">
                    <MessageSquare className="mr-2 h-4 w-4" />
                    DM creator
                  </Button>
                </div>
              </section>

              <section className="rounded-[0.9rem] border border-white/10 bg-black/12 px-3 py-2.5 text-xs text-white/75">
                <button
                  type="button"
                  onClick={() => setIsHostDemoOpen((open) => !open)}
                  className="flex w-full items-center justify-between text-left text-[11px] uppercase tracking-[0.16em] text-white/45 hover:text-white/70"
                >
                  <span>Demo controls</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-white/35">
                    {isHostDemoOpen ? "Hide" : "Open"}
                  </span>
                </button>
                {isHostDemoOpen ? (
                  <div className="mt-2.5 space-y-2">
                    <p className="text-[10px] uppercase tracking-[0.15em] text-white/35">Host mock controls</p>
                  <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
                      <Button size="sm" variant="outline" onClick={startRound} disabled={!canStartRound}>
                        Start round
                      </Button>
                      <Button size="sm" variant="outline" onClick={endRound} disabled={roundState !== "live"}>
                        End round
                      </Button>
                      <Button size="sm" variant="outline" onClick={advanceContestant} disabled={!canAdvanceContestant}>
                        Next contestant
                      </Button>
                      <Button size="sm" variant="outline" onClick={markWinner} disabled={roundState !== "live"}>
                        Mark winner
                      </Button>
                      <Button size="sm" variant="outline" onClick={resetDemo} className="col-span-2 xl:col-span-1">
                        Reset demo
                      </Button>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          </aside>
        </div>
      </div>

      <section id="vote" className="grid gap-2">
        <article className="rounded-xl border border-white/12 bg-black/15 px-4 py-3 text-sm">
          <p className="text-[11px] uppercase tracking-[0.16em] text-accent">Pitch room chat</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-lg font-semibold text-white">{activeContestant.name} · Live chatter</p>
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/55">{activeComments.length} comments</p>
          </div>
          <div className="mt-2 space-y-2 text-sm text-white/80">
            <div className="space-y-2">
              {activeComments.slice(0, 4).map((comment) => (
                <p key={comment.id} className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-white/55">
                    {comment.author}
                  </span>
                  <br />
                  <span className="text-sm text-white/90">{comment.message}</span>
                </p>
              ))}
            </div>
          </div>
        </article>
      </section>
    </section>
  );
}
