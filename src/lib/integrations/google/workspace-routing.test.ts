import { describe, expect, it } from "vitest";
import type { PendingOperation } from "@/lib/domain/types";
import { deletedGroupIdsInBatch, operationWorkspaceScope, partitionOperationsForDeletedGroups } from "./workspace-routing";

function operation(input: Partial<PendingOperation> & Pick<PendingOperation, "entityType" | "payload">): PendingOperation {
  return {
    id: "operation-1",
    entityId: "entity-1",
    action: "upsert",
    createdAt: "2026-08-12T12:00:00.000Z",
    attempts: 0,
    status: "pending",
    idempotencyKey: "operation-1",
    ...input,
  };
}

describe("operationWorkspaceScope", () => {
  it("routes settings, debt records, and categories to Personal", () => {
    expect(operationWorkspaceScope(operation({ entityType: "user_settings", payload: {} }))).toEqual({ kind: "personal" });
    expect(operationWorkspaceScope(operation({ entityType: "debt_record", payload: {} }))).toEqual({ kind: "personal" });
    expect(operationWorkspaceScope(operation({ entityType: "category", payload: {} }))).toEqual({ kind: "personal" });
  });

  it("routes personal records to Personal", () => {
    expect(operationWorkspaceScope(operation({ entityType: "expense", payload: { expense: { id: "personal" } } }))).toEqual({ kind: "personal" });
  });

  it("routes Group records and deletes to the matching Group", () => {
    expect(operationWorkspaceScope(operation({ entityType: "expense", payload: { expense: { groupId: "group-family" } } }))).toEqual({ kind: "group", groupId: "group-family" });
    expect(operationWorkspaceScope(operation({ entityType: "event", action: "delete", payload: { groupId: "group-family" } }))).toEqual({ kind: "group", groupId: "group-family" });
    expect(operationWorkspaceScope(operation({ entityType: "settlement", payload: { groupId: "group-roommates" } }))).toEqual({ kind: "group", groupId: "group-roommates" });
  });

  it("routes legacy settlements through their referenced event", () => {
    const eventGroupIds = new Map([["event-toronto", "group-family"]]);
    const legacySettlement = operation({
      entityType: "settlement",
      entityId: "settlement-legacy",
      payload: {
        settlement: {
          events: [{ eventId: "event-toronto", allocatedAmount: 50 }],
        },
      },
    });

    expect(operationWorkspaceScope(legacySettlement, eventGroupIds)).toEqual({
      kind: "group",
      groupId: "group-family",
    });
  });

  it("rejects a settlement that references events from different Groups", () => {
    const eventGroupIds = new Map([
      ["event-family", "group-family"],
      ["event-roommates", "group-roommates"],
    ]);
    const invalidSettlement = operation({
      entityType: "settlement",
      entityId: "settlement-invalid",
      payload: {
        settlement: {
          events: [{ eventId: "event-family" }, { eventId: "event-roommates" }],
        },
      },
    });

    expect(() => operationWorkspaceScope(invalidSettlement, eventGroupIds)).toThrow(/multiple Groups/);
  });

  it("fails closed when a Group-scoped operation has no Group identity", () => {
    expect(() => operationWorkspaceScope(operation({ entityType: "settlement", payload: {} }))).toThrow(/cannot determine the Group/);
  });

  it("identifies groups whose final queued state is deleted", () => {
    const operations = [
      operation({ entityType: "invitation", payload: { invitation: { groupId: "group-roommates" } } }),
      operation({ entityType: "group", entityId: "group-roommates", action: "delete", payload: { groupId: "group-roommates" } }),
    ];

    expect([...deletedGroupIdsInBatch(operations)]).toEqual(["group-roommates"]);
  });

  it("discards stale writes before syncing a deleted group", () => {
    const staleInvitation = operation({ id: "invite-op", entityType: "invitation", payload: { invitation: { groupId: "group-roommates" } } });
    const groupDelete = operation({ id: "delete-op", entityType: "group", entityId: "group-roommates", action: "delete", payload: { groupId: "group-roommates" } });
    const personalDebt = operation({ id: "debt-op", entityType: "debt_record", payload: {} });

    expect(partitionOperationsForDeletedGroups([staleInvitation, groupDelete, personalDebt])).toEqual({
      active: [groupDelete, personalDebt],
      discardedOperationIds: ["invite-op"],
    });
  });
});
