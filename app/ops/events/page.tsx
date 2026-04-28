import { OpsShell } from "@/app/ops/_components/ops-shell";
import { OpsSection } from "@/app/ops/_components/ops-primitives";
import { formatDateTime, getOpsDatasetFromSource } from "@/lib/ops/metrics";

export default async function OpsEventsPage() {
  const data = await getOpsDatasetFromSource();

  return (
    <OpsShell
      currentPath="/ops/events"
      title="Events"
      description="Raw sports events and their linked ticket state."
    >
      <OpsSection title="Market Events" description="Displayed directly from seeded event records and ticket links.">
        <div className="space-y-4">
          {data.marketEvents.map((event) => {
            const tickets = data.tickets.filter((ticket) => ticket.marketEventId === event.id);

            return (
              <div key={event.id} className="rounded-lg border border-border/70 bg-white/80 p-4">
                <div className="flex flex-col gap-1">
                  <p className="text-sm uppercase tracking-[0.16em] text-muted-foreground">{event.sport}</p>
                  <h2 className="text-xl font-semibold text-foreground">{event.eventName}</h2>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(event.startsAt)} · {event.status}
                  </p>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {tickets.map((ticket) => (
                    <div key={ticket.id} className="rounded-lg border border-border/70 bg-white p-3">
                      <p className="font-semibold text-foreground">{ticket.ticketRef}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {ticket.side} · {ticket.market}
                      </p>
                      <p className="mt-2 text-sm text-foreground">
                        Cash {ticket.stakeCash} / Credit {ticket.stakeCredit} · {ticket.status}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </OpsSection>
    </OpsShell>
  );
}
