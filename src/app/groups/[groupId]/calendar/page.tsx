import { CalendarScreen } from "@/components/screens/calendar-screen";

export default async function GroupCalendarPage({ params }: PageProps<"/groups/[groupId]/calendar">) {
  const { groupId } = await params;
  return <CalendarScreen groupId={groupId} />;
}
