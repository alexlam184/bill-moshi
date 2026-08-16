import type { Metadata } from "next";
import { MyselfOverviewScreen } from "@/components/screens/myself-overview-screen";

export const metadata: Metadata = { title: "Myself overview" };

export default function MyselfPage() {
  return <MyselfOverviewScreen />;
}
