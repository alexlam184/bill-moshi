import type { LedgerRecord } from "./types";

// Local-only fields are excluded because Google Sheets never stores them.
// Sorting splits makes the fingerprint stable when sheet row order changes.
export function recordSyncFingerprint(record: LedgerRecord) {
  return JSON.stringify({
    id: record.id,
    groupId: record.groupId ?? "",
    eventId: record.eventId ?? "",
    recordType: record.recordType,
    description: record.description,
    categoryId: record.categoryId,
    transactionDate: record.transactionDate,
    payerId: record.payerId,
    amountOriginal: record.amountOriginal,
    currencyOriginal: record.currencyOriginal,
    exchangeRate: record.exchangeRate,
    amountBase: record.amountBase,
    baseCurrency: record.baseCurrency,
    receiptFileId: record.receiptFileId ?? "",
    notes: record.notes ?? "",
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    version: record.version,
    exchangeRateSource: record.exchangeRateSource,
    exchangeRateDate: record.exchangeRateDate ?? "",
    exchangeRateProvider: record.exchangeRateProvider ?? "",
    reportingCurrency: record.reportingCurrency ?? "",
    baseToReportingRate: record.baseToReportingRate ?? "",
    amountReporting: record.amountReporting ?? "",
    reportingRateSource: record.reportingRateSource ?? "",
    reportingRateDate: record.reportingRateDate ?? "",
    reportingRateProvider: record.reportingRateProvider ?? "",
    recurringPaymentId: record.recurringPaymentId ?? "",
    recurringPaymentDate: record.recurringPaymentDate ?? "",
    splits: record.splits.toSorted((left, right) => left.memberId.localeCompare(right.memberId)).map((split) => ({
      memberId: split.memberId,
      splitMethod: split.splitMethod,
      owedAmount: split.owedAmount,
      percentage: split.percentage ?? "",
      shares: split.shares ?? "",
    })),
  });
}

