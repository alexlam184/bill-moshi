"use client";

import { ArrowRightLeft, CalendarDays, ChevronLeft, ChevronRight, TrendingDown, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Card, EmptyState } from "@/components/ui/primitives";
import { buildMonthGrid, calendarDayTotals, calendarMonthTotals, recordsForCalendarScope, transactionDateKey } from "@/lib/domain/calendar";
import { formatMoney } from "@/lib/domain/calculations";
import { SUPPORTED_CURRENCIES, type CurrencyCode, type LedgerRecord } from "@/lib/domain/types";
import { useQueryState } from "@/lib/hooks/use-query-state";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localTodayKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

export function CalendarScreen({ groupId }: { groupId?: string }) {
  const { snapshot, hydrated, selectedGroupId, personalContext, selectGroup } = useBillMoshi();
  const group = groupId ? snapshot.groups.find((item) => item.id === groupId) : undefined;
  const today = new Date();
  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [monthKey, setMonthKey] = useQueryState<string>("month", currentMonthKey);
  const [selectedDateQuery, setSelectedDate] = useQueryState<string>("date", localTodayKey());
  const [currency, setCurrency] = useQueryState<CurrencyCode>("currency", "CAD", SUPPORTED_CURRENCIES);
  const validMonthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey) ? monthKey : currentMonthKey;
  const [monthYear, monthNumber] = validMonthKey.split("-").map(Number);
  const month = new Date(monthYear, monthNumber - 1, 1);
  const selectedDate = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(selectedDateQuery) ? selectedDateQuery : localTodayKey();

  useEffect(() => {
    if (!groupId && (selectedGroupId || personalContext)) selectGroup(undefined);
  }, [groupId, personalContext, selectGroup, selectedGroupId]);

  if (!hydrated) return <div className="min-h-dvh animate-pulse bg-slate-50" />;
  if (groupId && !group) notFound();

  const records = recordsForCalendarScope(snapshot.records, groupId);
  const monthGrid = buildMonthGrid(month.getFullYear(), month.getMonth());
  const dayTotals = calendarDayTotals(records, currency);
  const monthTotals = calendarMonthTotals(records, month.getFullYear(), month.getMonth(), currency);
  const selectedRecords = records
    .filter((record) => record.currencyOriginal === currency && transactionDateKey(record.transactionDate) === selectedDate)
    .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  const monthLabel = new Intl.DateTimeFormat("en-CA", { month: "long", year: "numeric" }).format(month);
  const selectedDateLabel = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${selectedDate}T12:00:00`));
  const closeHref = group ? `/groups/${group.id}` : "/";
  const net = monthTotals.income - monthTotals.expense;

  function moveMonth(offset: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    const prefix = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-`;
    const firstRecordDate = records
      .filter((record) => record.currencyOriginal === currency && transactionDateKey(record.transactionDate).startsWith(prefix))
      .map((record) => transactionDateKey(record.transactionDate))
      .sort()[0];
    setMonthKey(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
    setSelectedDate(firstRecordDate ?? `${prefix}01`);
  }

  function selectDay(date: string) {
    const selected = new Date(`${date}T12:00:00`);
    if (selected.getMonth() !== month.getMonth() || selected.getFullYear() !== month.getFullYear()) {
      setMonthKey(`${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, "0")}`);
    }
    setSelectedDate(date);
  }

  return (
    <div className="min-h-dvh bg-white md:min-h-0 md:overflow-hidden md:rounded-[1.5rem] md:border md:border-line md:card-shadow">
      <header className="safe-top-header grid grid-cols-[44px_minmax(0,1fr)_76px] items-center gap-1 border-b border-line px-2 sm:min-h-20 sm:grid-cols-[48px_1fr_100px] sm:gap-2 sm:px-5">
        <Link href={closeHref} aria-label="Close calendar" className="grid size-11 place-items-center rounded-xl text-muted transition hover:bg-slate-100 hover:text-ink"><X size={22} /></Link>
        <div className="flex min-w-0 items-center justify-center gap-0 sm:gap-3">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month" className="grid size-11 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-slate-100 hover:text-ink"><ChevronLeft size={20} /></button>
          <h1 className="min-w-0 whitespace-nowrap text-center text-base font-extrabold tracking-tight text-ink sm:min-w-32 sm:text-2xl">{monthLabel}</h1>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Next month" className="grid size-11 shrink-0 place-items-center rounded-xl text-muted transition hover:bg-slate-100 hover:text-ink"><ChevronRight size={20} /></button>
        </div>
        <select aria-label="Calendar currency" name="calendar-currency" autoComplete="off" value={currency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)} className="min-h-11 w-full rounded-xl border border-line bg-slate-50 px-1.5 text-xs font-extrabold text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft sm:px-2 sm:text-sm">
          {SUPPORTED_CURRENCIES.map((code) => <option key={code}>{code}</option>)}
        </select>
      </header>

      <div className="flex min-w-0 items-center gap-2 border-b border-line bg-brand-soft/40 px-3 py-3 text-[0.68rem] font-bold text-brand-dark sm:px-6 sm:text-xs">
        <CalendarDays size={16} />
        <span className="min-w-0 truncate">{group ? `${group.emoji} ${group.name}` : "All groups + Myself"}</span>
        <span className="ml-auto hidden shrink-0 text-muted min-[360px]:inline">Tap a day for records</span>
      </div>

      <section aria-label={`${monthLabel} calendar`}>
        <div className="grid grid-cols-7 border-b border-line bg-slate-50/80">
          {weekdays.map((day, index) => <div key={day} className={`py-2.5 text-center text-[0.65rem] font-extrabold uppercase tracking-wide sm:text-xs ${index === 0 ? "text-danger" : index === 6 ? "text-success" : "text-muted"}`}>{day}</div>)}
        </div>
        <div className="grid grid-cols-7 bg-line/80 gap-px">
          {monthGrid.map((day, index) => {
            const totals = dayTotals.get(day.date);
            const selected = selectedDate === day.date;
            const hasExpense = Boolean(totals?.expense);
            const hasIncome = Boolean(totals?.income);
            const hasTransfer = Boolean(totals?.transfer);
            const tone = hasExpense && hasIncome ? "bg-brand-soft/75" : hasExpense ? "bg-danger-soft/55" : hasIncome ? "bg-success-soft/60" : "bg-white";
            const dayName = new Intl.DateTimeFormat("en-CA", { month: "long", day: "numeric", year: "numeric" }).format(new Date(`${day.date}T12:00:00`));
            const summary = [
              hasIncome ? `${formatMoney(totals!.income, currency)} income` : "",
              hasExpense ? `${formatMoney(totals!.expense, currency)} expense` : "",
              hasTransfer ? `${formatMoney(totals!.transfer, currency)} transfer` : "",
            ].filter(Boolean).join(", ");
            return (
              <button
                type="button"
                key={day.date}
                onClick={() => selectDay(day.date)}
                aria-label={`${dayName}${summary ? `, ${summary}` : ", no records"}`}
                aria-pressed={selected}
                className={`relative min-h-[4.7rem] overflow-hidden p-1.5 text-left transition sm:min-h-24 sm:p-2.5 ${tone} ${day.inCurrentMonth ? "" : "opacity-35"} ${selected ? "z-10 ring-2 ring-inset ring-brand" : "hover:brightness-[0.98]"}`}
              >
                <span className={`text-xs font-extrabold sm:text-base ${index % 7 === 0 ? "text-danger" : index % 7 === 6 ? "text-success" : "text-ink"}`}>{String(day.dayNumber).padStart(2, "0")}</span>
                <span className="mt-1 grid justify-items-end gap-0.5 text-[0.55rem] font-extrabold leading-tight sm:mt-2 sm:text-xs">
                  {hasIncome && <span className="max-w-full truncate text-success">+{compactAmount(totals!.income, currency)}</span>}
                  {hasExpense && <span className="max-w-full truncate text-danger">−{compactAmount(totals!.expense, currency)}</span>}
                  {hasTransfer && <span className="max-w-full truncate text-brand-dark">↔{compactAmount(totals!.transfer, currency)}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-2 border-y border-line bg-slate-50/70 p-3 sm:gap-3 sm:p-5" aria-label="Monthly totals">
        <MonthlyTotal label="Expense" value={monthTotals.expense} currency={currency} tone="danger" icon={<TrendingDown size={16} />} />
        <MonthlyTotal label="Income" value={monthTotals.income} currency={currency} tone="success" icon={<TrendingUp size={16} />} />
        <MonthlyTotal label="Net" value={net} currency={currency} tone={net >= 0 ? "success" : "danger"} icon={<ArrowRightLeft size={16} />} signed />
        {monthTotals.transfer > 0 && <p className="col-span-3 px-1 text-[0.65rem] text-muted">Transfers: {formatMoney(monthTotals.transfer, currency)} · shown on the calendar but excluded from monthly net.</p>}
      </section>

      <section className="p-4 sm:p-6">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div><p className="text-xs font-extrabold uppercase tracking-[0.13em] text-brand-dark">Selected day</p><h2 className="mt-1 text-lg font-extrabold tracking-tight">{selectedDateLabel}</h2></div>
          <span className="shrink-0 text-xs font-bold text-muted">{selectedRecords.length} {selectedRecords.length === 1 ? "record" : "records"}</span>
        </div>
        {selectedRecords.length === 0 ? <Card><EmptyState icon={<CalendarDays size={24} />} title="No records this day" body={`There are no ${currency} expenses, income, or transfers in this calendar scope.`} /></Card> : <Card className="divide-y divide-line overflow-hidden">{selectedRecords.map((record) => <CalendarRecordRow key={record.id} record={record} snapshot={snapshot} />)}</Card>}
      </section>
    </div>
  );
}

function MonthlyTotal({ label, value, currency, tone, icon, signed = false }: { label: string; value: number; currency: CurrencyCode; tone: "success" | "danger"; icon: ReactNode; signed?: boolean }) {
  return <div className="min-w-0 rounded-xl border border-line bg-white p-2.5 sm:p-4"><p className={`flex items-center gap-1 text-[0.62rem] font-extrabold uppercase tracking-wide sm:text-xs ${tone === "success" ? "text-success" : "text-danger"}`}>{icon}<span className="truncate">{label}</span></p><p className="mt-2 truncate text-xs font-extrabold text-ink sm:text-lg">{formatMoney(signed ? value : Math.abs(value), currency)}</p></div>;
}

function CalendarRecordRow({ record, snapshot }: { record: LedgerRecord; snapshot: ReturnType<typeof useBillMoshi>["snapshot"] }) {
  const category = snapshot.categories.find((item) => item.id === record.categoryId);
  const group = snapshot.groups.find((item) => item.id === record.groupId);
  const event = snapshot.events.find((item) => item.id === record.eventId);
  const context = !record.groupId ? "Myself · Personal" : event ? `${group?.name ?? "Group"} · ${event.name}` : `${group?.name ?? "Group"} · Daily`;
  const tone = record.recordType === "expense" ? "text-danger" : record.recordType === "income" ? "text-success" : "text-brand-dark";
  const iconTone = record.recordType === "expense" ? "bg-danger-soft" : record.recordType === "income" ? "bg-success-soft" : "bg-brand-soft";
  return <Link href={`/records/${record.id}`} className="virtual-list-item flex min-h-16 items-center gap-3 px-4 py-3 transition hover:bg-slate-50"><span className={`grid size-10 shrink-0 place-items-center rounded-xl text-lg ${iconTone}`}>{category?.emoji ?? (record.recordType === "transfer" ? "↔️" : "🧾")}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold">{record.description}</p><p className="mt-0.5 truncate text-xs text-muted">{context}</p></div><div className="shrink-0 text-right"><p className={`text-sm font-extrabold ${tone}`}>{record.recordType === "income" ? "+" : record.recordType === "expense" ? "−" : ""}{formatMoney(record.amountOriginal, record.currencyOriginal)}</p><p className="mt-0.5 text-[0.62rem] font-bold capitalize text-muted">{record.recordType}</p></div><ChevronRight size={16} className="shrink-0 text-slate-300" /></Link>;
}

function compactAmount(value: number, currency: CurrencyCode) {
  return new Intl.NumberFormat("en-CA", { notation: "compact", maximumFractionDigits: currency === "JPY" ? 0 : 1 }).format(value);
}
