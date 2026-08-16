import type { Metadata } from "next";
import { DebtRecordsScreen } from "@/components/screens/debt-records-screen";

export const metadata: Metadata = { title: "Debt records" };
export default function DebtRecordsPage() { return <DebtRecordsScreen />; }
