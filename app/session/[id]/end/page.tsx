import Link from "next/link";
import { notFound } from "next/navigation";

import { getSession, getTranscript, materializeSession } from "@/lib/session/store";

function formatDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  if (m === 0) return `${ss}s`;
  return `${m}m ${ss.toString().padStart(2, "0")}s`;
}

export default async function SessionEndPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) notFound();

  const snapshot = materializeSession(session);
  const transcript = await getTranscript(id);

  const totalLabel = `$${(snapshot.effectiveCostCents / 100).toFixed(2)}`;
  const durationLabel = formatDuration(snapshot.durationSeconds);
  const wordCount = transcript.reduce((acc, m) => acc + m.content.split(/\s+/).filter(Boolean).length, 0);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[linear-gradient(180deg,#fdf3fb_0%,#fffafd_55%,#fff5ec_100%)] px-4 pb-16 pt-10 sm:px-6">
      {/* Soft confetti blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-[6%] top-10 h-40 w-40 rounded-full bg-[#ffd0ef]/40 blur-3xl" />
        <div className="absolute right-[8%] top-24 h-44 w-44 rounded-full bg-[#d8c9f4]/50 blur-3xl" />
        <div className="absolute left-[30%] top-[40%] h-32 w-32 rounded-full bg-[#ffe171]/40 blur-3xl" />
      </div>

      <div className="mx-auto w-full max-w-3xl">
        {/* Hero card */}
        <section className="relative overflow-hidden rounded-[36px] border border-[#ecddf5] bg-white/90 p-7 text-center shadow-[0_40px_110px_-46px_rgba(67,61,123,0.35)] sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[linear-gradient(135deg,#f6f1ff_0%,#fff4e5_100%)] text-4xl shadow-inner">
            ✨
          </div>
          <p className="mt-5 text-[11px] font-black uppercase tracking-[0.22em] text-[#8a7fbb]">Visit complete</p>
          <h1 className="mt-2 text-3xl font-black leading-tight text-[#2b2f53] sm:text-4xl">
            That was magical.
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#5b6486]">
            Here&apos;s a warm little recap for the grown-up — how long the visit lasted, the total, and what was said.
          </p>

          {/* Stats */}
          <div className="mt-7 grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-[#ecddf5] bg-[linear-gradient(180deg,#fbf8ff_0%,#fffafd_100%)] px-3 py-4 sm:px-4">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#8a7fbb] sm:text-[10px]">Length</p>
              <p className="mt-2 font-mono text-xl font-black tabular-nums text-[#2b2f53] sm:text-2xl">{durationLabel}</p>
            </div>
            <div className="rounded-2xl border border-[#ecddf5] bg-[linear-gradient(180deg,#fbf8ff_0%,#fffafd_100%)] px-3 py-4 sm:px-4">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#8a7fbb] sm:text-[10px]">Total</p>
              <p className="mt-2 text-xl font-black text-[#2b2f53] sm:text-2xl">{totalLabel}</p>
            </div>
            <div className="rounded-2xl border border-[#ecddf5] bg-[linear-gradient(180deg,#fbf8ff_0%,#fffafd_100%)] px-3 py-4 sm:px-4">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-[#8a7fbb] sm:text-[10px]">Words</p>
              <p className="mt-2 text-xl font-black text-[#2b2f53] sm:text-2xl">{wordCount}</p>
            </div>
          </div>
        </section>

        {/* Highlights */}
        <section className="mt-6 rounded-3xl border border-[#ecddf5] bg-white/90 p-6 shadow-[0_24px_70px_-44px_rgba(67,61,123,0.28)] sm:p-7">
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-lg">💫</span>
            <h2 className="text-base font-black text-[#2b2f53] sm:text-lg">Sweet highlights</h2>
          </div>
          <div className="mt-4 grid gap-2.5">
            {snapshot.session.summaryPoints.length ? (
              snapshot.session.summaryPoints.map((point) => (
                <div
                  key={point}
                  className="flex items-start gap-3 rounded-2xl border border-[#ecddf5] bg-[linear-gradient(180deg,#fbf8ff_0%,#fffafd_100%)] px-4 py-3 text-sm leading-6 text-[#3f4668]"
                >
                  <span aria-hidden className="mt-0.5 shrink-0 text-[#8a7fbb]">•</span>
                  <span>{point}</span>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-[#ecddf5] bg-[#fbf8ff] px-4 py-3 text-sm text-[#6c7491]">
                A magical hello and goodbye, all wrapped up. 🌟
              </p>
            )}
          </div>
        </section>

        {/* Transcript */}
        <section className="mt-6 overflow-hidden rounded-3xl border border-[#ecddf5] bg-white/90 shadow-[0_24px_70px_-44px_rgba(67,61,123,0.28)]">
          <details className="group" open>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-5 sm:px-7">
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-lg">📜</span>
                <h2 className="text-base font-black text-[#2b2f53] sm:text-lg">Visit transcript</h2>
                <span className="rounded-full bg-[#f1edfa] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[#6a5fa9]">
                  {transcript.length} {transcript.length === 1 ? "message" : "messages"}
                </span>
              </div>
              <span
                aria-hidden
                className="rounded-full border border-[#ecddf5] bg-white px-3 py-1 text-xs font-black text-[#6a5fa9] transition group-open:rotate-180"
              >
                ▾
              </span>
            </summary>
            <div className="border-t border-[#ecddf5] px-6 py-5 sm:px-7">
              {transcript.length === 0 ? (
                <p className="text-sm text-[#8a91ac]">No transcript captured for this visit.</p>
              ) : (
                <div className="max-h-[360px] space-y-4 overflow-y-auto pr-1">
                  {transcript.map((message) => {
                    const isChild = message.role === "user";
                    return (
                      <div key={message.id} className={`flex ${isChild ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm ${
                          isChild
                            ? "bg-[linear-gradient(135deg,#e9defc_0%,#f6f1ff_100%)] text-[#2b2f53]"
                            : "bg-[linear-gradient(135deg,#fff4e5_0%,#fff9f0_100%)] text-[#3f4668]"
                        }`}>
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a7fbb]">
                            {isChild ? "Child" : message.role}
                          </p>
                          <p className="mt-1">{message.content}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </details>
        </section>

        {/* CTAs */}
        <section className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#433d7b_0%,#6a5fa9_100%)] px-6 py-4 text-center text-sm font-extrabold tracking-wide text-white shadow-[0_22px_50px_-26px_rgba(67,61,123,0.6)] transition hover:brightness-110"
          >
            <span aria-hidden>🎉</span> Start Another Visit
          </Link>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 rounded-2xl border border-[#ecddf5] bg-white px-6 py-4 text-center text-sm font-extrabold text-[#433d7b] shadow-sm transition hover:border-[#d8c9f4] hover:bg-[#fbf8ff]"
          >
            <span aria-hidden>✨</span> Choose a Different Character
          </Link>
        </section>

        {/* Trust note */}
        <p className="mt-5 text-center text-[11px] text-[#8a91ac]">
          🛡️ No ads · No data sold · Transcripts stay private to the grown-up
        </p>
      </div>
    </main>
  );
}
