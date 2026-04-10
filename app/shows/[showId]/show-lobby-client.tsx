"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Flame,
  MessageSquare,
  HandMetal,
  Heart,
  MessageCircleMore,
  SendHorizonal,
  Vote,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { competitionBandLabel, tierFromScore } from "@/lib/competitive-intel";

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

const seedShowHost = {
  name: "Nova Ward",
  stage: "Spotlight Arena",
  runningAt: "Tonight, 8:00 PM PT",
  audience: "10,482",
};

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

const judges = [
  { name: "Rory Kline", state: "ON" },
  { name: "Mina Val", state: "READY" },
  { name: "Kai Voss", state: "CUTTING" },
] as const;

function judgeSignalColor(state: (typeof judges)[number]["state"]) {
  switch (state) {
    case "ON":
      return "text-emerald-300";
    case "READY":
      return "text-amber-200";
    case "CUTTING":
      return "text-rose-300";
    default:
      return "text-white/80";
  }
}

function formatSeconds(seconds: number) {
  const display = Math.max(seconds, 0);
  const mins = Math.floor(display / 60);
  const secs = display % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatMomentum(value: number) {
  if (value === 0) return "00";
  const abs = Math.abs(value);
  const sign = value > 0 ? "+" : "-";
  return `${sign}${String(abs).padStart(2, "0")}`;
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
  const [resultPinned, setResultPinned] = useState(false);
  const [isHostDemoOpen, setIsHostDemoOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentThreads, setCommentThreads] = useState<Record<string, CommentEntry[]>>(seedComments);
  const [commentAck, setCommentAck] = useState("");
  const [engagementPulse, setEngagementPulse] = useState(0);
  const [dmPulse, setDmPulse] = useState("");
  const [transitionPulse, setTransitionPulse] = useState<TransitionTone | null>(null);
  const [showResultPulse, setShowResultPulse] = useState(false);
  const [transitionCountdown, setTransitionCountdown] = useState(0);
  const transitionTimeoutRef = useRef<number | null>(null);
  const feedbackTimeoutRef = useRef<number | null>(null);
  const resultPulseTimeoutRef = useRef<number | null>(null);
  const commentInputRef = useRef<HTMLInputElement | null>(null);
  const roundTransitionRef = useRef({
    roundState: "waiting" as RoundState,
    viewerState: "notInQueue" as ViewerPhase,
    viewerVote: null as VoteChoice | null,
    hasResult: false,
  });
  const resultCardRef = useRef<HTMLDivElement>(null);

  const activeContestant = useMemo(
    () => contestants.find((contestant) => contestant.id === activeContestantId) ?? contestants[0],
    [activeContestantId, contestants]
  );
  const activeBand = useMemo(() => competitionBandLabel(tierFromScore(activeContestant.score)), [activeContestant.score]);
  const activeComments = useMemo(() => commentThreads[activeContestant.id] ?? [], [commentThreads, activeContestant.id]);

  const queuePosition = useMemo(
    () => queue.findIndex((entry) => entry.id === VIEWER_ID),
    [queue]
  );
  const queuePositionLabel = queuePosition >= 0 ? `${queuePosition + 1}/${queue.length}` : null;
  const queuePositionCopy = queuePositionLabel ? `Position ${queuePositionLabel} in queue.` : "Queue is open.";

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

  const laneTelemetry = useMemo(() => {
    const livePulse = clamp(Math.round((keepPercent / 100) * 96), 45, 96);
    return [
      { lane: activeContestant.lane, label: "Live lead", pulse: `${livePulse}%` },
      ...(queue.slice(0, 2).map((entry, index) => ({
        lane: entry.lane,
        label: index === 0 ? "Next up" : "Queued",
        pulse: `${72 - index * 16}%`,
      })) as { lane: string; label: string; pulse: string }[]),
    ];
  }, [activeContestant.lane, queue, keepPercent]);

  const leaderboard = useMemo(
    () =>
      [...contestants]
        .sort((a, b) => b.score - a.score)
        .map((entry, index) => ({ ...entry, rank: index + 1 })),
    [contestants]
  );

  const canVote = roundState === "live" && viewerVote === null && isVoteArmed;
  const liveReactionCount = engagementPulse + votes.keep + votes.swap;
  const canStartRound = roundState === "waiting";
  const canAdvanceContestant = queue.length > 0 && roundState !== "live";

  const isLiveRound = roundState === "live";
  const isEndingSoon = isLiveRound && secondsLeft <= 8 && secondsLeft > 0;
  const stateTone = isLiveRound
    ? isEndingSoon
      ? "FINAL SECONDS"
      : "LIVE STAGE"
    : roundState === "ended"
      ? "RESULT"
      : audiencePhase === "ready"
        ? "NEXT UP"
        : audiencePhase === "queueWait"
          ? "WAITING IN QUEUE"
          : "WAITING";
  const stateSubline = isLiveRound
    ? isVoteArmed
      ? "Choose one vote to lock your pressure signal."
      : viewerVote
          ? "Vote is locked for this round."
          : "Voting lane is live."
    : roundState === "ended"
      ? result
          ? "Result posted."
          : "Round sealed."
      : audiencePhase === "ready" && viewerReady
          ? "You're confirmed for the next call."
          : audiencePhase === "ready"
            ? "Stand by for next pitch."
          : audiencePhase === "queueWait"
              ? "You are in queue."
              : "Join queue to get pitch access.";

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
      ? "from-accent/45 via-cyan-300/22 to-transparent"
      : transitionPulse?.tone === "ended" || transitionPulse?.tone === "result"
        ? "from-rose-500/35 via-amber-400/16 to-transparent"
        : transitionPulse?.tone === "locked"
          ? "from-rose-500/24 via-amber-500/10 to-transparent"
          : isLiveRound
            ? "from-primary/28 via-accent/20 to-transparent"
            : "from-white/12 via-white/4 to-transparent";
  const timerClass =
    isEndingSoon && isLiveRound
      ? "scale-105 text-rose-300 drop-shadow-[0_0_14px_rgba(251,113,133,0.65)]"
      : timerTone;
  const resultRevealClass = showResultPulse
    ? "ring-2 ring-emerald-300/65 shadow-[0_0_34px_rgba(122,255,205,0.28)] bg-black/65"
    : "";

  const resultStrip = result
    ? `Result • ${result.winner.wasActive ? "KEPT" : "PASSED"} by ${result.votes.winnerShare}%`
    : null;
  const resultHeadlineClass = result?.winner.wasActive ? "text-accent" : "text-rose-300";

  const audienceAction = useMemo<PrimaryAudienceAction>(() => {
    if (audiencePhase === "resultView") {
      return {
        label: "Result visible",
        variant: "outline",
        disabled: true,
        helper: "Result below the stage.",
        onClick: undefined,
      };
    }

    if (audiencePhase === "voteLocked") {
      return {
        label: "Vote locked",
        variant: "outline",
        disabled: true,
        helper: "Vote locked for this round.",
        onClick: undefined,
      };
    }

    if (audiencePhase === "voteOpen") {
      return {
        label: "Voting open",
        variant: "cta",
        disabled: true,
        helper: "Choose your call below.",
        onClick: undefined,
      };
    }

    if (audiencePhase === "voteIdle") {
      return {
        label: "Vote now",
        variant: "cta",
        disabled: false,
        helper: "Open the live vote lane.",
        onClick: () => setIsVoteArmed(true),
      };
    }

    if (audiencePhase === "queueWait") {
      return {
        label: "In queue",
        variant: "outline",
        disabled: true,
        helper: queuePositionLabel ? `Queue ${queuePositionLabel}` : "Stay ready as the arena advances.",
        onClick: undefined,
      };
    }

    if (audiencePhase === "ready") {
      return {
        label: viewerReady ? "Ready set" : "Get ready",
        variant: viewerReady ? "outline" : "cta",
        disabled: viewerReady,
        helper: viewerReady
          ? "Host call coming."
          : queuePositionLabel
            ? `Position ${queuePositionLabel}`
            : "Confirm once when ready.",
        onClick: viewerReady ? undefined : () => setViewerReady(true),
      };
    }

    return {
      label: "Join queue",
      variant: "cta",
      disabled: false,
      helper: "Claim a lane and wait.",
      onClick: joinQueue,
    };
  }, [audiencePhase, joinQueue, queuePositionLabel, queuePosition, viewerReady]);

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
    if (resultPulseTimeoutRef.current) {
      window.clearTimeout(resultPulseTimeoutRef.current);
      resultPulseTimeoutRef.current = null;
    }
    setTransitionPulse(null);
    setTransitionCountdown(0);
    setShowResultPulse(false);
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
    setCommentAck("Comment posted to this pitch.");

    if (feedbackTimeoutRef.current) {
      window.clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setCommentAck("");
      feedbackTimeoutRef.current = null;
    }, 2000);
  }, [commentDraft, activeContestant.id]);

  const sendReaction = useCallback(() => {
    setEngagementPulse((current) => current + 1);
    setCommentAck("You sent a live reaction.");
    if (feedbackTimeoutRef.current) {
      window.clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setCommentAck("");
      feedbackTimeoutRef.current = null;
    }, 2000);
  }, []);

  const sendDirectMessage = useCallback(() => {
    setDmPulse(`Message sent to ${activeContestant.name} (demo message).`);
    if (feedbackTimeoutRef.current) {
      window.clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = null;
    }
    feedbackTimeoutRef.current = window.setTimeout(() => {
      setDmPulse("");
      feedbackTimeoutRef.current = null;
    }, 2200);
  }, [activeContestant.name]);

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
      if (resultPulseTimeoutRef.current) {
        window.clearTimeout(resultPulseTimeoutRef.current);
        resultPulseTimeoutRef.current = null;
      }
      if (feedbackTimeoutRef.current) {
        window.clearTimeout(feedbackTimeoutRef.current);
        feedbackTimeoutRef.current = null;
      }
    };
  }, []);

  const setContestantStatus = useCallback((id: string, status: Contestant["status"]) => {
    setContestants((current) =>
      current.map((contestant) => (contestant.id === id ? { ...contestant, status } : contestant))
    );
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
      if (resultPulseTimeoutRef.current) {
        window.clearTimeout(resultPulseTimeoutRef.current);
      }
      setResultPinned(true);
      setShowResultPulse(true);
      triggerTransitionPulse(
        {
          label: "Result posted",
          detail: "Scoreboard update active.",
          tone: "result",
        },
        1200
      );
      resultPulseTimeoutRef.current = window.setTimeout(() => {
        setShowResultPulse(false);
        resultPulseTimeoutRef.current = null;
      }, 1200);
      addScore(autoWinner, moveForward ? 8 : 14);
    },
    [activeContestant.id, addScore, contestants, keepPercent, queue, roundState, swapPercent, totalVotes, triggerTransitionPulse, votes.keep, votes.swap]
  );

  const startRound = useCallback(() => {
    if (!canStartRound) return;

    clearPulseState();
    setResult(null);
    setResultPinned(false);
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
    setResultPinned(false);
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
  }, [canAdvanceContestant, clearPulseState, queue, resetContestantStatuses]);

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
    setResultPinned(false);
    setResult(null);
    setCommentThreads(seedComments);
    setCommentDraft("");
    setCommentAck("");
    setDmPulse("");
    setEngagementPulse(0);
  }, [clearPulseState]);

  const vote = useCallback(
    (choice: VoteChoice) => {
      if (!canVote) return;
      setViewerVote(choice);
      setIsVoteArmed(false);
      setVotes((current) =>
        choice === "keep" ? { ...current, keep: current.keep + 1 } : { ...current, swap: current.swap + 1 }
      );
      setContestantStatus(activeContestant.id, "live");
      triggerTransitionPulse({
        label: "Vote locked",
        detail: "Your pressure call is locked.",
        tone: "locked",
      });
    },
    [canVote, activeContestant.id, setContestantStatus, triggerTransitionPulse]
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
        detail: "Read the scoreboard shift.",
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
    setCommentAck("");
    setDmPulse("");
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

            <div className="pointer-events-none absolute -left-[30%] top-16 h-[34rem] w-[60%] rotate-[20deg] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.08),transparent_65%)] blur-3xl" />
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1/2 bg-[repeating-linear-gradient(90deg,rgba(255,255,255,0.04)_0,rgba(255,255,255,0.04)_1px,rgba(255,255,255,0)_13px,rgba(255,255,255,0)_17px)]" />
            <div className="pointer-events-none absolute right-[12%] top-[52%] h-40 w-40 rounded-full bg-[radial-gradient(circle_at_40%_40%,rgba(255,132,70,0.22),transparent_70%)] blur-2xl animate-ping" />
            <div className="pointer-events-none absolute left-[8%] top-[58%] h-52 w-52 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(0,205,255,0.15),transparent_72%)] blur-3xl animate-pulse" />
            <div className="pointer-events-none absolute inset-x-0 bottom-24 mx-auto h-1 w-11/12 bg-gradient-to-r from-transparent via-white/25 to-transparent" />

            <div className={`pointer-events-none absolute inset-x-0 top-0 z-10 h-full bg-gradient-to-b ${stageBandTone} opacity-90`} />
            <div className={`pointer-events-none absolute inset-x-4 top-24 z-10 grid gap-2 opacity-90 sm:grid-cols-3 ${isLiveRound || roundState === "ended" ? "sm:top-24" : "top-20"}`}>
              {laneTelemetry.map((lane) => (
                <div key={lane.lane} className="rounded-full bg-black/25 p-2.5 backdrop-blur">
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-white/80">
                    <span>{lane.lane} • {lane.label}</span>
                    <span className={lane.lane === activeContestant.lane ? "text-accent" : ""}>{lane.pulse}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/12">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary/90 to-accent/90"
                      style={{ width: lane.pulse }}
                    />
                  </div>
                </div>
              ))}
            </div>

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
                    LIVE SHOW
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
                            {activeContestant.genre} • {activeBand} • lane {activeContestant.lane}
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
                    <div className="rounded-lg border border-white/15 bg-black/45 px-3 py-2.5 text-sm">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-accent">Now pitching</p>
                      <p className="mt-0.5 text-white/95">{activeContestant.pitchTitle}</p>
                      <p className="mt-1 text-xs text-white/70">{activeContestant.pitchSummary}</p>
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
                        Comment now
                        <MessageSquare className="ml-2 h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={sendDirectMessage}>
                        DM creator
                        <MessageSquare className="ml-2 h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                <div className="grid gap-2 border-t border-white/10 pt-2 text-xs uppercase tracking-[0.14em]">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <p className="inline-flex items-center gap-2 text-white/45">
                      <Flame className="h-3.5 w-3.5 text-primary" />
                      Host: {seedShowHost.name}
                    </p>
                    <p className="inline-flex items-center gap-2 text-white/45">
                      Stage: {seedShowHost.stage} • {seedShowHost.runningAt}
                    </p>
                  </div>

                  <div className="w-full max-w-xl space-y-1.5">
                    <div className="flex items-center justify-between text-white/70">
                      <p>{activeContestant.name} score</p>
                      <p className="text-accent">
                        {activeContestant.score} • Momentum {formatMomentum(activeContestant.momentum)}
                      </p>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/16">
                      <div
                        className="h-full w-[71%] rounded-full bg-gradient-to-r from-primary/95 via-accent/95 to-white/85"
                        style={{ width: `${clamp(keepPercent, 12, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="relative rounded-xl border border-white/20 bg-black/35 px-4 py-3 text-sm">
                  <p className="text-xs uppercase tracking-[0.16em] text-accent">Judges</p>
                  <div className="mt-2 grid gap-1.5 text-xs uppercase tracking-[0.14em] text-white/65">
                    {judges.map((judge) => (
                      <p key={judge.name} className="flex items-center justify-between gap-2 border-l border-white/15 pl-2">
                        <span>{judge.name}</span>
                        <span className={judgeSignalColor(judge.state)}>{judge.state}</span>
                      </p>
                    ))}
                  </div>
                </div>

                {result ? (
                  <div
                    ref={resultPinned ? resultCardRef : undefined}
                    className={`relative overflow-hidden rounded-xl border border-white/20 bg-black/35 px-4 py-3 text-sm ${resultPinned ? "ring-1 ring-accent/45" : ""} ${resultRevealClass}`}
                  >
                    <div className="pointer-events-none absolute -left-10 top-1/2 h-20 w-20 -translate-y-1/2 rounded-full bg-emerald-300/10 blur-3xl" />
                    <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">{resultStrip}</p>
                    <p className={`mt-1 text-xs uppercase tracking-[0.16em] ${resultHeadlineClass}`}>{result.outcome}</p>
                    <p className="mt-2 text-3xl font-black uppercase leading-tight tracking-[0.01em] text-white">
                      {result.winner.name}
                    </p>
                    <p className="mt-1 text-sm text-white/85">
                      {result.headline} · {result.winner.lane}
                    </p>
                    <p className="mt-2 text-xs text-white/70">
                      {result.detail} Winner pressure {result.votes.winner} • Opponent {result.votes.loser} • Margin{" "}
                      {result.votes.margin}
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
                  <p>Audience command</p>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/45">{roundState === "live" ? "Live" : "Standby"}</p>
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
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em] text-white/70">
                      <p>Crowd split</p>
                      <p>{totalVotes} signals</p>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/12">
                      <div className="relative h-full">
                        <div
                          className="absolute left-0 h-full rounded-full bg-gradient-to-r from-primary/90 to-accent/90"
                          style={{ width: `${keepPercent}%` }}
                        />
                        <div
                          className="absolute right-0 h-full rounded-full bg-white/70"
                          style={{ width: `${swapPercent}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] uppercase tracking-[0.14em] text-white/60">
                      <p>Keep {keepPercent}%</p>
                      <p className="text-right">Swap {swapPercent}%</p>
                    </div>
                  </div>
                ) : null}

                {votePanelVisible ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <Button size="sm" variant={viewerVote === "keep" ? "cta" : "outline"} onClick={() => vote("keep")} disabled={!canVote}>
                      Keep lane
                      <Vote className="ml-2 h-4 w-4" />
                    </Button>
                    <Button size="sm" variant={viewerVote === "swap" ? "cta" : "outline"} onClick={() => vote("swap")} disabled={!canVote}>
                      Swap lane
                      <HandMetal className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
                {viewerVote ? (
                  <p className="mt-1.5 text-xs text-white/70">
                    Your vote: {viewerVote === "keep" ? "Keep" : "Swap"}
                  </p>
                ) : null}
                <div className="mt-2.5 space-y-2 border-t border-white/10 pt-2">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/50">Audience engagement</p>
                  <div className="grid gap-2">
                    <Button size="sm" variant="outline" onClick={sendReaction} className="justify-start">
                      React to pitch
                      <Heart className="ml-2 h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/45">
                    {commentAck || dmPulse || (engagementPulse ? `${engagementPulse} live reactions sent` : "No engagement sent yet")}
                  </p>
                  <div>
                    <label className="text-[10px] uppercase tracking-[0.14em] text-white/55" htmlFor="commentDraft">
                      Comment on this pitch
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
                        placeholder="What do you think?"
                        className="h-9 flex-1 rounded-md border border-white/20 bg-black/35 px-2 text-xs text-white outline-none focus:border-accent"
                      />
                      <Button size="sm" variant="default" onClick={broadcastComment} disabled={!commentDraft.trim()}>
                        <SendHorizonal className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 border-t border-white/10 pt-2 text-[11px] uppercase tracking-[0.14em] text-white/50">
                  <p className="flex items-center justify-between">
                    <span>Queue preview</span>
                    <span>{queue.length} entries</span>
                  </p>
                  <div className="mt-1.5 space-y-1 text-white/70">
                    {queue.length > 0 ? (
                      queue.slice(0, 2).map((entry) => (
                      <p key={entry.id} className="flex items-center justify-between gap-2 border-b border-white/10 pb-1 last:border-b-0 last:pb-0">
                        <span className="inline-flex min-w-0 items-center gap-2 text-white/75">
                          <span className="font-semibold uppercase tracking-[0.12em]">{entry.lane}</span>
                          <span className="line-clamp-1">{entry.name}</span>
                        </span>
                        {entry.id === VIEWER_ID ? (
                          <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] text-primary">you</span>
                        ) : null}
                      </p>
                    ))
                    ) : (
                      <p className="text-white/55">Queue clear</p>
                    )}
                    {viewerState === "inQueue" || viewerState === "invited" || viewerState === "nextUp" ? (
                      <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/45">{queuePositionCopy}</p>
                    ) : null}
                  </div>
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

      <section id="vote" className="grid gap-2 xl:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-xl border border-white/12 bg-black/15 px-4 py-3 text-sm">
          <p className="text-[11px] uppercase tracking-[0.16em] text-accent">Pitch discussion</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-lg font-semibold text-white">Comments on {activeContestant.name}</p>
            <p className="text-[11px] uppercase tracking-[0.14em] text-white/55">{activeComments.length} comments</p>
          </div>
          <div className="mt-2 space-y-2 text-sm text-white/80">
              <p className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.14em] text-white/50">
                <MessageCircleMore className="h-3.5 w-3.5" />
                {liveReactionCount} live audience signals
              </p>
            <div className="space-y-2">
              {activeComments.map((comment) => (
                <p key={comment.id} className="rounded-md border border-white/10 bg-black/25 px-2 py-1.5">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-white/55">
                    {comment.author} · {comment.role}
                  </span>
                  <br />
                  <span className="text-sm text-white/90">{comment.message}</span>
                </p>
              ))}
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-white/12 bg-black/15 px-4 py-3 text-sm">
          <p className="text-[11px] uppercase tracking-[0.16em] text-accent">Scoreboard</p>
          <p className="mt-1 text-lg font-semibold text-white">Live standings</p>
                <div className="mt-2 space-y-1.5">
            {leaderboard.map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-b border-white/10 py-2 last:border-0 last:pb-0"
              >
                <p className="h-6 w-6 rounded-full bg-white/12 text-xs font-semibold text-white inline-flex items-center justify-center">
                  {entry.rank}
                </p>
                <p className="text-sm font-semibold text-white">
                  {entry.name}
                  {entry.id === activeContestant.id ? " · LIVE" : null}
                </p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/65">
                  {competitionBandLabel(tierFromScore(entry.score))}
                </p>
                <p className="text-sm font-semibold text-accent">{entry.score}</p>
              </div>
            ))}
          </div>
        </article>
      </section>
    </section>
  );
}
