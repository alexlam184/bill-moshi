import type { AppSnapshot, User } from "./types";

export function bindSnapshotIdentity(
  snapshot: AppSnapshot,
  identity: Pick<User, "id" | "name" | "email" | "image">,
  sourceUserId?: string,
): AppSnapshot {
  const currentUser = {
    ...snapshot.currentUser,
    ...identity,
    defaultCurrency: snapshot.currentUser.defaultCurrency,
  };
  if (!sourceUserId || sourceUserId === identity.id) {
    return { ...snapshot, currentUser };
  }

  const replace = (value: string) => value === sourceUserId ? identity.id : value;
  return {
    ...snapshot,
    currentUser,
    groups: snapshot.groups.map((group) => ({ ...group, ownerId: replace(group.ownerId) })),
    groupMembers: snapshot.groupMembers.map((member) => member.userId === sourceUserId ? {
      ...member,
      userId: identity.id,
      name: identity.name,
      email: identity.email,
    } : member),
    events: snapshot.events.map((event) => ({ ...event, ownerId: replace(event.ownerId) })),
    members: snapshot.members.map((member) => member.userId === sourceUserId ? {
      ...member,
      userId: identity.id,
      name: identity.name,
      email: identity.email,
    } : member),
    expenses: snapshot.expenses.map((expense) => ({
      ...expense,
      payerId: replace(expense.payerId),
      createdBy: replace(expense.createdBy),
      splits: expense.splits.map((split) => ({ ...split, memberId: replace(split.memberId) })),
    })),
    debtRecords: snapshot.debtRecords.map((record) => ({ ...record, createdBy: replace(record.createdBy) })),
    settlements: snapshot.settlements.map((settlement) => ({
      ...settlement,
      fromMemberId: replace(settlement.fromMemberId),
      toMemberId: replace(settlement.toMemberId),
      createdBy: replace(settlement.createdBy),
    })),
    invitations: snapshot.invitations.map((invitation) => ({ ...invitation, createdBy: replace(invitation.createdBy) })),
    joinRequests: snapshot.joinRequests.map((request) => ({
      ...request,
      requesterUserId: replace(request.requesterUserId),
      reviewedBy: request.reviewedBy ? replace(request.reviewedBy) : undefined,
    })),
    activity: snapshot.activity.map((entry) => ({ ...entry, actorId: replace(entry.actorId) })),
  };
}
