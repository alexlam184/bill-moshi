import type { CurrencyCode, LedgerRecord } from "./types";
import { dateFilterRange, dateInRange, type DateFilterPreset, type DateFilterRange } from "./date-filter";

export type InsightLedger = "group" | "myself";
export type InsightDatePreset = DateFilterPreset;
export type InsightDateRange = DateFilterRange;

export interface InsightSummary {
  expense: number;
  income: number;
  balance: number;
  records: number;
}

export const insightDateRange = dateFilterRange;

export function recordInInsightDateRange(record: LedgerRecord, range: InsightDateRange) {
  return dateInRange(record.transactionDate, range);
}

export function recordsForInsightScope(records: LedgerRecord[], ledger: InsightLedger, groupId?: string, eventId?: string) {
  if (ledger === "myself") return records.filter((record) => !record.groupId && !record.eventId);
  return records.filter((record) => {
    if (!record.groupId) return false;
    if (groupId && record.groupId !== groupId) return false;
    if (eventId && record.eventId !== eventId) return false;
    return true;
  });
}

export function summarizeInsightRecords(records: LedgerRecord[], currency: CurrencyCode): InsightSummary {
  return records
    .filter((record) => record.baseCurrency === currency)
    .reduce<InsightSummary>((summary, record) => {
      summary.records += 1;
      if (record.recordType === "expense") summary.expense += record.amountBase;
      if (record.recordType === "income") summary.income += record.amountBase;
      summary.balance = summary.income - summary.expense;
      return summary;
    }, { expense: 0, income: 0, balance: 0, records: 0 });
}
