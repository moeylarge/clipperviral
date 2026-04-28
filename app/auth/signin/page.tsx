import { Suspense } from "react";

import { SignInForm } from "./signin-form";

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-[#fafafa] px-4 py-10 text-[#1d1d1f] sm:px-6">
      <div className="mx-auto grid w-full max-w-md gap-6">
        <div className="grid gap-2 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#1d1d1f] text-xl font-black text-white">
            CV
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm leading-6 text-[#6e6e73]">
            Use your allowed account to scan YouTube and Kick links.
          </p>
        </div>
        <section className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_18px_50px_rgba(0,0,0,0.05)]">
          <Suspense fallback={<p className="text-sm text-[#6e6e73]">Loading sign-in...</p>}>
            <SignInForm />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
