import type { Metadata } from "next";
import { ProfileScreen } from "@/components/screens/profile-screen";

export const metadata: Metadata = { title: "Settings" };
export default function SettingsPage() { return <ProfileScreen />; }
