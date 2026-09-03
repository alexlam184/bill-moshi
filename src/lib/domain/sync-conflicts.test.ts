import { describe, expect, it } from "vitest";
import type { LedgerRecord } from "./types";
import { recordSyncFingerprint } from "./sync-conflicts";

const record: LedgerRecord = {
  id: "expense-1", groupId: "group-1", recordType: "expense", description: "Dinner", categoryId: "food",
  transactionDate: "2026-08-31T20:00:00.000Z", payerId: "user-a", amountOriginal: 30, currencyOriginal: "CAD",
  exchangeRate: 1, amountBase: 30, baseCurrency: "CAD", exchangeRateSource: "same-currency", createdBy: "user-a",
  createdAt: "2026-08-31T20:00:00.000Z", updatedAt: "2026-08-31T20:00:00.000Z", version: 1, syncStatus: "synced",
  splits: [
    { recordId: "expense-1", memberId: "user-b", splitMethod: "equal", owedAmount: 15 },
    { recordId: "expense-1", memberId: "user-a", splitMethod: "equal", owedAmount: 15 },
  ],
};

describe("expense sync fingerprints", () => {
  it("ignores local-only state and split row order", () => {
    expect(recordSyncFingerprint({ ...record, syncStatus: "pending", localReceiptId: "local", splits: record.splits.toReversed() }))
      .toBe(recordSyncFingerprint(record));
  });

  it("detects a manual sheet field change even when the version is unchanged", () => {
    expect(recordSyncFingerprint({ ...record, description: "Dinner edited in Sheets" }))
      .not.toBe(recordSyncFingerprint(record));
  });
});
