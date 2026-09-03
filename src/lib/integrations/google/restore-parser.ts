import { roundMoney } from "../../domain/calculations";
import { emptyRestoreData, type RestoreBackup, type RestoreWorkspace } from "../../domain/restore";
import { validateRecurringPayment } from "../../domain/recurring-payments";
import { SUPPORTED_CURRENCIES, type LedgerRecord, type RecordSplit, type RecurringPayment, type User } from "../../domain/types";
import type { SheetName } from "./sheet-schema";

export type WorkbookTables = Partial<Record<SheetName, unknown[][]>>;
type Row = Record<string, unknown>;
const optional = (r: Row, key: string) => r[key] === undefined || r[key] === null || r[key] === "" ? undefined : String(r[key]);
function required(r: Row, key: string) { const value = optional(r, key)?.trim(); if (!value) throw new Error(`Missing ${key}`); return value; }
function number(r: Row, key: string, fallback?: number) { const value = optional(r, key); const result = value === undefined ? fallback : Number(value); if (result === undefined || !Number.isFinite(result)) throw new Error(`Invalid ${key}`); return result; }
function choice<T extends string>(r: Row, key: string, options: readonly T[], fallback?: T): T { const value = optional(r, key) ?? fallback; if (!options.includes(value as T)) throw new Error(`Invalid ${key}`); return value as T; }
function date(r: Row, key: string, fallback?: string) { const value = optional(r, key) ?? fallback; if (!value || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error(`Invalid ${key}`); return value; }
function boolean(r: Row, key: string) { return String(r[key]).toLowerCase() === "true"; }
function positive(r: Row, key: string, fallback?: number) { const n = number(r, key, fallback); if (n <= 0) throw new Error(`Invalid ${key}`); return n; }
function integer(r: Row, key: string, fallback: number) { const n = number(r, key, fallback); if (n < 0 || !Number.isSafeInteger(n)) throw new Error(`Invalid ${key}`); return n; }
function strings(r: Row, key: string): string[] { const raw = optional(r, key); if (!raw) return []; const value: unknown = JSON.parse(raw); if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) throw new Error(`Invalid ${key}`); return value; }

export function parseRestoreWorkbook(workspace: RestoreWorkspace, tables: WorkbookTables, user: User): RestoreBackup {
  const data = emptyRestoreData();
  const warnings: string[] = [];
  let skippedRows = 0;
  const rows = <T>(sheet: SheetName, requiredColumns: string[], parse: (row: Row) => T): T[] => {
    const table = tables[sheet];
    if (!table?.length) return [];
    const headers = table[0].map(String);
    if (requiredColumns.some((column) => !headers.includes(column))) throw new Error(`${sheet} has missing or renamed columns. Restore the original Bill Moshi headers first.`);
    return table.slice(1).flatMap((cells, index) => {
      if (!cells.some((cell) => cell !== "" && cell !== null && cell !== undefined)) return [];
      try { return [parse(Object.fromEntries(headers.map((header, i) => [header, cells[i]])))]; }
      catch (error) { skippedRows++; if (warnings.length < 30) warnings.push(`${sheet} row ${index + 2}: ${error instanceof Error ? error.message : "Invalid data"}. Skipped.`); return []; }
    });
  };
  const personal = workspace.kind === "personal";
  let defaultCurrency: User["defaultCurrency"] | undefined;
  const aliases = new Set([user.id]);
  if (personal) {
    const settings = rows("UserSettings", ["user_id", "email", "default_currency"], (r) => ({ userId: required(r, "user_id"), email: required(r, "email"), currency: choice(r, "default_currency", SUPPORTED_CURRENCIES) }));
    if (settings.some((item) => item.email.toLowerCase() !== user.email.toLowerCase())) throw new Error("This Personal sheet belongs to another account.");
    for (const setting of settings) { aliases.add(setting.userId); defaultCurrency = setting.currency; }
  }
  const identity = (value: string) => aliases.has(value) ? user.id : value;

  if (!personal) {
    if (!tables.Groups?.length || !tables.GroupMembers?.length) throw new Error("Missing Groups or GroupMembers data. Group access cannot be verified.");
    data.groups = rows("Groups", ["group_id", "group_name", "created_by"], (r) => ({ id: required(r, "group_id"), name: required(r, "group_name"), emoji: optional(r, "emoji") ?? "👥", description: optional(r, "description"), notes: optional(r, "notes"), currency: choice(r, "currency", SUPPORTED_CURRENCIES, "CAD"), ownerId: required(r, "created_by"), createdAt: date(r, "created_at"), updatedAt: date(r, "updated_at", optional(r, "created_at")) }));
    if (data.groups.length !== 1 || data.groups[0].id !== workspace.groupId) throw new Error("The Group sheet does not match its Drive workspace.");
    data.groupMembers = rows("GroupMembers", ["group_member_id", "group_id", "user_id", "email", "status"], (r) => {
      if (required(r, "group_id") !== workspace.groupId) throw new Error("Member belongs to another group");
      return { id: required(r, "group_member_id"), groupId: required(r, "group_id"), userId: required(r, "user_id"), name: required(r, "name"), email: optional(r, "email") ?? "", role: choice(r, "role", ["owner", "member", "viewer"] as const), status: choice(r, "status", ["active", "removed", "left"] as const), joinedAt: date(r, "joined_at"), avatarColor: "var(--color-avatar-soft)" };
    });
    const membership = data.groupMembers.find((member) => member.email.toLowerCase() === user.email.toLowerCase() && member.status === "active");
    if (!membership) throw new Error("Your account is not an approved active member of this group.");
    aliases.add(membership.userId);
    data.groups = data.groups.map((group) => ({ ...group, ownerId: identity(group.ownerId) }));
    data.groupMembers = data.groupMembers.map((member) => ({ ...member, userId: identity(member.userId) }));
    data.events = rows("Events", ["event_id", "group_id", "event_name"], (r) => {
      if (required(r, "group_id") !== workspace.groupId) throw new Error("Event belongs to another group");
      return { id: required(r, "event_id"), groupId: required(r, "group_id"), name: required(r, "event_name"), emoji: optional(r, "emoji") ?? "📅", startDate: optional(r, "start_date"), endDate: optional(r, "end_date"), baseCurrency: choice(r, "base_currency", SUPPORTED_CURRENCIES), ownerId: identity(required(r, "created_by")), createdAt: date(r, "created_at"), updatedAt: date(r, "updated_at", optional(r, "created_at")), simplifyDebts: optional(r, "simplify_debts") === undefined ? true : boolean(r, "simplify_debts") };
    });
    data.members = rows("Members", ["member_id", "event_id", "user_id"], (r) => {
      if (!data.events.some((event) => event.id === r.event_id)) throw new Error("Unknown event");
      return { id: required(r, "member_id"), eventId: required(r, "event_id"), userId: identity(required(r, "user_id")), name: required(r, "name"), email: optional(r, "email") ?? "", role: choice(r, "role", ["owner", "member", "viewer"] as const), status: choice(r, "status", ["active", "removed", "left"] as const, "active"), joinedAt: date(r, "joined_at"), avatarColor: "var(--color-avatar-soft)" };
    });
  }
  data.categories = rows("Categories", ["category_id", "name"], (r) => ({ id: required(r, "category_id"), name: required(r, "name"), emoji: optional(r, "emoji") ?? "🧾", isCustom: boolean(r, "is_custom"), createdBy: optional(r, "created_by") }));
  const splits = personal ? [] : rows<RecordSplit>("RecordSplits", ["record_id", "member_id", "owed_amount"], (r) => {
    const owedAmount = number(r, "owed_amount");
    if (owedAmount < 0) throw new Error("Negative split amount");
    return { recordId: required(r, "record_id"), memberId: identity(required(r, "member_id")), owedAmount, splitMethod: choice(r, "split_method", ["equal", "exact", "percentage", "shares"] as const, "equal"), percentage: optional(r, "percentage") ? number(r, "percentage") : undefined, shares: optional(r, "shares") ? number(r, "shares") : undefined };
  });
  data.records = rows<LedgerRecord>("Records", ["record_id", "amount_original", "currency_original", "amount_base", "base_currency", "payer_id"], (r) => {
    const id = required(r, "record_id");
    const groupId = optional(r, "group_id");
    const eventId = optional(r, "event_id");
    const payerId = identity(required(r, "payer_id"));
    const createdBy = identity(required(r, "created_by"));
    const recordType = choice(r, "record_type", ["expense", "income", "transfer"] as const, "expense");
    if (personal && (groupId || eventId || recordType === "transfer" || payerId !== user.id || createdBy !== user.id)) throw new Error("Not a personal record for this account");
    if (!personal && groupId !== workspace.groupId) throw new Error("Record belongs to another group");
    if (eventId && !data.events.some((event) => event.id === eventId)) throw new Error("Missing event");
    const baseCurrency = choice(r, "base_currency", SUPPORTED_CURRENCIES);
    const amountBase = positive(r, "amount_base");
    const recordSplits = personal
      ? [{ recordId: id, memberId: user.id, splitMethod: "equal" as const, owedAmount: amountBase }]
      : splits.filter((split) => split.recordId === id);
    if (!personal && (!recordSplits.length || new Set(recordSplits.map((split) => split.memberId)).size !== recordSplits.length || roundMoney(recordSplits.reduce((sum, split) => sum + split.owedAmount, 0), baseCurrency) !== amountBase)) throw new Error("Splits are missing, duplicated, or do not match the total");
    const exchangeRate = positive(r, "exchange_rate");
    const currencyOriginal = choice(r, "currency_original", SUPPORTED_CURRENCIES);
    const amountOriginal = positive(r, "amount_original");
    if (roundMoney(amountOriginal * exchangeRate, baseCurrency) !== amountBase) throw new Error("Saved exchange rate does not match the total");
    const reportingCurrency = optional(r, "reporting_currency") ? choice(r, "reporting_currency", SUPPORTED_CURRENCIES) : undefined;
    const reportingRate = reportingCurrency ? positive(r, "base_to_reporting_rate") : undefined;
    const amountReporting = reportingCurrency ? number(r, "amount_reporting") : undefined;
    if (reportingCurrency && roundMoney(amountBase * reportingRate!, reportingCurrency) !== amountReporting) throw new Error("Saved reporting conversion does not match the total");
    return { id, groupId, eventId, recordType, description: required(r, "description"), categoryId: required(r, "category_id"), transactionDate: date(r, "transaction_date"), payerId, createdBy, amountOriginal, currencyOriginal, exchangeRate, amountBase, baseCurrency, exchangeRateSource: choice(r, "exchange_rate_source", ["same-currency", "manual", "fixed-event", "automatic"] as const, currencyOriginal === baseCurrency ? "same-currency" : "manual"), exchangeRateDate: optional(r, "exchange_rate_date"), exchangeRateProvider: optional(r, "exchange_rate_provider"), reportingCurrency, baseToReportingRate: reportingRate, amountReporting, reportingRateSource: reportingCurrency ? choice(r, "reporting_rate_source", ["same-currency", "derived", "manual", "automatic"] as const, "manual") : undefined, reportingRateDate: optional(r, "reporting_rate_date"), reportingRateProvider: optional(r, "reporting_rate_provider"), receiptFileId: optional(r, "receipt_file_id"), notes: optional(r, "notes"), createdAt: date(r, "created_at"), updatedAt: date(r, "updated_at", optional(r, "created_at")), version: integer(r, "version", 1), syncStatus: "synced", splits: recordSplits, recurringPaymentId: personal ? optional(r, "recurring_payment_id") : undefined, recurringPaymentDate: personal ? optional(r, "recurring_payment_date") : undefined };
  });
  if (personal) {
    data.debtRecords = rows("DebtRecords", ["debt_record_id", "amount", "currency"], (r) => {
      if (identity(required(r, "created_by")) !== user.id) throw new Error("Debt belongs to another account");
      const fileIds = strings(r, "photo_file_ids");
      return { id: required(r, "debt_record_id"), direction: choice(r, "direction", ["borrowed", "lent"] as const), personName: required(r, "person_name"), name: optional(r, "name") ?? "", amount: positive(r, "amount"), currency: choice(r, "currency", SUPPORTED_CURRENCIES), date: date(r, "date"), dueDate: optional(r, "due_date"), note: optional(r, "note"), status: choice({ ...r, status: r.status === "open" ? "unpaid" : r.status === "settled" ? "paid" : r.status }, "status", ["unpaid", "paid"] as const), createdBy: user.id, createdAt: date(r, "created_at"), updatedAt: date(r, "updated_at", optional(r, "created_at")), photoFileIds: Object.fromEntries(fileIds.map((fileId) => [fileId, fileId])), photoNames: strings(r, "photo_names"), syncStatus: "synced" as const };
    });
    data.recurringPayments = rows<RecurringPayment>("RecurringPayments", ["recurring_payment_id", "start_date", "next_occurrence", "status"], (r) => {
      if (identity(required(r, "created_by")) !== user.id) throw new Error("Schedule belongs to another account");
      const payment: RecurringPayment = { id: required(r, "recurring_payment_id"), name: required(r, "name"), categoryId: required(r, "category_id"), amount: positive(r, "amount"), currency: choice(r, "currency", SUPPORTED_CURRENCIES), startDate: date(r, "start_date"), endDate: optional(r, "end_date"), frequency: choice(r, "frequency", ["day", "week", "month", "year"] as const), interval: integer(r, "interval", 1), nextOccurrence: integer(r, "next_occurrence", 0), status: choice(r, "status", ["active", "paused", "deleted"] as const), note: optional(r, "note"), createdBy: user.id, createdAt: date(r, "created_at"), updatedAt: date(r, "updated_at", optional(r, "created_at")), version: integer(r, "version", 1), syncStatus: "synced" };
      validateRecurringPayment(payment);
      return payment;
    });
  } else {
    const allocations = rows("SettlementEvents", ["settlement_id", "event_id", "allocated_amount"], (r) => ({ id: required(r, "settlement_id"), eventId: required(r, "event_id"), allocatedAmount: number(r, "allocated_amount") }));
    data.settlements = rows("Settlements", ["settlement_id", "amount", "currency"], (r) => {
      const id = required(r, "settlement_id");
      const events = allocations.filter((item) => item.id === id).map(({ eventId, allocatedAmount }) => ({ eventId, allocatedAmount }));
      if (!events.length || events.some((item) => !data.events.some((event) => event.id === item.eventId))) throw new Error("Settlement events are missing");
      return { id, fromMemberId: identity(required(r, "from_member_id")), toMemberId: identity(required(r, "to_member_id")), amount: positive(r, "amount"), currency: choice(r, "currency", SUPPORTED_CURRENCIES), date: date(r, "date"), scope: choice(r, "scope", ["current", "selected", "all"] as const), paymentMethod: optional(r, "payment_method") ?? "Other", note: optional(r, "note"), createdBy: identity(required(r, "created_by")), createdAt: date(r, "created_at"), events, syncStatus: "synced" as const };
    });
  }
  for (const item of [...data.records, ...data.recurringPayments]) {
    if (!data.categories.some((category) => category.id === item.categoryId)) data.categories.push({ id: item.categoryId, name: "Restored category", emoji: "🧾", isCustom: true });
  }
  return { workspace: { ...workspace, name: data.groups[0]?.name ?? workspace.name }, data, defaultCurrency, warnings, skippedRows };
}
