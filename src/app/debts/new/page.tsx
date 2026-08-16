import type { Metadata } from "next";
import { DebtRecordsScreen } from "@/components/screens/debt-records-screen";

export const metadata: Metadata = { title: "New debt record" };

export default function NewDebtRecordPage() {
  return <DebtRecordsScreen composerMode />;
}
