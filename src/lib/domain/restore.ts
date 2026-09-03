import type { AppSnapshot, CurrencyCode, PendingOperation } from "./types";
import { bindSnapshotIdentity } from "./identity";
import { seedSnapshot } from "./seed";

export const RESTORE_COLLECTIONS = ["groups", "groupMembers", "events", "members", "categories", "records", "debtRecords", "settlements", "recurringPayments"] as const;
export type RestoreCollection = typeof RESTORE_COLLECTIONS[number];
export type RestoreData = Pick<AppSnapshot, RestoreCollection>;
export interface RestoreWorkspace { id: string; name: string; kind: "personal" | "group"; groupId?: string; modifiedAt?: string }
export interface RestoreBackup { workspace: RestoreWorkspace; data: RestoreData; defaultCurrency?: CurrencyCode; warnings: string[]; skippedRows: number }
export interface RestorePreview { accountEmail: string; createdAt: string; backups: RestoreBackup[]; errors: string[] }
export interface RestoreDeletion { entityType: PendingOperation["entityType"]; entityId: string }
export interface RestoreSummary { added: number; replacedSample: number; existing: number; skipped: number; records: number; groups: number; recurringPayments: number }

export function emptyRestoreData(): RestoreData {
  return { groups: [], groupMembers: [], events: [], members: [], categories: [], records: [], debtRecords: [], settlements: [], recurringPayments: [] };
}

const entityTypes: Record<RestoreCollection, PendingOperation["entityType"]> = {
  groups: "group", groupMembers: "group_member", events: "event", members: "group_member", categories: "category", records: "record", debtRecords: "debt_record", settlements: "settlement", recurringPayments: "recurring_payment",
};

export function filterRestoreDeletions(snapshot: AppSnapshot, deletions: RestoreDeletion[]): AppSnapshot {
  const deleted = new Set(deletions.map((item) => `${item.entityType}:${item.entityId}`));
  const removedEvents = new Set(snapshot.events.filter((event) => deleted.has(`event:${event.id}`) || deleted.has(`group:${event.groupId}`)).map((event) => event.id));
  const next = { ...snapshot };
  for (const key of RESTORE_COLLECTIONS) {
    Object.assign(next, { [key]: (snapshot[key] ?? []).filter((item) => !deleted.has(`${entityTypes[key]}:${item.id}`)
      && !("groupId" in item && item.groupId && deleted.has(`group:${item.groupId}`))
      && !("eventId" in item && item.eventId && (removedEvents.has(item.eventId) || deleted.has(`event:${item.eventId}`)))
      && !("events" in item && item.events.some((event) => removedEvents.has(event.eventId) || deleted.has(`event:${event.eventId}`)))) });
  }
  return next;
}

// Add-only import: the phone's existing data and queued operations always win.
export function mergeRestore(current: AppSnapshot, preview: RestorePreview, operations: PendingOperation[] = [], deletions: RestoreDeletion[] = [], restoreCurrency = false) {
  if (current.currentUser.email.toLowerCase() !== preview.accountEmail.toLowerCase()) throw new Error("This preview belongs to a different Google account. Load a new preview.");
  const protectedIds = new Set([...deletions, ...operations].map((entry) => `${entry.entityType}:${entry.entityId}`));
  const deleted = new Set([...deletions, ...operations.filter((entry) => entry.action === "delete")].map((entry) => `${entry.entityType}:${entry.entityId}`));
  const summary: RestoreSummary = { added: 0, replacedSample: 0, existing: 0, skipped: 0, records: 0, groups: 0, recurringPayments: 0 };
  const snapshot = { ...current };
  const demo = bindSnapshotIdentity(structuredClone(seedSnapshot), current.currentUser, seedSnapshot.currentUser.id);
  for (const key of RESTORE_COLLECTIONS) {
    const items = new Map<string, RestoreData[typeof key][number]>((current[key] ?? []).map((item) => [item.id, item]));
    for (const backup of preview.backups) {
      for (const item of backup.data[key]) {
        const groupId = "groupId" in item ? item.groupId : key === "groups" ? item.id : undefined;
        const eventId = "eventId" in item ? item.eventId : key === "events" ? item.id : undefined;
        const missingParent = (groupId && !snapshot.groups.some((group) => group.id === groupId) && key !== "groups")
          || (eventId && !snapshot.events.some((event) => event.id === eventId) && key !== "events")
          || ("events" in item && item.events.some((event) => !snapshot.events.some((existing) => existing.id === event.eventId) || deleted.has(`event:${event.eventId}`)));
        const scopeBlocked = (groupId && deleted.has(`group:${groupId}`)) || (eventId && deleted.has(`event:${eventId}`));
        if (protectedIds.has(`${entityTypes[key]}:${item.id}`) || scopeBlocked || missingParent) { summary.skipped++; continue; }
        const existing = items.get(item.id);
        if (existing) {
          const originalSample = demo[key].find((sample) => sample.id === item.id);
          if (!originalSample || JSON.stringify(originalSample) !== JSON.stringify(existing)) { summary.existing++; continue; }
          items.set(item.id, item);
          summary.replacedSample++;
          if (["records", "debtRecords", "settlements"].includes(key)) summary.records++;
          continue;
        }
        items.set(item.id, item);
        summary.added++;
        if (["records", "debtRecords", "settlements"].includes(key)) summary.records++;
        if (key === "groups") summary.groups++;
        if (key === "recurringPayments") summary.recurringPayments++;
      }
    }
    // Every collection is only merged with the same typed collection above.
    Object.assign(snapshot, { [key]: [...items.values()] });
  }
  const currency = preview.backups.find((backup) => backup.workspace.kind === "personal")?.defaultCurrency;
  if (restoreCurrency && currency && !operations.some((operation) => operation.entityType === "user_settings")) {
    snapshot.currentUser = { ...current.currentUser, defaultCurrency: currency };
  }
  return { snapshot, summary };
}
