import type { CurrencyCode, LedgerRecord, RecordSplit, RecordType, SplitMethod } from "../../domain/types";

const text = (value: unknown) => value === undefined || value === null ? "" : String(value);
const optional = (value: unknown) => text(value) || undefined;
const numeric = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function recordFromSheetRows(row: unknown[], splitRows: unknown[][]): LedgerRecord | undefined {
  const id = text(row[0]);
  if (!id) return undefined;
  const splits: RecordSplit[] = splitRows.flatMap((split): RecordSplit[] => text(split[0]) !== id ? [] : [{
    recordId: id,
    memberId: text(split[1]),
    splitMethod: (optional(split[2]) ?? "equal") as SplitMethod,
    owedAmount: numeric(split[3]),
    percentage: optional(split[4]) ? numeric(split[4]) : undefined,
    shares: optional(split[5]) ? numeric(split[5]) : undefined,
  }]);
  return {
    id,
    groupId: optional(row[1]),
    eventId: optional(row[2]),
    description: text(row[3]),
    categoryId: text(row[4]),
    transactionDate: text(row[5]),
    payerId: text(row[6]),
    amountOriginal: numeric(row[7]),
    currencyOriginal: text(row[8]) as CurrencyCode,
    exchangeRate: numeric(row[9], 1),
    amountBase: numeric(row[10]),
    baseCurrency: text(row[11]) as CurrencyCode,
    receiptFileId: optional(row[12]),
    notes: optional(row[13]),
    createdBy: text(row[14]),
    createdAt: text(row[15]),
    updatedAt: text(row[16]),
    version: numeric(row[17], 1),
    recordType: (optional(row[18]) ?? "expense") as RecordType,
    exchangeRateSource: (optional(row[19]) ?? "same-currency") as LedgerRecord["exchangeRateSource"],
    exchangeRateDate: optional(row[20]),
    exchangeRateProvider: optional(row[21]),
    reportingCurrency: optional(row[22]) as CurrencyCode | undefined,
    baseToReportingRate: optional(row[23]) ? numeric(row[23]) : undefined,
    amountReporting: optional(row[24]) ? numeric(row[24]) : undefined,
    reportingRateSource: optional(row[25]) as LedgerRecord["reportingRateSource"],
    reportingRateDate: optional(row[26]),
    reportingRateProvider: optional(row[27]),
    recurringPaymentId: optional(row[28]),
    recurringPaymentDate: optional(row[29]),
    syncStatus: "synced",
    splits,
  };
}
