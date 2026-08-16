import { GroupMembersScreen } from "@/components/screens/group-members-screen";

export default async function GroupMembersPage({ params }: PageProps<"/groups/[groupId]/members">) {
  const { groupId } = await params;
  return <GroupMembersScreen groupId={groupId} />;
}
