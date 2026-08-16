import { describe, expect, it } from "vitest";
import type { PendingOperation } from "@/lib/domain/types";
import { operationWorkspaceScope } from "./workspace-routing";

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

  it("fails closed when a Group-scoped operation has no Group identity", () => {
    expect(() => operationWorkspaceScope(operation({ entityType: "settlement", payload: {} }))).toThrow(/cannot determine the Group/);
  });
});
