import { SettleScreen } from "@/components/screens/settle-screen";

export default async function SettlePage({ searchParams }: PageProps<"/settle">) {
  const params = await searchParams;
  return <SettleScreen initialEventId={typeof params.eventId === "string" ? params.eventId : undefined} />;
}
