"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useFwtovAuth } from "./fwtov-auth-provider";

type Persona = {
  slug: string;
  name: string;
  valueLine: string;
  previewImage: string;
  description?: string;
};

export function HomePageClient({ personas, demoVideoSrc = "" }: { personas: Persona[]; demoVideoSrc?: string }) {
  const router = useRouter();
  const { user, loading: authLoading, openAuth } = useFwtovAuth();
  const [loadingPersona, setLoadingPersona] = useState<string | null>(null);
  const [startNotice, setStartNotice] = useState<string | null>(null);
  const handledStartParamRef = useRef(false);
  const personaMap = useMemo(() => new Map(personas.map((p) => [p.slug, p])), [personas]);
  const personaTone = useMemo(
    () =>
      new Map<string, string>([
        ["santa", "from-[#ffdfbf] via-[#fff5eb] to-[#fffdf9]"],
        ["toothfairy", "from-[#ffe0f3] via-[#fff4fb] to-[#fffdfd]"],
        ["easterbunny", "from-[#e5f7d8] via-[#f7fff1] to-[#fffdf7]"],
      ]),
    [],
  );

  const handleStart = useCallback(async (personaSlug: string) => {
    if (authLoading) return;
    if (!user) {
      openAuth({ intent: "start_session", personaSlug });
      return;
    }

    try {
      setLoadingPersona(personaSlug);
      setStartNotice(null);
      const res = await fetch("/api/sessions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaSlug,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        setStartNotice(
          res.status === 402
            ? "Your free trial was already used. Pick a Gold Coins pack to start another live visit."
            : payload?.error ?? "The live visit could not start. Please try again.",
        );
        setLoadingPersona(null);
        return;
      }

      const data = (await res.json()) as { sessionId: string };
      router.push(`/session/${data.sessionId}`);
    } catch {
      setStartNotice("The live visit could not start. Please try again.");
      setLoadingPersona(null);
    }
  }, [authLoading, openAuth, router, user]);

  useEffect(() => {
    if (handledStartParamRef.current || authLoading || !user) return;

    const params = new URLSearchParams(window.location.search);
    const startPersona = params.get("start");
    if (!startPersona || !personaMap.has(startPersona)) return;

    handledStartParamRef.current = true;
    void handleStart(startPersona);
  }, [authLoading, handleStart, personaMap, user]);

  return (
    <main className="landing-shell relative overflow-hidden">
      <div className="landing-cotton-candy" aria-hidden>
        <div className="landing-candy landing-candy-one" />
        <div className="landing-candy landing-candy-two" />
        <div className="landing-candy landing-candy-three" />
        <div className="landing-candy landing-candy-four" />
        <div className="landing-candy landing-candy-five" />
        <div className="landing-candy landing-candy-six" />
        <div className="landing-balloon landing-balloon-pink" />
        <div className="landing-balloon landing-balloon-blue" />
        <div className="landing-balloon landing-balloon-yellow" />
        <div className="landing-balloon landing-balloon-lilac" />
      </div>

      <section className="hero-glow relative overflow-hidden px-5 pb-12 pt-8 sm:px-8 sm:pt-12">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute left-[5%] top-10 h-32 w-32 rounded-full bg-[#ffd04c]/60 blur-3xl" />
          <div className="absolute left-[28%] top-20 h-20 w-20 rounded-full bg-[#ff8fb8]/45 blur-2xl" />
          <div className="absolute right-[8%] top-16 h-32 w-32 rounded-full bg-[#ffb34f]/50 blur-3xl" />
          <div className="absolute right-[18%] top-8 h-20 w-20 rounded-full bg-[#9fdbff]/50 blur-2xl" />
          <div className="absolute bottom-12 left-[48%] h-28 w-28 rounded-full bg-[#c8f097]/45 blur-3xl" />
          <div className="hero-candy-cloud hero-candy-cloud-left" />
          <div className="hero-candy-cloud hero-candy-cloud-right" />
          <div className="hero-candy-cloud hero-candy-cloud-bottom" />
        </div>

        <div className="relative z-10 mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="hero-panel max-w-3xl px-5 py-5 sm:px-7 sm:py-7 lg:pr-8">
            <div className="hero-panel-cotton" aria-hidden>
              <div className="hero-panel-cotton-blob hero-panel-cotton-blob-one" />
              <div className="hero-panel-cotton-blob hero-panel-cotton-blob-two" />
              <div className="hero-panel-cotton-blob hero-panel-cotton-blob-three" />
              <div className="hero-panel-cotton-blob hero-panel-cotton-blob-four" />
              <div className="hero-panel-cotton-sheen" />
            </div>

            <div className="relative z-[1]">
              <div className="hero-copy-enter hero-trust-pill inline-flex rounded-full px-3.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]">
                Parent-started • Parent-controlled
              </div>
              <h1 className="hero-headline-enter mt-5 max-w-4xl text-balance text-5xl font-semibold leading-[0.92] text-[#252c62] sm:text-6xl xl:text-7xl">
                Santa is on the line!
              </h1>
              <p className="hero-copy-enter mt-4 max-w-2xl text-xl font-bold text-[#36489a] sm:text-2xl">
                Press the button and say hi — the Easter Bunny and Tooth Fairy are waiting too.
              </p>
              <p className="hero-copy-enter-delayed mt-4 max-w-2xl text-base leading-7 text-[#536186] sm:text-lg">
                Real-time video calls, safely powered by AI. First 45 seconds free.
              </p>

              <div className="hero-cta-group-enter mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={() => handleStart("santa")}
                  className="hero-primary-cta cta-pop px-10 py-5 text-xl font-extrabold transition hover:brightness-105"
                >
                  Call Santa →
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const node = document.getElementById("characters");
                    node?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="hero-secondary-cta px-6 py-4 text-base font-extrabold transition hover:-translate-y-0.5 hover:bg-white"
                >
                  Meet the Characters
                </button>
              </div>

              <div className="hero-copy-enter-delayed mt-5 flex flex-wrap items-center gap-2 text-sm font-bold">
                <span className="hero-chip px-3 py-2">First 45 seconds included</span>
                <span className="hero-chip px-3 py-2">Parent confirms before extra time</span>
                <span className="hero-chip px-3 py-2">Live on screen right away</span>
              </div>
              {startNotice ? (
                <div className="hero-copy-enter-delayed mt-4 rounded-[18px] border border-[#f0dfca] bg-[#fff8ef] px-4 py-3 text-sm font-extrabold leading-6 text-[#9a653b]" role="status">
                  {startNotice} Open a character card and choose a pack when prompted.
                </div>
              ) : null}
            </div>
          </div>

          <div className="relative min-h-[420px] lg:min-h-[540px]">
            {demoVideoSrc ? (
              <div className="hero-cast-santa hero-cast-shell absolute left-1/2 top-[0%] z-20 w-full max-w-[440px] hero-float-delay -translate-x-1/2 bg-white/34 p-3">
                <video
                  src={demoVideoSrc}
                  className="aspect-[9/12] w-full rounded-[26px] object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                  aria-label="Santa preview video"
                />
                <div className="mt-3 text-center text-base font-extrabold tracking-[0.01em] text-[#cb583c]">Santa Claus</div>
              </div>
            ) : (
              <>
                <div className="hero-cast-tooth hero-cast-shell absolute left-[2%] top-[14%] hero-float z-10 bg-white/28 p-2">
                  <span className="hero-prop hero-prop-sparkle left-1 top-10 h-5 w-5 bg-[#ffe171]" />
                  <span className="hero-prop hero-prop-sparkle-delayed right-3 top-4 h-4 w-4 bg-[#ffd0ef]" />
                  <span className="hero-prop hero-prop-sparkle left-5 bottom-16 h-3 w-3 bg-[#b8d7ff]" />
                  <img src="/avatars/toothfairy.svg" alt="Tooth Fairy" className="hero-cast-body h-[210px] w-[175px] object-cover sm:h-[250px] sm:w-[210px]" />
                  <div className="mt-2 text-center text-sm font-extrabold tracking-[0.01em] text-[#c15e97]">Tooth Fairy</div>
                </div>
                <div className="hero-cast-santa hero-cast-shell absolute left-1/2 top-[0%] z-20 hero-float-delay -translate-x-1/2 bg-white/34 p-3">
                  <span className="hero-prop hero-prop-snow left-2 top-12 h-4 w-4 bg-white" />
                  <span className="hero-prop hero-prop-snow-delayed right-4 top-8 h-5 w-5 bg-[#fff4d6]" />
                  <span className="hero-prop hero-prop-snow left-10 bottom-20 h-3 w-3 bg-[#fff]" />
                  <img src="/avatars/santa.svg" alt="Santa Claus" className="hero-cast-body h-[310px] w-[248px] object-cover sm:h-[378px] sm:w-[306px]" />
                  <div className="mt-3 text-center text-base font-extrabold tracking-[0.01em] text-[#cb583c]">Santa Claus</div>
                </div>
                <div className="hero-cast-bunny hero-cast-shell absolute right-[2%] top-[13%] hero-float-delay-2 z-10 bg-white/28 p-2">
                  <span className="hero-prop hero-prop-egg left-1 top-10 h-6 w-5 bg-[#ffd06f]" />
                  <span className="hero-prop hero-prop-egg-delayed right-2 top-6 h-5 w-4 bg-[#ffbfd4]" />
                  <span className="hero-prop hero-prop-egg left-7 bottom-14 h-5 w-4 bg-[#b5e18c]" />
                  <img src="/avatars/easterbunny.svg" alt="Easter Bunny" className="hero-cast-body h-[210px] w-[175px] object-cover sm:h-[250px] sm:w-[210px]" />
                  <div className="mt-2 text-center text-sm font-extrabold tracking-[0.01em] text-[#6d9842]">Easter Bunny</div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-6xl px-5 pb-4 sm:px-8">
        <div className="grid gap-3 rounded-[30px] border border-[#eddcc8] bg-white/76 p-4 text-sm text-[#59617f] shadow-[0_18px_50px_-34px_rgba(121,91,57,0.22)] sm:grid-cols-3 sm:p-5">
          <div className="rounded-[18px] bg-[#fff9f2] px-4 py-3">
            <p className="font-extrabold text-[#2b2f53]">Designed for wonder</p>
            <p className="mt-1">Bright, simple, magical calls that feel special fast.</p>
          </div>
          <div className="rounded-[18px] bg-[#fff9f2] px-4 py-3">
            <p className="font-extrabold text-[#2b2f53]">Built for parents</p>
            <p className="mt-1">Clear pricing, easy start, and no child-facing payment decisions.</p>
          </div>
          <div className="rounded-[18px] bg-[#fff9f2] px-4 py-3">
            <p className="font-extrabold text-[#2b2f53]">Made for happy moments</p>
            <p className="mt-1">Perfect for bedtime, holiday excitement, and little family traditions.</p>
          </div>
        </div>
      </section>

      <section id="characters" className="relative mx-auto w-full max-w-6xl px-5 pb-16 pt-7 sm:px-8">
        <div className="characters-candy-wash" aria-hidden />
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a47144]">Choose a magical visitor</p>
            <h2 className="mt-2 text-3xl font-semibold text-[#2b2f53] sm:text-4xl">Three characters. Three kinds of magic.</h2>
            <p className="mt-3 max-w-2xl text-base text-[#646d8e]">
              Pick the visit that fits the moment best. Each one is built to feel safe, warm, and instantly understandable for kids.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {personas.map((persona) => {
            const loading = loadingPersona === persona.slug;
            return (
              <button
                key={persona.slug}
                type="button"
                className="persona-card"
                aria-label={`Start magical call with ${persona.name}`}
                onClick={() => handleStart(persona.slug)}
                disabled={loadingPersona !== null}
              >
                <div className={`overflow-hidden rounded-[24px] border border-[#edd9c4] bg-gradient-to-b ${personaTone.get(persona.slug)}`}>
                  <img src={persona.previewImage} alt={persona.name} className="h-[280px] w-full object-cover object-top" />
                </div>
                <div className="mt-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#a47144]">Live magical character</p>
                    <h3 className="mt-2 text-3xl font-semibold text-[#2b2f53]">{persona.name}</h3>
                    <p className="mt-2 text-sm font-bold text-[#5d6587]">{persona.valueLine}</p>
                    {persona.description ? <p className="mt-3 text-sm text-[#6f7694]">{persona.description}</p> : null}
                  </div>
                  <span className="rounded-full border border-[#f0d2b9] bg-[#fff8f3] px-4 py-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#b36b3e]">
                    Open visit
                  </span>
                </div>
                {loading ? (
                  <p className="mt-5 text-sm font-bold text-primary">Opening the magical visit...</p>
                ) : (
                  <p className="mt-5 text-sm text-[#6f7694]">First 45 seconds included. Parent confirms before the visit continues.</p>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl items-center justify-center gap-6 px-5 pb-10 text-xs font-bold text-[#7c829b] sm:px-8">
        <a href="/terms" className="transition hover:text-[#2b2f53]">
          Terms
        </a>
        <a href="/privacy" className="transition hover:text-[#2b2f53]">
          Privacy
        </a>
      </footer>

      {loadingPersona && !personaMap.get(loadingPersona) ? (
        <p className="sr-only" aria-live="polite">
          Loading
        </p>
      ) : null}
    </main>
  );
}
