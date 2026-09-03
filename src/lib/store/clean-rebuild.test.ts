import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptySnapshot } from "../domain/empty-snapshot";
import { seedSnapshot } from "../domain/seed";
import { getReceipt, listPendingOperations, loadSnapshot, queueOperation, saveReceipt, saveSnapshot } from "./db";

beforeEach(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("indexedDB", new IDBFactory());
});

describe("clean record rebuild", () => {
  it.each([1, 3, 4])("discards every old device store at version %i without uploading anything", async (version) => {
    const old = await openDB("bill-moshi", version, { upgrade(db) {
      for (const name of ["app", "queue", "receipts", "recurringOccurrences", "restoreMeta"]) db.createObjectStore(name);
    } });
    await old.put("app", seedSnapshot, "snapshot");
    await old.put("queue", { action: "delete", entityType: "group", entityId: "old-group" }, "old-operation");
    await old.put("receipts", { blob: new Blob(["old receipt"]) }, "old-receipt");
    await old.put("recurringOccurrences", { deleted: true }, "old-occurrence");
    await old.put("restoreMeta", { importedIds: { records: ["old-record"] } }, "state");
    old.close();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await loadSnapshot()).toBeUndefined();
    expect(await listPendingOperations()).toEqual([]);
    expect(await getReceipt("old-receipt")).toBeUndefined();
    const rebuilt = await openDB("bill-moshi", 5);
    for (const name of rebuilt.objectStoreNames) expect(await rebuilt.count(name)).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    rebuilt.close();
  });

  it("keeps new records, queued edits, and photos on subsequent opens", async () => {
    await loadSnapshot();
    const snapshot = emptySnapshot();
    const record = { ...seedSnapshot.records[0], id: "record-after-rebuild", payerId: snapshot.currentUser.id, createdBy: snapshot.currentUser.id, splits: [] };
    snapshot.records.push(record);
    await saveSnapshot(snapshot);
    await queueOperation({ id: "new-operation", idempotencyKey: "new-operation", entityType: "record", entityId: record.id, action: "upsert", payload: { record }, createdAt: record.createdAt, attempts: 0, status: "pending" });
    await saveReceipt("new-receipt", new File(["new receipt"], "receipt.txt"));
    expect(await loadSnapshot()).toEqual(snapshot);
    expect((await listPendingOperations()).map((item) => item.id)).toEqual(["new-operation"]);
    expect((await getReceipt("new-receipt"))?.name).toBe("receipt.txt");
    expect(await loadSnapshot()).toEqual(snapshot);
  });

  it("starts with no sample records or groups and independent default categories", () => {
    const first = emptySnapshot();
    const second = emptySnapshot();
    expect(first.currentUser.name).toBe("You");
    for (const key of ["groups", "groupMembers", "events", "members", "records", "recurringPayments", "debtRecords", "settlements", "activity"] as const) expect(first[key]).toEqual([]);
    expect(first.categories.length).toBeGreaterThan(0);
    first.categories[0].name = "Changed";
    expect(second.categories[0].name).not.toBe("Changed");
  });
});
