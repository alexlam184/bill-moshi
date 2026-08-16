import type { Metadata } from "next";
import { DebtRecordsScreen } from "@/components/screens/debt-records-screen";

export const metadata: Metadata = { title: "Debt payment status" };

export default function DebtPaymentStatusPage() {
  return <DebtRecordsScreen view="records" />;
}
