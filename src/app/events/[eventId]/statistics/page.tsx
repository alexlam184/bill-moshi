import { StatisticsScreen } from "@/components/screens/statistics-screen";

export default async function StatisticsPage({ params }: PageProps<"/events/[eventId]/statistics">) {
  const { eventId } = await params;
  return <StatisticsScreen eventId={eventId} />;
}
