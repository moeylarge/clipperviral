import { notFound } from "next/navigation";

import { PrivateVisitClient } from "@/app/_components/private-visit-client";
import { getCharacterConfig, routeKeyMatches } from "@/lib/config";

export default async function PrivateVisitPage({ params }: { params: Promise<{ accessKey: string }> }) {
  const { accessKey } = await params;
  if (!routeKeyMatches(accessKey)) notFound();

  const character = getCharacterConfig(accessKey);
  return <PrivateVisitClient accessKey={accessKey} characterName={character.name} tagline={character.tagline} />;
}
