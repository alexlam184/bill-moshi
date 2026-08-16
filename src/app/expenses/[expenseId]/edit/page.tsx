import { AddExpenseScreen } from "@/components/screens/add-expense-screen";

export default async function EditExpensePage({ params }: PageProps<"/expenses/[expenseId]/edit">) {
  const { expenseId } = await params;
  return <AddExpenseScreen editingExpenseId={expenseId} />;
}
