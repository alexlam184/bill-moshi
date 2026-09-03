import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyRestoreData, mergeRestore, type RestorePreview } from "../domain/restore";
import { seedSnapshot } from "../domain/seed";
import type { AppSnapshot, PendingOperation } from "../domain/types";
import { clearLocalData, listPendingOperations, loadSnapshot, queueOperation, removePendingOperations, restoreFromPreview, saveSnapshot } from "./db";

const current: AppSnapshot = { ...structuredClone(seedSnapshot), ...emptyRestoreData() };
const record = { ...seedSnapshot.records[0], id: "restored-one", groupId: undefined, eventId: undefined, receiptFileId: "receipt", syncStatus: "synced" as const };
function preview(): RestorePreview { return { accountEmail: current.currentUser.email, createdAt: new Date().toISOString(), errors: [], backups: [{ workspace: { id: "personal", kind: "personal", name: "Personal" }, data: { ...emptyRestoreData(), records: [record] }, defaultCurrency: "HKD", warnings: [], skippedRows: 0 }] }; }
function deletion(entityType: PendingOperation["entityType"], entityId: string): PendingOperation { return { id: `delete-${entityId}`, idempotencyKey: `delete-${entityId}`, entityType, entityId, action: "delete", payload: {}, createdAt: new Date().toISOString(), attempts: 0, status: "pending" }; }

beforeEach(async () => { vi.stubGlobal("window", {}); await clearLocalData(); await saveSnapshot(structuredClone(current)); });

describe("safe local restore", () => {
  it("is repeatable, survives reload, and never queues uploads", async () => {
    expect((await restoreFromPreview(preview(), current)).summary.records).toBe(1);
    expect((await restoreFromPreview(preview(), current)).summary.records).toBe(0);
    expect((await loadSnapshot())?.records).toHaveLength(1);
    expect(await listPendingOperations()).toHaveLength(0);
  });
  it("keeps existing local edits and pending writes", async () => {
    const local = { ...current, records: [{ ...record, description: "New local edit", syncStatus: "pending" as const, version: 3 }] };
    await saveSnapshot(local);
    const operation = { ...deletion("record", record.id), action: "upsert" as const, payload: { record: local.records[0] } };
    await queueOperation(operation);
    await restoreFromPreview(preview(), local);
    expect((await loadSnapshot())?.records[0].description).toBe("New local edit");
    expect(await listPendingOperations()).toEqual([operation]);
  });
  it("does not resurrect deletions, even after their sync acknowledgement", async () => {
    await restoreFromPreview(preview(), current);
    const operation = deletion("record", record.id);
    await queueOperation(operation);
    await removePendingOperations([operation.id]);
    await saveSnapshot({ ...current, records: [record] }); // stale second tab
    expect((await loadSnapshot())?.records).toHaveLength(0);
    expect((await restoreFromPreview(preview(), current)).summary.records).toBe(0);
    expect((await loadSnapshot())?.records).toHaveLength(0);
  });
  it("preserves imported records when an older tab saves unrelated changes", async () => {
    await restoreFromPreview(preview(), current);
    await saveSnapshot({ ...current, currentUser: { ...current.currentUser, name: "Updated" } });
    expect((await loadSnapshot())?.records).toHaveLength(1);
    expect((await loadSnapshot())?.currentUser.name).toBe("Updated");
  });
  it("protects group and event deletions with their child records", () => {
    const data = { ...emptyRestoreData(), groups: seedSnapshot.groups, events: seedSnapshot.events, records: seedSnapshot.records.filter((item) => item.groupId) };
    const input = preview(); input.backups[0].data = data;
    const result = mergeRestore(current, input, [deletion("group", "group-family")]);
    expect(result.snapshot.groups.some((group) => group.id === "group-family")).toBe(false);
    expect(result.snapshot.records).toHaveLength(0);
  });
  it("requires matching account and fresh preview", async () => {
    await expect(restoreFromPreview({ ...preview(), createdAt: "2020-01-01" }, current)).rejects.toThrow("expired");
    await expect(restoreFromPreview({ ...preview(), accountEmail: "other@example.com" }, current)).rejects.toThrow("different Google account");
    expect((await loadSnapshot())?.records).toHaveLength(0);
  });
  it("restores currency only when requested and without overwriting a pending preference", async () => {
    await restoreFromPreview(preview(), current);
    expect((await loadSnapshot())?.currentUser.defaultCurrency).toBe("CAD");
    await queueOperation({ ...deletion("user_settings", current.currentUser.id), action: "upsert" });
    await restoreFromPreview(preview(), current, true);
    expect((await loadSnapshot())?.currentUser.defaultCurrency).toBe("CAD");
  });
  it("replaces an unchanged built-in sample with its backup but protects an edited sample", () => {
    const sample = seedSnapshot.records.find((item) => item.id === "expense-personal-coffee")!;
    const input = preview(); input.backups[0].data.records = [{ ...sample, description: "Backed-up coffee" }];
    const replaced = mergeRestore(structuredClone(seedSnapshot), input);
    expect(replaced.summary.replacedSample).toBe(1);
    expect(replaced.snapshot.records.find((item) => item.id === sample.id)?.description).toBe("Backed-up coffee");
    const edited = { ...structuredClone(seedSnapshot), records: seedSnapshot.records.map((item) => item.id === sample.id ? { ...item, description: "Local edit" } : item) };
    const protectedResult = mergeRestore(edited, input);
    expect(protectedResult.summary.replacedSample).toBe(0);
    expect(protectedResult.snapshot.records.find((item) => item.id === sample.id)?.description).toBe("Local edit");
  });
});
