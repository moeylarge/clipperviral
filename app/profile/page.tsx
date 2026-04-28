import Link from "next/link";

import { getManualSessionEmail } from "@/lib/auth/manual-session";
import { getCurrentProfile } from "@/lib/data/spotlight";

import { ProfileSettingsClient, type ProfileSettingsInitialData } from "./profile-settings-client";

async function getProfileData(): Promise<ProfileSettingsInitialData> {
  const manualEmail = await getManualSessionEmail();
  let profileData: Awaited<ReturnType<typeof getCurrentProfile>> | null = null;

  try {
    profileData = await getCurrentProfile();
  } catch {
    profileData = null;
  }

  const user = profileData?.user ?? null;
  const profile = profileData?.profile ?? null;
  const handle = user?.handle || "";
  const handleLooksLikeEmail = handle.includes("@");

  return {
    fullName: user?.display_name || "",
    email: manualEmail || (handleLooksLikeEmail ? handle : ""),
    username: handleLooksLikeEmail ? "" : handle,
    bio: profile?.bio || "",
    avatarUrl: profile?.avatar_url || "",
    storageMode: "browser",
  };
}

export default async function ProfilePage() {
  const profile = await getProfileData();

  return (
    <>
      <style>{`
        body {
          background: #fafafa;
        }

        .app-shell {
          display: block !important;
          min-height: 100vh;
        }

        .app-sidebar,
        .topbar {
          display: none !important;
        }

        .app-main,
        .app-content {
          min-height: 100vh;
        }

        .app-content {
          max-width: none !important;
          padding: 0 !important;
        }
      `}</style>
      <main className="min-h-screen bg-[#fafafa] text-[#1d1d1f]">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <h1 className="text-3xl font-semibold tracking-tight text-[#1d1d1f]">Settings</h1>
              <p className="text-sm text-[#6e6e73]">Manage your profile and account preferences.</p>
            </div>
            <Link
              href="/"
              prefetch={false}
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-black/[0.08] bg-white px-4 text-sm font-medium text-[#1d1d1f] transition hover:bg-[#f5f5f7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c423e3]/40"
            >
              Back to editor
            </Link>
          </div>
          <ProfileSettingsClient initialData={profile} />
        </div>
      </main>
    </>
  );
}
