import Link from "next/link";

const sections = [
  {
    title: "1. Data We Collect",
    body: [
      "We collect the email address and basic account identity provided through Google OAuth so you can sign in.",
      "We store Stripe customer IDs, subscription IDs, subscription status, plan type, trial dates, billing-period dates, and related billing state.",
      "When you use the editor, we may process uploaded videos, pasted video URLs, generated clips, captions, overlays, editor settings, and export metadata needed to provide the service.",
    ],
  },
  {
    title: "2. How We Use Data",
    body: [
      "We use data to authenticate users, provide trials and paid access, process video and clip-generation requests, score moments with AI, operate billing, prevent abuse, debug errors, provide support, and improve ClipperViral.",
    ],
  },
  {
    title: "3. Third-Party Services",
    body: [
      "Supabase provides authentication, database, and storage infrastructure.",
      "Stripe processes billing, subscription management, invoices, and payment events.",
      "Anthropic may process transcripts or clip context for AI scoring.",
      "Fly.io hosts the downloader proxy used for supported link-based clipping workflows.",
      "Vercel hosts the web application and serverless routes.",
      "Resend may send transactional email if enabled for account or billing messages.",
    ],
  },
  {
    title: "4. No Sale Of User Data",
    body: [
      "We do not sell user data.",
      "We do not share personal information with third parties for their independent advertising or resale purposes.",
    ],
  },
  {
    title: "5. Cookies",
    body: [
      "We use session cookies and similar storage for authentication and basic product operation.",
      "We do not use tracking pixels for advertising in the current product.",
    ],
  },
  {
    title: "6. Video And AI Processing",
    body: [
      "ClipperViral may temporarily process uploaded files, pasted links, transcripts, and generated outputs to provide clipping, scoring, captioning, stitching, preview, and export features.",
      "You are responsible for ensuring that any content you process complies with applicable laws and third-party platform rules.",
    ],
  },
  {
    title: "7. Retention And Security",
    body: [
      "We keep account, billing, and operational data as long as needed to provide the service, comply with legal obligations, prevent abuse, resolve disputes, and maintain records.",
      "We use reasonable safeguards, but no online service can guarantee perfect security.",
    ],
  },
  {
    title: "8. Your Rights",
    body: [
      "Depending on where you live, including under GDPR or CCPA-style privacy laws, you may have rights to access, correct, delete, or receive a copy of certain personal data.",
      "To request deletion or privacy help, email support@clipperviral.com from the email address attached to your account.",
    ],
  },
  {
    title: "9. Children",
    body: [
      "ClipperViral is not intended for children under 13, and we do not knowingly collect personal information from children under 13.",
    ],
  },
  {
    title: "10. Contact",
    body: ["Privacy requests and questions can be sent to support@clipperviral.com."],
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#fbf7ff] px-4 py-10 text-[#171021] sm:px-6 lg:px-8">
      <article className="mx-auto max-w-4xl rounded-3xl bg-white p-6 shadow-[0_24px_80px_rgba(23,16,33,0.08)] ring-1 ring-black/[0.04] sm:p-10">
        <Link href="/" className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#171021] px-4 text-sm font-bold text-white">
          ClipperViral
        </Link>
        <div className="mt-8">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#b81bc9]">Privacy</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">Privacy Policy</h1>
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
          <Link href="/terms" className="text-[#b81bc9] underline-offset-4 hover:underline">
            Terms of Service
          </Link>
        </footer>
      </article>
    </main>
  );
}
