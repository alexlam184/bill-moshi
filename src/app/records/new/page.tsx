import type { Metadata } from "next";
import { AddRecordScreen } from "@/components/screens/add-record-screen";

export const metadata: Metadata = { title: "Add record" };
export default async function NewRecordPage({ searchParams }: PageProps<"/records/new">) {
  const params = await searchParams;
  return <AddRecordScreen initialGroupId={typeof params.groupId === "string" ? params.groupId : undefined} initialEventId={typeof params.eventId === "string" ? params.eventId : undefined} initialPersonal={params.personal === "1"} />;
}
