import { JoinGroupScreen } from "@/components/screens/join-event-screen";

export default async function JoinPage({ params }: PageProps<"/join/[token]">) {
  const { token } = await params;
  return <JoinGroupScreen token={token} />;
}
