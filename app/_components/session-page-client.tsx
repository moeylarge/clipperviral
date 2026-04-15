"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Room, RoomEvent, Track, TrackEvent } from "livekit-client";

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

function getClientUserId() {
  const storageKey = "face2face_user_id";
  const current = window.localStorage.getItem(storageKey);
  if (current) return current;
  const created = crypto.randomUUID();
  window.localStorage.setItem(storageKey, created);
  return created;
}

type VoiceMediaState = "idle" | "connecting" | "connected" | "reconnecting" | "failed";
type AvatarMediaState =
  | "idle"
  | "avatar_connecting"
  | "avatar_audio_only"
  | "avatar_video_live"
  | "avatar_failed"
  | "avatar_concurrency_limited";

export function SessionPageClient({ sessionId, persona }: { sessionId: string; persona: PersonaConfig }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<HeartbeatResult | null>(null);
  const [muted, setMuted] = useState(false);
  const [loadingContinue, setLoadingContinue] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceMediaState>("idle");
  const [avatarState, setAvatarState] = useState<AvatarMediaState>("idle");
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [firstAvatarRenderMs, setFirstAvatarRenderMs] = useState<number | null>(null);
  const [firstAssistantResponseMs, setFirstAssistantResponseMs] = useState<number | null>(null);
  const [sessionBootstrapMs, setSessionBootstrapMs] = useState<number | null>(null);

  const bootStartRef = useRef<number>(0);
  const reconnectMarkedRef = useRef(false);
  const assistantSeenRef = useRef(false);

  const voicePcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

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
    if (voicePcRef.current) {
      voicePcRef.current.ontrack = null;
      voicePcRef.current.onconnectionstatechange = null;
      voicePcRef.current.close();
      voicePcRef.current = null;
    }

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
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

  const startRealtimeVoice = useCallback(async () => {
    voiceBootstrapCallsRef.current += 1;
    publishMediaDebugStats();
    avatarLog("voice.bootstrap.request_start", {
      call: voiceBootstrapCallsRef.current,
      status: snapshotStatusRef.current,
    });
    setVoiceState("connecting");
    setMediaError(null);

    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = micStream;

    const bootstrapRes = await fetch("/api/realtime/voice/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    });
    if (!bootstrapRes.ok) {
      avatarLog("voice.bootstrap.request_failed", {
        call: voiceBootstrapCallsRef.current,
        status: bootstrapRes.status,
        sessionStatus: snapshotStatusRef.current,
      });
      throw new Error(await bootstrapRes.text());
    }
    avatarLog("voice.bootstrap.request_success", {
      call: voiceBootstrapCallsRef.current,
      status: bootstrapRes.status,
      sessionStatus: snapshotStatusRef.current,
    });

    const bootstrapData = (await bootstrapRes.json()) as {
      voice: { clientSecret: string; model: string };
    };
    const clientSecret = bootstrapData.voice.clientSecret;
    const model = bootstrapData.voice.model;

    const pc = new RTCPeerConnection();
    voicePcRef.current = pc;

    pc.ontrack = (event) => {
      if (!remoteAudioRef.current) return;
      remoteAudioRef.current.srcObject = event.streams[0];
      remoteAudioRef.current.muted = muted;
      void remoteAudioRef.current.play().catch(() => {
        // Autoplay may be blocked until user interaction.
      });
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === "connected") {
        setVoiceState("connected");
        reconnectMarkedRef.current = false;
        return;
      }

      if (state === "connecting" || state === "new") {
        setVoiceState("connecting");
        return;
      }

      if (state === "disconnected") {
        setVoiceState("reconnecting");
        markReconnecting();
        return;
      }

      if (state === "failed" || state === "closed") {
        setVoiceState("failed");
        markReconnecting();
      }
    };

    for (const track of micStream.getTracks()) {
      track.enabled = !muted;
      pc.addTrack(track, micStream);
    }

    const dataChannel = pc.createDataChannel("oai-events");
    dataChannel.addEventListener("message", (event) => {
      if (assistantSeenRef.current) return;

      try {
        const parsed = JSON.parse(event.data) as { type?: string };
        const type = parsed.type ?? "";
        if (type.startsWith("response.audio.") || type.startsWith("response.output_text.") || type === "response.done") {
          assistantSeenRef.current = true;
          if (!firstAssistantResponseMs && bootStartRef.current > 0) {
            setFirstAssistantResponseMs(Math.round(performance.now() - bootStartRef.current));
          }
        }
      } catch {
        // Ignore non-JSON provider events.
      }
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const sdpRes = await fetch(`https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientSecret}`,
        "Content-Type": "application/sdp",
      },
      body: offer.sdp ?? "",
    });
    if (!sdpRes.ok) {
      throw new Error(`Realtime SDP exchange failed (${sdpRes.status}): ${await sdpRes.text()}`);
    }

    const answerSdp = await sdpRes.text();
    await pc.setRemoteDescription({
      type: "answer",
      sdp: answerSdp,
    });
  }, [avatarLog, firstAssistantResponseMs, markReconnecting, muted, publishMediaDebugStats, sessionId]);

  const startLiveAvatar = useCallback(async () => {
    avatarBootstrapCallsRef.current += 1;
    publishMediaDebugStats();
    avatarBootstrapAttemptRef.current += 1;
    const attempt = avatarBootstrapAttemptRef.current;
    const bootstrapStart = performance.now();

    setAvatarState("avatar_connecting");
    teardownAvatarRef.current = false;
    avatarHasVideoTrackRef.current = false;
    avatarHasAudioTrackRef.current = false;
    avatarVideoLiveMarkedRef.current = false;
    avatarConnectedAtRef.current = null;
    avatarLog("avatar.bootstrap.request_start", { attempt });

    const bootstrapRes = await fetch("/api/realtime/avatar/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
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
      avatar: { streamUrl?: string; token?: string };
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
    setSessionBootstrapMs(null);
    setFirstAvatarRenderMs(null);
    setFirstAssistantResponseMs(null);
    assistantSeenRef.current = false;

    try {
      await Promise.all([startRealtimeVoice(), startLiveAvatar()]);
      setSessionBootstrapMs(Math.round(performance.now() - bootStartRef.current));
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
  }, [avatarLog, markReconnecting, publishMediaDebugStats, refresh, startLiveAvatar, startRealtimeVoice]);

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
      const status = beat?.session.status ?? snapshotStatusRef.current;
      snapshotStatusRef.current = status ?? null;
      publishMediaDebugStats();
      avatarLog("effect.initial_bootstrap.post_refresh", {
        status,
      });
      if (status !== "active") {
        avatarLog("effect.initial_bootstrap.skip_non_active", {
          status,
        });
        return;
      }
      await initializeRealtime("initial", false);
    })();

    return () => {
      cleanupVoice();
      cleanupAvatar();
    };
  }, [avatarLog, cleanupAvatar, cleanupVoice, initializeRealtime, publishMediaDebugStats, refresh]);

  useEffect(() => {
    if (!localStreamRef.current) return;
    for (const track of localStreamRef.current.getAudioTracks()) {
      track.enabled = !muted;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = muted;
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
      return;
    }
  }, [avatarLog, cleanupAvatar, cleanupVoice, snapshot]);

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
  const freeRemaining = snapshot?.freeRemainingSeconds ?? 60;
  const requiresPayment = snapshot?.requiresPayment ?? false;
  const showFreeEnding = snapshot?.shouldShowFreeEndingWarning ?? false;

  const priceLabel = useMemo(() => `$${(costCents / 100).toFixed(2)}`, [costCents]);

  async function endCall() {
    cleanupVoice();
    cleanupAvatar();
    await fetch(`/api/sessions/${sessionId}/end`, { method: "POST" });
    router.push(`/session/${sessionId}/end`);
  }

  async function continueTalking() {
    setLoadingContinue(true);

    await fetch("/api/billing/top-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: getClientUserId(),
        amountCents: 1000,
      }),
    });

    await refresh({ resume: true });
    await initializeRealtime("continue_after_payment", true);
    setLoadingContinue(false);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-background px-4 pb-8 pt-5 sm:px-8">
      <section className="mx-auto flex w-full max-w-6xl items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/55">LIVE</p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{persona.name}</h1>
        </div>
        <button
          type="button"
          onClick={endCall}
          className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/20"
        >
          End
        </button>
      </section>

      <section className="mx-auto mt-4 w-full max-w-6xl">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/15 bg-gradient-to-b from-[#15233b] to-[#0e1727] p-5 shadow-[0_34px_90px_-50px_rgba(0,0,0,0.95)]">
          <div className="aspect-[9/12] w-full overflow-hidden rounded-[1.6rem] border border-white/10 bg-[#0f1a2c] md:aspect-[16/9]">
            <div className="relative h-full w-full">
              <video
                ref={avatarVideoRef}
                className={`h-full w-full object-cover transition-opacity duration-300 ${
                  avatarState === "avatar_video_live" ? "opacity-100" : "opacity-0"
                }`}
                autoPlay
                playsInline
                muted
              />
              <img
                src={persona.previewImage}
                alt={persona.name}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                  avatarState === "avatar_video_live" ? "opacity-0" : "opacity-100"
                }`}
              />
            </div>
          </div>
          <audio ref={remoteAudioRef} autoPlay playsInline hidden />
          <div ref={avatarAudioContainerRef} />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="rounded-full bg-black/35 px-4 py-2 text-sm text-white/90">Timer {formatTime(duration)}</div>
            <div className="rounded-full bg-black/35 px-4 py-2 text-sm text-white/90">Cost {priceLabel}</div>
            <div className="rounded-full bg-black/35 px-4 py-2 text-sm text-white/90">
              {freeRemaining > 0 ? `Free minute: ${freeRemaining}s` : "$1.99/min active"}
            </div>
            <button
              type="button"
              onClick={() => setMuted((v) => !v)}
              className="rounded-full bg-black/35 px-4 py-2 text-sm text-white/90 transition hover:bg-black/55"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
            <div className="rounded-full bg-black/35 px-4 py-2 text-xs text-white/80">Voice: {voiceState}</div>
            <div className="rounded-full bg-black/35 px-4 py-2 text-xs text-white/80">Avatar: {avatarState}</div>
            {sessionBootstrapMs !== null ? (
              <div className="rounded-full bg-black/35 px-4 py-2 text-xs text-white/80">Start {sessionBootstrapMs}ms</div>
            ) : null}
            {firstAvatarRenderMs !== null ? (
              <div className="rounded-full bg-black/35 px-4 py-2 text-xs text-white/80">Avatar render {firstAvatarRenderMs}ms</div>
            ) : null}
            {firstAssistantResponseMs !== null ? (
              <div className="rounded-full bg-black/35 px-4 py-2 text-xs text-white/80">First response {firstAssistantResponseMs}ms</div>
            ) : null}
            {(voiceState !== "connected" ||
              (avatarState !== "avatar_video_live" &&
                avatarState !== "avatar_audio_only" &&
                avatarState !== "avatar_concurrency_limited")) && (
              <button
                type="button"
                onClick={() => {
                  cleanupVoice();
                  cleanupAvatar("manual_reconnect");
                  void initializeRealtime("manual_reconnect", true);
                }}
                className="rounded-full bg-black/35 px-4 py-2 text-xs text-white/90 transition hover:bg-black/55"
              >
                Reconnect media
              </button>
            )}
          </div>

          {avatarState === "avatar_concurrency_limited" ? (
            <p className="mt-3 text-xs text-amber-200/90">Avatar capacity reached. Running in voice-only mode until avatar capacity is available.</p>
          ) : null}
          {avatarState === "avatar_audio_only" ? (
            <p className="mt-3 text-xs text-amber-200/90">Avatar audio is active, but no remote video track is currently rendering.</p>
          ) : null}
          {mediaError ? <p className="mt-3 text-xs text-rose-200/90">{mediaError}</p> : null}
        </div>
      </section>

      {showFreeEnding && !requiresPayment ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-20 mx-auto w-fit rounded-full border border-amber-300/40 bg-amber-400/15 px-4 py-2 text-sm font-semibold text-amber-100 backdrop-blur">
          Free minute ending
        </div>
      ) : null}

      {requiresPayment ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-5">
          <div className="w-full max-w-sm rounded-3xl border border-white/15 bg-[#101a2b] p-6 text-center shadow-[0_36px_100px_-56px_rgba(0,0,0,1)]">
            <h2 className="text-2xl font-bold">Continue talking — $1.99/min</h2>
            <p className="mt-2 text-sm text-white/70">Conversation is paused until credits are available.</p>
            <button
              type="button"
              disabled={loadingContinue}
              onClick={continueTalking}
              className="mt-5 w-full rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:opacity-60"
            >
              {loadingContinue ? "Continuing..." : "Continue"}
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
