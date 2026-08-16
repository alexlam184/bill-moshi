import { MembersScreen } from "@/components/screens/members-screen";

export default async function MembersPage({ params }: PageProps<"/events/[eventId]/members">) {
  const { eventId } = await params;
  return <MembersScreen eventId={eventId} />;
}
