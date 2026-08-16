import type { Metadata } from "next";
import { RecordsScreen } from "@/components/screens/records-screen";

export const metadata: Metadata = { title: "My records" };

export default function MyRecordsPage() {
  return <RecordsScreen mineOnly />;
}
