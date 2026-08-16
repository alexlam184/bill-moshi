import { EventDashboardScreen } from "@/components/screens/event-dashboard-screen";

export default async function EventPage({ params }: PageProps<"/events/[eventId]">) {
  const { eventId } = await params;
  return <EventDashboardScreen eventId={eventId} />;
}
