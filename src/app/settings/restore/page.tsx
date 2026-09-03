import type { Metadata } from "next";
import { RestoreScreen } from "@/components/screens/restore-screen";

export const metadata: Metadata = { title: "Restore from Google Drive" };
export default function RestorePage() { return <RestoreScreen />; }
