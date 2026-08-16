import { EventSettingsScreen } from "@/components/screens/event-settings-screen";

export default async function EventSettingsPage({ params }: PageProps<"/events/[eventId]/settings">) {
  const { eventId } = await params;
  return <EventSettingsScreen eventId={eventId} />;
}
