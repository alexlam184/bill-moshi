import { BalancesScreen } from "@/components/screens/balances-screen";

export default async function BalancesPage({ params }: PageProps<"/events/[eventId]/balances">) {
  const { eventId } = await params;
  return <BalancesScreen eventId={eventId} />;
}
