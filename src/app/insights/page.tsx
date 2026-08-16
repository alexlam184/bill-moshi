import type { Metadata } from "next";
import { InsightsScreen } from "@/components/screens/insights-screen";

export const metadata: Metadata = { title: "Insight" };
export default function InsightsPage() { return <InsightsScreen />; }
