"use client";

import { ArrowLeft, BarChart3 } from "lucide-react";
import Link from "next/link";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Card, EmptyState, PageTitle } from "@/components/ui/primitives";
import { formatMoney, totalEventSpending } from "@/lib/domain/calculations";

export function StatisticsScreen({ eventId }: { eventId: string }) {
  const { snapshot } = useBillMoshi();
  const event = snapshot.events.find((item) => item.id === eventId);
  if (!event) return <p>Event not found.</p>;
  const expenses = snapshot.expenses.filter((expense) => expense.recordType === "expense" && expense.eventId === eventId);
  const total = totalEventSpending(eventId, snapshot.expenses);
  const categoryTotals = snapshot.categories.map((category) => ({ category, total: expenses.filter((expense) => expense.categoryId === category.id).reduce((sum, expense) => sum + expense.amountBase, 0) })).filter((item) => item.total > 0).sort((a, b) => b.total - a.total);
  const dates = expenses.map((expense) => expense.transactionDate.slice(0, 10));
  const activeDays = new Set(dates).size;
  return <div className="grid gap-6"><Link href={`/events/${eventId}`} className="flex w-fit items-center gap-2 text-sm font-bold text-muted"><ArrowLeft size={17} /> {event.name}</Link><PageTitle eyebrow="Event report" title="Statistics" subtitle="A quick breakdown of spending in this event." /><div className="grid grid-cols-2 gap-3"><Card className="p-4"><p className="text-xs font-bold text-muted">Total spending</p><p className="mt-1.5 text-xl font-extrabold">{formatMoney(total, event.baseCurrency)}</p></Card><Card className="p-4"><p className="text-xs font-bold text-muted">Daily average</p><p className="mt-1.5 text-xl font-extrabold">{formatMoney(activeDays ? total / activeDays : 0, event.baseCurrency)}</p></Card></div><section><h2 className="mb-3 text-lg font-extrabold">By category</h2><Card className="p-5">{categoryTotals.length === 0 ? <EmptyState icon={<BarChart3 size={24} />} title="No data yet" body="Add expenses to see a category breakdown." /> : <div className="grid gap-5">{categoryTotals.map(({ category, total: categoryTotal }) => { const percentage = total ? Math.round(categoryTotal / total * 100) : 0; return <div key={category.id}><div className="mb-2 flex items-center gap-2"><span>{category.emoji}</span><span className="flex-1 text-sm font-bold">{category.name}</span><span className="text-sm font-extrabold">{formatMoney(categoryTotal, event.baseCurrency)}</span><span className="w-9 text-right text-xs text-muted">{percentage}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${percentage}%` }} /></div></div>; })}</div>}</Card></section></div>;
}
