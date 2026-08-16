import type { Metadata } from "next";
import { CreateEventScreen } from "@/components/screens/create-event-screen";

export const metadata: Metadata = { title: "Create event" };
export default async function NewEventPage({ searchParams }: PageProps<"/events/new">) {
  const params = await searchParams;
  return <CreateEventScreen initialGroupId={typeof params.groupId === "string" ? params.groupId : undefined} />;
}
