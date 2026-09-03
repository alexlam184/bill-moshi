import { describe, expect, it } from "vitest";
import { parseRestoreWorkbook, type WorkbookTables } from "./restore-parser";
import { GOOGLE_SHEET_HEADERS, type SheetName } from "./sheet-schema";
import type { RestoreWorkspace } from "../../domain/restore";

const user = { id: "google:me@example.com", email: "me@example.com", name: "Me", defaultCurrency: "CAD" as const };
const personal: RestoreWorkspace = { id: "sheet-personal", name: "Personal", kind: "personal" };
function sheet(name: SheetName, records: Record<string, unknown>[]) { const headers = GOOGLE_SHEET_HEADERS[name]; return [[...headers], ...records.map((record) => headers.map((header) => record[header] ?? ""))]; }
const record = { record_id: "record-one", description: "Internet", category_id: "utilities", transaction_date: "2026-08-01T12:00:00.000Z", payer_id: "old-me", amount_original: 100, currency_original: "HKD", exchange_rate: 0.17, amount_base: 17, base_currency: "CAD", created_by: "old-me", created_at: "2026-08-01T12:00:00.000Z", updated_at: "2026-08-01T12:00:00.000Z", version: 1, record_type: "expense", receipt_file_id: "receipt-one" };
function tables(): WorkbookTables { return {
  UserSettings: sheet("UserSettings", [{ user_id: "old-me", email: user.email, default_currency: "HKD" }]),
  Records: sheet("Records", [record]),
  Categories: sheet("Categories", [{ category_id: "utilities", name: "Utilities", emoji: "💡", is_custom: false }]),
}; }

describe("Google backup parsing", () => {
  it("restores personal records without a split worksheet", () => {
    const result = parseRestoreWorkbook(personal, tables(), user);
    expect(result.skippedRows).toBe(0);
    expect(result.defaultCurrency).toBe("HKD");
    expect(result.data.records[0]).toMatchObject({ id: "record-one", payerId: user.id, amountOriginal: 100, exchangeRate: 0.17, amountBase: 17, receiptFileId: "receipt-one", syncStatus: "synced", splits: [{ memberId: user.id, owedAmount: 17 }] });
    expect(result.data.recurringPayments).toEqual([]);
  });
  it("uses header names even when columns are reordered", () => {
    const input = tables(); input.Records = input.Records!.map((row) => [...row].reverse());
    expect(parseRestoreWorkbook(personal, input, user).data.records[0].amountBase).toBe(17);
  });
  it("rejects renamed required headers and mismatched personal accounts", () => {
    const input = tables(); input.Records![0][0] = "Changed ID";
    expect(() => parseRestoreWorkbook(personal, input, user)).toThrow("missing or renamed columns");
    const foreign = tables(); foreign.UserSettings![1][1] = "someone@example.com";
    expect(() => parseRestoreWorkbook(personal, foreign, user)).toThrow("another account");
  });
  it("refuses unapproved group access", () => {
    const input: WorkbookTables = { Groups: sheet("Groups", [{ group_id: "g", group_name: "Family", created_by: "owner", currency: "CAD", created_at: "2026-01-01", updated_at: "2026-01-01" }]), GroupMembers: sheet("GroupMembers", [{ group_member_id: "m", group_id: "g", user_id: user.id, name: "Me", email: user.email, role: "member", status: "left", joined_at: "2026-01-01" }]) };
    expect(() => parseRestoreWorkbook({ id: "group-data", name: "Family", kind: "group", groupId: "g" }, input, user)).toThrow("approved active member");
  });
  it("restores group records with member identities and event scope", () => {
    const input = tables();
    input.Groups = sheet("Groups", [{ group_id: "g", group_name: "Family", created_by: "old-me", currency: "CAD", created_at: "2026-01-01", updated_at: "2026-01-01" }]);
    input.GroupMembers = sheet("GroupMembers", [{ group_member_id: "m", group_id: "g", user_id: "old-me", name: "Me", email: user.email, role: "owner", status: "active", joined_at: "2026-01-01" }]);
    input.Events = sheet("Events", [{ event_id: "e", group_id: "g", event_name: "Trip", base_currency: "CAD", created_by: "old-me", created_at: "2026-01-01", updated_at: "2026-01-01" }]);
    input.Records = sheet("Records", [{ ...record, group_id: "g", event_id: "e" }]);
    input.RecordSplits = sheet("RecordSplits", [{ record_id: record.record_id, member_id: "old-me", split_method: "equal", owed_amount: 17 }]);
    const result = parseRestoreWorkbook({ id: "group-data", name: "Group", kind: "group", groupId: "g" }, input, user);
    expect(result.data.records[0]).toMatchObject({ groupId: "g", eventId: "e", payerId: user.id });
    expect(result.data.groups[0].ownerId).toBe(user.id);
    expect(result.workspace.name).toBe("Family");
  });
  it("preserves recurring progress and debt payment status", () => {
    const input = tables();
    input.RecurringPayments = sheet("RecurringPayments", [{ recurring_payment_id: "r", name: "Internet", category_id: "utilities", amount: 20, currency: "CAD", start_date: "2026-01-31", frequency: "month", interval: 1, next_occurrence: 8, status: "paused", created_by: "old-me", created_at: "2026-01-01", updated_at: "2026-08-01", version: 3 }]);
    input.DebtRecords = sheet("DebtRecords", [{ debt_record_id: "d", direction: "lent", person_name: "Mary", amount: 20, currency: "CAD", date: "2026-08-01", status: "paid", created_by: "old-me", created_at: "2026-08-01", updated_at: "2026-08-01", photo_file_ids: '["drive-photo"]', photo_names: '["Dinner.jpg"]' }]);
    const result = parseRestoreWorkbook(personal, input, user);
    expect(result.data.recurringPayments[0]).toMatchObject({ nextOccurrence: 8, status: "paused", version: 3 });
    expect(result.data.debtRecords[0]).toMatchObject({ status: "paid", photoFileIds: { "drive-photo": "drive-photo" } });
  });
});
