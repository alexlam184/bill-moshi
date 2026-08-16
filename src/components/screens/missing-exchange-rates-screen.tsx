"use client";

import { ArrowLeft, CheckCircle2, Clock3, Save } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Button, Card, EmptyState, PageTitle } from "@/components/ui/primitives";
import { formatMoney, recordsMissingReportingRate } from "@/lib/domain/calculations";

export function MissingExchangeRatesScreen() {
  const { snapshot, setExpenseReportingRate } = useBillMoshi();
  const reportingCurrency = snapshot.currentUser.defaultCurrency;
  const missing = recordsMissingReportingRate(snapshot.expenses, reportingCurrency)
    .toSorted((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function save(event: FormEvent, expenseId: string) {
    event.preventDefault();
    try {
      setExpenseReportingRate(expenseId, Number(values[expenseId]));
      setErrors((current) => ({ ...current, [expenseId]: "" }));
    } catch (caught) {
      setErrors((current) => ({ ...current, [expenseId]: caught instanceof Error ? caught.message : "Could not save the rate." }));
    }
  }

  return <div className="grid gap-6 animate-rise">
    <Link href="/" className="flex w-fit items-center gap-2 text-sm font-bold text-muted"><ArrowLeft size={17} /> All groups</Link>
    <PageTitle eyebrow="Currency reporting" title="Missing exchange rates" subtitle={`Add a saved reporting rate so older records can be included in your ${reportingCurrency} All Groups balance.`} />
    <Card className="flex items-start gap-3 border-warning/20 bg-warning-soft p-5"><Clock3 size={21} className="mt-0.5 shrink-0 text-warning" /><div><p className="text-sm font-extrabold">Historical records only</p><p className="mt-1 text-xs leading-5 text-muted">Enter how much 1 unit of the record’s base currency was worth in {reportingCurrency}. This changes only All Groups reporting and never rewrites the original amount, splits, or Group/Event balance.</p></div></Card>

    {missing.length === 0 ? <Card><EmptyState icon={<CheckCircle2 size={24} />} title="All records are covered" body={`Every record can be included in your ${reportingCurrency} All Groups balance.`} /></Card> : <div className="grid gap-3">{missing.map((expense) => {
      const group = snapshot.groups.find((item) => item.id === expense.groupId);
      const billEvent = snapshot.events.find((item) => item.id === expense.eventId);
      const context = !expense.groupId ? "Myself" : billEvent ? `${group?.name ?? "Group"} · ${billEvent.name}` : `${group?.name ?? "Group"} · Daily`;
      return <Card key={expense.id} className="p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/expenses/${expense.id}`} className="truncate text-sm font-extrabold hover:text-brand-dark">{expense.description}</Link><p className="mt-1 truncate text-xs text-muted">{context} · {formatRateRecordDate(expense.transactionDate)}</p></div><p className="shrink-0 text-sm font-extrabold">{formatMoney(expense.amountBase, expense.baseCurrency)}</p></div><form onSubmit={(event) => save(event, expense.id)} className="mt-4 grid gap-2"><label className="text-xs font-bold text-muted" htmlFor={`rate-${expense.id}`}>1 {expense.baseCurrency} equals</label><div className="grid grid-cols-[1fr_auto_auto] gap-2"><input id={`rate-${expense.id}`} aria-label={`Manual ${expense.baseCurrency} to ${reportingCurrency} rate for ${expense.description}`} inputMode="decimal" value={values[expense.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [expense.id]: event.target.value }))} placeholder="0.00" className="min-w-0 rounded-xl border border-line bg-white px-3.5 text-right text-sm font-extrabold outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" /><span className="grid min-h-11 place-items-center rounded-xl bg-slate-50 px-3 text-xs font-extrabold text-muted">{reportingCurrency}</span><Button type="submit" className="px-3" aria-label={`Save manual rate for ${expense.description}`}><Save size={16} /></Button></div>{Number(values[expense.id]) > 0 && <p className="text-right text-xs font-bold text-success">{formatMoney(expense.amountBase, expense.baseCurrency)} → {formatMoney(expense.amountBase * Number(values[expense.id]), reportingCurrency)}</p>}{errors[expense.id] && <p role="alert" className="text-xs font-bold text-danger">{errors[expense.id]}</p>}</form></Card>;
    })}</div>}
  </div>;
}

function formatRateRecordDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
