import { ExpenseDetailsScreen } from "@/components/screens/expense-details-screen";

export default async function ExpensePage({ params }: PageProps<"/expenses/[expenseId]">) {
  const { expenseId } = await params;
  return <ExpenseDetailsScreen expenseId={expenseId} />;
}
