import { openDB, type DBSchema } from "idb";
import type { AppSnapshot, PendingOperation } from "@/lib/domain/types";

interface BillMoshiDB extends DBSchema {
  app: { key: "snapshot"; value: AppSnapshot };
  queue: { key: string; value: PendingOperation; indexes: { "by-created": string } };
  receipts: { key: string; value: { id: string; blob: Blob; name: string; type: string } };
}

const DB_NAME = "bill-moshi";

function database() {
  return openDB<BillMoshiDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore("app");
      const queue = db.createObjectStore("queue", { keyPath: "id" });
      queue.createIndex("by-created", "createdAt");
      db.createObjectStore("receipts", { keyPath: "id" });
    },
  });
}

export async function loadSnapshot() {
  if (typeof window === "undefined") return undefined;
  return (await database()).get("app", "snapshot");
}

export async function saveSnapshot(snapshot: AppSnapshot) {
  if (typeof window === "undefined") return;
  await (await database()).put("app", snapshot, "snapshot");
}

export async function queueOperation(operation: PendingOperation) {
  await (await database()).put("queue", operation);
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
  const transaction = db.transaction(["app", "queue", "receipts"], "readwrite");
  await Promise.all([
    transaction.objectStore("app").clear(),
    transaction.objectStore("queue").clear(),
    transaction.objectStore("receipts").clear(),
    transaction.done,
  ]);
}
