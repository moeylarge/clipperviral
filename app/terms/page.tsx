import Link from "next/link";

type LegalSection = {
  title: string;
  body: string[];
};

const sections: LegalSection[] = [
  {
    title: "1. The Service",
    body: [
      "Clipper Viral provides tools for creating, editing, captioning, formatting, previewing, and exporting video clips. Features may include video upload, URL-based clipping, layout editing, PNG image upload for split-screen compositions, captions, overlays, exports, local clip storage, profile and sign-in features, and future paid plans or subscriptions.",
      "We may add, change, limit, or remove features at any time.",
    ],
  },
  {
    title: "2. Eligibility",
    body: [
      "You must be at least 13 years old to use Clipper Viral.",
      "If you use Clipper Viral on behalf of a business, organization, or other entity, you represent that you have authority to accept these Terms on its behalf.",
    ],
  },
  {
    title: "3. Accounts And Access",
    body: [
      "Some features may require sign-in or protected access. You are responsible for providing accurate account information, keeping your login credentials secure, all activity under your account, and not sharing access in a way that violates these Terms.",
      "We may suspend or terminate access if we believe your account is being misused, compromised, or used in violation of these Terms.",
    ],
  },
  {
    title: "4. Your Content",
    body: [
      "Your content means any videos, images, URLs, captions, text, overlays, profile information, or other materials you upload, submit, create, edit, or process through Clipper Viral.",
      "You keep ownership of your content. However, you grant Clipper Viral a limited license to host, process, modify, preview, render, export, transmit, and display your content only as needed to provide and improve the service.",
      "You are responsible for your content and for making sure you have all rights needed to use it.",
    ],
  },
  {
    title: "5. Content Rights And Restrictions",
    body: [
      "You agree that you will not upload, process, edit, export, or share content unless you have the legal right to do so.",
      "You may not use Clipper Viral to infringe rights, upload content you do not have permission to use, create unlawful or harmful content, create malware or scams, impersonate others, violate third-party platform rules, bypass technical restrictions, or use the service for illegal activity.",
      "We may remove, block, or refuse to process content if we believe it violates these Terms or creates risk for Clipper Viral, users, or third parties.",
    ],
  },
  {
    title: "6. Third-Party Platforms And URLs",
    body: [
      "Clipper Viral may allow you to paste or process URLs from third-party platforms such as YouTube or Kick.",
      "You are responsible for complying with the terms, policies, and rights requirements of those platforms. Clipper Viral does not grant you rights to third-party content.",
      "Third-party platforms may restrict access, block downloads, change their systems, or make certain links unavailable. We are not responsible for third-party platform limitations, failures, or changes.",
    ],
  },
  {
    title: "7. Local Browser Storage And Exports",
    body: [
      "Some features may store clips, project data, profile information, or settings locally in your browser. Local storage may be deleted if you clear browser data, may not sync across devices, and may not be recoverable.",
      "You are responsible for reviewing exported content before publishing or sharing it. We do not guarantee that exports will be accepted by any third-party platform or produce any particular result, view count, revenue, or engagement.",
    ],
  },
  {
    title: "8. Payments And Plans",
    body: [
      "Clipper Viral may offer paid plans, subscriptions, usage limits, or premium features in the future. Pricing and plan terms will be shown before purchase if paid features are added.",
      "Until paid plans are officially launched, any references to plans are informational and not a guarantee of availability.",
    ],
  },
  {
    title: "9. Acceptable Use",
    body: [
      "You agree not to abuse, overload, disrupt, or interfere with the service; attempt unauthorized access; reverse engineer protected parts of the service; use harmful automation; bypass security, authentication, rate limits, or access restrictions; violate laws or third-party rights; or resell the service without permission.",
    ],
  },
  {
    title: "10. Beta And Developing Features",
    body: [
      "Some Clipper Viral features may be experimental, incomplete, or under active development. Features may change or stop working, processing may fail, third-party link support may be unreliable, and we may simplify, modify, or remove features as the product develops.",
    ],
  },
  {
    title: "11. Service Availability And Intellectual Property",
    body: [
      "We aim to keep Clipper Viral available, but we do not guarantee uninterrupted or error-free service.",
      "Clipper Viral, including its design, branding, software, interface, and technology, is owned by us or our licensors. You may not copy, modify, distribute, sell, or create derivative works from Clipper Viral except as allowed by these Terms or with written permission.",
    ],
  },
  {
    title: "12. Disclaimers And Liability",
    body: [
      "Clipper Viral is provided as is and as available. To the fullest extent allowed by law, we disclaim all warranties, including warranties of merchantability, fitness for a particular purpose, non-infringement, availability, accuracy, and reliability.",
      "We do not guarantee that the service will always work, any URL can be processed, exports will be error-free, captions will be accurate, content will go viral, or you will gain views, followers, revenue, or engagement.",
      "To the fullest extent allowed by law, Clipper Viral will not be liable for indirect, incidental, special, consequential, punitive, or lost-profit damages. Our total liability for any claim related to the service will not exceed the amount you paid to Clipper Viral in the 3 months before the claim, or $100 if you have not paid us.",
    ],
  },
  {
    title: "13. Indemnification And Termination",
    body: [
      "You agree to defend, indemnify, and hold harmless Clipper Viral from claims, damages, liabilities, losses, and expenses arising from your use of the service, your content, your violation of these Terms, your violation of law, or your violation of third-party rights.",
      "We may suspend or terminate your access to Clipper Viral at any time if we believe you violated these Terms, your use creates risk, your account is compromised, or we need to protect the service or other users.",
    ],
  },
  {
    title: "14. Governing Law, Changes, And Contact",
    body: [
      "These Terms are governed by the laws of the State of [insert state], without regard to conflict of law principles. Any disputes will be handled in the courts located in [insert county/state], unless applicable law requires otherwise.",
      "We may update these Terms from time to time. Your continued use of Clipper Viral after changes are posted means you accept the updated Terms.",
      "For questions about these Terms, contact Clipper Viral at [insert support email].",
    ],
  },
];

export default function TermsPage() {
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
            <div className="mt-8 inline-flex rounded-full bg-[#fff2fd] px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-[#bd24cf] ring-1 ring-[#e35de0]/16">Terms</div>
            <h1 className="mt-4 text-5xl font-semibold tracking-[-0.055em] text-[#1d1d1f]">Terms of Service</h1>
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
