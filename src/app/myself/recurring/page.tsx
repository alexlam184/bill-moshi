import type { Metadata } from "next";
import { RecurringPaymentsScreen } from "@/components/screens/recurring-payments-screen";

export const metadata: Metadata = { title: "Recurring payments" };
export default function RecurringPaymentsPage() { return <RecurringPaymentsScreen />; }
