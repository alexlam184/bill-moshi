import type { PendingOperation } from "@/lib/domain/types";

export type WorkspaceScope =
  | { kind: "personal" }
  | { kind: "group"; groupId: string };

type OperationPayload = {
  groupId?: string;
  group?: { id?: string };
  groupMember?: { groupId?: string };
  event?: { groupId?: string };
  expense?: { groupId?: string };
  settlement?: { events?: Array<{ eventId?: string }> };
  invitation?: { groupId?: string };
  request?: { groupId?: string };
};

export type EventGroupLookup = ReadonlyMap<string, string>;

export function deletedGroupIdsInBatch(operations: PendingOperation[]) {
  return new Set(operations.flatMap((operation) => {
    if (operation.entityType !== "group" || operation.action !== "delete") return [];
    const payload = operation.payload as OperationPayload;
    return [payload.groupId ?? operation.entityId];
  }));
}

export function partitionOperationsForDeletedGroups(
  operations: PendingOperation[],
  eventGroupIds?: EventGroupLookup,
) {
  const deletedGroupIds = deletedGroupIdsInBatch(operations);
  const active: PendingOperation[] = [];
  const discardedOperationIds: string[] = [];
  for (const operation of operations) {
    const isGroupDelete = operation.entityType === "group" && operation.action === "delete";
    const scope = operationWorkspaceScope(operation, eventGroupIds);
    if (!isGroupDelete && scope.kind === "group" && deletedGroupIds.has(scope.groupId)) {
      discardedOperationIds.push(operation.id);
    } else {
      active.push(operation);
    }
  }
  return { active, discardedOperationIds };
}

export function operationWorkspaceScope(
  operation: PendingOperation,
  eventGroupIds?: EventGroupLookup,
): WorkspaceScope {
  if (["user_settings", "debt_record", "category"].includes(operation.entityType)) {
    return { kind: "personal" };
  }

  const payload = operation.payload as OperationPayload;
  if (operation.entityType === "expense" && !payload.expense?.groupId && !payload.groupId) {
    return { kind: "personal" };
  }

  const settlementGroupIds = new Set(
    (payload.settlement?.events ?? [])
      .map((event) => event.eventId ? eventGroupIds?.get(event.eventId) : undefined)
      .filter((groupId): groupId is string => Boolean(groupId)),
  );
  if (settlementGroupIds.size > 1) {
    throw new Error(`Google sync cannot route settlement ${operation.entityId} because it references events from multiple Groups.`);
  }

  const groupId = payload.groupId
    ?? payload.group?.id
    ?? payload.groupMember?.groupId
    ?? payload.event?.groupId
    ?? payload.expense?.groupId
    ?? payload.invitation?.groupId
    ?? payload.request?.groupId
    ?? settlementGroupIds.values().next().value;

  if (!groupId) throw new Error(`Google sync cannot determine the Group for ${operation.entityType} ${operation.entityId}.`);
  return { kind: "group", groupId };
}
