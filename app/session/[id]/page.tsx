import { notFound } from "next/navigation";

import { getPersonaBySlug } from "@/lib/personas";
import { getSession } from "@/lib/session/store";
import { SessionPageClient } from "@/app/_components/session-page-client";

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ resume?: string }>;
}) {
  const { id } = await params;
  const resolvedSearch = await searchParams;
  const session = await getSession(id);
  if (!session) notFound();

  const persona = getPersonaBySlug(session.personaSlug);
  if (!persona) notFound();

  return <SessionPageClient sessionId={session.id} persona={persona} autoResume={resolvedSearch.resume === "1"} />;
}
