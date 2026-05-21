import Link from "next/link";
import { headers } from "next/headers";

import { HomePageClient } from "./_components/homepage-client";
import { PERSONAS } from "@/lib/personas";

export const dynamic = "force-dynamic";

const features = [
  {
    title: "AI moment detection",
    body: "Find the best 30 seconds in any 2-hour Kick or YouTube VOD.",
  },
  {
    title: "200+ Kick streamer overlays",
    body: "Official Kick Program Mode compliant overlays built into the editor.",
  },
  {
    title: "Multi-format export",
    body: "9:16, 16:9, 4:5, square, iPhone frame, and split-screen layouts.",
  },
  {
    title: "Effects library",
    body: "Add motion, frames, lower thirds, brand tags, and punchy social polish.",
  },
  {
    title: "Caption styles",
    body: "Generate captions and tune styles for Shorts, Reels, TikTok, and feeds.",
  },
  {
    title: "Multi-clip stitch",
    body: "Rank moments, stitch highlights, and lead with the strongest hook.",
  },
];

function isClipperViralRequest(host: string) {
  const normalized = host.toLowerCase();
  return (
    process.env.NEXT_PUBLIC_SITE_KIND === "clipperviral" ||
    normalized === "clipperviral.com" ||
    normalized === "www.clipperviral.com" ||
    normalized.startsWith("clipperviral-")
  );
}

export default async function HomePage() {
  const host = (await headers()).get("host") || "";

  if (!isClipperViralRequest(host)) {
    return <HomePageClient personas={PERSONAS} demoVideoSrc={process.env.NEXT_PUBLIC_HOMEPAGE_DEMO_VIDEO_SRC ?? ""} />;
  }

  return (
    <main className="min-h-screen bg-[#080713] text-white">
      <section className="overflow-hidden bg-[radial-gradient(circle_at_15%_10%,rgba(227,93,224,0.34),transparent_30%),radial-gradient(circle_at_84%_5%,rgba(125,69,255,0.34),transparent_28%),linear-gradient(180deg,#121026_0%,#080713_100%)] px-4 py-6 sm:px-6 lg:px-8">
        <nav className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-lg font-black tracking-tight">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[linear-gradient(135deg,#4f22f2,#eb34b8)] shadow-[0_18px_44px_rgba(235,52,184,0.28)]">
              CV
            </span>
            ClipperViral
          </Link>
          <div className="flex items-center gap-3 text-sm font-bold">
            <Link href="/pricing" className="hidden text-white/72 transition hover:text-white sm:inline">
              Pricing
            </Link>
            <Link
              href="/login?next=/editor.html"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-white px-4 text-[#171021] shadow-[0_14px_34px_rgba(0,0,0,0.20)] transition hover:bg-[#fff1fc]"
            >
              Start trial
            </Link>
          </div>
        </nav>

        <div className="mx-auto grid max-w-6xl gap-12 py-16 lg:grid-cols-[1fr_0.88fr] lg:items-center lg:py-24">
          <div className="grid gap-8">
            <div className="grid gap-5">
              <div className="w-fit rounded-full border border-white/14 bg-white/8 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#ffd6f6]">
                Built for clippers
              </div>
              <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
                Turn Kick & YouTube VODs into viral clips — in seconds
              </h1>
              <p className="max-w-2xl text-base font-semibold leading-8 text-white/72 sm:text-lg">
                Built for clippers. AI scans 2-hour streams for the viral moments. Editor pre-tuned for TikTok, Reels, Shorts. 200+ official Kick streamer overlays.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login?next=/editor.html"
                className="inline-flex min-h-13 items-center justify-center rounded-full bg-[linear-gradient(135deg,#e35de0,#d63bdc_48%,#c423e3)] px-6 text-sm font-black text-white shadow-[0_22px_52px_rgba(227,93,224,0.32)] transition hover:brightness-110"
              >
                Start 7-day free trial
              </Link>
              <Link
                href="/pricing"
                className="inline-flex min-h-13 items-center justify-center rounded-full border border-white/18 bg-white/8 px-6 text-sm font-black text-white transition hover:bg-white/14"
              >
                See pricing
              </Link>
            </div>
            <p className="text-sm font-bold text-white/54">7-day free trial · no credit card · cancel anytime</p>
          </div>

          <div className="rounded-[28px] border border-white/12 bg-white/8 p-4 shadow-[0_30px_100px_rgba(0,0,0,0.32)] backdrop-blur">
            <div className="rounded-[22px] bg-[#100f1d] p-4 ring-1 ring-white/10">
              <div className="mb-4 flex items-center justify-between text-xs font-black text-white/62">
                <span>Demo video coming</span>
                <span>4:5 · 9:16 · 16:9</span>
              </div>
              <div className="grid aspect-[4/5] place-items-center rounded-[18px] bg-[linear-gradient(145deg,rgba(79,34,242,0.34),rgba(235,52,184,0.20)),radial-gradient(circle_at_50%_28%,rgba(255,255,255,0.20),transparent_22%),#171426]">
                <div className="grid gap-4 text-center">
                  <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white/12 text-3xl">▶</div>
                  <div>
                    <p className="text-2xl font-black tracking-tight">AI finds the hook</p>
                    <p className="mt-2 text-sm font-bold text-white/58">Scan VOD → rank moments → edit → export</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#fbf7ff] px-4 py-16 text-[#171021] sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-8">
          <div className="grid gap-3 text-center">
            <h2 className="text-4xl font-black tracking-tight">Everything a clipper needs in one editor</h2>
            <p className="mx-auto max-w-2xl text-sm font-semibold leading-6 text-[#6b6272]">
              From long VODs to social-ready exports without rebuilding the same layout over and over.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article key={feature.title} className="rounded-2xl border border-[#eadcf2] bg-white p-6 shadow-[0_18px_48px_rgba(23,16,33,0.06)]">
                <h3 className="text-xl font-black tracking-tight">{feature.title}</h3>
                <p className="mt-3 text-sm font-semibold leading-6 text-[#6b6272]">{feature.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-4 py-16 text-[#171021] sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-8">
          <div className="grid gap-2 text-center">
            <h2 className="text-4xl font-black tracking-tight">Launch pricing</h2>
            <p className="text-sm font-semibold text-[#6b6272]">7-day free trial · no credit card · cancel anytime</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-3xl border border-[#eadcf2] bg-[#fbf7ff] p-7">
              <h3 className="text-2xl font-black">Monthly</h3>
              <p className="mt-3 text-5xl font-black tracking-tight">$19<span className="text-base font-bold text-[#6b6272]">/mo</span></p>
              <p className="mt-4 text-sm font-semibold leading-6 text-[#6b6272]">Flexible access for active clipping weeks.</p>
            </article>
            <article className="rounded-3xl border border-[#171021] bg-[#171021] p-7 text-white shadow-[0_24px_70px_rgba(23,16,33,0.22)]">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-[#171021]">Best value</span>
              <h3 className="mt-4 text-2xl font-black">Annual</h3>
              <p className="mt-3 text-5xl font-black tracking-tight">$190<span className="text-base font-bold text-white/64">/yr</span></p>
              <p className="mt-4 text-sm font-semibold leading-6 text-white/68">Save $38 — 2 months free.</p>
            </article>
          </div>
          <Link href="/pricing" className="mx-auto text-sm font-black text-[#b81bc9] underline-offset-4 hover:underline">
            View full features →
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-[#080713] px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm font-bold text-white/62 sm:flex-row sm:items-center sm:justify-between">
          <p>Copyright 2026 ClipperViral</p>
          <nav className="flex flex-wrap gap-4">
            <Link href="/pricing" className="hover:text-white">Pricing</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <a href="mailto:support@clipperviral.com" className="hover:text-white">support@clipperviral.com</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
