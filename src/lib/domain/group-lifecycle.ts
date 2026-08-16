import type { AppSnapshot, EventMember, GroupMember } from "./types";

export interface LeaveGroupResult {
  snapshot: AppSnapshot;
  groupMember: GroupMember;
  eventMembers: EventMember[];
}

export function removeGroupData(snapshot: AppSnapshot, groupId: string): AppSnapshot {
  const eventIds = new Set(snapshot.events.filter((event) => event.groupId === groupId).map((event) => event.id));

  return {
    ...snapshot,
    groups: snapshot.groups.filter((group) => group.id !== groupId),
    groupMembers: snapshot.groupMembers.filter((member) => member.groupId !== groupId),
    events: snapshot.events.filter((event) => event.groupId !== groupId),
    members: snapshot.members.filter((member) => !eventIds.has(member.eventId)),
    expenses: snapshot.expenses.filter((expense) => expense.groupId !== groupId),
    settlements: snapshot.settlements.flatMap((settlement) => {
      const remainingEvents = settlement.events.filter((allocation) => !eventIds.has(allocation.eventId));
      if (remainingEvents.length === settlement.events.length) return [settlement];
      if (remainingEvents.length === 0) return [];
      return [{
        ...settlement,
        amount: remainingEvents.reduce((sum, allocation) => sum + allocation.allocatedAmount, 0),
        events: remainingEvents,
      }];
    }),
    invitations: snapshot.invitations.filter((invitation) => invitation.groupId !== groupId),
    joinRequests: snapshot.joinRequests.filter((request) => request.groupId !== groupId),
    activity: snapshot.activity.filter((entry) => entry.groupId !== groupId && (!entry.eventId || !eventIds.has(entry.eventId))),
  };
}

export function leaveGroupData(snapshot: AppSnapshot, groupId: string, userId: string): LeaveGroupResult {
  const group = snapshot.groups.find((item) => item.id === groupId);
  if (!group) throw new Error("Group not found.");
  if (group.ownerId === userId) throw new Error("The group owner cannot leave. Delete the group or transfer ownership first.");

  const membership = snapshot.groupMembers.find((member) => member.groupId === groupId && member.userId === userId && member.status === "active");
  if (!membership) throw new Error("You are not an active member of this group.");

  const groupMember: GroupMember = { ...membership, status: "left" };
  const eventIds = new Set(snapshot.events.filter((event) => event.groupId === groupId).map((event) => event.id));
  const eventMembers = snapshot.members
    .filter((member) => eventIds.has(member.eventId) && member.userId === userId)
    .map((member): EventMember => ({ ...member, status: "left" }));

  return {
    snapshot: removeGroupData(snapshot, groupId),
    groupMember,
    eventMembers,
  };
}

export function deleteGroupData(snapshot: AppSnapshot, groupId: string, userId: string) {
  const group = snapshot.groups.find((item) => item.id === groupId);
  if (!group) throw new Error("Group not found.");
  if (group.ownerId !== userId) throw new Error("Only the group owner can delete this group.");
  return removeGroupData(snapshot, groupId);
}
