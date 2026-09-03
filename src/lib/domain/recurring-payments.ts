import { roundMoney } from "./calculations";
import type { ExchangeRateQuote } from "./exchange-rates";
import { SUPPORTED_CURRENCIES, type LedgerRecord, type RecurringPayment, type RecurringPaymentInput, type User } from "./types";

// Date-only schedules use calendar arithmetic, not 24-hour durations (DST).
export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a valid payment date.");
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Choose a valid payment date.");
  return date;
}

export function validateRecurringPayment(input: RecurringPaymentInput) {
  if (!input.name.trim()) throw new Error("Enter a payment name.");
  if (!input.categoryId || ["transfer", "income"].includes(input.categoryId)) throw new Error("Choose an expense category.");
  if (!SUPPORTED_CURRENCIES.includes(input.currency)) throw new Error("Choose a supported currency.");
  if (!Number.isFinite(input.amount) || input.amount <= 0 || roundMoney(input.amount, input.currency) !== input.amount) throw new Error(input.currency === "JPY" ? "Enter a positive whole-yen amount." : "Enter a positive amount with up to two decimal places.");
  if (!["day", "week", "month", "year"].includes(input.frequency) || !Number.isInteger(input.interval) || input.interval < 1 || input.interval > 365) throw new Error("Repeat interval must be between 1 and 365.");
  parseDate(input.startDate);
  if (input.endDate) {
    parseDate(input.endDate);
    if (input.endDate < input.startDate) throw new Error("End date cannot be before the first payment.");
  }
}

export function occurrenceDate(payment: Pick<RecurringPayment, "startDate" | "frequency" | "interval">, index: number) {
  const date = parseDate(payment.startDate);
  const day = date.getUTCDate();
  const offset = payment.interval * index;
  if (payment.frequency === "day" || payment.frequency === "week") {
    date.setUTCDate(day + offset * (payment.frequency === "week" ? 7 : 1));
  } else {
    const month = date.getUTCMonth() + offset * (payment.frequency === "year" ? 12 : 1);
    date.setUTCDate(1);
    date.setUTCMonth(month);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
  }
  return date.toISOString().slice(0, 10);
}

export function nextPaymentDate(payment: RecurringPayment): string | undefined {
  if (payment.status === "deleted") return undefined;
  const date = occurrenceDate(payment, payment.nextOccurrence);
  return payment.endDate && date > payment.endDate ? undefined : date;
}

export function duePaymentDates(payment: RecurringPayment, today = localDateKey(), limit = 90) {
  if (payment.status !== "active") return [];
  const dates: string[] = [];
  for (let index = payment.nextOccurrence; dates.length < limit; index++) {
    const date = occurrenceDate(payment, index);
    if (date > today || (payment.endDate && date > payment.endDate)) break;
    dates.push(date);
  }
  return dates;
}

export function resumeRecurringPayment(payment: RecurringPayment, today = localDateKey()): RecurringPayment {
  let nextOccurrence = payment.nextOccurrence;
  while (occurrenceDate(payment, nextOccurrence) < today) nextOccurrence++;
  return { ...payment, nextOccurrence, status: "active" };
}

export function recurringLabel(payment: Pick<RecurringPayment, "frequency" | "interval">) {
  if (payment.interval === 1) return { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" }[payment.frequency];
  return `Every ${payment.interval} ${payment.frequency}s`;
}

export function createRecurringRecord(payment: RecurringPayment, date: string, user: User, now: Date, quote?: ExchangeRateQuote): LedgerRecord {
  const converted = payment.currency !== user.defaultCurrency;
  const validQuote = quote && quote.fromCurrency === payment.currency && quote.toCurrency === user.defaultCurrency && Number.isFinite(quote.rate) && quote.rate > 0 ? quote : undefined;
  // If offline, retain the real original amount. The existing missing-rates
  // workflow can supply conversion later; never invent a foreign-currency rate.
  const baseCurrency = converted && !validQuote ? payment.currency : user.defaultCurrency;
  const exchangeRate = converted && validQuote ? validQuote.rate : 1;
  const amountBase = roundMoney(payment.amount * exchangeRate, baseCurrency);
  const id = `recurring-record-${payment.id}-${date}`;
  const timestamp = now.toISOString();
  const transactionDate = new Date(`${date}T00:00:00`).toISOString();
  return {
    id, recurringPaymentId: payment.id, recurringPaymentDate: date,
    recordType: "expense", description: payment.name, categoryId: payment.categoryId,
    transactionDate, payerId: user.id, amountOriginal: payment.amount, currencyOriginal: payment.currency,
    exchangeRate, amountBase, baseCurrency,
    exchangeRateSource: converted && validQuote ? "automatic" : "same-currency",
    exchangeRateDate: validQuote?.effectiveAt ?? date,
    exchangeRateProvider: validQuote?.provider,
    ...(baseCurrency === user.defaultCurrency ? { reportingCurrency: user.defaultCurrency, baseToReportingRate: 1, amountReporting: amountBase, reportingRateSource: "same-currency" as const } : {}),
    notes: payment.note, createdBy: user.id, createdAt: timestamp, updatedAt: timestamp,
    version: 1, syncStatus: "pending",
    splits: [{ recordId: id, memberId: user.id, splitMethod: "equal", owedAmount: amountBase }],
  };
}
