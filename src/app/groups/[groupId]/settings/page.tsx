import type { Metadata } from "next";
import { GroupSettingsScreen } from "@/components/screens/group-settings-screen";

export const metadata: Metadata = { title: "Group currency" };

export default async function GroupSettingsPage({ params }: PageProps<"/groups/[groupId]/settings">) {
  const { groupId } = await params;
  return <GroupSettingsScreen groupId={groupId} />;
}
