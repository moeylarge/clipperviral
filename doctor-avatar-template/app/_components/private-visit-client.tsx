"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createLocalAudioTrack, type LocalAudioTrack, Room, RoomEvent, Track } from "livekit-client";

type VoiceState = "idle" | "connecting" | "connected" | "failed";
type AvatarState = "idle" | "connecting" | "video_live" | "audio_only" | "disabled" | "failed";

function statusText(voice: VoiceState, avatar: AvatarState) {
  if (voice === "connected" && avatar === "video_live") return "Live now";
  if (voice === "connected" && avatar === "audio_only") return "Audio live";
  if (voice === "connecting" || avatar === "connecting") return "Connecting";
  if (avatar === "disabled") return "Video disabled";
  if (voice === "failed" || avatar === "failed") return "Reconnect needed";
  return "";
}

export function PrivateVisitClient({ accessKey, characterName, tagline }: { accessKey: string; characterName: string; tagline: string }) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [avatarState, setAvatarState] = useState<AvatarState>("idle");
  const [booting, setBooting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const conversationIdRef = useRef<string>("");
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null);
  const roomRef = useRef<Room | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const avatarAudioContainerRef = useRef<HTMLDivElement | null>(null);
  const avatarHasVideoRef = useRef(false);

  const durationLabel = useMemo(() => {
    const minutes = Math.floor(elapsedSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, [elapsedSeconds]);

  const cleanup = useCallback(() => {
    if (roomRef.current) {
      if (localAudioTrackRef.current) {
        void roomRef.current.localParticipant.unpublishTrack(localAudioTrackRef.current);
      }
      roomRef.current.removeAllListeners();
      roomRef.current.disconnect();
      roomRef.current = null;
    }

    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.stop();
      localAudioTrackRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (avatarAudioContainerRef.current) {
      avatarAudioContainerRef.current.innerHTML = "";
    }

    avatarHasVideoRef.current = false;
  }, []);

  const startAvatar = useCallback(async () => {
    setAvatarState("connecting");
    setVoiceState("connecting");
    if (!conversationIdRef.current) {
      conversationIdRef.current = crypto.randomUUID();
    }

    const bootstrapRes = await fetch("/api/realtime/avatar/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessKey,
        conversationId: conversationIdRef.current,
      }),
    });

    if (!bootstrapRes.ok) {
      throw new Error(await bootstrapRes.text());
    }

    const bootstrapData = (await bootstrapRes.json()) as {
      avatar: { streamUrl?: string; token?: string; disabled?: boolean; disabledReason?: string };
    };

    if (bootstrapData.avatar.disabled) {
      setAvatarState("disabled");
      throw new Error(bootstrapData.avatar.disabledReason ?? "Avatar video is disabled");
    }

    if (!bootstrapData.avatar.streamUrl || !bootstrapData.avatar.token) {
      throw new Error("LiveAvatar bootstrap missing streamUrl or token");
    }

    const room = new Room();
    roomRef.current = room;

    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Video && videoRef.current) {
        avatarHasVideoRef.current = true;
        track.attach(videoRef.current);
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        videoRef.current.autoplay = true;
        videoRef.current.onplaying = () => {
          setAvatarState("video_live");
        };
        void videoRef.current.play()
          .then(() => {
            setAvatarState("video_live");
          })
          .catch(() => undefined);
      }

      if (track.kind === Track.Kind.Audio && avatarAudioContainerRef.current) {
        const audio = track.attach() as HTMLAudioElement;
        audio.autoplay = true;
        audio.style.display = "none";
        audio.muted = muted;
        avatarAudioContainerRef.current.appendChild(audio);
        setAvatarState((current) => (avatarHasVideoRef.current || current === "video_live" ? "video_live" : "audio_only"));
      }
    });

    room.on(RoomEvent.Disconnected, () => {
      setVoiceState("failed");
      setAvatarState("failed");
    });

    await room.connect(bootstrapData.avatar.streamUrl, bootstrapData.avatar.token, {
      autoSubscribe: true,
    });

    const localAudioTrack = await createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    localAudioTrackRef.current = localAudioTrack;

    if (muted) {
      await localAudioTrack.mute();
    } else {
      await localAudioTrack.unmute();
    }

    await room.localParticipant.publishTrack(localAudioTrack, {
      source: Track.Source.Microphone,
      name: "mark-mic",
      stream: "mark-mic",
    });
    setVoiceState("connected");
  }, [accessKey, muted]);

  async function startVisit() {
    setBooting(true);
    setError(null);
    cleanup();
    conversationIdRef.current = crypto.randomUUID();

    try {
      await startAvatar();
      setElapsedSeconds(0);
      setStartedAt(Date.now());
      requestAnimationFrame(() => {
        window.setTimeout(() => {
          viewportRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 120);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start the private visit");
      cleanup();
      setVoiceState((current) => (current === "connected" ? current : "failed"));
      setAvatarState((current) => (current === "video_live" || current === "audio_only" ? current : "failed"));
      setStartedAt(null);
      setElapsedSeconds(0);
    } finally {
      setBooting(false);
    }
  }

  function endVisit() {
    cleanup();
    setVoiceState("idle");
    setAvatarState("idle");
    setStartedAt(null);
    setElapsedSeconds(0);
    setError(null);
  }

  useEffect(() => {
    if (localAudioTrackRef.current) {
      if (muted) {
        void localAudioTrackRef.current.mute();
      } else {
        void localAudioTrackRef.current.unmute();
      }
    }
    if (avatarAudioContainerRef.current) {
      avatarAudioContainerRef.current.querySelectorAll("audio").forEach((audio) => {
        audio.muted = muted;
      });
    }
  }, [muted]);

  useEffect(() => {
    if (!startedAt) return;
    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    const tick = setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);
    return () => clearInterval(tick);
  }, [startedAt]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return (
    <main className="private-shell">
      <section className="private-panel" style={{ padding: 28 }}>
        <div className="private-header">
          <div className="private-hero-intro">
            <div className="private-topline-row">
              <p className="private-topline">Private session</p>
              <span className="private-trust-chip">Confidential</span>
              <span className="live-consult-badge">
                <span className="live-consult-dot" />
                Live consult
              </span>
            </div>
            <h1 className="private-title">{characterName}</h1>
            <p className="private-status-line">Symptom review and next-step guidance</p>
            <p className="private-copy">{tagline}</p>
            <div className="hero-ecg" aria-hidden="true">
              <span className="hero-ecg-line" />
            </div>
          </div>
          <div className="private-hero-side">
            <div className="doctor-avatar-card" aria-hidden="true">
              <div className="doctor-avatar-halo halo-a" />
              <div className="doctor-avatar-halo halo-b" />
              <div className="doctor-avatar">
                <div className="doctor-avatar-head" />
                <div className="doctor-avatar-hair" />
                <div className="doctor-avatar-body" />
                <div className="doctor-avatar-coat" />
                <div className="doctor-avatar-shirt" />
                <div className="doctor-avatar-cross" />
                <div className="doctor-avatar-stethoscope neck-left" />
                <div className="doctor-avatar-stethoscope neck-right" />
                <div className="doctor-avatar-stethoscope chest" />
              </div>
            </div>
            <div className="private-controls">
              <button type="button" className="private-button" style={{ padding: "18px 34px", fontSize: 18 }} onClick={startVisit} disabled={booting}>
                {booting ? "Starting..." : "Start with one click"}
              </button>
              <button type="button" className="private-button" style={{ padding: "15px 20px" }} onClick={() => setMuted((value) => !value)}>
                {muted ? "Unmute" : "Mute"}
              </button>
              <button
                type="button"
                className="private-button"
                style={{ padding: "15px 20px" }}
                onClick={endVisit}
                disabled={voiceState === "idle" && avatarState === "idle"}
              >
                End
              </button>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {statusText(voiceState, avatarState) ? <span className="status-pill">{statusText(voiceState, avatarState)}</span> : null}
          <span className="status-pill timer-pill">
            <span className="timer-label">Session time</span>
            <span className="timer-value">{durationLabel}</span>
          </span>
        </div>

        <div ref={viewportRef} style={{ marginTop: 24 }} className="viewport">
          <video ref={videoRef} autoPlay playsInline muted style={{ opacity: avatarState === "video_live" ? 1 : 0, transition: "opacity 200ms ease" }} />
          <div
            className="fallback"
            style={{
              opacity: avatarState === "video_live" ? 0 : 1,
              visibility: avatarState === "video_live" ? "hidden" : "visible",
              transition: "opacity 200ms ease",
            }}
          >
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#2f2952" }}>{characterName}</div>
              <p style={{ margin: "12px auto 0", maxWidth: 420, fontSize: 16, lineHeight: 1.6 }}>
                Tap start to begin the private voice and video session. Use it to talk things through and get organized before speaking with a real clinician.
              </p>
            </div>
          </div>
        </div>

        <div ref={avatarAudioContainerRef} />

        <div className="private-summary">
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <div className="metric-card">
              <div className="metric-label">Session</div>
              <div className="metric-value">{statusText(voiceState, avatarState)}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Voice</div>
              <div className="metric-value">{voiceState}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Video</div>
              <div className="metric-value">{avatarState === "video_live" ? "live" : avatarState === "audio_only" ? "audio" : avatarState}</div>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">Use it for</div>
            <div className="metric-value" style={{ fontSize: 16, lineHeight: 1.5 }}>
              Talking through symptoms, organizing thoughts, and preparing better questions for a real doctor.
            </div>
          </div>
        </div>

        <div className="warning">
          Support only. This is not a doctor and not medical advice. For emergencies or rapidly worsening symptoms, call emergency services or go to the ER.
        </div>

        <p className="private-note">Best use: describe what is happening, let it help organize the details, then use that summary with a licensed clinician.</p>

        {error ? <div className="warning">{error}</div> : null}
      </section>
    </main>
  );
}
