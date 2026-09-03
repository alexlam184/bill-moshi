import { describe, expect, it } from "vitest";
import { recordFromSheetRows } from "./sheet-record";

describe("Google Sheet expense rows", () => {
  it("reconstructs a shared record and its splits for conflict resolution", () => {
    const row = ["expense-1", "group-1", "", "Dinner", "food", "2026-08-31T20:00:00.000Z", "user-a", 30, "CAD", 1, 30, "CAD", "receipt-1", "note", "user-a", "2026-08-31T20:00:00.000Z", "2026-08-31T21:00:00.000Z", 2, "expense", "same-currency"];
    const restored = recordFromSheetRows(row, [["expense-1", "user-a", "equal", 15], ["expense-1", "user-b", "equal", 15]]);
    expect(restored).toMatchObject({ id: "expense-1", groupId: "group-1", description: "Dinner", version: 2, receiptFileId: "receipt-1", syncStatus: "synced" });
    expect(restored?.splits).toHaveLength(2);
  });
});
