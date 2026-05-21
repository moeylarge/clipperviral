import Link from "next/link";

const sections = [
  {
    title: "1. Service",
    body: [
      "ClipperViral is a software-as-a-service clipping tool for scanning, editing, captioning, formatting, stitching, previewing, and exporting video clips.",
      "We may add, change, limit, suspend, or remove features at any time, including URL scanning, AI scoring, downloader integrations, overlays, captions, and export tools.",
    ],
  },
  {
    title: "2. Accounts",
    body: [
      "You are responsible for your account, your sign-in credentials, and all activity under your account.",
      "You must provide accurate information and may not share, resell, abuse, or bypass access controls for the service.",
    ],
  },
  {
    title: "3. User Content And Source Videos",
    body: [
      "You are responsible for all content you upload, paste, scan, edit, caption, export, publish, or otherwise process with ClipperViral.",
      "ClipperViral does not host, own, or grant rights to the original source video content from Kick, YouTube, or any other platform.",
      "You keep ownership of your content, but you grant us a limited license to process it only as needed to provide the service.",
    ],
  },
  {
    title: "4. Platform Rules And Copyright",
    body: [
      "You are responsible for complying with Kick, YouTube, TikTok, Instagram, X, and any other third-party platform terms, rules, and technical restrictions.",
      "You are responsible for complying with copyright, trademark, privacy, publicity, and other applicable laws before scanning, editing, exporting, or publishing content.",
      "Do not use ClipperViral to infringe rights, process content you are not allowed to use, bypass platform restrictions, or create unlawful or harmful material.",
    ],
  },
  {
    title: "5. Subscriptions, Trials, And Cancellation",
    body: [
      "Paid plans, free trials, prices, and feature access are shown at checkout or in the product. We may update plans and pricing for future billing periods.",
      "You may cancel anytime through the billing portal. When you cancel, access continues until the end of the current paid billing period unless otherwise stated.",
      "If a payment fails, access to paid features may be limited, paused, or ended.",
    ],
  },
  {
    title: "6. Refunds",
    body: [
      "Refunds are reviewed case by case. We do not provide automatic refunds unless required by law.",
      "To request a refund review, contact support@clipperviral.com with the email attached to your account and the reason for the request.",
    ],
  },
  {
    title: "7. Acceptable Use",
    body: [
      "You may not overload, disrupt, scrape, reverse engineer, abuse, or interfere with ClipperViral; attempt unauthorized access; bypass authentication, subscriptions, or rate limits; or use the service for illegal activity.",
      "We may suspend or terminate access if use creates legal, technical, security, platform, or business risk.",
    ],
  },
  {
    title: "8. No Warranty",
    body: [
      "ClipperViral is provided as-is and as-available, with no warranty of any kind.",
      "We do not guarantee that any URL can be scanned, any export will be error-free, AI scoring will be accurate, captions will be perfect, or any clip will receive views, followers, revenue, or engagement.",
    ],
  },
  {
    title: "9. Limitation Of Liability",
    body: [
      "To the fullest extent allowed by law, ClipperViral will not be liable for indirect, incidental, special, consequential, punitive, or lost-profit damages.",
      "Our total liability for claims related to the service will not exceed the amount you paid to ClipperViral in the 3 months before the claim, or $100 if you have not paid us.",
    ],
  },
  {
    title: "10. Governing Law",
    body: [
      "These Terms are governed by the laws of the State of Florida, without regard to conflict of law principles.",
      "Allan may update this placeholder governing-law section before launch if a different state is preferred.",
    ],
  },
  {
    title: "11. Contact",
    body: ["Questions about these Terms can be sent to support@clipperviral.com."],
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#fbf7ff] px-4 py-10 text-[#171021] sm:px-6 lg:px-8">
      <article className="mx-auto max-w-4xl rounded-3xl bg-white p-6 shadow-[0_24px_80px_rgba(23,16,33,0.08)] ring-1 ring-black/[0.04] sm:p-10">
        <Link href="/" className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#171021] px-4 text-sm font-bold text-white">
          ClipperViral
        </Link>
        <div className="mt-8">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b81bc9]">Terms</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Terms of Service</h1>
          <p className="mt-3 text-sm font-semibold text-[#6b6272]">Effective Date: May 21, 2026</p>
        </div>
        <div className="mt-10 grid gap-8">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="text-2xl font-black tracking-tight">{section.title}</h2>
              <div className="mt-3 grid gap-3 text-sm font-semibold leading-7 text-[#5d5364]">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
        <footer className="mt-10 border-t border-black/10 pt-6 text-sm font-bold text-[#6b6272]">
          <Link href="/privacy" className="text-[#b81bc9] underline-offset-4 hover:underline">
            Privacy Policy
          </Link>
        </footer>
      </article>
    </main>
  );
}
