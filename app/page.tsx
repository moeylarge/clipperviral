import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";

import { HomePageClient } from "./_components/homepage-client";
import { PERSONAS } from "@/lib/personas";

export const dynamic = "force-dynamic";

const overlayStreamers = [
  "adinross",
  "trainwreckstv",
  "xqc",
  "sneako",
  "akademiks",
  "babyalien",
  "jackdoherty",
  "zhc",
  "deenthegreat",
  "ryangarcia",
  "camcasey",
  "astridwett",
];

const layoutCards = [
  {
    title: "9:16 Full Screen",
    body: "TikTok, Reels, and Shorts placement sits 25% above bottom to stay clear of captions.",
  },
  {
    title: "16:9 Horizontal",
    body: "YouTube-ready lower third with bottom placement and 4% safe padding.",
  },
  {
    title: "4:5 Feed",
    body: "Instagram feed framing with the branded overlay positioned for scroll-stop visibility.",
  },
  {
    title: "Split-screen / 4:5 Stacked",
    body: "Middle-gap placement keeps both clips visible while the Kick brand stays top-most.",
  },
];

const secondaryFeatures = [
  "AI moment detection — Find the best 30 seconds in any 2-hour Kick or YouTube VOD",
  "Multi-format export — 9:16, 16:9, 4:5, square, iPhone frame, split screen",
  "Effects library — Motion, frames, lower-thirds, brand tags",
  "Caption styles — Tuned for TikTok, Reels, Shorts",
  "Multi-clip stitch — Rank, stitch, lead with the hook",
];

const complianceItems = [
  "Approved by Kick HQ",
  "Auto-resizes per layout",
  "Streamer search built into editor",
  "Always renders top-most",
  "250+ overlays + ongoing updates",
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

function formatHandle(handle: string) {
  return handle.replace(/_/g, " ");
}

export default async function HomePage() {
  const host = (await headers()).get("host") || "";

  if (!isClipperViralRequest(host)) {
    return <HomePageClient personas={PERSONAS} demoVideoSrc={process.env.NEXT_PUBLIC_HOMEPAGE_DEMO_VIDEO_SRC ?? ""} />;
  }

  return (
    <main className="min-h-screen bg-[#080713] text-white">
      <section className="overflow-hidden bg-[radial-gradient(circle_at_15%_10%,rgba(83,252,24,0.18),transparent_26%),radial-gradient(circle_at_84%_5%,rgba(227,93,224,0.30),transparent_28%),linear-gradient(180deg,#121026_0%,#080713_100%)] px-4 py-6 sm:px-6 lg:px-8">
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

        <div className="mx-auto grid max-w-6xl gap-12 py-14 lg:grid-cols-[1fr_0.86fr] lg:items-center lg:py-20">
          <div className="grid gap-8">
            <div className="grid gap-5">
              <div className="w-fit rounded-full border border-[#53fc18]/30 bg-[#53fc18]/12 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#caffbd]">
                200+ Official Kick Program Overlays
              </div>
              <h1 className="max-w-4xl text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
                Kick Content Program-ready clips in one click
              </h1>
              <p className="max-w-2xl text-base font-semibold leading-8 text-white/74 sm:text-lg">
                ClipperViral ships every official Kick streamer overlay built-in. Clip any of 200+ Kick streamers and stay compliant — no more rebuilding lower-thirds in CapCut.
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
                href="#overlay-library"
                className="inline-flex min-h-13 items-center justify-center rounded-full border border-white/18 bg-white/8 px-6 text-sm font-black text-white transition hover:bg-white/14"
              >
                See the overlay library
              </Link>
            </div>
            <p className="text-sm font-bold text-white/54">7-day free trial · no credit card · cancel anytime</p>
          </div>

          <div className="mx-auto w-full max-w-[390px] rounded-[38px] border border-white/14 bg-white/10 p-3 shadow-[0_32px_110px_rgba(0,0,0,0.42)] backdrop-blur">
            <div className="rounded-[30px] bg-[#0a0d12] p-3 ring-1 ring-white/10">
              <div className="relative aspect-[9/16] overflow-hidden rounded-[24px] bg-[radial-gradient(circle_at_50%_22%,rgba(255,255,255,0.20),transparent_20%),linear-gradient(180deg,#1b2230_0%,#0d1118_58%,#05070b_100%)]">
                <div className="absolute left-5 right-5 top-5 flex items-center justify-between text-[10px] font-black uppercase tracking-[0.16em] text-white/50">
                  <span>Kick clip</span>
                  <span>9:16</span>
                </div>
                <div className="absolute inset-x-8 top-[19%] aspect-video rounded-2xl bg-[linear-gradient(135deg,rgba(83,252,24,0.24),rgba(227,93,224,0.18)),#151b24] shadow-[0_18px_60px_rgba(0,0,0,0.36)]">
                  <div className="grid h-full place-items-center text-center">
                    <span className="rounded-full bg-white/10 px-4 py-2 text-xs font-black text-white/72">VOD moment</span>
                  </div>
                </div>
                <div className="absolute inset-x-5 bottom-[25%] rounded-xl bg-black/80 px-3 py-2 shadow-[0_12px_36px_rgba(0,0,0,0.42)]">
                  <Image
                    src="/brand/kick/streamers/adinross.png"
                    alt="Adin Ross Kick Program overlay"
                    width={1082}
                    height={108}
                    priority
                    className="h-auto w-full"
                  />
                </div>
                <div className="absolute bottom-5 left-5 right-5 rounded-2xl bg-white/8 p-4 text-sm font-black text-white/74">
                  Official overlay applied automatically
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="overlay-library" className="bg-[#fbf7ff] px-4 py-16 text-[#171021] sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-10">
          <div className="grid gap-4 text-center">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b81bc9]">The moat</p>
            <h2 className="text-4xl font-black tracking-tight sm:text-5xl">
              200+ Kick streamers. Every overlay. Compliance handled.
            </h2>
            <p className="mx-auto max-w-3xl text-base font-semibold leading-8 text-[#5d5364]">
              If you&apos;re clipping a streamer in Kick&apos;s Content Creator Program, you need their official branded overlay on every clip you post. Without it, monetization gets denied and accounts get locked. ClipperViral ships every overlay — pre-sized, pre-positioned, and Kick-compliant — so you stay paid.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {overlayStreamers.map((handle) => (
              <article key={handle} className="rounded-2xl border border-[#e3d4ec] bg-white p-4 shadow-[0_18px_48px_rgba(23,16,33,0.06)]">
                <div className="rounded-xl bg-[#0a0d12] px-3 py-4">
                  <Image
                    src={`/brand/kick/streamers/${handle}.png`}
                    alt={`${formatHandle(handle)} Kick Program overlay`}
                    width={1082}
                    height={108}
                    className="h-auto w-full"
                  />
                </div>
                <p className="mt-3 text-sm font-black uppercase tracking-[0.12em] text-[#6b6272]">{handle}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-5">
            <div className="text-center">
              <h3 className="text-3xl font-black tracking-tight">Smart placement on every layout</h3>
              <p className="mt-2 text-sm font-semibold text-[#6b6272]">The overlay moves with the export format, not against it.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {layoutCards.map((layout) => (
                <article key={layout.title} className="rounded-2xl border border-[#eadcf2] bg-white p-5 shadow-[0_14px_38px_rgba(23,16,33,0.05)]">
                  <h4 className="text-lg font-black tracking-tight">{layout.title}</h4>
                  <p className="mt-3 text-sm font-semibold leading-6 text-[#6b6272]">{layout.body}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="grid gap-6 rounded-3xl bg-[#10131c] p-6 text-white shadow-[0_24px_80px_rgba(23,16,33,0.18)] lg:grid-cols-[0.92fr_1fr] lg:items-center lg:p-8">
            <div>
              <h3 className="text-3xl font-black tracking-tight">Built for Kick Program compliance</h3>
              <p className="mt-3 text-sm font-semibold leading-6 text-white/62">
                Choose the streamer, pick the layout, and export with the right overlay already in place.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {complianceItems.map((item) => (
                <li key={item} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm font-black text-white/84">
                  ✓ {item}
                </li>
              ))}
            </ul>
          </div>

          <Link
            href="/login?next=/editor.html"
            className="mx-auto inline-flex min-h-13 items-center justify-center rounded-full bg-[linear-gradient(135deg,#e35de0,#d63bdc_48%,#c423e3)] px-6 text-sm font-black text-white shadow-[0_18px_42px_rgba(227,93,224,0.25)] transition hover:brightness-110"
          >
            Browse the full overlay library inside the editor — start your free trial →
          </Link>
        </div>
      </section>

      <section className="bg-white px-4 py-14 text-[#171021] sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b81bc9]">Also included</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight">The rest of the clipping workflow</h2>
            </div>
            <p className="max-w-xl text-sm font-semibold leading-6 text-[#6b6272]">
              The overlay library is the reason Kick clippers switch. These tools keep the workflow fast after the overlay is handled.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            {secondaryFeatures.map((feature) => (
              <div key={feature} className="rounded-2xl border border-[#eadcf2] bg-[#fbf7ff] p-4 text-sm font-bold leading-6 text-[#3b3340]">
                {feature}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#fbf7ff] px-4 py-16 text-[#171021] sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-5xl gap-8">
          <div className="grid gap-2 text-center">
            <h2 className="text-4xl font-black tracking-tight">Launch pricing</h2>
            <p className="text-sm font-semibold text-[#6b6272]">7-day free trial · no credit card · cancel anytime</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-3xl border border-[#eadcf2] bg-white p-7 shadow-[0_18px_48px_rgba(23,16,33,0.06)]">
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
