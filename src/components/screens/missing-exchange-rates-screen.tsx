"use client";

import { ArrowLeft, CheckCircle2, Clock3, Save } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useBillMoshi } from "@/components/providers/app-provider";
import { Button, Card, EmptyState, PageTitle } from "@/components/ui/primitives";
import { formatMoney, recordsMissingReportingRate } from "@/lib/domain/calculations";

export function MissingExchangeRatesScreen() {
  const { snapshot, setRecordReportingRate } = useBillMoshi();
  const reportingCurrency = snapshot.currentUser.defaultCurrency;
  const missing = recordsMissingReportingRate(snapshot.records, reportingCurrency)
    .toSorted((a, b) => b.transactionDate.localeCompare(a.transactionDate));
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  function save(event: FormEvent, recordId: string) {
    event.preventDefault();
    try {
      setRecordReportingRate(recordId, Number(values[recordId]));
      setErrors((current) => ({ ...current, [recordId]: "" }));
    } catch (caught) {
      setErrors((current) => ({ ...current, [recordId]: caught instanceof Error ? caught.message : "Could not save the rate." }));
    }
  }

  return <div className="grid gap-6">
    <Link href="/" className="flex w-fit items-center gap-2 text-sm font-bold text-muted"><ArrowLeft size={17} /> All groups</Link>
    <PageTitle eyebrow="Currency reporting" title="Missing exchange rates" subtitle={`Add a saved reporting rate so older records can be included in your ${reportingCurrency} All Groups balance.`} />
    <Card className="flex items-start gap-3 border-warning/20 bg-warning-soft p-5"><Clock3 size={21} className="mt-0.5 shrink-0 text-warning" /><div><p className="text-sm font-extrabold">Historical records only</p><p className="mt-1 text-xs leading-5 text-muted">Enter how much 1 unit of the record’s base currency was worth in {reportingCurrency}. This changes only All Groups reporting and never rewrites the original amount, splits, or Group/Event balance.</p></div></Card>

    {missing.length === 0 ? <Card><EmptyState icon={<CheckCircle2 size={24} />} title="All records are covered" body={`Every record can be included in your ${reportingCurrency} All Groups balance.`} /></Card> : <div className="grid gap-3">{missing.map((record) => {
      const group = snapshot.groups.find((item) => item.id === record.groupId);
      const billEvent = snapshot.events.find((item) => item.id === record.eventId);
      const context = !record.groupId ? "Myself" : billEvent ? `${group?.name ?? "Group"} · ${billEvent.name}` : `${group?.name ?? "Group"} · Daily`;
      return <Card key={record.id} className="virtual-list-item p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><Link href={`/records/${record.id}`} className="truncate text-sm font-extrabold hover:text-brand-dark">{record.description}</Link><p className="mt-1 truncate text-xs text-muted">{context} · {formatRateRecordDate(record.transactionDate)}</p></div><p className="shrink-0 text-sm font-extrabold">{formatMoney(record.amountBase, record.baseCurrency)}</p></div><form onSubmit={(event) => save(event, record.id)} className="mt-4 grid gap-2" noValidate><label className="text-xs font-bold text-muted" htmlFor={`rate-${record.id}`}>1 {record.baseCurrency} equals</label><div className="grid grid-cols-[1fr_auto_auto] gap-2"><input id={`rate-${record.id}`} name={`rate-${record.id}`} autoComplete="off" aria-label={`Manual ${record.baseCurrency} to ${reportingCurrency} rate for ${record.description}`} type="number" min="0" step="any" inputMode="decimal" value={values[record.id] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [record.id]: event.target.value }))} placeholder="e.g. 1.38…" className="min-w-0 rounded-xl border border-line bg-white px-3.5 text-right text-sm font-extrabold outline-none focus:border-brand focus:ring-4 focus:ring-brand-soft" /><span className="grid min-h-11 place-items-center rounded-xl bg-slate-50 px-3 text-xs font-extrabold text-muted">{reportingCurrency}</span><Button type="submit" className="px-3" aria-label={`Save manual rate for ${record.description}`}><Save size={16} /></Button></div>{Number(values[record.id]) > 0 && <p className="text-right text-xs font-bold text-success">{formatMoney(record.amountBase, record.baseCurrency)} → {formatMoney(record.amountBase * Number(values[record.id]), reportingCurrency)}</p>}{errors[record.id] && <p role="alert" aria-live="assertive" className="text-xs font-bold text-danger">{errors[record.id]}</p>}</form></Card>;
    })}</div>}
  </div>;
}

function formatRateRecordDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}
