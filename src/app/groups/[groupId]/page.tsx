import { GroupDashboardScreen } from "@/components/screens/group-dashboard-screen";

export default async function GroupPage({ params }: PageProps<"/groups/[groupId]">) {
  const { groupId } = await params;
  return <GroupDashboardScreen groupId={groupId} />;
}
