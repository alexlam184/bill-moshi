import type { Metadata } from "next";
import { RecordsScreen } from "@/components/screens/records-screen";

export const metadata: Metadata = { title: "Records" };
export default function RecordsPage() { return <RecordsScreen />; }
