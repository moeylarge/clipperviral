import Link from "next/link";

type LegalSection = {
  title: string;
  body: string[];
};

const sections: LegalSection[] = [
  {
    title: "1. Information We Collect",
    body: [
      "We may collect account information such as name, email address, username, profile information, profile photo, and authentication information needed to keep you signed in.",
      "When you use Clipper Viral, you may provide uploaded videos, uploaded PNG images, video URLs, captions, edits, layouts, overlays, export settings, generated clips, and profile details.",
      "Some information may be stored locally in your browser, including recent exported clips, editor state, profile details, temporary project data, preferences, and UI state.",
      "We may automatically collect technical information such as IP address, browser type, device type, operating system, pages visited, referring URLs, error logs, performance information, and access times.",
    ],
  },
  {
    title: "2. How We Use Information",
    body: [
      "We use information to provide the editor and clipping tools, process uploads and links, maintain sign-in sessions, save preferences, improve the product, debug errors, prevent abuse, communicate service updates, support future billing, and comply with legal obligations.",
    ],
  },
  {
    title: "3. Video, Link, And Upload Processing",
    body: [
      "Clipper Viral may process user-provided videos, links, images, and related media so the editor can generate clips, previews, captions, overlays, and exports.",
      "You are responsible for making sure you have the rights and permissions needed to upload, process, edit, or export any content you use with Clipper Viral.",
    ],
  },
  {
    title: "4. Cookies And Local Storage",
    body: [
      "We may use cookies, local storage, session storage, or similar technologies to keep you signed in, remember editor state, store recent exports locally, save preferences, improve performance, and protect the service.",
    ],
  },
  {
    title: "5. How We Share Information",
    body: [
      "We do not sell your personal information.",
      "We may share information with service providers that help us operate Clipper Viral, such as hosting providers, authentication providers, payment processors, analytics tools, rendering infrastructure, error monitoring, and security tools.",
      "We may disclose information if required to comply with law, respond to lawful requests, protect rights or users, prevent fraud or abuse, or enforce our Terms of Service.",
    ],
  },
  {
    title: "6. Third-Party Services",
    body: [
      "Clipper Viral may interact with third-party platforms or services, including YouTube, Kick, Google, Stripe, Vercel, Supabase, or other infrastructure providers.",
      "Your use of third-party platforms is also governed by their own terms and privacy policies.",
    ],
  },
  {
    title: "7. Data Retention And Security",
    body: [
      "We keep information only as long as reasonably needed to provide the service, maintain your account, operate and improve the product, comply with legal obligations, resolve disputes, enforce agreements, and prevent abuse or security issues.",
      "We use reasonable technical and organizational measures to protect information, but no website, app, or online service can guarantee complete security.",
    ],
  },
  {
    title: "8. Your Choices And Rights",
    body: [
      "Depending on your location and the features available, you may be able to access, update, correct, or delete certain account information, delete local browser-stored data, request account deletion, opt out of certain communications, or control cookies through your browser.",
      "California residents may have rights under California privacy laws, including rights to know, access, correct, delete, or opt out of certain uses of personal information, depending on whether those laws apply to Clipper Viral.",
    ],
  },
  {
    title: "9. Children, International Users, And Updates",
    body: [
      "Clipper Viral is not intended for children under 13, and we do not knowingly collect personal information from children under 13.",
      "Clipper Viral is operated from the United States. If you access the service from outside the United States, your information may be processed in the United States or other countries where our service providers operate.",
      "We may update this Privacy Policy from time to time. Your continued use of Clipper Viral after changes are posted means you accept the updated Privacy Policy.",
    ],
  },
  {
    title: "10. Contact",
    body: ["For privacy questions or requests, contact Clipper Viral at [insert support email]."],
  },
];

export default function PrivacyPage() {
  return <LegalPage label="Privacy Policy" title="Privacy Policy" sections={sections} />;
}

function LegalPage({ label, title, sections }: { label: string; title: string; sections: LegalSection[] }) {
  return (
    <>
      <style>{`
        body { background: #f5f5f7; }
        .app-shell { display: block !important; min-height: 100vh; }
        .app-sidebar, .topbar { display: none !important; }
        .app-main, .app-content { min-height: 100vh; }
        .app-content { max-width: none !important; padding: 0 !important; }
      `}</style>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(227,93,224,0.12),transparent_31%),#f5f5f7] px-4 py-6 text-[#1d1d1f] sm:px-6 lg:px-8">
        <article className="mx-auto max-w-4xl rounded-[34px] bg-white p-6 shadow-[0_34px_110px_rgba(29,29,31,0.10)] ring-1 ring-black/[0.04] sm:p-10">
          <div className="mb-8">
            <Link href="/auth/signin" className="inline-flex min-h-11 items-center justify-center rounded-full bg-[linear-gradient(135deg,#e35de0,#d63bdc_48%,#c423e3)] px-4 text-sm font-bold text-white shadow-[0_14px_34px_rgba(227,93,224,0.24)]">
              Back to sign in
            </Link>
            <div className="mt-8 inline-flex rounded-full bg-[#fff2fd] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#bd24cf] ring-1 ring-[#e35de0]/16">{label}</div>
            <h1 className="mt-4 text-5xl font-semibold tracking-[-0.055em] text-[#1d1d1f]">{title}</h1>
            <p className="mt-3 text-sm font-semibold text-[#6e6e73]">Effective Date: April 14, 2026</p>
          </div>
          <div className="grid gap-7">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-2xl font-semibold tracking-[-0.035em] text-[#1d1d1f]">{section.title}</h2>
                <div className="mt-3 grid gap-3 text-sm leading-7 text-[#424245]">
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
      </main>
    </>
  );
}
