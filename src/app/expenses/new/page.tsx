import type { Metadata } from "next";
import { AddExpenseScreen } from "@/components/screens/add-expense-screen";

export const metadata: Metadata = { title: "Add record" };
export default async function NewExpensePage({ searchParams }: PageProps<"/expenses/new">) {
  const params = await searchParams;
  return <AddExpenseScreen initialGroupId={typeof params.groupId === "string" ? params.groupId : undefined} initialEventId={typeof params.eventId === "string" ? params.eventId : undefined} initialPersonal={params.personal === "1"} />;
}
