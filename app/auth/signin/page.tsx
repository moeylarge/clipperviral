import Link from "next/link";
import { Suspense } from "react";

import { SignInForm } from "./signin-form";
import { Button } from "@/components/ui/button";

export default function SignInPage() {
  return (
    <section className="mx-auto max-w-2xl space-y-4 rounded-xl border border-border bg-white p-6 shadow-sm md:p-8">
      <p className="section-kicker">Session</p>
      <h1 className="text-3xl leading-tight text-foreground md:text-4xl">Sign in to ClipperViral</h1>
      <p className="text-sm text-muted-foreground md:text-base">Use your ClipperViral access to open the editor and production tools.</p>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading sign-in...</p>}>
        <SignInForm />
      </Suspense>
      <Button asChild size="sm" variant="outline" className="w-full">
        <Link href="/">Back to ClipperViral</Link>
      </Button>
    </section>
  );
}
