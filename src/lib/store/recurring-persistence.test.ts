import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { seedSnapshot } from "../domain/seed";
import { createRecurringRecord } from "../domain/recurring-payments";
import type { RecurringPayment } from "@/lib/domain/types";
import { clearLocalData, commitRecurringOccurrences, listPendingOperations, loadSnapshot, persistRecurringPayment, queueOperation, saveSnapshot } from "./db";

const payment: RecurringPayment = { id: "recurring-test", version: 1, name: "Internet", categoryId: "food", amount: 60, currency: "CAD", startDate: "2026-01-31", frequency: "month", interval: 1, nextOccurrence: 0, status: "active", createdBy: seedSnapshot.currentUser.id, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", syncStatus: "pending" };
const record = createRecurringRecord(payment, "2026-01-31", seedSnapshot.currentUser, new Date("2026-01-31T20:00:00Z"));

beforeEach(async () => {
  vi.stubGlobal("window", {});
  await clearLocalData();
  await saveSnapshot(structuredClone(seedSnapshot));
  await persistRecurringPayment(payment, seedSnapshot);
});

describe("atomic recurring payments", () => {
  it("creates a single expense and advances the cursor once under concurrent tabs", async () => {
    const results = await Promise.all([commitRecurringOccurrences(payment, [record]), commitRecurringOccurrences(payment, [record])]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await loadSnapshot())?.records.filter((item) => item.id === record.id)).toHaveLength(1);
    expect((await loadSnapshot())?.recurringPayments[0].nextOccurrence).toBe(1);
    expect((await listPendingOperations()).filter((item) => item.entityId === record.id)).toHaveLength(1);
  });
  it("keeps generated expenses and cursor when a stale view is saved", async () => {
    await commitRecurringOccurrences(payment, [record]);
    await saveSnapshot({ ...seedSnapshot, recurringPayments: [payment] });
    expect((await loadSnapshot())?.records.some((item) => item.id === record.id)).toBe(true);
    expect((await loadSnapshot())?.recurringPayments[0].nextOccurrence).toBe(1);
  });
  it("does not regenerate a deleted expense after rescheduling to the same date", async () => {
    const result = await commitRecurringOccurrences(payment, [record]);
    await queueOperation({ id: "delete", idempotencyKey: "delete", entityType: "record", entityId: record.id, action: "delete", payload: {}, createdAt: "2026-02-01", status: "pending", attempts: 0 });
    const edited = { ...result!.payment, nextOccurrence: 0, version: 3 };
    await persistRecurringPayment(edited, seedSnapshot);
    const retry = await commitRecurringOccurrences(edited, [record]);
    expect(retry?.records).toHaveLength(0);
    expect((await loadSnapshot())?.records.some((item) => item.id === record.id)).toBe(false);
    expect(retry?.payment.nextOccurrence).toBe(1);
  });
  it("rejects an in-flight generation if the schedule was paused or edited", async () => {
    await persistRecurringPayment({ ...payment, version: 2, status: "paused" }, seedSnapshot);
    expect(await commitRecurringOccurrences(payment, [record])).toBeUndefined();
    expect((await loadSnapshot())?.records.some((item) => item.id === record.id)).toBe(false);
  });
  it("retains history when the schedule is deleted", async () => {
    const result = await commitRecurringOccurrences(payment, [record]);
    await persistRecurringPayment({ ...result!.payment, version: 3, status: "deleted" }, seedSnapshot);
    expect((await loadSnapshot())?.records.some((item) => item.id === record.id)).toBe(true);
    expect((await loadSnapshot())?.recurringPayments[0].status).toBe("deleted");
  });
});
