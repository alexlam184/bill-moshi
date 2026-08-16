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
  invitation?: { groupId?: string };
  request?: { groupId?: string };
};

export function operationWorkspaceScope(operation: PendingOperation): WorkspaceScope {
  if (["user_settings", "debt_record", "category"].includes(operation.entityType)) {
    return { kind: "personal" };
  }

  const payload = operation.payload as OperationPayload;
  if (operation.entityType === "expense" && !payload.expense?.groupId && !payload.groupId) {
    return { kind: "personal" };
  }

  const groupId = payload.groupId
    ?? payload.group?.id
    ?? payload.groupMember?.groupId
    ?? payload.event?.groupId
    ?? payload.expense?.groupId
    ?? payload.invitation?.groupId
    ?? payload.request?.groupId;

  if (!groupId) throw new Error(`Google sync cannot determine the Group for ${operation.entityType} ${operation.entityId}.`);
  return { kind: "group", groupId };
}
