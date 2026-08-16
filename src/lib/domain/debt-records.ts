import { SUPPORTED_CURRENCIES, type CurrencyCode, type DebtRecord } from "./types";

export interface DebtCurrencySummary {
  currency: CurrencyCode;
  borrowed: number;
  lent: number;
}

export const MAX_BULK_DEBT_PEOPLE = 50;
export type DebtShareMethod = "equal" | "exact" | "percentage" | "shares";

function currencyDecimals(currency: CurrencyCode) {
  return currency === "JPY" ? 0 : 2;
}

function roundCurrency(value: number, currency: CurrencyCode) {
  const factor = 10 ** currencyDecimals(currency);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function equalDebtShareValues(total: number, count: number, currency: CurrencyCode, method: DebtShareMethod): number[] {
  if (!Number.isFinite(total) || total <= 0 || count <= 0) return [];
  if (method === "equal" || method === "shares") return Array.from({ length: count }, () => 1);
  const decimals = method === "percentage" ? 2 : currencyDecimals(currency);
  const factor = 10 ** decimals;
  const totalUnits = Math.round((method === "percentage" ? 100 : total) * factor);
  const baseUnits = Math.floor(totalUnits / count);
  const remainder = totalUnits - (baseUnits * count);

  return Array.from({ length: count }, (_, index) => (baseUnits + (index < remainder ? 1 : 0)) / factor);
}

export function calculateDebtShareAmounts(
  total: number,
  currency: CurrencyCode,
  method: DebtShareMethod,
  values: number[],
): number[] {
  if (!Number.isFinite(total) || total <= 0) throw new Error("Enter an amount greater than zero.");
  if (values.length === 0) throw new Error("Enter at least one person's name.");
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error("Each person's share must be greater than zero.");

  if (method === "equal" || method === "shares") {
    const weights = method === "equal" ? values.map(() => 1) : values;
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    const factor = 10 ** currencyDecimals(currency);
    const totalUnits = Math.round(total * factor);
    const rawUnits = weights.map((weight) => totalUnits * weight / totalWeight);
    const amountUnits = rawUnits.map(Math.floor);
    const remainingUnits = totalUnits - amountUnits.reduce((sum, value) => sum + value, 0);
    const remainderOrder = rawUnits
      .map((raw, index) => ({ index, remainder: raw - Math.floor(raw) }))
      .toSorted((a, b) => b.remainder - a.remainder || a.index - b.index);
    for (let index = 0; index < remainingUnits; index += 1) amountUnits[remainderOrder[index].index] += 1;
    const amounts = amountUnits.map((value) => value / factor);
    if (amounts.some((value) => value <= 0)) throw new Error("The total is too small to give every person a positive share.");
    return amounts;
  }

  const expectedTotal = method === "percentage" ? 100 : roundCurrency(total, currency);
  const enteredTotal = method === "percentage"
    ? Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100
    : roundCurrency(values.reduce((sum, value) => sum + value, 0), currency);
  if (enteredTotal !== expectedTotal) {
    throw new Error(method === "percentage"
      ? `Shares must total 100% (currently ${enteredTotal}%).`
      : `Shares must total ${expectedTotal.toFixed(currencyDecimals(currency))} ${currency} (currently ${enteredTotal.toFixed(currencyDecimals(currency))} ${currency}).`);
  }

  if (method === "exact") return values.map((value) => roundCurrency(value, currency));

  const amounts = values.map((percentage) => roundCurrency(total * percentage / 100, currency));
  const roundingDifference = roundCurrency(total - amounts.reduce((sum, value) => sum + value, 0), currency);
  amounts[amounts.length - 1] = roundCurrency(amounts[amounts.length - 1] + roundingDifference, currency);
  if (amounts.some((value) => value <= 0)) throw new Error("Each percentage must produce an amount greater than zero.");
  return amounts;
}

export function parseDebtPersonNames(value: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const part of value.split(/[\r\n,\uff0c\u3001]+/u)) {
    const name = part.trim();
    if (!name) continue;

    const comparisonKey = name.normalize("NFKC").toLocaleLowerCase();
    if (seen.has(comparisonKey)) continue;

    seen.add(comparisonKey);
    names.push(name);
  }

  return names;
}

export function summarizeUnpaidDebtRecords(records: DebtRecord[]): DebtCurrencySummary[] {
  const totals = new Map<CurrencyCode, DebtCurrencySummary>();

  for (const record of records) {
    if (record.status !== "unpaid") continue;
    const current = totals.get(record.currency) ?? { currency: record.currency, borrowed: 0, lent: 0 };
    current[record.direction] += record.amount;
    totals.set(record.currency, current);
  }

  return SUPPORTED_CURRENCIES.flatMap((currency) => {
    const summary = totals.get(currency);
    return summary && (summary.borrowed > 0 || summary.lent > 0) ? [summary] : [];
  });
}
