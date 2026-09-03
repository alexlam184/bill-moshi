import { openDB, type DBSchema } from "idb";
import type { AppSnapshot, LedgerRecord, PendingOperation, RecurringPayment } from "@/lib/domain/types";
import { filterRestoreDeletions, mergeRestore, RESTORE_COLLECTIONS, type RestoreCollection, type RestoreDeletion, type RestorePreview } from "../domain/restore";

interface RestoreMetadata { importedIds: Partial<Record<RestoreCollection, string[]>>; deletions: RestoreDeletion[] }

interface BillMoshiDB extends DBSchema {
  app: { key: "snapshot"; value: AppSnapshot };
  queue: { key: string; value: PendingOperation; indexes: { "by-created": string } };
  receipts: { key: string; value: { id: string; blob: Blob; name: string; type: string } };
  recurringOccurrences: { key: string; value: { id: string; deleted: boolean } };
  restoreMeta: { key: "state"; value: RestoreMetadata };
}

const DB_NAME = "bill-moshi";

function database(onBlocked?: () => void) {
  const opening = openDB<BillMoshiDB>(DB_NAME, 5, {
    blocked: onBlocked,
    blocking() { void opening.then((db) => db.close()); },
    upgrade(db) {
      // Deliberate clean rebuild: discard pre-rebuild device data, never migrate it.
      // This runs once; reopening version 5 preserves all newly created records.
      for (const name of Array.from(db.objectStoreNames)) db.deleteObjectStore(name);
      db.createObjectStore("app");
      const queue = db.createObjectStore("queue", { keyPath: "id" });
      queue.createIndex("by-created", "createdAt");
      db.createObjectStore("receipts", { keyPath: "id" });
      db.createObjectStore("recurringOccurrences", { keyPath: "id" });
      db.createObjectStore("restoreMeta");
    },
  });
  return opening;
}

export async function loadSnapshot(onBlocked?: () => void) {
  if (typeof window === "undefined") return undefined;
  return (await database(onBlocked)).get("app", "snapshot");
}

export async function saveSnapshot(snapshot: AppSnapshot) {
  if (typeof window === "undefined") return;
  const tx = (await database()).transaction(["app", "recurringOccurrences", "restoreMeta"], "readwrite");
  const previous = await tx.objectStore("app").get("snapshot");
  const restored = await tx.objectStore("restoreMeta").get("state");
  const tombstones = new Set((await tx.objectStore("recurringOccurrences").getAll()).filter((item) => item.deleted).map((item) => item.id));
  const payments = new Map((previous?.recurringPayments ?? []).map((payment) => [payment.id, payment]));
  for (const payment of snapshot.recurringPayments ?? []) {
    if ((payments.get(payment.id)?.version ?? -1) <= payment.version) payments.set(payment.id, payment);
  }
  const records = new Map(snapshot.records.filter((record) => !tombstones.has(record.id)).map((record) => [record.id, record]));
  for (const record of previous?.records ?? []) {
    if (!record.recurringPaymentId || tombstones.has(record.id)) continue;
    const incoming = records.get(record.id);
    if (!incoming || record.version > incoming.version) records.set(record.id, record);
  }
  const next = { ...snapshot, recurringPayments: [...payments.values()], records: [...records.values()] };
  // A tab opened before the restore must not erase newly imported rows when
  // its unrelated local edit saves an older snapshot.
  if (previous && restored) {
    for (const key of RESTORE_COLLECTIONS) {
      const importedIds = new Set(restored.importedIds[key]);
      const presentIds = new Set(next[key].map((item) => item.id));
      Object.assign(next, { [key]: [...next[key], ...(previous[key] ?? []).filter((item) => importedIds.has(item.id) && !presentIds.has(item.id))] });
    }
  }
  await tx.objectStore("app").put(filterRestoreDeletions(next, restored?.deletions ?? []), "snapshot");
  await tx.done;
}

export async function queueOperation(operation: PendingOperation) {
  const tx = (await database()).transaction(["queue", "app", "recurringOccurrences", "restoreMeta"], "readwrite");
  await tx.objectStore("queue").put(operation);
  if (operation.action === "delete") {
    const meta = await tx.objectStore("restoreMeta").get("state") ?? { importedIds: {}, deletions: [] };
    meta.deletions = [...meta.deletions.filter((item) => item.entityType !== operation.entityType || item.entityId !== operation.entityId), { entityType: operation.entityType, entityId: operation.entityId }];
    const snapshot = await tx.objectStore("app").get("snapshot");
    for (const key of RESTORE_COLLECTIONS) {
      meta.importedIds[key] = meta.importedIds[key]?.filter((id) => {
        if (id === operation.entityId) return false;
        const item = snapshot?.[key].find((item) => item.id === id);
        return !(operation.entityType === "group" && item && "groupId" in item && item.groupId === operation.entityId)
          && !(operation.entityType === "event" && item && "eventId" in item && item.eventId === operation.entityId);
      });
    }
    await tx.objectStore("restoreMeta").put(meta, "state");
    if (snapshot) await tx.objectStore("app").put(filterRestoreDeletions(snapshot, meta.deletions), "snapshot");
  }
  if (operation.entityType === "record" && operation.action === "delete" && operation.entityId.startsWith("recurring-record-")) {
    await tx.objectStore("recurringOccurrences").put({ id: operation.entityId, deleted: true });
    const snapshot = await tx.objectStore("app").get("snapshot");
    if (snapshot) await tx.objectStore("app").put({ ...snapshot, records: snapshot.records.filter((record) => record.id !== operation.entityId) }, "snapshot");
  }
  await tx.done;
}

function recurringOperation(payment: RecurringPayment): PendingOperation {
  const id = `recurring-schedule:${payment.id}:${payment.version}`;
  return { id, idempotencyKey: id, entityType: "recurring_payment", entityId: payment.id, action: "upsert", payload: { recurringPayment: payment }, createdAt: payment.updatedAt, attempts: 0, status: "pending" };
}

export async function persistRecurringPayment(payment: RecurringPayment, fallback: AppSnapshot) {
  const tx = (await database()).transaction(["app", "queue"], "readwrite");
  const snapshot = await tx.objectStore("app").get("snapshot") ?? fallback;
  const existing = (snapshot.recurringPayments ?? []).find((item) => item.id === payment.id);
  if (existing && existing.version !== payment.version - 1) {
    await tx.done;
    throw new Error("This payment changed in another tab. Refresh the page before editing it.");
  }
  await tx.objectStore("app").put({ ...snapshot, recurringPayments: [...(snapshot.recurringPayments ?? []).filter((item) => item.id !== payment.id), payment] }, "snapshot");
  await tx.objectStore("queue").put(recurringOperation(payment));
  await tx.done;
}

// Cursor, occurrence marker, record and queue entries commit together. Two
// tabs (or a reload after a crash) cannot charge the same occurrence twice.
export async function commitRecurringOccurrences(payment: RecurringPayment, records: LedgerRecord[]) {
  const tx = (await database()).transaction(["app", "queue", "recurringOccurrences"], "readwrite");
  const snapshot = await tx.objectStore("app").get("snapshot");
  const current = snapshot?.recurringPayments?.find((item) => item.id === payment.id);
  if (!snapshot || !current || current.version !== payment.version || current.status !== "active") {
    await tx.done;
    return undefined;
  }
  const inserted: LedgerRecord[] = [];
  for (const record of records) {
    if (await tx.objectStore("recurringOccurrences").get(record.id)) continue;
    await tx.objectStore("recurringOccurrences").put({ id: record.id, deleted: false });
    if (snapshot.records.some((item) => item.id === record.id)) continue;
    inserted.push(record);
    await tx.objectStore("queue").put({ id: record.id, idempotencyKey: record.id, entityType: "record", entityId: record.id, action: "upsert", payload: { record, category: snapshot.categories.find((item) => item.id === record.categoryId) }, createdAt: record.createdAt, attempts: 0, status: "pending" });
  }
  const updated: RecurringPayment = { ...current, nextOccurrence: current.nextOccurrence + records.length, version: current.version + 1, updatedAt: new Date().toISOString(), syncStatus: "pending" };
  await tx.objectStore("queue").put(recurringOperation(updated));
  await tx.objectStore("app").put({ ...snapshot, recurringPayments: snapshot.recurringPayments.map((item) => item.id === updated.id ? updated : item), records: [...inserted, ...snapshot.records] }, "snapshot");
  await tx.done;
  return { payment: updated, records: inserted };
}

export async function listPendingOperations() {
  if (typeof window === "undefined") return [];
  return (await database()).getAllFromIndex("queue", "by-created");
}

export async function removePendingOperations(ids: string[]) {
  const db = await database();
  const transaction = db.transaction("queue", "readwrite");
  await Promise.all([...ids.map((id) => transaction.store.delete(id)), transaction.done]);
}

export async function updatePendingOperation(operation: PendingOperation) {
  await (await database()).put("queue", operation);
}

export async function saveReceipt(id: string, file: File) {
  await (await database()).put("receipts", { id, blob: file, name: file.name, type: file.type });
}

export async function getReceipt(id: string) {
  return (await database()).get("receipts", id);
}

export async function clearLocalData() {
  if (typeof window === "undefined") return;
  const db = await database();
  const transaction = db.transaction(["app", "queue", "receipts", "recurringOccurrences", "restoreMeta"], "readwrite");
  await Promise.all([
    transaction.objectStore("app").clear(),
    transaction.objectStore("queue").clear(),
    transaction.objectStore("receipts").clear(),
    transaction.objectStore("recurringOccurrences").clear(),
    transaction.objectStore("restoreMeta").clear(),
    transaction.done,
  ]);
}

export async function getRestorePreviewSummary(preview: RestorePreview, snapshot: AppSnapshot, restoreCurrency = false) {
  const db = await database();
  const tx = db.transaction(["queue", "restoreMeta", "recurringOccurrences"]);
  const operations = await tx.objectStore("queue").getAll();
  const meta = await tx.objectStore("restoreMeta").get("state");
  const recurringDeletions = (await tx.objectStore("recurringOccurrences").getAll()).filter((item) => item.deleted).map((item) => ({ entityType: "record" as const, entityId: item.id }));
  await tx.done;
  return mergeRestore(snapshot, preview, operations, [...meta?.deletions ?? [], ...recurringDeletions], restoreCurrency).summary;
}

export async function restoreFromPreview(preview: RestorePreview, fallback: AppSnapshot, restoreCurrency = false) {
  if (!Number.isFinite(Date.parse(preview.createdAt)) || Date.now() - Date.parse(preview.createdAt) > 10 * 60_000) throw new Error("This preview has expired. Preview the backup again before restoring.");
  const tx = (await database()).transaction(["app", "queue", "recurringOccurrences", "restoreMeta"], "readwrite");
  const snapshot = await tx.objectStore("app").get("snapshot") ?? fallback;
  const operations = await tx.objectStore("queue").getAll();
  const meta = await tx.objectStore("restoreMeta").get("state") ?? { importedIds: {}, deletions: [] };
  const markers = await tx.objectStore("recurringOccurrences").getAll();
  const deletions = [...meta.deletions, ...markers.filter((item) => item.deleted).map((item) => ({ entityType: "record" as const, entityId: item.id }))];
  const result = mergeRestore(snapshot, preview, operations, deletions, restoreCurrency);
  for (const key of RESTORE_COLLECTIONS) {
    const existingIds = new Set((snapshot[key] ?? []).map((item) => item.id));
    meta.importedIds[key] = [...new Set([...meta.importedIds[key] ?? [], ...result.snapshot[key].filter((item) => !existingIds.has(item.id)).map((item) => item.id)])];
  }
  const marked = new Set(markers.map((item) => item.id));
  for (const record of result.snapshot.records) {
    if (record.recurringPaymentId && !marked.has(record.id)) await tx.objectStore("recurringOccurrences").put({ id: record.id, deleted: false });
  }
  await tx.objectStore("app").put(result.snapshot, "snapshot");
  await tx.objectStore("restoreMeta").put(meta, "state");
  await tx.done;
  return result;
}
