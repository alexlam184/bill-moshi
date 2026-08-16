import type { CurrencyCode, Expense } from "./types";

export interface CalendarDay {
  date: string;
  dayNumber: number;
  inCurrentMonth: boolean;
}

export interface CalendarRecordTotals {
  expense: number;
  income: number;
  transfer: number;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function transactionDateKey(transactionDate: string) {
  return transactionDate.slice(0, 10);
}

export function buildMonthGrid(year: number, monthIndex: number): CalendarDay[] {
  const firstDay = new Date(year, monthIndex, 1);
  const gridStart = new Date(year, monthIndex, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return {
      date: dateKey(date),
      dayNumber: date.getDate(),
      inCurrentMonth: date.getMonth() === monthIndex && date.getFullYear() === year,
    };
  });
}

export function recordsForCalendarScope(records: Expense[], groupId?: string) {
  return groupId ? records.filter((record) => record.groupId === groupId) : records;
}

export function calendarDayTotals(records: Expense[], currency: CurrencyCode) {
  const totals = new Map<string, CalendarRecordTotals>();

  for (const record of records) {
    if (record.currencyOriginal !== currency) continue;
    const day = transactionDateKey(record.transactionDate);
    const current = totals.get(day) ?? { expense: 0, income: 0, transfer: 0 };
    current[record.recordType] += record.amountOriginal;
    totals.set(day, current);
  }

  return totals;
}

export function calendarMonthTotals(records: Expense[], year: number, monthIndex: number, currency: CurrencyCode) {
  const prefix = `${year}-${String(monthIndex + 1).padStart(2, "0")}-`;
  const monthRecords = records.filter((record) => transactionDateKey(record.transactionDate).startsWith(prefix));
  const byDay = calendarDayTotals(monthRecords, currency);

  return [...byDay.values()].reduce<CalendarRecordTotals>((total, day) => ({
    expense: total.expense + day.expense,
    income: total.income + day.income,
    transfer: total.transfer + day.transfer,
  }), { expense: 0, income: 0, transfer: 0 });
}
