import type { Metadata } from "next";
import { DebtRecordsScreen } from "@/components/screens/debt-records-screen";

export const metadata: Metadata = { title: "Edit debt record" };

export default async function EditDebtRecordPage({ params }: PageProps<"/debts/[debtRecordId]/edit">) {
  const { debtRecordId } = await params;
  return <DebtRecordsScreen composerMode editingDebtRecordId={debtRecordId} />;
}
