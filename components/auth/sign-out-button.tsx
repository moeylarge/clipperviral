"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await fetch("/api/auth/manual-signout", {
        method: "POST",
      });
      router.replace("/auth/signin");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <Button type="button" size="sm" variant="ghost" onClick={handleSignOut} disabled={isSigningOut}>
      {isSigningOut ? "Signing out..." : "Sign out"}
    </Button>
  );
}
