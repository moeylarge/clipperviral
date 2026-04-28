"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createLocalAudioTrack, Room, RoomEvent, Track, TrackEvent } from "livekit-client";
import type { LocalAudioTrack } from "livekit-client";

import type { PersonaConfig } from "@/lib/personas";
import type { HeartbeatResult } from "@/lib/session/types";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function presentVoiceState(state: VoiceMediaState) {
  if (state === "connected") return "Voice connected";
  if (state === "connecting") return "Connecting";
  if (state === "reconnecting") return "Reconnecting";
  if (state === "failed") return "Needs reconnect";
  return "Getting ready";
}

function presentAvatarState(state: AvatarMediaState) {
  if (state === "avatar_video_live") return "Character on screen";
  if (state === "avatar_audio_only") return "Voice only";
  if (state === "avatar_connecting") return "Character joining";
  if (state === "avatar_concurrency_limited") return "Character waiting";
  if (state === "avatar_failed") return "Character unavailable";
  return "Getting ready";
}

type VoiceMediaState = "idle" | "connecting" | "connected" | "reconnecting" | "failed";
type AvatarMediaState =
  | "idle"
  | "avatar_connecting"
  | "avatar_audio_only"
  | "avatar_video_live"
  | "avatar_failed"
  | "avatar_concurrency_limited";

export function SessionPageClient({ sessionId, persona, autoResume = false }: { sessionId: string; persona: PersonaConfig; autoResume?: boolean }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<HeartbeatResult | null>(null);
  const [muted, setMuted] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceMediaState>("idle");
  const [avatarState, setAvatarState] = useState<AvatarMediaState>("idle");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [firstAvatarRenderMs, setFirstAvatarRenderMs] = useState<number | null>(null);

  const bootStartRef = useRef<number>(0);
  const reconnectMarkedRef = useRef(false);

  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null);

  const avatarRoomRef = useRef<Room | null>(null);
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);
  const avatarAudioContainerRef = useRef<HTMLDivElement | null>(null);
  const teardownAvatarRef = useRef(false);
  const avatarHasVideoTrackRef = useRef(false);
  const avatarHasAudioTrackRef = useRef(false);
  const avatarBootstrapAttemptRef = useRef(0);
  const avatarCleanupCountRef = useRef(0);
  const avatarConnectedAtRef = useRef<number | null>(null);
  const avatarVideoLiveMarkedRef = useRef(false);
  const snapshotStatusRef = useRef<HeartbeatResult["session"]["status"] | null>(null);
  const hasInitializedRealtimeRef = useRef(false);
  const mediaBootstrapInFlightRef = useRef(false);
  const mediaBootstrapCompletedRef = useRef(false);
  const voiceBootstrapCallsRef = useRef(0);
  const avatarBootstrapCallsRef = useRef(0);
  const livekitConnectAttemptsRef = useRef(0);
  const bootstrapEffectEntriesRef = useRef(0);

  const avatarLog = useCallback(
    (event: string, details?: Record<string, unknown>) => {
      const payload = {
        ts: new Date().toISOString(),
        sessionId,
        event,
        ...details,
      };
      console.info("[avatar-debug]", payload);
    },
    [sessionId],
  );

  const publishMediaDebugStats = useCallback(() => {
    const win = window as Window & {
      __mediaDebugStats?: {
        sessionId: string;
        voiceBootstrapCalls: number;
        avatarBootstrapCalls: number;
        livekitConnectAttempts: number;
        bootstrapEffectEntries: number;
        status: HeartbeatResult["session"]["status"] | null;
        inFlight: boolean;
        completed: boolean;
      };
    };

    win.__mediaDebugStats = {
      sessionId,
      voiceBootstrapCalls: voiceBootstrapCallsRef.current,
      avatarBootstrapCalls: avatarBootstrapCallsRef.current,
      livekitConnectAttempts: livekitConnectAttemptsRef.current,
      bootstrapEffectEntries: bootstrapEffectEntriesRef.current,
      status: snapshotStatusRef.current,
      inFlight: mediaBootstrapInFlightRef.current,
      completed: mediaBootstrapCompletedRef.current,
    };
  }, [sessionId]);

  const refresh = useCallback(
    async (body?: Record<string, unknown>) => {
      const res = await fetch(`/api/sessions/${sessionId}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });

      if (!res.ok) return;
      const data = (await res.json()) as HeartbeatResult;
      setSnapshot(data);
      return data;
    },
    [sessionId],
  );

  const markReconnecting = useCallback(() => {
    if (reconnectMarkedRef.current) return;
    reconnectMarkedRef.current = true;
    void refresh({ reconnecting: true });
  }, [refresh]);

  const cleanupVoice = useCallback(() => {
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.stop();
      localAudioTrackRef.current = null;
    }

    setVoiceState("idle");
  }, []);

  const cleanupAvatar = useCallback(
    (reason = "cleanup") => {
      avatarCleanupCountRef.current += 1;
      avatarLog("avatar.cleanup", {
        reason,
        cleanupCount: avatarCleanupCountRef.current,
        hadRoom: Boolean(avatarRoomRef.current),
        hadVideoTrack: avatarHasVideoTrackRef.current,
        hadAudioTrack: avatarHasAudioTrackRef.current,
      });

      teardownAvatarRef.current = true;
      avatarHasVideoTrackRef.current = false;
      avatarHasAudioTrackRef.current = false;
      avatarVideoLiveMarkedRef.current = false;

      if (avatarVideoRef.current) {
        avatarVideoRef.current.srcObject = null;
      }

      if (avatarAudioContainerRef.current) {
        avatarAudioContainerRef.current.innerHTML = "";
      }

      if (avatarRoomRef.current) {
        avatarRoomRef.current.removeAllListeners();
        avatarRoomRef.current.disconnect();
        avatarRoomRef.current = null;
      }
    },
    [avatarLog],
  );

  const startLiveAvatar = useCallback(async (reason: "initial" | "manual_reconnect" | "continue_after_payment") => {
    avatarBootstrapCallsRef.current += 1;
    publishMediaDebugStats();
    avatarBootstrapAttemptRef.current += 1;
    const attempt = avatarBootstrapAttemptRef.current;
    const bootstrapStart = performance.now();

    setAvatarState("avatar_connecting");
    setVoiceState("connecting");
    setMediaError(null);
    teardownAvatarRef.current = false;
    avatarHasVideoTrackRef.current = false;
    avatarHasAudioTrackRef.current = false;
    avatarVideoLiveMarkedRef.current = false;
    avatarConnectedAtRef.current = null;
    avatarLog("avatar.bootstrap.request_start", {
      attempt,
      reason,
      sessionStatus: snapshotStatusRef.current,
    });

    const bootstrapRes = await fetch("/api/realtime/avatar/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, reason }),
    });

    if (!bootstrapRes.ok) {
      const body = (await bootstrapRes.json().catch(() => ({}))) as {
        error?: string;
        provider?: { code?: number; message?: string };
      };
      avatarLog("avatar.bootstrap.request_failed", {
        attempt,
        httpStatus: bootstrapRes.status,
        providerCode: body.provider?.code,
        providerMessage: body.provider?.message,
        error: body.error,
        elapsedMs: Math.round(performance.now() - bootstrapStart),
      });

      if (body.provider?.code === 4032) {
        setAvatarState("avatar_concurrency_limited");
        setMediaError("Avatar provider is at concurrency limit. Voice can continue without live avatar video.");
        return;
      }

      setAvatarState("avatar_failed");
      throw new Error(body.error ?? "LiveAvatar bootstrap failed");
    }

    const bootstrapData = (await bootstrapRes.json()) as {
      avatar: { streamUrl?: string; token?: string; disabled?: boolean; disabledReason?: string };
    };
    avatarLog("avatar.bootstrap.request_success", {
      attempt,
      httpStatus: bootstrapRes.status,
      hasStreamUrl: Boolean(bootstrapData.avatar.streamUrl),
      hasToken: Boolean(bootstrapData.avatar.token),
      streamUrl: bootstrapData.avatar.streamUrl,
      tokenPreview: bootstrapData.avatar.token ? `${bootstrapData.avatar.token.slice(0, 12)}...` : null,
      elapsedMs: Math.round(performance.now() - bootstrapStart),
    });

    if (bootstrapData.avatar.disabled) {
      setAvatarState("avatar_failed");
      setVoiceState("failed");
      setMediaError(`Avatar usage disabled: ${bootstrapData.avatar.disabledReason ?? "LIVEAVATAR_ENABLED=false"}`);
      avatarLog("avatar.bootstrap.disabled", {
        attempt,
        reason,
        disabledReason: bootstrapData.avatar.disabledReason ?? null,
      });
      return;
    }

    if (!bootstrapData.avatar.streamUrl || !bootstrapData.avatar.token) {
      setAvatarState("avatar_failed");
      throw new Error("LiveAvatar bootstrap missing streamUrl or token");
    }

    cleanupAvatar("pre_connect_reset");
    teardownAvatarRef.current = false;

    const room = new Room();
    avatarRoomRef.current = room;

    room.on(RoomEvent.Connected, () => {
      avatarConnectedAtRef.current = performance.now();
      avatarLog("livekit.room_connected", { attempt });
    });

    room.on(RoomEvent.ParticipantConnected, (participant) => {
      avatarLog("livekit.participant_connected", {
        participantIdentity: participant.identity,
        participantSid: participant.sid,
      });
    });

    room.on(RoomEvent.TrackPublished, (publication, participant) => {
      avatarLog("livekit.track_published", {
        participantIdentity: participant?.identity,
        participantSid: participant?.sid,
        publicationSid: publication.trackSid,
        kind: publication.kind,
        source: publication.source,
        isMuted: publication.isMuted,
      });
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      avatarLog("livekit.track_subscribed", {
        participantIdentity: participant?.identity,
        participantSid: participant?.sid,
        publicationSid: publication?.trackSid,
        kind: track.kind,
      });

      track.on(TrackEvent.Muted, () => {
        avatarLog("livekit.track_muted", { kind: track.kind });
      });
      track.on(TrackEvent.Unmuted, () => {
        avatarLog("livekit.track_unmuted", { kind: track.kind });
      });

      if (track.kind === Track.Kind.Video && avatarVideoRef.current) {
        avatarHasVideoTrackRef.current = true;
        track.attach(avatarVideoRef.current);

        const media = avatarVideoRef.current;
        media.muted = true;
        media.playsInline = true;
        media.autoplay = true;

        avatarLog("livekit.video_attach_attempt", {
          readyState: media.readyState,
          hasSrcObject: Boolean(media.srcObject),
          connectedMs: avatarConnectedAtRef.current ? Math.round(performance.now() - avatarConnectedAtRef.current) : null,
        });

        media.onloadedmetadata = () => {
          avatarLog("livekit.video_loadedmetadata", {
            readyState: media.readyState,
            hasSrcObject: Boolean(media.srcObject),
            videoWidth: media.videoWidth,
            videoHeight: media.videoHeight,
          });
        };
        media.oncanplay = () => {
          avatarLog("livekit.video_canplay", {
            readyState: media.readyState,
            hasSrcObject: Boolean(media.srcObject),
          });
        };
        media.onplaying = () => {
          avatarLog("livekit.video_playing", {
            readyState: media.readyState,
            hasSrcObject: Boolean(media.srcObject),
            videoWidth: media.videoWidth,
            videoHeight: media.videoHeight,
          });

          if (!avatarVideoLiveMarkedRef.current) {
            avatarVideoLiveMarkedRef.current = true;
            setAvatarState("avatar_video_live");
          }

          if (!firstAvatarRenderMs && bootStartRef.current > 0) {
            setFirstAvatarRenderMs(Math.round(performance.now() - bootStartRef.current));
          }
        };
        void media.play().catch((error) => {
          avatarLog("livekit.video_play_error", {
            message: error instanceof Error ? error.message : String(error),
          });
        });
      }

      if (track.kind === Track.Kind.Audio && avatarAudioContainerRef.current) {
        avatarHasAudioTrackRef.current = true;
        setVoiceState("connected");
        const audioEl = track.attach() as HTMLAudioElement;
        audioEl.autoplay = true;
        audioEl.controls = false;
        audioEl.style.display = "none";
        audioEl.muted = muted;

        audioEl.onplaying = () => {
          avatarLog("livekit.audio_playing", {
            hasVideoTrack: avatarHasVideoTrackRef.current,
            hasAudioTrack: avatarHasAudioTrackRef.current,
          });
          setVoiceState("connected");
          if (!avatarHasVideoTrackRef.current) {
            setAvatarState("avatar_audio_only");
          }
        };
        audioEl.onerror = () => {
          avatarLog("livekit.audio_error", {
            hasVideoTrack: avatarHasVideoTrackRef.current,
            hasAudioTrack: avatarHasAudioTrackRef.current,
          });
        };
        avatarAudioContainerRef.current.appendChild(audioEl);
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      avatarLog("livekit.track_unsubscribed", {
        participantIdentity: participant?.identity,
        participantSid: participant?.sid,
        publicationSid: publication?.trackSid,
        kind: track.kind,
      });
      track.detach().forEach((el) => el.remove());

      if (track.kind === Track.Kind.Video) {
        avatarHasVideoTrackRef.current = false;
        if (avatarHasAudioTrackRef.current) {
          setAvatarState("avatar_audio_only");
        } else {
          setAvatarState("avatar_connecting");
        }
      }
      if (track.kind === Track.Kind.Audio) {
        avatarHasAudioTrackRef.current = false;
        setVoiceState("reconnecting");
      }
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      avatarLog("livekit.participant_disconnected", {
        participantIdentity: participant.identity,
        participantSid: participant.sid,
      });
    });

    room.on(RoomEvent.Disconnected, (reason) => {
      avatarLog("livekit.room_disconnected", {
        reason: reason ?? null,
        hadVideoTrack: avatarHasVideoTrackRef.current,
        hadAudioTrack: avatarHasAudioTrackRef.current,
      });
      if (teardownAvatarRef.current) return;
      setAvatarState("avatar_failed");
      setVoiceState("failed");
      setMediaError("Avatar media disconnected.");
      if (snapshotStatusRef.current === "active") {
        markReconnecting();
      }
    });

    livekitConnectAttemptsRef.current += 1;
    publishMediaDebugStats();
    avatarLog("livekit.connect_attempt", {
      attempt,
      connectCall: livekitConnectAttemptsRef.current,
      sessionStatus: snapshotStatusRef.current,
    });
    await room.connect(bootstrapData.avatar.streamUrl, bootstrapData.avatar.token, {
      autoSubscribe: true,
    });
    avatarLog("livekit.connect_success", { attempt });

    let micTrack: LocalAudioTrack;
    try {
      micTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      localAudioTrackRef.current = micTrack;
      if (muted) {
        await micTrack.mute();
      }
      avatarLog("livekit.microphone.success", {
        label: micTrack.mediaStreamTrack.label,
        enabled: micTrack.mediaStreamTrack.enabled,
        muted: micTrack.isMuted,
      });
    } catch (error) {
      setVoiceState("failed");
      avatarLog("livekit.microphone.failed", {
        name: error instanceof DOMException ? error.name : null,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const publication = await room.localParticipant.publishTrack(micTrack, {
      source: Track.Source.Microphone,
      name: "microphone",
    });
    avatarLog("livekit.microphone.published", {
      publicationSid: publication.trackSid,
      source: publication.source,
      isMuted: publication.isMuted,
    });
    setVoiceState("connected");
    await room.localParticipant.publishData(
      new TextEncoder().encode(
        JSON.stringify({
          event_id: crypto.randomUUID(),
          event_type: "avatar.start_listening",
        }),
      ),
      { reliable: true, topic: "agent-control" },
    );
    avatarLog("livekit.start_listening.sent", { attempt });

    setAvatarState("avatar_connecting");
    reconnectMarkedRef.current = false;
  }, [avatarLog, cleanupAvatar, firstAvatarRenderMs, markReconnecting, muted, publishMediaDebugStats, sessionId]);

  const initializeRealtime = useCallback(async (reason: "initial" | "manual_reconnect" | "continue_after_payment", explicitReconnect = false) => {
    avatarLog("media.bootstrap.evaluate", {
      reason,
      explicitReconnect,
      sessionStatus: snapshotStatusRef.current,
      inFlight: mediaBootstrapInFlightRef.current,
      completed: mediaBootstrapCompletedRef.current,
    });

    if (snapshotStatusRef.current !== "active") {
      avatarLog("media.bootstrap.blocked_status", {
        reason,
        explicitReconnect,
        sessionStatus: snapshotStatusRef.current,
      });
      return;
    }

    if (mediaBootstrapInFlightRef.current) {
      avatarLog("media.bootstrap.blocked_inflight", { reason, explicitReconnect });
      return;
    }

    if (mediaBootstrapCompletedRef.current && !explicitReconnect) {
      avatarLog("media.bootstrap.blocked_completed", { reason, explicitReconnect });
      return;
    }

    mediaBootstrapInFlightRef.current = true;
    publishMediaDebugStats();
    bootStartRef.current = performance.now();
    setFirstAvatarRenderMs(null);

    try {
      await startLiveAvatar(reason);
      await refresh({ resume: true });
      mediaBootstrapCompletedRef.current = true;
      avatarLog("media.bootstrap.completed", {
        reason,
        explicitReconnect,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Realtime bootstrap failed";
      setMediaError(message);
      setVoiceState((current) => (current === "connected" ? current : "failed"));
      setAvatarState((current) =>
        current === "avatar_video_live" || current === "avatar_audio_only" || current === "avatar_concurrency_limited"
          ? current
          : "avatar_failed",
      );
      markReconnecting();
      avatarLog("media.bootstrap.failed", {
        reason,
        explicitReconnect,
        message,
      });
    } finally {
      mediaBootstrapInFlightRef.current = false;
      publishMediaDebugStats();
    }
  }, [avatarLog, markReconnecting, publishMediaDebugStats, refresh, startLiveAvatar]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    snapshotStatusRef.current = snapshot?.session.status ?? null;
    publishMediaDebugStats();
  }, [publishMediaDebugStats, snapshot]);

  useEffect(() => {
    bootstrapEffectEntriesRef.current += 1;
    publishMediaDebugStats();
    avatarLog("effect.initial_bootstrap.enter", {
      entry: bootstrapEffectEntriesRef.current,
      hasInitialized: hasInitializedRealtimeRef.current,
      status: snapshotStatusRef.current,
    });
    if (hasInitializedRealtimeRef.current) return;
    hasInitializedRealtimeRef.current = true;

    void (async () => {
      const beat = await refresh();
      let status = beat?.session.status ?? snapshotStatusRef.current;
      snapshotStatusRef.current = status ?? null;
      publishMediaDebugStats();
      avatarLog("effect.initial_bootstrap.post_refresh", {
        status,
      });
      if (status === "paused_for_payment" && autoResume) {
        const resumed = await refresh({ resume: true });
        status = resumed?.session.status ?? status;
        snapshotStatusRef.current = status ?? null;
        publishMediaDebugStats();
        avatarLog("effect.initial_bootstrap.after_auto_resume", {
          status,
        });
      }

      if (status !== "active") {
        avatarLog("effect.initial_bootstrap.skip_non_active", {
          status,
        });
        return;
      }
      await initializeRealtime("initial", false);
    })();
  }, [autoResume, avatarLog, cleanupAvatar, cleanupVoice, initializeRealtime, publishMediaDebugStats, refresh]);

  useEffect(() => {
    return () => {
      cleanupVoice();
      cleanupAvatar();
    };
  }, [cleanupAvatar, cleanupVoice]);

  useEffect(() => {
    const micTrack = localAudioTrackRef.current;
    if (micTrack) {
      void (muted ? micTrack.mute() : micTrack.unmute());
    }
    if (avatarAudioContainerRef.current) {
      const audios = avatarAudioContainerRef.current.querySelectorAll("audio");
      audios.forEach((audio) => {
        audio.muted = muted;
      });
    }
  }, [muted]);

  useEffect(() => {
    avatarLog("effect.session_guard.enter", {
      status: snapshot?.session.status ?? null,
      requiresPayment: snapshot?.requiresPayment ?? null,
    });
    if (!snapshot) return;

    if (snapshot.session.status === "ended") {
      cleanupVoice();
      cleanupAvatar();
      return;
    }

    if (snapshot.requiresPayment || snapshot.session.status === "paused_for_payment") {
      cleanupVoice();
      cleanupAvatar();
      router.replace(`/session/${sessionId}/checkout`);
      return;
    }
  }, [avatarLog, cleanupAvatar, cleanupVoice, router, sessionId, snapshot]);

  const avatarOperational =
    avatarState === "avatar_video_live" || avatarState === "avatar_audio_only" || avatarState === "avatar_concurrency_limited";
  const mediaHealthy = voiceState === "connected" && avatarOperational;

  useEffect(() => {
    avatarLog("effect.heartbeat_loop.enter", {
      status: snapshot?.session.status ?? null,
      requiresPayment: snapshot?.requiresPayment ?? null,
      mediaHealthy,
    });
    if (!snapshot) return;
    if (snapshot.session.status === "ended" || snapshot.requiresPayment) return;

    if (!mediaHealthy) {
      if (snapshot.session.status === "active") {
        markReconnecting();
      }
      return;
    }

    reconnectMarkedRef.current = false;
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 1000);

    return () => clearInterval(timer);
  }, [avatarLog, markReconnecting, mediaHealthy, refresh, snapshot]);

  useEffect(() => {
    const url = `/api/sessions/${sessionId}/end`;
    const payload = JSON.stringify({ reason: "ended_failure" });

    const onUnload = () => {
      avatarLog("browser.pagehide_cleanup_send", {
        status: snapshot?.session.status ?? null,
        avatarState,
        voiceState,
      });
      cleanupAvatar("pagehide");
      cleanupVoice();
      if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon(url, blob);
        return;
      }

      fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {
        // Best effort cleanup; server timeout remains source of truth.
      });
    };

    window.addEventListener("pagehide", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
    };
  }, [avatarLog, avatarState, cleanupAvatar, cleanupVoice, sessionId, snapshot?.session.status, voiceState]);

  const duration = snapshot?.durationSeconds ?? 0;
  const costCents = snapshot?.effectiveCostCents ?? 0;
  const freeRemaining = snapshot?.trialSecondsRemaining ?? snapshot?.freeRemainingSeconds ?? 45;
  const requiresPayment = snapshot?.requiresPayment ?? false;
  const showFreeEnding = snapshot?.shouldShowFreeEndingWarning ?? false;

  const priceLabel = useMemo(() => `$${(costCents / 100).toFixed(2)}`, [costCents]);

  async function endCall() {
    cleanupVoice();
    cleanupAvatar();
    await fetch(`/api/sessions/${sessionId}/end`, { method: "POST" });
    router.push(`/session/${sessionId}/end`);
  }

  const avatarLive = avatarState === "avatar_video_live";
  const connecting = !avatarLive && (avatarState === "avatar_connecting" || avatarState === "idle" || voiceState === "connecting");
  const freeActive = freeRemaining > 0;
  const freeProgress = Math.max(0, Math.min(1, freeRemaining / 45));
  const needsReconnect =
    voiceState !== "connected" ||
    (avatarState !== "avatar_video_live" &&
      avatarState !== "avatar_audio_only" &&
      avatarState !== "avatar_concurrency_limited");

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#fdf3fb_0%,#fffafd_60%,#fff5ec_100%)] px-3 pb-6 pt-4 sm:px-6 sm:pt-6">
      {/* Top status bar */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`absolute inset-0 animate-ping rounded-full ${avatarLive ? "bg-[#4cc66a]" : "bg-[#e07234]"} opacity-60`} />
            <span className={`relative h-2.5 w-2.5 rounded-full ${avatarLive ? "bg-[#2fa84d]" : "bg-[#e07234]"}`} />
          </span>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#433d7b]">
            {avatarLive ? "Live" : connecting ? "Connecting" : "Reconnecting"} · {persona.name}
          </p>
        </div>
        <button
          type="button"
          onClick={endCall}
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#f0c9c1] bg-white/90 px-4 py-2 text-xs font-extrabold text-[#c13d2b] shadow-sm transition hover:bg-[#fff1ec]"
        >
          <span aria-hidden>✕</span> End Visit
        </button>
      </header>

      {/* Free minute progress ring */}
      {freeActive && !requiresPayment ? (
        <div className="mx-auto mt-3 flex w-full max-w-5xl items-center justify-between gap-3 rounded-2xl border border-[#f1dfc7] bg-[linear-gradient(90deg,#fff4e5_0%,#fff9f0_100%)] px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-2.5 min-w-0">
            <span aria-hidden className="text-base">🎁</span>
            <p className="truncate text-xs font-extrabold text-[#8b612f] sm:text-sm">
              {showFreeEnding ? "Free trial ending soon" : "Enjoying the 45-second trial — on the house"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[#f1dfc7]/70 sm:w-40">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#e07234_0%,#f7a75a_100%)] transition-[width] duration-1000"
                style={{ width: `${freeProgress * 100}%` }}
              />
            </div>
            <span className="font-mono text-xs font-black tabular-nums text-[#8b612f]">
              {freeRemaining}s
            </span>
          </div>
        </div>
      ) : null}

      {/* Hero video stage */}
      <section className="mx-auto mt-4 w-full max-w-5xl">
        <div className="relative overflow-hidden rounded-[32px] border border-[#ecddf5] bg-[#0f0b1f] shadow-[0_44px_120px_-42px_rgba(67,61,123,0.5)]">
          {/* Video / fallback */}
          <div className="relative aspect-[3/4] w-full sm:aspect-video">
            <video
              ref={avatarVideoRef}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                avatarLive ? "opacity-100" : "opacity-0"
              }`}
              autoPlay
              playsInline
              muted
            />
            <img
              src={persona.previewImage}
              alt={persona.name}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
                avatarLive ? "opacity-0" : "opacity-100 blur-[2px] scale-105"
              }`}
            />
            {/* Gradient bottom for control legibility */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(180deg,transparent_0%,rgba(15,11,31,0.78)_100%)]" />
            {/* Connecting overlay */}
            {!avatarLive ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 rounded-3xl bg-white/12 px-6 py-5 backdrop-blur-md">
                  <div className="flex items-center gap-1.5" aria-hidden>
                    <span className="h-2 w-2 animate-bounce rounded-full bg-white [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-white [animation-delay:120ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-white [animation-delay:240ms]" />
                  </div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-white/90">
                    {presentAvatarState(avatarState)}
                  </p>
                </div>
              </div>
            ) : null}

            {/* Top-left persona chip */}
            <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/35 px-3 py-1.5 backdrop-blur-md sm:left-5 sm:top-5">
              <span aria-hidden className="text-sm">✨</span>
              <p className="text-[11px] font-black uppercase tracking-wider text-white">{persona.name}</p>
            </div>

            {/* Top-right timer chip */}
            <div className="absolute right-3 top-3 flex items-center gap-2 rounded-full bg-black/35 px-3 py-1.5 backdrop-blur-md sm:right-5 sm:top-5">
              <span aria-hidden>⏱</span>
              <span className="font-mono text-xs font-black tabular-nums text-white">{formatTime(duration)}</span>
            </div>

            {/* Bottom control bar */}
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-3 px-4 pb-5 sm:pb-6">
              <button
                type="button"
                onClick={() => setMuted((v) => !v)}
                aria-label={muted ? "Unmute" : "Mute"}
                className={`flex h-14 w-14 items-center justify-center rounded-full text-2xl shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] transition hover:scale-105 ${
                  muted ? "bg-white text-[#c13d2b]" : "bg-white/95 text-[#2b2f53]"
                }`}
              >
                <span aria-hidden>{muted ? "🔇" : "🎤"}</span>
              </button>
              <button
                type="button"
                onClick={endCall}
                aria-label="End visit"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e25b5b] text-2xl text-white shadow-[0_16px_40px_-12px_rgba(193,61,43,0.7)] transition hover:scale-105 hover:bg-[#c84848]"
              >
                <span aria-hidden>📞</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  cleanupVoice();
                  cleanupAvatar("manual_reconnect");
                  void initializeRealtime("manual_reconnect", true);
                }}
                aria-label="Refresh the visit"
                className={`flex h-14 w-14 items-center justify-center rounded-full bg-white/95 text-2xl text-[#2b2f53] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)] transition hover:scale-105 ${
                  needsReconnect ? "animate-pulse ring-2 ring-[#e07234]" : ""
                }`}
              >
                <span aria-hidden>↻</span>
              </button>
            </div>
          </div>
          <div ref={avatarAudioContainerRef} />
        </div>
      </section>

      {/* Compact status chips */}
      <section className="mx-auto mt-4 w-full max-w-5xl">
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-2xl border border-[#ecddf5] bg-white/85 px-3 py-2.5 text-center shadow-sm sm:px-4">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#8a7fbb] sm:text-[10px]">Visit time</p>
            <p className="mt-1 font-mono text-sm font-black tabular-nums text-[#2b2f53] sm:text-base">{formatTime(duration)}</p>
          </div>
          <div className="rounded-2xl border border-[#ecddf5] bg-white/85 px-3 py-2.5 text-center shadow-sm sm:px-4">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#8a7fbb] sm:text-[10px]">So far</p>
            <p className="mt-1 text-sm font-black text-[#2b2f53] sm:text-base">{priceLabel}</p>
          </div>
          <div className="rounded-2xl border border-[#ecddf5] bg-white/85 px-3 py-2.5 text-center shadow-sm sm:px-4">
            <p className="text-[9px] font-black uppercase tracking-[0.14em] text-[#8a7fbb] sm:text-[10px]">Status</p>
            <p className="mt-1 truncate text-xs font-black text-[#2b2f53] sm:text-sm">
              {avatarLive ? "Connected" : presentVoiceState(voiceState)}
            </p>
          </div>
        </div>
      </section>

      {/* Soft parent note + inline alerts */}
      <section className="mx-auto mt-3 w-full max-w-5xl space-y-2">
        {mediaError ? (
          <p className="rounded-xl border border-[#f0c9c1] bg-[#fff1ec] px-3 py-2 text-center text-xs font-semibold text-[#b15d58]">
            {mediaError}
          </p>
        ) : null}
        {avatarState === "avatar_concurrency_limited" ? (
          <p className="rounded-xl border border-[#f1dfc7] bg-[#fff9f0] px-3 py-2 text-center text-xs font-semibold text-[#9f6d34]">
            Character is almost ready — voice continues in the meantime.
          </p>
        ) : null}
        {avatarState === "avatar_audio_only" ? (
          <p className="rounded-xl border border-[#f1dfc7] bg-[#fff9f0] px-3 py-2 text-center text-xs font-semibold text-[#9f6d34]">
            Voice is live — on-screen character catching up.
          </p>
        ) : null}
        <p className="text-center text-[11px] text-[#8a91ac]">
          A grown-up stays nearby · Parent decides when the magic continues
        </p>
      </section>
    </main>
  );
}
