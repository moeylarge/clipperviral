import { HomePageClient } from "./_components/homepage-client";
import { PERSONAS } from "@/lib/personas";

export default function HomePage() {
  return <HomePageClient personas={PERSONAS} demoVideoSrc={process.env.NEXT_PUBLIC_HOMEPAGE_DEMO_VIDEO_SRC ?? ""} />;
}
