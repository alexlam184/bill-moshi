"use client";

import { ArrowDownRight, ArrowRightLeft, ArrowUpRight, CalendarRange, PieChart as PieChartIcon, ReceiptText, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Card, EmptyState, PageTitle, fieldClass } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/domain/calculations";
import { insightDateRange, recordInInsightDateRange, recordsForInsightScope, summarizeInsightRecords, type InsightDatePreset, type InsightLedger } from "@/lib/domain/insights";
import type { Category, CurrencyCode } from "@/lib/domain/types";

const categoryColors = ["#6EBBF1", "#2FA36B", "#E35D6A", "#F59E0B", "#8B5CF6", "#14B8A6", "#64748B", "#EC4899"];

export function InsightsScreen() {
  const { snapshot, selectedGroupId, personalContext } = useBillMoshi();
  const [ledger, setLedger] = useState<InsightLedger>(personalContext ? "myself" : "group");
  const [currency, setCurrency] = useState<CurrencyCode>("CAD");
  const [eventScope, setEventScope] = useState("all");
  const [datePreset, setDatePreset] = useState<InsightDatePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const currentGroup = snapshot.groups.find((group) => group.id === selectedGroupId);
  const groupEvents = currentGroup ? snapshot.events.filter((event) => event.groupId === currentGroup.id) : [];
  const selectedEventScope = ledger === "group" && currentGroup && groupEvents.some((event) => event.id === eventScope) ? eventScope : "all";
  const selectedEvent = groupEvents.find((event) => event.id === selectedEventScope);
  const contextRecords = recordsForInsightScope(
    snapshot.expenses,
    ledger,
    ledger === "group" ? currentGroup?.id : undefined,
    selectedEventScope === "all" ? undefined : selectedEventScope,
  );
  const dateRange = insightDateRange(datePreset, new Date(), { start: customFrom || undefined, end: customTo || undefined });
  const dateError = Boolean(dateRange.start && dateRange.end && dateRange.start > dateRange.end);
  const dateRecords = dateError ? [] : contextRecords.filter((record) => recordInInsightDateRange(record, dateRange));
  const contextCurrencies = [...new Set(contextRecords.map((record) => record.baseCurrency))];
  const availableCurrencies: CurrencyCode[] = contextCurrencies.length > 0 ? contextCurrencies : [selectedEvent?.baseCurrency ?? "CAD"];
  const selectedCurrency = availableCurrencies.includes(currency) ? currency : availableCurrencies[0];
  const records = dateRecords.filter((record) => record.baseCurrency === selectedCurrency);
  const summary = summarizeInsightRecords(dateRecords, selectedCurrency);
  const expenses = records.filter((record) => record.recordType === "expense");
  const categoryTotals = snapshot.categories
    .map((category) => ({ category, total: expenses.filter((record) => record.categoryId === category.id).reduce((sum, record) => sum + record.amountBase, 0) }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);
  const visibleEvents = ledger === "group" ? snapshot.events.filter((event) => {
    if (currentGroup && event.groupId !== currentGroup.id) return false;
    if (selectedEventScope !== "all" && event.id !== selectedEventScope) return false;
    return event.baseCurrency === selectedCurrency;
  }) : [];
  const eventTotals = visibleEvents
    .map((event) => ({ event, total: expenses.filter((record) => record.eventId === event.id).reduce((sum, record) => sum + record.amountBase, 0) }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);
  const visibleGroups = ledger === "myself" ? [] : currentGroup ? [currentGroup] : snapshot.groups;
  const dailyTotals = visibleGroups
    .map((group) => ({ group, total: expenses.filter((record) => record.groupId === group.id && !record.eventId).reduce((sum, record) => sum + record.amountBase, 0) }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);
  const eyebrow = ledger === "myself" ? "Myself" : currentGroup ? `${currentGroup.emoji} ${currentGroup.name}` : "Across groups";
  const subtitle = ledger === "myself"
    ? "Personal income and spending only—Group records are excluded."
    : currentGroup
      ? selectedEvent ? `Showing only ${selectedEvent.name}.` : "Showing daily records and every Event in this Group."
      : "Showing records across Groups; personal records are excluded.";

  return (
    <div className="grid gap-6 animate-rise">
      <PageTitle eyebrow={eyebrow} title="Insight" subtitle={subtitle} />

      <Card className="p-3 sm:p-4">
        <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="group" aria-label="Insight ledger">
          <button type="button" aria-pressed={ledger === "group"} onClick={() => { setLedger("group"); setEventScope("all"); }} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-extrabold transition ${ledger === "group" ? "bg-white text-ink shadow-sm" : "text-muted"}`}><UsersRound size={17} /> Group</button>
          <button type="button" aria-pressed={ledger === "myself"} onClick={() => { setLedger("myself"); setEventScope("all"); }} className={`flex min-h-11 items-center justify-center gap-2 rounded-lg text-sm font-extrabold transition ${ledger === "myself" ? "bg-white text-ink shadow-sm" : "text-muted"}`}><UserRound size={17} /> Myself</button>
        </div>

        <div className={`mt-3 grid gap-3 ${ledger === "group" && currentGroup ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <FilterField label="Date">
            <select aria-label="Insight date" className={`${fieldClass} min-h-11 text-sm font-bold`} value={datePreset} onChange={(event) => setDatePreset(event.target.value as InsightDatePreset)}>
              <option value="all">All time</option>
              <option value="today">Today</option>
              <option value="last7">Last 7 days</option>
              <option value="last30">Last 30 days</option>
              <option value="month">This month</option>
              <option value="year">This year</option>
              <option value="custom">Custom range</option>
            </select>
          </FilterField>
          {ledger === "group" && currentGroup && <FilterField label="Event"><select aria-label="Insight event" className={`${fieldClass} min-h-11 text-sm font-bold`} value={selectedEventScope} onChange={(event) => setEventScope(event.target.value)}><option value="all">All events + daily</option>{groupEvents.map((event) => <option key={event.id} value={event.id}>{event.emoji} {event.name}</option>)}</select></FilterField>}
          <FilterField label="Currency"><select aria-label="Insight currency" className={`${fieldClass} min-h-11 text-sm font-bold`} value={selectedCurrency} onChange={(event) => setCurrency(event.target.value as CurrencyCode)}>{availableCurrencies.map((code) => <option key={code}>{code}</option>)}</select></FilterField>
        </div>

        {datePreset === "custom" && <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2"><FilterField label="From"><input aria-label="Insight start date" type="date" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} className={`${fieldClass} min-h-11 text-sm`} /></FilterField><FilterField label="To"><input aria-label="Insight end date" type="date" value={customTo} onChange={(event) => setCustomTo(event.target.value)} className={`${fieldClass} min-h-11 text-sm`} /></FilterField>{dateError && <p className="text-xs font-bold text-danger sm:col-span-2">Start date must be on or before the end date.</p>}</div>}
        <p className="mt-3 flex items-center gap-2 text-xs text-muted"><CalendarRange size={14} />{dateRangeLabel(datePreset, dateRange.start, dateRange.end)}</p>
      </Card>

      <section aria-label="Insight summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Income" value={formatMoney(summary.income, selectedCurrency)} icon={<ArrowUpRight size={18} />} iconClass="bg-success-soft text-success" valueClass="text-success" />
        <MetricCard label="Expense" value={formatMoney(summary.expense, selectedCurrency)} icon={<ArrowDownRight size={18} />} iconClass="bg-danger-soft text-danger" valueClass="text-danger" />
        <MetricCard label="Balance" value={formatMoney(summary.balance, selectedCurrency)} icon={<ArrowRightLeft size={18} />} iconClass={summary.balance >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-danger"} valueClass={summary.balance >= 0 ? "text-success" : "text-danger"} />
        <MetricCard label="Records" value={String(summary.records)} icon={<ReceiptText size={18} />} iconClass="bg-brand-soft text-brand-dark" />
      </section>

      <section>
        <div className="mb-3"><h2 className="text-lg font-extrabold">Expense by category</h2><p className="mt-1 text-xs text-muted">Proportion of Expense only; Income and Transfers are excluded.</p></div>
        <Card className="p-5">{categoryTotals.length === 0 ? <EmptyState icon={<PieChartIcon size={24} />} title="No expense data" body={`No ${selectedCurrency} expenses match this scope and date filter.`} /> : <div className="grid items-center gap-6 md:grid-cols-[230px_1fr]"><CategoryDonut items={categoryTotals} total={summary.expense} currency={selectedCurrency} /><div className="grid gap-3">{categoryTotals.map(({ category, total }, index) => { const percentage = summary.expense ? total / summary.expense * 100 : 0; return <div key={category.id} className="flex items-center gap-3"><span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: categoryColors[index % categoryColors.length] }} /><span className="text-lg" aria-hidden="true">{category.emoji}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{category.name}</p><p className="mt-0.5 text-xs text-muted">{percentage.toFixed(percentage >= 10 ? 0 : 1)}%</p></div><p className="shrink-0 text-sm font-extrabold">{formatMoney(total, selectedCurrency)}</p></div>; })}</div></div>}</Card>
      </section>

      {dailyTotals.length > 0 && <section><h2 className="mb-3 text-lg font-extrabold">Daily expense by group</h2><Card className="divide-y divide-line overflow-hidden">{dailyTotals.map(({ group, total }) => { const count = expenses.filter((record) => record.groupId === group.id && !record.eventId).length; return <Link key={group.id} href={`/groups/${group.id}`} className="flex items-center gap-3 p-4 hover:bg-slate-50"><span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-xl">{group.emoji}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{group.name}</p><p className="mt-0.5 text-xs text-muted">No event · {expenseCountLabel(count)}</p></div><p className="text-sm font-extrabold">{formatMoney(total, selectedCurrency)}</p></Link>; })}</Card></section>}

      {eventTotals.length > 0 && <section><h2 className="mb-3 text-lg font-extrabold">Expense by event</h2><Card className="divide-y divide-line overflow-hidden">{eventTotals.map(({ event, total }) => { const group = snapshot.groups.find((item) => item.id === event.groupId); const count = expenses.filter((record) => record.eventId === event.id).length; return <Link key={event.id} href={`/events/${event.id}`} className="flex items-center gap-3 p-4 hover:bg-slate-50"><span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-xl">{event.emoji}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{event.name}</p><p className="mt-0.5 text-xs text-muted">{group?.emoji} {group?.name} · {expenseCountLabel(count)}</p></div><p className="text-sm font-extrabold">{formatMoney(total, selectedCurrency)}</p></Link>; })}</Card></section>}
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5"><span className="text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-muted">{label}</span>{children}</label>;
}

function MetricCard({ label, value, icon, iconClass, valueClass = "text-ink" }: { label: string; value: string; icon: ReactNode; iconClass: string; valueClass?: string }) {
  return <Card className="min-w-0 p-4"><span className={`grid size-9 place-items-center rounded-xl ${iconClass}`}>{icon}</span><p className="mt-4 text-xs font-bold text-muted">{label}</p><p className={`mt-1 truncate text-base font-extrabold tracking-tight sm:text-xl ${valueClass}`}>{value}</p></Card>;
}

function CategoryDonut({ items, total, currency }: { items: Array<{ category: Category; total: number }>; total: number; currency: CurrencyCode }) {
  const segments = items.map(({ category, total: categoryTotal }, index) => ({
    category,
    percentage: total ? categoryTotal / total * 100 : 0,
    offset: items.slice(0, index).reduce((sum, item) => sum + (total ? item.total / total * 100 : 0), 0),
  }));
  return <div className="relative mx-auto grid size-52 place-items-center" role="img" aria-label={`Expense category pie chart totaling ${formatMoney(total, currency)}`}><svg viewBox="0 0 160 160" className="size-full -rotate-90" aria-hidden="true"><circle cx="80" cy="80" r="56" pathLength="100" fill="none" stroke="#F1F5F9" strokeWidth="24" />{segments.map(({ category, percentage, offset }, index) => <circle key={category.id} cx="80" cy="80" r="56" pathLength="100" fill="none" stroke={categoryColors[index % categoryColors.length]} strokeWidth="24" strokeDasharray={`${percentage} ${100 - percentage}`} strokeDashoffset={-offset} />)}</svg><div className="absolute inset-0 grid place-content-center text-center"><span className="text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-muted">Expense</span><strong className="mt-1 text-lg tracking-tight text-ink">{formatMoney(total, currency)}</strong></div></div>;
}

function dateRangeLabel(preset: InsightDatePreset, start?: string, end?: string) {
  if (preset === "all") return "All available dates";
  if (preset === "today") return "Today";
  if (preset === "last7") return "Last 7 days";
  if (preset === "last30") return "Last 30 days";
  if (preset === "month") return "This month";
  if (preset === "year") return "This year";
  if (!start && !end) return "Custom range · all dates";
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  return start ? `From ${formatDate(start)}` : `Through ${formatDate(end!)}`;
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${date}T12:00:00`));
}

function expenseCountLabel(count: number) {
  return `${count} expense${count === 1 ? "" : "s"}`;
}
